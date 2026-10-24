/**
 * witanime.site scraper
 * ---------------------
 * Validated request recipe (their WAF is picky):
 *   - Session endpoints: any UA, cookies from GET /watch/{slug}/{ep}
 *   - Manifest/sources + stream-source/stream-gate: UA MUST be short ("Mozilla/5.0")
 *     and MUST NOT carry a Referer header (hotlink gate).
 *   - GET /watch/stream-gate/{token} answers with 302 → upstream embed URL.
 *   - mp4upload & friends embed pages contain a direct .mp4 file URL.
 */
import crypto from 'node:crypto';
import { apiGet, apiSet, streamGet, streamSet } from './db.js';

export const WITA_BASE = 'https://witanime.site';
// WAF recon: stream routes 404 on long browser UAs and pass short ones.
// A datacenter IP + long Chrome UA gets a hard 403, so EVERYTHING uses the
// short profile now, with an honest fallback on retry.
const UA_API = 'Mozilla/5.0';
const UA_HONEST = 'black-x/1.0';
const UA_PAGE = UA_API;
const LANG = 'ar-EG,ar;q=0.9,en;q=0.8';
const TIMEOUT = 20000;

/* ------------------------------ http helpers ------------------------------ */

/**
 * Tiny global throttle — witanime rate-limits aggressively (429 page).
 * Serialize upstream calls with a minimum gap and surface 429 as a typed error.
 */
let lastUpstreamAt = 0;
const MIN_GAP_MS = 450;

async function throttle() {
  const wait = lastUpstreamAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastUpstreamAt = Date.now();
}

class RateLimitedError extends Error {
  constructor() {
    super('witanime rate limited (429)');
    this.code = 'rate_limited';
  }
}

function parseSetCookies(res) {
  const out = {};
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of cookies) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return out;
}

/**
 * Session-bound cookie jar. Laravel rotates witanime-session mid-flow —
 * every response's Set-Cookie MUST be merged back or the gate 404s
 * ("session expired"). This was the hard-won lesson of the recon phase.
 */
class WitaSession {
  constructor(cookies = {}) {
    this.cookies = { ...cookies };
    this.csrf = '';
  }
  absorb(res) {
    Object.assign(this.cookies, parseSetCookies(res));
    return res;
  }
  cookieHeader() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

const cookieHeader = (jar) => (jar instanceof WitaSession ? jar.cookieHeader() : Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '));

function guard(res) {
  if (res.status === 429) throw new RateLimitedError();
  return res;
}

function jarOf(cookies) {
  return cookies instanceof WitaSession ? cookies : new WitaSession(cookies || {});
}

async function get(url, { ua = UA_API, cookies = {}, headers = {}, redirect = 'follow', _retry = true } = {}) {
  await throttle();
  const jar = jarOf(cookies);
  const res = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Accept-Language': LANG,
      ...(Object.keys(jar.cookies).length ? { Cookie: jar.cookieHeader() } : {}),
      ...headers
    },
    redirect,
    signal: AbortSignal.timeout(TIMEOUT)
  });
  if (_retry && (res.status === 403 || res.status === 429) && ua !== UA_HONEST) {
    // WAF mood swing — one retry with the honest UA
    return get(url, { ua: UA_HONEST, cookies: jar, headers, redirect, _retry: false });
  }
  jar.absorb(guard(res));
  return res;
}

async function post(url, { ua = UA_API, cookies = {}, headers = {}, body, json = false, _retry = true } = {}) {
  await throttle();
  const jar = jarOf(cookies);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': ua,
      'Accept-Language': LANG,
      ...(Object.keys(jar.cookies).length ? { Cookie: jar.cookieHeader() } : {}),
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: body ? (json ? JSON.stringify(body) : body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT)
  });
  if (_retry && (res.status === 403 || res.status === 429) && ua !== UA_HONEST) {
    return post(url, { ua: UA_HONEST, cookies: jar, headers, body, json, _retry: false });
  }
  jar.absorb(guard(res));
  return res;
}

