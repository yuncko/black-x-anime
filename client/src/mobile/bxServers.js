/**
 * Hearbor APK <-> website server bridge.
 *
 * Up to v14 the APK scraped third-party catalogues straight from the phone,
 * with its own server list. When a title was missing it silently loaded the
 * chapters of an unrelated series, and broken pages were swapped for random
 * AniList covers. Since v15 every anime and manga server call goes through the
 * same public Hearbor API the website uses (shared/publicSite.js; since v18.1
 * https://black-x-anime.ai.studio/api, before that black-x-anime.me), so
 * the app and the website always list the same servers, episodes, chapters and
 * pages. Nothing here invents data: unknown values stay empty.
 */
import { getServerUrl, isNativeApk } from '../api.js';
import { APK_RELEASE, compareVersions } from '../../../shared/apkRelease.js';
import { PUBLIC_SITE_ORIGIN } from '../../../shared/publicSite.js';
import { ANILIST_GENRE_NOT_IN, ANILIST_TAG_NOT_IN, isHiddenAnime, isHiddenManga } from './contentFilter.js';

export const BX_PUBLIC_ORIGIN = PUBLIC_SITE_ORIGIN;
export const BX_APK_FILE_NAME = 'HEARBOR-Mobile-120Hz.apk';
export const BX_APK_DOWNLOAD_URL = `${BX_PUBLIC_ORIGIN}/${BX_APK_FILE_NAME}`;
// The version this APK was built as (the server reports the latest one in /api/app/config).
export const BX_APK_VERSION = APK_RELEASE.version;
export { compareVersions };

/* -------------------------------------------------------------------------- */
/* Base URL + JSON helper                                                      */
/* -------------------------------------------------------------------------- */

/**
 * API origin. The APK serves its UI from https://localhost, so it must call the
 * website explicitly; browsers (including the `?apk_ui=1` preview) use the
 * same-origin `/api` routes.
 */
export function bxApiBase() {
  let configured = '';
  try {
    configured = String(getServerUrl() || '');
  } catch {
    configured = '';
  }
  if (/^https?:\/\/[^\s/]+/i.test(configured)) return configured.replace(/\/+$/, '');
  return isNativeApk() ? BX_PUBLIC_ORIGIN : '';
}