/** Fetch a page + extract session cookies + csrf token. */
async function session(pagePath) {
  const url = `${WITA_BASE}${pagePath}`;
  const jar = new WitaSession();
  const res = await get(url, { ua: UA_PAGE, cookies: jar, headers: { Accept: 'text/html' } });
  const html = await res.text();
  const csrf = html.match(/csrf-token" content="([^"]+)"/)?.[1] || '';
  return { html, cookies: jar, csrf, status: res.status };
}

const stripTags = (s) => (s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

/* ------------------------------- discovery ------------------------------- */

/** Homepage: latest episode cards. */
export async function fetchLatest() {
  const cached = apiGet('wita:latest');
  if (cached) return cached;

  const { html } = await session('/');
  const items = [];
  const seen = new Set();
  // <a ... href="https://witanime.site/watch/{slug}/{ep}"> ... <img src="poster" alt="Title">
  const re = /<a[^>]+href="https:\/\/witanime\.site\/watch\/([^"\/]+)\/(\d+)"[^>]*>[\s\S]{0,1600}?<img[^>]+src="(https:\/\/images\.witanime\.site\/[^"]+)"[^>]+alt="([^"]*)"/g;
  for (const m of html.matchAll(re)) {
    const [, slug, ep, poster, alt] = m;
    const key = `${slug}/${ep}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      slug,
      episode: Number(ep),
      titleEn: decodeEntities(alt) || slug,
      titleAr: null,
      poster,
      url: `/watch/${slug}/${ep}`
    });
    if (items.length >= 24) break;
  }
  apiSet('wita:latest', items, 10 * 60 * 1000);
  return items;
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Fetch browse catalog page from witanime.site
 * Supports pages 1..112+ (over 3,000 anime).
 */
export async function fetchBrowseAnimeList(page = 1) {
  const p = Math.max(1, Number(page) || 1);
  const cacheKey = `wita:browse:page:${p}`;
  const cached = apiGet(cacheKey);
  if (cached) return cached;

  const path = p === 1 ? '/browse' : `/browse/page/${p}`;
  let html = null;
  try {
    const res = await session(path);
    html = res.html;
  } catch (_) {}

  if (!html) return { items: [], page: p, hasNext: false, totalPages: 112 };

  const mainHtml = html.split('قد يعجبك أيضًا')[0];
  const cheerio = await import('cheerio');
  const $ = cheerio.load(mainHtml);
  const items = [];
  const seen = new Set();

  $('a[href*="/anime/"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    const mSlug = href.match(/\/anime\/([^/?#]+)/);
    if (!mSlug) return;
    const slug = mSlug[1];
    if (seen.has(slug)) return;
    seen.add(slug);

    const poster = $el.find('img').attr('src') || $el.find('img').attr('data-src') || null;
    const rawTitle = $el.find('h3').text().trim() || $el.find('img').attr('alt') || slug;
    const title = decodeEntities(rawTitle);
    const scoreText = $el.find('span:contains(".")').text().trim() || $el.text().match(/\b(\d\.\d)\b/)?.[1] || '';
    const score = scoreText ? Number(scoreText) : null;

    items.push({
      slug,
      kind: 'anime',
      titleEn: title,
      titleAr: title,
      poster,
      score,
      url: `/show/${slug}?source=witanime`,
      source: 'witanime',
      sourceLabel: 'سيرفر Hearbor 1'
    });
  });

  const hasNext = html.includes(`/browse/page/${p + 1}`) || p < 112;
  const result = { items, page: p, hasNext, totalPages: 112 };
  apiSet(cacheKey, result, 60 * 60 * 1000);
  return result;
}

export function isTitleMatch(query, candidateTitle = '', candidateSlug = '') {
  const qNorm = String(query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!qNorm) return false;
  // If query is purely Arabic, trust the search engine result after stripping sidebar
  if (/[\u0600-\u06FF]/.test(qNorm) && !/[a-z]{3,}/i.test(qNorm)) return true;

  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'season', 'part', 'movie', 'ova', 'ona', 'tv', 'anime', 'no', 'ni', 'wa', 'ga', 'wo', 'to']);
  const qWords = qNorm
    .replace(/[\u0600-\u06FF]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
  if (!qWords.length) return true;

  const target = `${candidateTitle} ${String(candidateSlug || '').replace(/-/g, ' ')}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  const targetTokens = new Set(target.split(/\s+/).filter(Boolean));
  const matched = qWords.filter((w) => targetTokens.has(w) || target.includes(w));

  if (qWords.length === 1) {
    return matched.length === 1;
  }
  if (qWords.length === 2) {
    return matched.length === 2;
  }
  return matched.length >= Math.ceil(qWords.length * 0.66);
}

/** Search witanime for shows. */
export async function searchShows(q) {
  const key = `wita:search:v3:${q.toLowerCase().trim()}`;
  const cached = apiGet(key);
  if (cached) return cached;

  let items = await searchOnce(q);
  if (!items.length && q.trim().split(/\s+/).length > 3) {
    const short = q.replace(/[''`]/g, '').split(/[\s\-(]+/).filter((w) => w.length > 2).slice(0, 3).join(' ');
    if (short && short !== q) items = await searchOnce(short);
  }
  apiSet(key, items, 30 * 60 * 1000);
  return items;
}

async function searchOnce(q) {
  const { html } = await session(`/search?q=${encodeURIComponent(q)}`);
  if (!html) return [];
  // Crucial: Strip out the "قد يعجبك أيضًا" (You might also like) sidebar widget
  // which always lists sousou-no-frieren first even when search results are 0!
  const mainHtml = html.split('قد يعجبك أيضًا')[0];
  if (mainHtml.includes('عدد النتائج: 0') || mainHtml.includes('لا توجد نتائج')) {
    return [];
  }
  const items = [];
  const seen = new Set();
  const re = /<a[^>]+href="https:\/\/witanime\.site\/(anime|movie)\/([^"\/]+)"[^>]*>[\s\S]{0,1800}?<img[^>]+src="(https:\/\/images\.witanime\.site\/[^"]+)"[^>]+alt="([^"]*)"/g;
  for (const m of mainHtml.matchAll(re)) {
    const [, kind, slug, poster, alt] = m;
    if (seen.has(slug)) continue;
    const titleEn = decodeEntities(alt) || slug;
    if (!isTitleMatch(q, titleEn, slug)) continue;
    seen.add(slug);
    items.push({
      slug,
      kind,
      titleEn,
      titleAr: titleEn,
      poster,
      url: `/${kind}/${slug}`,
      source: 'witanime',
      sourceLabel: 'سيرفر Hearbor 1'
    });
    if (items.length >= 24) break;
  }
  return items;
}

/** Anime page: metadata + full episode list. */
export async function fetchShow(slug) {
  const key = `wita:show:${slug}`;
  const cached = apiGet(key);
  if (cached) return cached;

  const { html, status } = await session(`/anime/${slug}`);
  if (status === 404 || !html.includes(`/watch/${slug}/`)) return null;

  const poster = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)?.[1]
    || html.match(/src="(https:\/\/images\.witanime\.site\/posters\/[^"]+)"/)?.[1] || null;
  const banner = html.match(/src="(https:\/\/images\.witanime\.site\/banners\/[^"]+)"/)?.[1] || poster;
  const titleEn = decodeEntities(html.match(/<h1[^>]*>[\s\S]*?<span dir="ltr">([^<]+)<\/span>/)?.[1] || slug);
  const desc = decodeEntities(html.match(/name="description" content="([^"]+)"/)?.[1] || '');

  // full episode list: href="/watch/{slug}/{n}" (server renders all episodes)
  const episodes = new Map();
  for (const m of html.matchAll(new RegExp(`href="(?:https://witanime\\.site)?/watch/${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(\\d+)"`, 'g'))) {
    const n = Number(m[1]);
    if (!episodes.has(n)) {
      episodes.set(n, { episode: n, url: `/watch/${slug}/${n}` });
    }
  }

  const show = {
    slug,
    kind: 'anime',
    titleEn,
    titleAr: null,
    description: desc,
    poster,
    banner,
    episodeCount: episodes.size,
    episodes: [...episodes.values()].sort((a, b) => a.episode - b.episode)
  };
  apiSet(key, show, 30 * 60 * 1000);
  return show;
}

/* ------------------------------ streaming ------------------------------ */

/**
 * Resolve all streaming sources for an episode.
 * Returns [{ id, server, quality, version, lang, embedUrl, directUrl|null }]
 *
 * Resilience: stale-while-revalidate. The cache entry stores { sources, fetchedAt }
 * with a long TTL; entries older than FRESH_MS trigger a background refresh but
 * still serve immediately. On upstream 429 we always fall back to stale data.
 */
/* ------------------------- streaming resolution -------------------------
 * Two hard-won facts from the recon phase:
 *  1. witanime rate-limits aggressively (429 page) — keep bursts tiny.
 *  2. manifest tokens are SESSION-BOUND: stream-source/gate only accept a
 *     token inside the session that created the manifest. Always resolve with
 *     the stored session; if it's stale, re-pull the manifest and retry once.
 * ---------------------------------------------------------------------- */
const RESOLVE_TTL_MS = 12 * 60 * 60 * 1000;
const DIRECT_HOST_LABELS = ['videa', 'videas', 'mp4upload', 'yonaplay', 'hgcloud', '4shared'];

function manifestEntryId(slug, episode, e, idx) {
  return `${slug}-${episode}-${(e.label || e.server || 'srv')}-${e.quality || ''}-${idx}`;
}

function formatBlackXServerName(rawLabel, quality, idx) {
  const s = String(rawLabel || '').toLowerCase();
  const q = quality ? ` (${quality})` : '';
  if (s.includes('videa')) return `🎬 Hearbor Stream ${idx}${q}`;
  if (s.includes('mp4upload')) return `⚡ Hearbor Direct ${idx}${q}`;
  if (s.includes('yonaplay')) return `☁️ Hearbor Cloud ${idx}${q}`;
  if (s.includes('hgcloud')) return `🚀 Hearbor HLS ${idx}${q}`;
  if (s.includes('4shared')) return `🌐 Hearbor Server ${idx}${q}`;
  return `🌐 Hearbor Server ${idx}${q}`;
}

function orderEntries(entries) {
  return [...entries].sort((a, b) => {
    const rawA = a.rawServer || a.server;
    const rawB = b.rawServer || b.server;
    const pa = DIRECT_HOST_LABELS.indexOf(rawA) === -1 ? 99 : DIRECT_HOST_LABELS.indexOf(rawA);
    const pb = DIRECT_HOST_LABELS.indexOf(rawB) === -1 ? 99 : DIRECT_HOST_LABELS.indexOf(rawB);
    return pa - pb;
  });
}

/**
 * Episode payload (cached server-side):
 *   { entries, resolved: { [id]: {embedUrl, directUrl} }, _session: {cookies, csrf} }
 */
export async function fetchEpisode(slug, episode, { fresh = false } = {}) {
  const key = `wita:episode:v3:${slug}:${episode}`;
  const entry = fresh ? null : streamGet(key);
  if (entry && Array.isArray(entry.entries) && entry.entries.length) return entry;

  // 1) session via the watch page
  const sess = await session(`/watch/${slug}/${episode}`);
  if (sess.status === 404) return null;

  // 2) manifest — short UA, NO Referer
  const manRes = await post(`${WITA_BASE}/watch/${slug}/${episode}/sources`, {
    headers: { 'X-CSRF-TOKEN': sess.csrf, Accept: '*/*' },
    cookies: sess.cookies
  });
  if (!manRes.ok) {
    throw Object.assign(new Error(`sources manifest failed (${manRes.status})`), { code: 'upstream' });
  }
  const manifest = await manRes.json();

  const entries = [];
  let idx = 0;
  for (const [quality, list] of Object.entries(manifest.players || {})) {
    for (const item of list) {
      idx += 1;
      entries.push({
        id: manifestEntryId(slug, episode, item, idx),
        token: item.token,
        rawServer: item.label || `server-${idx}`,
        server: formatBlackXServerName(item.label, quality, idx),
        quality: quality || null,
        version: item.version || 'sub',
        lang: item.lang || 'jp'
      });
    }
  }

  const downloads = [];
  let dIdx = 0;
  for (const [quality, list] of Object.entries(manifest.downloads || {})) {
    for (const item of list) {
      dIdx += 1;
      downloads.push({
        id: `dl-${slug}-${episode}-${(item.label || 'srv')}-${quality || ''}-${dIdx}`,
        token: item.token,
        rawServer: item.label || `download-${dIdx}`,
        server: `📥 سيرفر تحميل Hearbor ${dIdx}${quality ? ` (${quality})` : ''}`,
        quality: quality || null,
        version: item.version || 'sub',
        lang: item.lang || 'jp'
      });
    }
  }

  if (!entries.length && !downloads.length) {
    throw Object.assign(new Error('empty manifest'), { code: 'upstream' });
  }

  const payload = {
    entries: orderEntries(entries),
    downloads,
    resolved: {},
    resolvedDownloads: {},
    _session: {
      cookies: { ...sess.cookies.cookies },
      csrf: sess.csrf,
      at: Date.now()
    }
  };
  streamSet(key, payload, RESOLVE_TTL_MS);
  return payload;
}

/**
 * Resolve one download manifest entry by id.
 */
export async function resolveDownloadEntry(slug, episode, entryId) {
  let payload = await fetchEpisode(slug, episode);
  if (!payload) return null;

  if (payload.resolvedDownloads?.[entryId]) return payload.resolvedDownloads[entryId];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const entry = (payload.downloads || []).find((e) => e.id === entryId);
    if (!entry) return null;

    try {
      const source = await resolveDownloadTokenWithSession(entry.token, payload._session);
      payload.resolvedDownloads = { ...(payload.resolvedDownloads || {}), [entryId]: source };
      streamSet(`wita:episode:v3:${slug}:${episode}`, payload, RESOLVE_TTL_MS);
      return source;
    } catch (err) {
      if (err.code === 'rate_limited') throw err;
      if (attempt === 0) {
        payload = await fetchEpisode(slug, episode, { fresh: true });
        if (!payload) return null;
        continue;
      }
      throw err;
    }
  }
  return null;
}

async function resolveDownloadTokenWithSession(token, sess) {
  const key = `wita:dl_token:${token}`;
  const cached = streamGet(key);
  if (cached) return cached;

  const jar = new WitaSession(sess?.cookies || {});
  const csrf = sess?.csrf || '';

  await post(`${WITA_BASE}/watch/download-source/${token}`, {
    headers: { 'X-CSRF-TOKEN': csrf, Accept: 'application/json' },
    cookies: jar
  });
  const gate = await get(`${WITA_BASE}/watch/download-gate/${token}`, {
    cookies: jar,
    redirect: 'manual'
  });
  const downloadUrl = gate.headers.get('location');
  if (!downloadUrl) {
    throw Object.assign(new Error('download gate did not redirect (stale session?)'), { code: 'stale_session' });
  }

  let directUrl = null;
  try {
    directUrl = await resolveDirectUrl(downloadUrl);
  } catch { /* keep link */ }

  const out = { downloadUrl, directUrl };
  streamSet(key, out, RESOLVE_TTL_MS);
  return out;
}

/**
 * Resolve one manifest entry by id (keeps tokens server-side).
 * Uses the manifest's own session; retries once with a fresh manifest.
 */
export async function resolveEntry(slug, episode, entryId) {
  let payload = await fetchEpisode(slug, episode);
  if (!payload) return null;

  if (payload.resolved?.[entryId]) return payload.resolved[entryId];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const entry = payload.entries.find((e) => e.id === entryId);
    if (!entry) return null;

    try {
      const source = await resolveTokenWithSession(entry.token, payload._session);
      payload.resolved = { ...(payload.resolved || {}), [entryId]: source };
      streamSet(`wita:episode:v3:${slug}:${episode}`, payload, RESOLVE_TTL_MS);
      return source;
    } catch (err) {
      if (err.code === 'rate_limited') throw err;
      // stale session → re-pull manifest and retry once
      if (attempt === 0) {
        payload = await fetchEpisode(slug, episode, { fresh: true });
        if (!payload) return null;
        continue;
      }
      throw err;
    }
  }
  return null;
}

/**
 * Unwraps embed hosts that block sandboxed parent iframes (e.g. AI Studio / Arena):
 * 1. hgcloud.to / vibuxer.com / streamwish -> unpacks JS eval and extracts direct HLS .m3u8 into /api/stream/hls-player
 * 2. mid.yonaplay.net -> decrypts AES-256-GCM server list and returns Google Drive / Videa / Mega embed URL directly
 */
export async function unwrapSandboxBlockedEmbed(rawEmbedUrl) {
  if (!rawEmbedUrl || typeof rawEmbedUrl !== 'string') return rawEmbedUrl;
  try {
    const parsed = new URL(rawEmbedUrl);
    const host = parsed.hostname.toLowerCase();

    // 1. hgcloud.to / vibuxer.com / streamwish family
    if (
      host.includes('hgcloud.') ||
      host.includes('vibuxer.') ||
      host.includes('streamwish.') ||
      host.includes('hlswish.') ||
      host.includes('wishembed.')
    ) {
      const codeMatch = parsed.pathname.match(/\/e\/([a-zA-Z0-9_-]+)/);
      const targetUrl = codeMatch
        ? `https://vibuxer.com/e/${codeMatch[1]}`
        : rawEmbedUrl;

      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: 'https://hgcloud.to/'
        },
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const html = await res.text();
        const m = html.match(/eval\((function\(p,a,c,k,e,d\)\{[\s\S]*?\}\([\s\S]*?\.split\(['"]\|['"]\)\))\)/);
        if (m && m[1]) {
          const unpacked = (new Function('return ' + m[1]))();
          const hls2 =
            unpacked.match(/"hls2"\s*:\s*"(https?:\/\/[^"]+)"/)?.[1] ||
            unpacked.match(/"hls3"\s*:\s*"(https?:\/\/[^"]+)"/)?.[1];
          if (hls2) {
            return `/api/stream/hls-player?url=${encodeURIComponent(hls2)}`;
          }
        }
      }
    }

    // 2. mid.yonaplay.net (sets sandbox attribute on its inner iframe) -> unwrap via AES-256-GCM
    if (host.includes('yonaplay.')) {
      const safariUA =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
      const htmlRes = await fetch(rawEmbedUrl, {
        headers: { 'User-Agent': safariUA, Referer: 'https://witanime.you/' },
        signal: AbortSignal.timeout(10000)
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const cookieHeader = (htmlRes.headers.getSetCookie?.() || [])
          .map((c) => c.split(';')[0])
          .join('; ');
        const m = html.match(/window\._E=\{a:"([^"]+)",c:"([^"]+)",t:"([^"]+)",k:"([^"]+)"\}/);
        if (m) {
          const [, , code, token, pageKey] = m;
          const origin = parsed.origin;
          const sourcesRes = await fetch(`${origin}/api/sources.php`, {
            method: 'POST',
            headers: {
              'User-Agent': safariUA,
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'X-Embed-Token': token,
              Cookie: cookieHeader,
              Referer: rawEmbedUrl
            },
            body: JSON.stringify({ code }),
            signal: AbortSignal.timeout(8000)
          });
          const sources = await sourcesRes.json();
          const candidates = [];
          for (const [, group] of Object.entries(sources?.qualities || {})) {
            for (const srv of group?.servers || []) {
              candidates.push(srv);
            }
          }
          // Prefer Google Drive or Videa or Mp4upload over Mega
          candidates.sort((a, b) => {
            const score = (n) => {
              const s = String(n || '').toLowerCase();
              if (s.includes('google') || s.includes('drive')) return 1;
              if (s.includes('videa') || s.includes('mp4')) return 2;
              return 5;
            };
            return score(a.name) - score(b.name);
          });

          for (const srv of candidates) {
            try {
              const apiRes = await fetch(`${origin}/api/api.php`, {
                method: 'POST',
                headers: {
                  'User-Agent': safariUA,
                  'Content-Type': 'application/json',
                  'X-Requested-With': 'XMLHttpRequest',
                  'X-Embed-Token': token,
                  Cookie: cookieHeader,
                  Referer: rawEmbedUrl
                },
                body: JSON.stringify({ code, token: srv.token, key: pageKey }),
                signal: AbortSignal.timeout(8000)
              });
              const d = await apiRes.json();
              if (d?.success && d?.d) {
                const raw = Buffer.from(d.d, 'base64');
                const iv = raw.subarray(0, 12);
                const tag = raw.subarray(12, 28);
                const ct = raw.subarray(28);
                const keyHash = crypto.createHash('sha256').update(pageKey).digest();
                const decipher = crypto.createDecipheriv('aes-256-gcm', keyHash, iv);
                decipher.setAuthTag(tag);
                const decryptedUrl = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
                if (decryptedUrl && decryptedUrl.startsWith('http')) {
                  return decryptedUrl;
                }
              }
            } catch {}
          }
        }
      }
    }
  } catch {}
  return rawEmbedUrl;
}

async function resolveTokenWithSession(token, sess) {
  const key = `wita:token:v2:${token}`;
  const cached = streamGet(key);
  if (cached) return cached;

  const jar = new WitaSession(sess?.cookies || {});
  const csrf = sess?.csrf || '';

  await post(`${WITA_BASE}/watch/stream-source/${token}`, {
    headers: { 'X-CSRF-TOKEN': csrf, Accept: 'application/json' },
    cookies: jar
  });
  const gate = await get(`${WITA_BASE}/watch/stream-gate/${token}`, {
    cookies: jar,
    redirect: 'manual'
  });
  const rawEmbedUrl = gate.headers.get('location');
  if (!rawEmbedUrl) {
    throw Object.assign(new Error('gate did not redirect (stale session?)'), { code: 'stale_session' });
  }

  const embedUrl = await unwrapSandboxBlockedEmbed(rawEmbedUrl);

  let directUrl = null;
  try {
    if (embedUrl.startsWith('http')) {
      directUrl = await resolveDirectUrl(embedUrl);
    }
  } catch { /* keep embed-only */ }

  const out = { embedUrl, directUrl };
  streamSet(key, out, RESOLVE_TTL_MS);
  return out;
}

async function resolveDirectUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();

  // Mega, Google Drive, Workupload, Gofile, 4shared are web lockers / cloud drives — not raw stream direct files
  if (
    host.endsWith('mega.nz') ||
    host.endsWith('mega.co.nz') ||
    host.endsWith('drive.google.com') ||
    host.endsWith('workupload.com') ||
    host.endsWith('gofile.io') ||
    host.endsWith('4shared.com') ||
    host.endsWith('wtsrv.xyz')
  ) {
    return null;
  }

  const cacheKey = `wita:direct:${url}`;
  const cached = streamGet(cacheKey);
  if (cached !== null && cached !== undefined) return cached;

  let direct = null;

  try {
    // 1. mp4upload (embed or direct page)
    if (host.includes('mp4upload.com')) {
      let embedTarget = url;
      const idMatch = url.match(/mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)(?:\.html)?/i);
      if (idMatch && idMatch[1]) {
        embedTarget = `https://www.mp4upload.com/embed-${idMatch[1]}.html`;
      }

      const res = await fetch(embedTarget, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          Accept: 'text/html'
        },
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) {
        const html = await res.text();
        const m = html.match(/src\s*:\s*["'](https?:\/\/[^"']+\/video\.mp4)[\"']/i) ||
                  html.match(/["'](https?:\/\/[a-zA-Z0-9.:-]+\/d\/[a-zA-Z0-9_\/=-]+\/video\.mp4)["']/i);
        if (m && m[1]) {
          direct = m[1];
        }
      }
    }
    // 2. MediaFire (extract direct download CDN button link)
    else if (host.includes('mediafire.com')) {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          Accept: 'text/html'
        },
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) {
        const html = await res.text();
        const m = html.match(/href=["'](https?:\/\/[a-zA-Z0-9.-]+\.mediafire\.com\/[^"']+)["'][^>]*id=["']downloadButton["']/i) ||
                  html.match(/id=["']downloadButton["'][^>]*href=["']([^"']+)["']/i) ||
                  html.match(/aria-label=["']Download file["'][^>]*href=["']([^"']+)["']/i);
        if (m && m[1] && m[1].startsWith('http') && !m[1].includes('/file/')) {
          direct = m[1];
        }
      }
    }
    // 3. Generic video hosts (e.g. yourupload, videa, etc.)
    else {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html'
        },
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) {
        const html = await res.text();
        // Look specifically for actual video paths with .mp4 or .mkv in the file name
        const patterns = [
          /(?:file|src)\s*:\s*["'](https?:\/\/[^"'\s]+\/(?:[^"'\s\/]+\.)+(?:mp4|mkv)(?:\?[^"'\s]*)?)["']/i,
          /<source[^>]+src=["'](https?:\/\/[^"'\s]+\/(?:[^"'\s\/]+\.)+(?:mp4|mkv)(?:\?[^"'\s]*)?)["']/i
        ];
        for (const re of patterns) {
          const m = html.match(re);
          if (m && m[1] && !/video\.min\.js|\.css|\.png|\.jpg|\.m3u8|favicon|player\//i.test(m[1])) {
            direct = m[1].replace(/\\\//g, '/');
            break;
          }
        }
      }
    }
  } catch {
    // Keep direct null if extraction times out or fails
  }

  // Safety filter: never allow non-video assets to be returned as direct video URLs
  if (direct) {
    try {
      const u = new URL(direct);
      const path = u.pathname.toLowerCase();
      if (
        path.endsWith('.png') ||
        path.endsWith('.jpg') ||
        path.endsWith('.jpeg') ||
        path.endsWith('.gif') ||
        path.endsWith('.ico') ||
        path.endsWith('.m3u8') ||
        path.endsWith('.js') ||
        path.endsWith('.css') ||
        path.includes('favicon')
      ) {
        direct = null;
      }
    } catch {
      direct = null;
    }
  }

  streamSet(cacheKey, direct, 6 * 60 * 60 * 1000);
  return direct;
}

function looksLikeCloudflareChallenge(body) {
  const html = String(body || '').slice(0, 20000);
  return /<title[^>]*>\s*(?:Just a moment|Attention Required|Verify you are human|Checking your browser)/i.test(html) ||
    /cf-browser-verification|__cf_chl_|cf_chl_(?:opt|captcha|challenge)/i.test(html);
}

/** Health/status helper for the UI. */
export async function scrapeHealth() {
  try {
    const res = await get(`${WITA_BASE}/`, { headers: { Accept: 'text/html' } });
    const body = await res.text();
    const challenge = looksLikeCloudflareChallenge(body);
    return {
      ok: res.ok && !challenge,
      status: res.status,
      source: 'witanime.site',
      challenge
    };
  } catch (err) {
    return { ok: false, status: 0, source: 'witanime.site', error: err.message };
  }
}

/**
 * Deep diagnostics — run from the deployed host to see exactly how its IP/UA
 * is treated by the witanime WAF (response statuses, challenge pages, manifest).
 */
export async function scrapeDiagnostics() {
  const out = { source: 'witanime.site', at: new Date().toISOString(), probes: [] };
  const uas = [['short', UA_API], ['honest', UA_HONEST], ['chrome-long', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36']];
  for (const [name, ua] of uas) {
    try {
      const res = await fetch(`${WITA_BASE}/`, {
        headers: { 'User-Agent': ua, Accept: 'text/html', 'Accept-Language': LANG },
        redirect: 'manual',
        signal: AbortSignal.timeout(15000)
      });
      const body = (await res.text()).slice(0, 4000);
      out.probes.push({
        name,
        status: res.status,
        server: res.headers.get('server'),
        challenge: looksLikeCloudflareChallenge(body),
        blocked: /Access denied|Sorry, you have been blocked/i.test(body),
        title: body.match(/<title>([^<]*)/)?.[1]?.slice(0, 60) || null
      });
    } catch (err) {
      out.probes.push({ name, error: err.message });
    }
  }
  // full streaming chain probe (the money test)
  try {
    const sess = await session('/watch/black-clover-2nd-season/1');
    out.pageStatus = sess.status;
    out.csrf = Boolean(sess.csrf);
    const man = await post(`${WITA_BASE}/watch/black-clover-2nd-season/1/sources`, {
      headers: { 'X-CSRF-TOKEN': sess.csrf, Accept: '*/*' },
      cookies: sess.cookies
    });
    const manBody = await man.text();
    out.manifestStatus = man.status;
    out.manifestOk = manBody.startsWith('{');
    out.manifestSnippet = manBody.slice(0, 100);
  } catch (err) {
    out.manifestError = err.message;
  }
  return out;
}