export function bxApiUrl(path) {
  const raw = String(path || '');
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${bxApiBase()}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

/* Native HTTP bridge (MainActivity.httpRequestAsync): plain HttpURLConnection, no CORS. */
const pendingNativeRequests = new Map();

function nativeHttpAvailable() {
  return typeof window !== 'undefined' && typeof window.BlackXNativeAuth?.httpRequestAsync === 'function';
}

function ensureNativeHttpCallback() {
  if (typeof window === 'undefined' || window.__bxNativeHttpBridgeReady) return;
  window.__bxNativeHttpBridgeReady = true;
  const previous = window.__onBlackXHttpResult;
  window.__onBlackXHttpResult = (reqId, text) => {
    const resolve = pendingNativeRequests.get(reqId);
    if (resolve) {
      pendingNativeRequests.delete(reqId);
      resolve(text || '');
    } else if (typeof previous === 'function') {
      previous(reqId, text);
    }
  };
}

function nativeHttpText(url, { method = 'GET', headers = {}, body = '', timeoutMs = 20000 } = {}) {
  ensureNativeHttpCallback();
  return new Promise((resolve) => {
    const reqId = `bx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      if (pendingNativeRequests.delete(reqId)) resolve('');
    }, timeoutMs);
    pendingNativeRequests.set(reqId, (text) => {
      clearTimeout(timer);
      resolve(text);
    });
    const headerPipe = Object.entries(headers)
      .map(([k, v]) => `${k}:${v}`)
      .join('||');
    try {
      window.BlackXNativeAuth.httpRequestAsync(reqId, url, method, headerPipe, body || '');
    } catch {
      clearTimeout(timer);
      pendingNativeRequests.delete(reqId);
      resolve('');
    }
  });
}

/**
 * JSON request against the website API. Credentials are omitted on purpose:
 * the public catalogue routes are CDN-cached and need no session. Inside the
 * APK a network/CORS failure is retried once through the native HTTP bridge,
 * so a missing CORS header can never blank the app.
 */
export async function bxRequestJson(path, { method = 'GET', body, timeoutMs = 15000 } = {}) {
  const url = bxApiUrl(path);
  const headers =
    body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' };
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method,
      credentials: 'omit',
      headers,
      body: payload,
      signal: controller ? controller.signal : undefined
    });
    if (!res.ok) {
      const err = new Error(`Hearbor API ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } catch (err) {
    const corsOrNetwork = err?.name === 'TypeError' && !err?.status;
    if (!corsOrNetwork || !nativeHttpAvailable() || !/^https?:\/\//i.test(url)) throw err;
    const text = await nativeHttpText(url, { method, headers, body: payload || '', timeoutMs });
    if (!text) throw err;
    try {
      return JSON.parse(text);
    } catch {
      throw err;
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Real anime total reported by the website (`/api/stream/stats`), or null. */
export async function fetchAnimeCatalogTotal() {
  try {
    const data = await bxRequestJson('/api/stream/stats', { timeoutMs: 10000 });
    const total = Number(data?.animeTotal);
    return Number.isFinite(total) && total > 0 ? total : null;
  } catch {
    return null;
  }
}

/** Source ids the website currently exposes (e.g. `aniproject` only when configured). */
export async function fetchBxSourceIds() {
  try {
    const data = await bxRequestJson('/api/stream/sources', { timeoutMs: 10000 });
    return new Set((Array.isArray(data?.sources) ? data.sources : []).map((s) => String(s?.id || '')).filter(Boolean));
  } catch {
    return new Set();
  }
}

export function formatBxCount(value, locale = 'en-US') {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString(locale) : '';
}

/* -------------------------------------------------------------------------- */
/* Anime                                                                       */
/* -------------------------------------------------------------------------- */

export const BX_ANIME_SOURCE_BADGES = Object.freeze({
  witanime: 'Hearbor 1',
  anime3rb: 'Hearbor 2',
  english: 'Hearbor 3',
  aniproject: 'Hearbor 4'
});

/** Same slug rule as the server's toWitcherSlug(). */
export function witcherSlug(objectID) {
  const clean = String(objectID || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean ? `aw-${clean}` : '';
}

export function animeSlugOf(anime) {
  const slug = String(anime?.slug || '').trim();
  if (slug.startsWith('aw-')) {
    const tail = slug.slice(3).replace(/^-+|-+$/g, '');
    if (tail) return `aw-${tail}`;
  } else if (slug) {
    return slug;
  }
  return witcherSlug(anime?.objectID);
}

export function inferAnimeSource(anime) {
  const explicit = String(anime?.source || '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BX_ANIME_SOURCE_BADGES, explicit)) return explicit;
  const slug = animeSlugOf(anime);
  if (/^(a3rb-|ok-|blkom-)/.test(slug)) return 'anime3rb';
  if (/^(en-|mal-|en_anime:)/.test(slug)) return 'english';
  if (slug.startsWith('ap-')) return 'aniproject';
  return 'witanime';
}

/** Website show object -> the anime card shape MobileApkApp already renders. */
export function mapShowToMobileAnime(show) {
  if (!show || typeof show !== 'object') return null;
  const slug = String(show.slug || show.id || '').trim();
  if (!slug) return null;
  const titleEn = String(show.titleEn || show.title || show.titleRomaji || slug);
  const titleRomaji = String(show.titleRomaji || show.title || titleEn);
  const poster = String(show.poster || show.banner || '');
  const ratingNum = Number(show.rating);
  const source = inferAnimeSource({ source: show.source, slug });
  const arabicGenres = Array.isArray(show.genres) ? show.genres.filter((g) => /[\u0600-\u06FF]/.test(String(g))) : [];
  return {
    objectID: String(show.objectID || slug),
    slug,
    malId: show.malId || null,
    titleRomaji,
    titleEn,
    titleAr: String(show.titleAr || titleRomaji),
    poster,
    banner: String(show.banner || poster),
    storyAr: String(show.synopsisAr || show.synopsis || ''),
    storyEn: String(show.synopsisEn || ''),
    tags: Array.isArray(show.tagsAr) && show.tagsAr.length ? show.tagsAr : arabicGenres,
    type: String(show.type || (show.kind === 'movie' ? 'فيلم' : 'مسلسل')),
    state: String(show.status || ''),
    year: show.year ? String(show.year) : '',
    season: String(show.season || ''),
    studio: String(show.studio || ''),
    age: String(show.ageRating || ''),
    duration: '',
    showTime: '',
    relatedIds: [],
    otherNames: [],
    views: Number(show.views) || 0,
    rating: Number.isFinite(ratingNum) && ratingNum > 0 ? ratingNum.toFixed(1) : '',
    youtubeId: show.youtubeTrailerId || null,
    source,
    sourceLabel: BX_ANIME_SOURCE_BADGES[source]
  };
}

/** Same search the website runs: every Hearbor anime server at once. */
export async function fetchMobileAnimeSearch(query, { source = 'all' } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const data = await bxRequestJson(
    `/api/stream/search?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}`,
    { timeoutMs: 20000 }
  );
  const seen = new Set();
  const out = [];
  for (const show of Array.isArray(data?.items) ? data.items : Array.isArray(data?.results) ? data.results : []) {
    // Hidden genres (contentFilter.js): checked on the raw show, whose `genres` may be English.
    if (isHiddenAnime(show)) continue;
    const mapped = mapShowToMobileAnime(show);
    if (!mapped || seen.has(mapped.slug)) continue;
    seen.add(mapped.slug);
    out.push(mapped);
  }
  return out;
}

/** Episode list from `/api/stream/show/:slug` (the website's Watch page source). */
export async function fetchMobileEpisodes(anime) {
  const slug = animeSlugOf(anime);
  if (!slug) return { show: null, episodes: [] };
  const source = inferAnimeSource(anime);
  const data = await bxRequestJson(
    `/api/stream/show/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`,
    { timeoutMs: 20000 }
  );
  const show = data?.show || null;
  return { show, episodes: mapShowEpisodes(show, anime) };
}

export function mapShowEpisodes(show, anime = null) {
  const fallbackThumb = show?.banner || show?.poster || anime?.banner || anime?.poster || '';
  const byNumber = new Map();
  (Array.isArray(show?.episodes) ? show.episodes : []).forEach((ep, idx) => {
    const number = Number(ep?.number ?? ep?.episode ?? idx + 1);
    // The episode endpoint only accepts whole numbers >= 1.
    if (!Number.isInteger(number) || number < 1 || byNumber.has(number)) return;
    const title = String(ep?.title || '').trim();
    const titleAr = String(ep?.titleAr || '').trim();
    byNumber.set(number, {
      number,
      episode: number,
      docId: String(ep?.docId || String(number).padStart(3, '0')),
      name: title || `الحلقة ${number}`,
      titleAr: titleAr && titleAr !== title ? titleAr : '',
      thumb: ep?.thumb || fallbackThumb,
      filler: Boolean(ep?.isFiller ?? ep?.filler)
    });
  });
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

function isPlayerEmbed(url) {
  return /\/api\/stream\/(?:mp4-player|hls-player)\?/i.test(String(url || ''));
}

/** `/api/stream/mp4-player?url=X` (relative or absolute) -> X. */
export function unwrapPlayerUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/\/api\/stream\/(?:mp4-player|hls-player)\?(?:[^#]*?&)?url=([^&#]+)/i);
  if (!m) return s;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return '';
  }
}

export function isHlsUrl(url) {
  const s = String(url || '');
  return /\.m3u8(?:[?#]|$)/i.test(s) || /\/api\/stream\/hls-proxy\?/i.test(s);
}

/** Absolute URL the APK <video> element can open, or ''. */
export function toPlayableUrl(raw) {
  const unwrapped = unwrapPlayerUrl(raw);
  if (!unwrapped) return '';
  if (unwrapped.startsWith('/api/')) return bxApiUrl(unwrapped);
  return /^https?:\/\//i.test(unwrapped) ? unwrapped : '';
}

/**
 * PixelDrain files are reachable on several official mirrors. v14 always tried
 * pixeldrain.dev first because pixeldrain.com is blocked on some networks; the
 * player's error handler then walks .dev -> .net -> .com.
 */
export function preferPixeldrainMirror(url) {
  const m = String(url || '').match(/^https?:\/\/pixeldrain\.(?:com|net|dev)\/(?:api\/file|u)\/([A-Za-z0-9_-]+)/i);
  return m ? `https://pixeldrain.dev/api/file/${m[1]}` : String(url || '');
}

function deviceCanPlayHls() {
  try {
    if (typeof document === 'undefined') return false;
    const v = document.createElement('video');
    if (v.canPlayType && v.canPlayType('application/vnd.apple.mpegurl')) return true;
    // Since v16 the APK player plays HLS through hls.js (Media Source Extensions).
    const MS = window.ManagedMediaSource || window.MediaSource;
    return Boolean(MS && typeof MS.isTypeSupported === 'function' && MS.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"'));
  } catch {
    return false;
  }
}

/**
 * Website episode manifest -> APK server list. Only sources the APK's <video>
 * player can open are kept: direct MP4, and HLS (natively or through hls.js).
 * Iframe-only hosts stay on the website player.
 */
export function mapEpisodeEntries(data, { slug, episode, source, canPlayHls } = {}) {
  const hlsOk = typeof canPlayHls === 'boolean' ? canPlayHls : deviceCanPlayHls();
  const resolved = data?.resolved && typeof data.resolved === 'object' ? data.resolved : {};
  const seen = new Set();
  const servers = [];
  for (const entry of Array.isArray(data?.entries) ? data.entries : []) {
    if (!entry || !entry.id || entry.isMonarchExclusive) continue;
    const pre = resolved[entry.id] || {};
    const embed = entry.embedUrl || pre.embedUrl || '';
    const direct = toPlayableUrl(entry.directUrl || pre.directUrl || '') || (isPlayerEmbed(embed) ? toPlayableUrl(embed) : '');
    if (!direct && embed) continue; // iframe-only host
    const hls = direct ? isHlsUrl(direct) : false;
    if (hls && !hlsOk) continue;
    const key = direct || `entry:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const playable = direct ? preferPixeldrainMirror(direct) : '';
    servers.push({
      name: String(entry.serverCode || (hls ? 'HLS' : 'BX')).toUpperCase(),
      label: String(entry.server || '').trim(),
      quality: String(entry.quality || '').trim(),
      link: playable,
      directResolvedUrl: playable,
      needsResolve: !playable,
      entryId: String(entry.id),
      slug,
      episode,
      source,
      isHls: hls,
      visible: true
    });
  }
  // Ready-to-play servers first, then the ones that still need /resolve.
  return [...servers.filter((s) => !s.needsResolve), ...servers.filter((s) => s.needsResolve)];
}

/** Same manifest the website's Watch page loads (`/api/stream/episode/:slug/:ep`). */
export async function fetchMobileEpisodeServers(anime, episodeNumber) {
  const episode = Number(episodeNumber);
  const slug = animeSlugOf(anime);
  if (!slug || !Number.isInteger(episode) || episode < 1) return [];
  const source = inferAnimeSource(anime);
  const data = await bxRequestJson(
    `/api/stream/episode/${encodeURIComponent(slug)}/${episode}?source=${encodeURIComponent(source)}`,
    { timeoutMs: 30000 }
  );
  return mapEpisodeEntries(data, { slug, episode, source });
}

/** Resolve one manifest entry on demand (`POST /api/stream/resolve`). Returns '' when not playable. */
export async function resolveMobileEpisodeServer(server) {
  if (!server?.slug || !server?.entryId || !Number.isInteger(Number(server.episode))) return '';
  const data = await bxRequestJson('/api/stream/resolve', {
    method: 'POST',
    body: { slug: server.slug, episode: Number(server.episode), entryId: server.entryId },
    timeoutMs: 20000
  });
  const src = data?.source || {};
  const direct = toPlayableUrl(src.directUrl || '') || (isPlayerEmbed(src.embedUrl) ? toPlayableUrl(src.embedUrl) : '');
  if (!direct || (isHlsUrl(direct) && !deviceCanPlayHls())) return '';
  return preferPixeldrainMirror(direct);
}

/* -------------------------------------------------------------------------- */
/* Manga / Manhwa / Manhua                                                     */
/* -------------------------------------------------------------------------- */

/** Mirrors the website library tabs (client/src/pages/Browse.jsx). */
export const BX_MANGA_SERVER_TABS = Object.freeze([
  Object.freeze({ id: 'all', ar: 'جميع سيرفرات Hearbor', en: 'All Hearbor Servers' }),
  Object.freeze({ id: 'bx1', ar: 'سيرفر Hearbor 1 (مانهوا عربية)', en: 'Hearbor 1 (AR Manhwa)' }),
  Object.freeze({ id: 'bx2', ar: 'سيرفر Hearbor 2 (مانجا عربية)', en: 'Hearbor 2 (AR Manga)' }),
  Object.freeze({ id: 'bx3', ar: 'سيرفر Hearbor 3 (الفهرس العالمي)', en: 'Hearbor 3 (Global Index)' })
]);

/** Shown only while the website exposes it (search-only, like on the website). */
export const BX_MANGA_SEARCH_ONLY_TAB = Object.freeze({
  id: 'bx4',
  ar: 'سيرفر Hearbor 4 (بحث فقط)',
  en: 'Hearbor 4 (Search only)',
  searchOnly: true
});

const MANGA_SERVER_IDS = new Set(['all', 'bx1', 'bx2', 'bx3', 'bx4']);

/** Labels contain 'مانهوا' / 'مانجا' so the APK's type chips keep working. */
const MANGA_TYPE_LABELS = Object.freeze({
  MANHWA: 'مانهوا كورية',
  MANHUA: 'مانهوا صينية',
  MANGA: 'مانجا يابانية'
});

export function mangaServerLabel(serverId) {
  const m = String(serverId || '').match(/^bx(\d)$/i);
  return m ? `Hearbor ${m[1]}` : 'Hearbor';
}

function serverIdFrom(value) {
  const s = String(value || '').toLowerCase().trim();
  if (/^bx\d$/.test(s)) return s;
  const m = s.match(/hearbor\s*(\d)/i) || s.match(/black\s*x\s*(\d)/i);
  return m ? `bx${m[1]}` : '';
}

export function normalizeMangaStatus(value) {
  const s = String(value || '').toUpperCase();
  if (s.includes('ONGOING') || s.includes('RELEASING') || s.includes('مستمر')) return 'ongoing';
  if (s.includes('COMPLETED') || s.includes('FINISHED') || s.includes('مكتمل')) return 'completed';
  return '';
}

function normalizeTitleKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0621-\u064A]+/g, '');
}

/** Website library/search item -> the manga card shape MobileApkApp renders. */
export function mapBxMangaItem(raw, fallbackServer = '') {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || raw.mangalikSlug || raw.slug || '').trim();
  if (!id) return null;
  const typeCode = String(raw.type || '').toUpperCase();
  const normalizedType = typeCode.includes('MANHUA')
    ? 'MANHUA'
    : typeCode.includes('MANHWA')
      ? 'MANHWA'
      : typeCode.includes('MANGA')
        ? 'MANGA'
        : '';
  const server =
    serverIdFrom(raw.server) ||
    serverIdFrom(raw.source) ||
    (fallbackServer && fallbackServer !== 'all' ? serverIdFrom(fallbackServer) : '');
  const title = String(raw.title_ar || raw.title || raw.title_en || '').trim() || id;
  const poster = String(raw.poster || raw.coverImage || raw.coverUrl || '').trim();
  const cover = poster || '/blackx-logo.png';
  const ratingNum = Number(raw.rating);
  const servers = (Array.isArray(raw.availableServers) ? raw.availableServers : [])
    .map((s) => serverIdFrom(typeof s === 'string' ? s : s?.id))
    .filter(Boolean);
  return {
    objectID: `bx:${id}`,
    bxId: id,
    bxServer: server,
    bxServers: servers,
    source: 'bx',
    sourceLabel: server ? mangaServerLabel(server) : 'Hearbor',
    name: title,
    name_en: String(raw.title_en || raw.title || '').trim(),
    poster_uri: cover,
    poster: { large: cover, medium: cover },
    banner: String(raw.banner || poster || ''),
    type: MANGA_TYPE_LABELS[normalizedType] || '',
    typeCode: normalizedType,
    story_ar: String(raw.description_ar || raw.description || '').trim(),
    story_en: String(raw.description_en || '').trim(),
    rate: Number.isFinite(ratingNum) && ratingNum > 0 ? ratingNum.toFixed(1) : '',
    status: normalizeMangaStatus(raw.status),
    genres: Array.isArray(raw.genres) ? raw.genres : []
  };
}

function mapAniListMedia(m) {
  const titleEn = m?.title?.english || m?.title?.romaji || m?.title?.native || '';
  if (!m?.id || !titleEn) return null;
  const c = String(m.countryOfOrigin || 'JP').toUpperCase();
  const type = c === 'KR' ? 'MANHWA' : c === 'CN' || c === 'TW' ? 'MANHUA' : 'MANGA';
  const poster = m.coverImage?.extraLarge || m.coverImage?.large || '';
  return mapBxMangaItem(
    {
      id: `al:${m.id}`,
      title_ar: titleEn,
      title_en: titleEn,
      type,
      poster,
      banner: m.bannerImage || poster,
      rating: m.averageScore ? m.averageScore / 10 : null,
      description_ar: String(m.description || '').replace(/<[^>]+>/g, '').trim(),
      status: m.status === 'FINISHED' ? 'COMPLETED' : m.status === 'RELEASING' ? 'ONGOING' : '',
      genres: Array.isArray(m.genres) ? m.genres : [],
      server: 'bx3'
    },
    'bx3'
  );
}

/**
 * The website's "Master Global Index" (Browse.jsx fetchAniListMasterClient):
 * AniList titles whose chapters Hearbor 3 resolves on demand.
 */
export async function fetchAniListMasterPage(page = 1, country = null, search = '') {
  try {
    const query = `
      query ($page: Int, $perPage: Int, $countryOfOrigin: CountryCode, $search: String, $sort: [MediaSort], $genreNotIn: [String], $tagNotIn: [String]) {
        Page(page: $page, perPage: $perPage) {
          media(type: MANGA, countryOfOrigin: $countryOfOrigin, search: $search, sort: $sort, isAdult: false, genre_not_in: $genreNotIn, tag_not_in: $tagNotIn) {
            id
            title { romaji english native }
            countryOfOrigin
            status
            averageScore
            genres
            description(asHtml: false)
            coverImage { extraLarge large }
            bannerImage
          }
        }
      }
    `;
    const variables = {
      page,
      perPage: 24,
      sort: search ? ['SEARCH_MATCH', 'POPULARITY_DESC'] : ['POPULARITY_DESC', 'TRENDING_DESC'],
      // Hidden genres (contentFilter.js), excluded by AniList itself.
      genreNotIn: [...ANILIST_GENRE_NOT_IN],
      tagNotIn: [...ANILIST_TAG_NOT_IN]
    };
    if (country) variables.countryOfOrigin = country;
    if (search) variables.search = search;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.data?.Page?.media || []).map(mapAniListMedia).filter((m) => m && !isHiddenManga(m));
  } catch {
    return [];
  }
}

/**
 * The most popular manga / manhwa on AniList right now (titles only), for the quick search
 * chips of the manga tab. Cached for a day; [] when AniList cannot be reached (the chips are
 * then simply not shown — there is no hard-coded fallback list).
 */
const POPULAR_MANGA_KEY = 'bx_mob_popular_manga_v1';
export async function fetchPopularMangaTitles(limit = 10) {
  try {
    const cached = JSON.parse(localStorage.getItem(POPULAR_MANGA_KEY) || 'null');
    if (cached && Array.isArray(cached.titles) && cached.titles.length && Date.now() - Number(cached.at) < 24 * 3600 * 1000) {
      return cached.titles.slice(0, limit);
    }
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: `query ($genreNotIn: [String], $tagNotIn: [String]) {
          Page(page: 1, perPage: 20) {
            media(type: MANGA, sort: POPULARITY_DESC, isAdult: false, genre_not_in: $genreNotIn, tag_not_in: $tagNotIn) {
              id
              title { romaji english }
              genres
            }
          }
        }`,
        variables: { genreNotIn: [...ANILIST_GENRE_NOT_IN], tagNotIn: [...ANILIST_TAG_NOT_IN] }
      })
    });
    if (!res.ok) return [];
    const json = await res.json();
    const titles = [];
    const seen = new Set();
    for (const m of json?.data?.Page?.media || []) {
      const t = String(m?.title?.english || m?.title?.romaji || '').trim();
      const key = t.toLowerCase();
      if (!t || seen.has(key) || t.length > 40) continue;
      seen.add(key);
      titles.push(t);
    }
    if (titles.length) {
      try {
        localStorage.setItem(POPULAR_MANGA_KEY, JSON.stringify({ at: Date.now(), titles }));
      } catch {
        /* ignore */
      }
    }
    return titles.slice(0, limit);
  } catch {
    return [];
  }
}

export function dedupeMangaHits(list) {
  const seenIds = new Set();
  const seenTitles = new Set();
  const out = [];
  for (const item of list) {
    if (!item || seenIds.has(item.objectID)) continue;
    const titleKey = normalizeTitleKey(item.name_en || item.name);
    if (titleKey && seenTitles.has(titleKey)) continue;
    seenIds.add(item.objectID);
    if (titleKey) seenTitles.add(titleKey);
    out.push(item);
  }
  return out;
}

/** Library page or search results, exactly as the website's library builds them. */
export async function fetchMobileMangaList({ server = 'all', query = '', page = 1 } = {}) {
  const srv = MANGA_SERVER_IDS.has(server) ? server : 'all';
  const q = String(query || '').trim();
  const pageNum = Math.max(1, Number(page) || 1);
  const withMasterIndex = srv === 'all' || srv === 'bx3';

  if (q) {
    // /api/search is not paginated.
    if (pageNum > 1) return [];
    const [res, master] = await Promise.all([
      bxRequestJson(`/api/search?query=${encodeURIComponent(q)}&type=manga&server=${encodeURIComponent(srv)}`, {
        timeoutMs: 25000
      }).catch(() => null),
      withMasterIndex ? fetchAniListMasterPage(1, null, q) : Promise.resolve([])
    ]);
    const rows = Array.isArray(res?.manga) ? res.manga : Array.isArray(res?.results) ? res.results : [];
    return dedupeMangaHits([...rows.map((r) => mapBxMangaItem(r, srv)), ...master]).filter((m) => !isHiddenManga(m));
  }

  // Hearbor 4 is search-only on the website as well.
  if (srv === 'bx4') return [];

  const tasks = [
    bxRequestJson(`/api/content/library?type=ALL&server=${encodeURIComponent(srv)}&page=${pageNum}`, {
      timeoutMs: 20000
    }).catch(() => null)
  ];
  if (withMasterIndex) {
    tasks.push(fetchAniListMasterPage(pageNum, 'KR'), fetchAniListMasterPage(pageNum, 'JP'), fetchAniListMasterPage(pageNum, 'CN'));
  }
  const [res, ...masters] = await Promise.all(tasks);
  const base = (Array.isArray(res?.items) ? res.items : []).map((r) => mapBxMangaItem(r, srv));
  return dedupeMangaHits([...base, ...masters.flat()]).filter((m) => !isHiddenManga(m));
}

export function normalizeServerList(list) {
  const out = [];
  const seen = new Set();
  for (const s of Array.isArray(list) ? list : []) {
    const id = serverIdFrom(typeof s === 'string' ? s : s?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      ar: (typeof s === 'object' && s?.name) || `سيرفر ${mangaServerLabel(id)}`,
      en: (typeof s === 'object' && s?.labelEn) || mangaServerLabel(id)
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Website chapters -> APK chapters, newest first (the reader UI relies on that order). */
export function mapBxChapters(list, { mangaId = '', server = '' } = {}) {
  const seen = new Set();
  const out = [];
  for (const ch of Array.isArray(list) ? list : []) {
    const chapterId = String(ch?.chapterId || ch?.id || '').trim();
    if (!chapterId || seen.has(chapterId)) continue;
    seen.add(chapterId);
    const numberRaw = String(ch?.chapterNumber ?? ch?.number ?? '').trim();
    const num = Number.parseFloat(numberRaw);
    out.push({
      id: chapterId,
      source: 'bx',
      chapterId,
      mangaId,
      server: serverIdFrom(ch?.server) || serverIdFrom(server),
      chapter: numberRaw || '?',
      sortKey: Number.isFinite(num) ? num : -1,
      title: String(ch?.title || '').trim() || (numberRaw ? `الفصل ${numberRaw}` : 'الفصل'),
      lang: String(ch?.lang || 'ar'),
      group: String(ch?.scanlationGroup || '')
    });
  }
  return out.sort((a, b) => b.sortKey - a.sortKey);
}

/** Chapters + servers for one title, the same way the website's library modal loads them. */
export async function fetchMobileMangaChapters(hit, preferredServer = '') {
  const id = String(hit?.bxId || '').trim();
  if (!id) return { chapters: [], availableServers: [], activeServer: '' };
  const requested = serverIdFrom(preferredServer) || serverIdFrom(hit?.bxServer);
  const qs = requested ? `?server=${encodeURIComponent(requested)}` : '';

  let rawChapters = [];
  let servers = [];
  let active = requested;
  const detail = await bxRequestJson(`/api/content/library/${encodeURIComponent(id)}${qs}`, { timeoutMs: 25000 }).catch(
    () => null
  );
  if (detail?.item) {
    rawChapters = detail.item.chapters || [];
    servers = detail.item.availableServers || [];
    active = serverIdFrom(detail.item.activeServer) || requested;
  } else {
    const res = await bxRequestJson(`/api/manga/${encodeURIComponent(id)}/chapters${qs}`, { timeoutMs: 25000 });
    rawChapters = res?.chapters || [];
    servers = res?.availableServers || [];
    active = serverIdFrom(res?.activeServer) || requested;
  }
  return {
    chapters: mapBxChapters(rawChapters, { mangaId: id, server: active }),
    availableServers: normalizeServerList(servers.length ? servers : hit?.bxServers || []),
    activeServer: active
  };
}

/** Page URL as the APK should first try it: absolute and not wrapped in the image proxy. */
export function normalizeMangaPageUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  const proxied = s.match(/\/api\/proxy\/image\?(?:[^#]*?&)?url=([^&#]+)/i);
  if (proxied) {
    try {
      s = decodeURIComponent(proxied[1]);
    } catch {
      return '';
    }
  }
  if (s.startsWith('//')) s = `https:${s}`;
  if (s.startsWith('/api/')) return bxApiUrl(s);
  return /^https?:\/\//i.test(s) ? s : '';
}

/** The website's own page proxy (sends the source's Referer); used when a direct load fails. */
export function bxImageProxyUrl(raw) {
  const direct = normalizeMangaPageUrl(raw);
  if (!direct || /\/api\/proxy\/image\?/i.test(direct)) return direct;
  return bxApiUrl(`/api/proxy/image?url=${encodeURIComponent(direct)}`);
}

export async function fetchMobileChapterPages(chapter) {
  const chapterId = String(chapter?.chapterId || '').trim();
  if (!chapterId) return [];
  const server = serverIdFrom(chapter?.server);
  const qs = server ? `?server=${encodeURIComponent(server)}` : '';
  const data = await bxRequestJson(`/api/manga/chapter/${encodeURIComponent(chapterId)}/pages${qs}`, {
    timeoutMs: 30000
  });
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  return pages
    .map((p, idx) => ({
      order: Number(p?.pageNumber) || idx + 1,
      url: normalizeMangaPageUrl(typeof p === 'string' ? p : p?.directUrl || p?.url || p?.imageUrl || '')
    }))
    .filter((p) => p.url)
    .sort((a, b) => a.order - b.order)
    .map((p) => p.url);
}

/**
 * Re-open an entry saved by an older APK build (no website id): exact title
 * match only, never "closest" guesses.
 */
export async function findBxMangaByTitle(name) {
  const key = normalizeTitleKey(name);
  if (key.length < 2) return null;
  const list = await fetchMobileMangaList({ server: 'all', query: String(name), page: 1 }).catch(() => []);
  return list.find((m) => normalizeTitleKey(m.name) === key || normalizeTitleKey(m.name_en) === key) || null;
}
