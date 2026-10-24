/**
 * Hearbor Server 2 — Live Arabic Anime API Engine
 * -----------------------------------------------
 * Powered by the live Arabic Anime v4 API (thousands of Arabic-subtitled series & movies).
 * Features:
 *  - Massive dynamic catalog (latest, popular, top-rated, search, full episode lists)
 *  - Direct Arabic-subtitled MP4 extraction (1080p FHD, 720p HD, 480p SD via MediaFire & Sendvid)
 *  - Sandbox-free HTML5 & Embed players (Hearbor Direct, OK.ru, Sendvid, Google Drive, Mega)
 *  - Working direct MP4 download servers for every episode
 *  - 100% pure Hearbor branding with zero mention of upstream sources
 */
import { apiGet, apiSet, streamGet, streamSet } from '../db.js';
import { isTitleMatch } from '../witanime.js';
import { isStrictCrossSourceMatch } from '../lib/crossSourceMatch.js';

const CREDENTIALS_ENDPOINT = 'https://api.ani-cli-arabic.dev/credentials';
const CREDENTIALS_SECRET = '6rK9z0XyW8vQ3J7pL2mN4sB1tH5gD0fA';

let cachedCreds = {
  apiBase: 'https://animeify.net/animeify/apis_v4/',
  token: '8cnY80AZSbUCmR26Vku1VUUY4',
  thumbBase: 'https://animeify.net/animeify/files/thumbnails/',
  fetchedAt: 0
};

async function getApiCreds() {
  if (Date.now() - cachedCreds.fetchedAt < 6 * 60 * 60 * 1000 && cachedCreds.apiBase && cachedCreds.token) {
    return cachedCreds;
  }
  try {
    const res = await fetch(CREDENTIALS_ENDPOINT, {
      headers: {
        'X-Auth-Key': CREDENTIALS_SECRET,
        'User-Agent': 'AniCliAr/2.0'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ANI_CLI_AR_API_BASE && data?.ANI_CLI_AR_TOKEN) {
        cachedCreds = {
          apiBase: data.ANI_CLI_AR_API_BASE,
          token: data.ANI_CLI_AR_TOKEN,
          thumbBase: data.THUMBNAILS_BASE_URL || cachedCreds.thumbBase,
          fetchedAt: Date.now()
        };
      }
    }
  } catch {}
  cachedCreds.fetchedAt = Date.now();
  return cachedCreds;
}

function toSlug(animeId, titleEn) {
  const cleanId = String(animeId || '').trim();
  if (cleanId) return `a3rb-${cleanId}`;
  const fallback = String(titleEn || 'anime')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `a3rb-${fallback}`;
}

function normalizeAnimeItem(item, thumbBase) {
  if (!item || typeof item !== 'object') return null;
  const animeId = String(item.AnimeId || item.anime_id || '').trim();
  if (!animeId) return null;

  const titleEn = String(item.EN_Title || item.Synonyms || animeId).trim();
  const titleAr = String(item.AR_Title || item.EN_Title || titleEn).trim();
  const poster = item.Thumbnail ? `${thumbBase}${item.Thumbnail}` : '';
  // Unknown values stay unknown (no invented 12 episodes, 8.6 score or "Action, Fantasy").
  const epCount = parseInt(item.Episodes, 10) > 0 ? parseInt(item.Episodes, 10) : null;
  const rawScore = parseFloat(item.Score);
  const score = Number.isFinite(rawScore) && rawScore > 0 && rawScore <= 10 ? Number(rawScore.toFixed(1)) : null;
  const genres = String(item.Genres || '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
  const slug = toSlug(animeId, titleEn);

  const norm = {
    slug,
    anime3rbId: animeId,
    malId: item.MalId_org ? Number(item.MalId_org) : null,
    kind: item.Type === 'MOVIE' ? 'movie' : 'anime',
    type: item.Type === 'MOVIE' ? 'Movie' : 'TV Series',
    titleEn,
    titleAr,
    titleRomaji: titleEn,
    poster,
    banner: poster,
    score,
    rating: score,
    status: item.Status === 'AIRING' ? 'يعرض الان' : 'مكتمل',
    season: item.Premiered || item.Aired || '',
    episodes: epCount,
    episodeCount: epCount,
    genres,
    description: `${titleAr}${item.Synonyms ? ` — ${item.Synonyms}` : ''}${genres.length ? ` (${genres.join(' • ')})` : ''}`,
    url: `/show/${slug}?source=anime3rb`,
    source: 'anime3rb',
    sourceLabel: 'سيرفر Hearbor 2'
  };
  apiSet(`bx2:record:v3:${animeId}`, norm, 6 * 60 * 60 * 1000);
  apiSet(`bx2:record:v3:${animeId.toLowerCase()}`, norm, 6 * 60 * 60 * 1000);
  return norm;
}

async function extractMediafireDirect(mfCodeOrUrl) {
  if (!mfCodeOrUrl) return null;
  const mfUrl = String(mfCodeOrUrl).startsWith('http')
    ? String(mfCodeOrUrl)
    : `https://www.mediafire.com/file/${mfCodeOrUrl}`;

  const cacheKey = `bx:mf:direct:${mfUrl}`;
  const cached = streamGet(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(mfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/(https:\/\/download[^"'\s<>]+)/i);
      if (match && match[1]) {
        streamSet(cacheKey, match[1], 12 * 60 * 1000);
        return match[1];
      }
    }
  } catch {}
  return null;
}

async function extractSendvidDirect(svCode) {
  if (!svCode) return null;
  const embedUrl = String(svCode).startsWith('http')
    ? String(svCode)
    : `https://sendvid.com/embed/${svCode}`;
  const cacheKey = `bx:sv:direct:${embedUrl}`;
  const cached = streamGet(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(embedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(7000)
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/i);
      if (m && m[0]) {
        streamSet(cacheKey, m[0], 2 * 60 * 60 * 1000);
        return m[0];
      }
    }
  } catch {}
  return null;
}

export const ANIME3RB_CATALOG = [];

class Anime3rbService {
  async fetchList({ filterType = '', filterData = '', animeType = 'SERIES', fromIndex = 0 } = {}) {
    const { apiBase, token, thumbBase } = await getApiCreds();
    const res = await fetch(`${apiBase}anime/load_anime_list_v2.php`, {
      method: 'POST',
      body: new URLSearchParams({
        UserId: '0',
        Language: 'AR',
        FilterType: filterType,
        FilterData: filterData,
        Type: animeType,
        From: String(fromIndex),
        Token: token
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => []);
    if (!Array.isArray(data)) return [];
    return data.map((item) => normalizeAnimeItem(item, thumbBase)).filter(Boolean);
  }

  async getLatestEpisodes(page = 1) {
    const p = Math.max(1, Number(page) || 1);
    const cacheKey = `bx2:latest:v3:${p}`;
    const cached = apiGet(cacheKey);
    if (cached) return cached;

    try {
      const { apiBase, token, thumbBase } = await getApiCreds();
      const fromIndex = (p - 1) * 20;
      const [latestRes, topRes] = await Promise.allSettled([
        fetch(`${apiBase}anime/load_latest_anime.php`, {
          method: 'POST',
          body: new URLSearchParams({
            UserId: '0',
            Language: 'AR',
            From: String(fromIndex),
            Token: token
          }),
          signal: AbortSignal.timeout(10000)
        }).then((r) => r.json()),
        this.fetchList({ filterType: 'SORT', filterData: 'HIGHEST_RATE', animeType: 'SERIES', fromIndex })
      ]);

      const items = [];
      const seen = new Set();

      if (latestRes.status === 'fulfilled' && Array.isArray(latestRes.value)) {
        for (const raw of latestRes.value) {
          const norm = normalizeAnimeItem(raw, thumbBase);
          if (norm && !seen.has(norm.slug)) {
            seen.add(norm.slug);
            items.push(norm);
          }
        }
      }
      if (topRes.status === 'fulfilled' && Array.isArray(topRes.value)) {
        for (const norm of topRes.value) {
          if (norm && !seen.has(norm.slug)) {
            seen.add(norm.slug);
            items.push(norm);
          }
        }
      }

      if (items.length) {
        apiSet(cacheKey, items, 20 * 60 * 1000);
      }
      return items;
    } catch {
      return [];
    }
  }

  async search(query) {
    const q = String(query || '').trim();
    if (!q) return this.getLatestEpisodes(1);

    const cacheKey = `bx2:search:v3:${q.toLowerCase()}`;
    const cached = apiGet(cacheKey);
    if (cached) return cached;

    try {
      const [series, movies] = await Promise.all([
        this.fetchList({ filterType: 'SEARCH', filterData: q, animeType: 'SERIES', fromIndex: 0 }),
        this.fetchList({ filterType: 'SEARCH', filterData: q, animeType: 'MOVIE', fromIndex: 0 })
      ]);
      const combined = [...series, ...movies].filter((item) =>
        isTitleMatch(q, `${item.titleEn} ${item.titleAr}`, item.anime3rbId)
      );
      apiSet(cacheKey, combined, 20 * 60 * 1000);
      return combined;
    } catch {
      return [];
    }
  }

  async resolveAnimeRecord(rawSlug) {
    const clean = String(rawSlug || '')
      .replace(/^a3rb-/, '')
      .replace(/^ok-/, '')
      .replace(/^blkom-/, '')
      .replace(/^en-\d+-/, '')
      .trim();
    if (!clean) return null;

    // Native Hearbor 2 ids look like xSousounoFrieren. Anything else (e.g. words from a Hearbor 1
    // slug) is a cross-server link and must name the very same show and season.
    const isNativeId = clean.startsWith('x') && /[A-Z]/.test(clean.slice(1));
    const cacheKey = isNativeId ? `bx2:record:v3:${clean}` : `bx2:xlink:v1:${clean.toLowerCase()}`;
    const cached = apiGet(cacheKey) || (isNativeId ? apiGet(`bx2:record:v3:${clean.toLowerCase()}`) : null);
    if (cached) return cached;

    // 1) If clean starts with 'x' (native AnimeId like xSousounoFrieren or xOnePiece), search by title derived from camelCase/words
    const searchQuery = isNativeId
      ? clean.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\d+$/g, '').trim()
      : clean.replace(/-/g, ' ').trim();
    const titleMatches = (x) =>
      isNativeId
        ? isTitleMatch(searchQuery, `${x.titleEn} ${x.titleAr}`, x.anime3rbId)
        : isStrictCrossSourceMatch(searchQuery, x.titleEn, x.titleRomaji);

    const [series, movies] = await Promise.all([
      this.fetchList({ filterType: 'SEARCH', filterData: searchQuery, animeType: 'SERIES', fromIndex: 0 }),
      this.fetchList({ filterType: 'SEARCH', filterData: searchQuery, animeType: 'MOVIE', fromIndex: 0 })
    ]);
    const all = [...series, ...movies];

    // Exact AnimeId match first
    let found = all.find((x) => x.anime3rbId.toLowerCase() === clean.toLowerCase());
    if (!found) {
      found = all.find(titleMatches);
    }

    // If still not found and searchQuery has > 2 words, try first 2 words with strict title check
    if (!found) {
      const words = searchQuery.split(/\s+/).filter((w) => w.length >= 3);
      if (words.length >= 2) {
        const shortQ = words.slice(0, 2).join(' ');
        const retry = await this.fetchList({ filterType: 'SEARCH', filterData: shortQ, animeType: 'SERIES', fromIndex: 0 });
        found = retry.find((x) => x.anime3rbId.toLowerCase() === clean.toLowerCase() || titleMatches(x)) || null;
      }
    }

    // Direct AnimeId fallback when clean is already a native 'x...' AnimeId (e.g. xShingekinoKyojinTheFinalSeason)
    if (!found && clean.startsWith('x') && clean.length > 2) {
      found = {
        slug: toSlug(clean, searchQuery),
        anime3rbId: clean,
        malId: null,
        kind: 'anime',
        type: 'TV Series',
        titleEn: searchQuery,
        titleAr: searchQuery,
        titleRomaji: searchQuery,
        poster: '',
        banner: '',
        score: null,
        rating: null,
        status: '',
        season: '',
        episodes: null,
        episodeCount: null,
        genres: [],
        description: searchQuery,
        url: `/show/${toSlug(clean, searchQuery)}?source=anime3rb`,
        source: 'anime3rb',
        sourceLabel: 'سيرفر Hearbor 2'
      };
    }

    if (found) {
      apiSet(cacheKey, found, 30 * 60 * 1000);
    }
    return found || null;
  }

  async getShow(rawSlug) {
    const clean = String(rawSlug || '').replace(/^a3rb-/, '').trim();
    const cacheKey = `bx2:show:v3:${clean}`;
    const cached = apiGet(cacheKey);
    if (cached) return cached;

    const record = await this.resolveAnimeRecord(clean);
    if (!record) return null;

    const { apiBase, token } = await getApiCreds();
    let episodesList = [];
    try {
      const epRes = await fetch(`${apiBase}episodes/load_episodes.php`, {
        method: 'POST',
        body: new URLSearchParams({
          AnimeID: record.anime3rbId,
          Token: token
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (epRes.ok) {
        const epData = await epRes.json().catch(() => []);
        if (Array.isArray(epData) && epData.length) {
          episodesList = epData.map((ep, idx) => {
            const num = Math.max(1, parseInt(ep.Episode, 10) || idx + 1);
            return {
              episode: num,
              title: `الحلقة ${num}`,
              url: `/watch/${record.slug}/${num}?source=anime3rb`
            };
          });
        }
      }
    } catch {}

    if (!episodesList.length) {
      // Only a count the catalogue really reported (never an invented 12 episodes).
      const count = Number(record.episodeCount) > 0 ? Number(record.episodeCount) : 0;
      episodesList = Array.from({ length: count }, (_, idx) => ({
        episode: idx + 1,
        title: `الحلقة ${idx + 1}`,
        url: `/watch/${record.slug}/${idx + 1}?source=anime3rb`
      }));
    }

    const show = {
      ...record,
      episodeCount: episodesList.length,
      episodes: episodesList,
      source: 'anime3rb',
      sourceName: 'سيرفر Hearbor 2'
    };

    apiSet(cacheKey, show, 30 * 60 * 1000);
    return show;
  }

  async getEpisode(rawSlug, epNum = 1) {
    const ep = Math.max(1, Number(epNum) || 1);
    const record = await this.resolveAnimeRecord(rawSlug);
    if (!record) return null;

    const cacheKey = `bx2:ep:v3:${record.anime3rbId}:${ep}`;
    const cached = streamGet(cacheKey);
    if (cached) return cached;

    const { apiBase, token } = await getApiCreds();
    let currentEp = null;

    try {
      const srvRes = await fetch(`${apiBase}anime/load_servers.php`, {
        method: 'POST',
        body: new URLSearchParams({
          UserId: '0',
          AnimeId: record.anime3rbId,
          Episode: String(ep),
          AnimeType: record.kind === 'movie' ? 'MOVIE' : 'SERIES',
          Token: token
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (srvRes.ok) {
        const srvJson = await srvRes.json().catch(() => null);
        currentEp = srvJson?.CurrentEpisode || null;
      }
    } catch {}

    if (!currentEp) {
      try {
        const epRes = await fetch(`${apiBase}episodes/load_episodes.php`, {
          method: 'POST',
          body: new URLSearchParams({
            AnimeID: record.anime3rbId,
            Token: token
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (epRes.ok) {
          const list = await epRes.json().catch(() => []);
          if (Array.isArray(list)) {
            currentEp = list.find((x) => Number(x.Episode) === ep) || list[ep - 1] || null;
          }
        }
      } catch {}
    }

    if (!currentEp) return null;

    // Extract direct MP4 links in parallel (MediaFire 1080p, 720p, 480p + Sendvid)
    const [mfFhd, mfHd, mfSd, svDirect] = await Promise.all([
      extractMediafireDirect(currentEp.FRFhdQ),
      extractMediafireDirect(currentEp.FRLink),
      extractMediafireDirect(currentEp.FRLowQ),
      extractSendvidDirect(currentEp.SVLink || currentEp.SVLowQ)
    ]);

    const entries = [];
    const downloads = [];
    const resolved = {};
    const resolvedDownloads = {};

    // 1) 720p HD Direct MP4 (Default for Free & VIP — plays in native <video> with ZERO iframe sandbox!)
    if (mfHd) {
      const id = `a3rb-hd-${record.anime3rbId}-${ep}`;
      const embedUrl = `/api/stream/mp4-player?url=${encodeURIComponent(mfHd)}`;
      entries.push({
        id,
        token: id,
        server: '⚡ Hearbor Direct 720p HD',
        quality: '720p HD',
        version: 'sub',
        lang: 'ar',
        embedUrl,
        directUrl: mfHd,
        isFastCdn: true,
        source: 'anime3rb'
      });
      resolved[id] = { embedUrl, directUrl: mfHd };

      const dlId = `dl-a3rb-hd-${record.anime3rbId}-${ep}`;
      const dlUrl = `/api/stream/download?url=${encodeURIComponent(mfHd)}&filename=${encodeURIComponent(`${record.titleEn}-EP${ep}-720p.mp4`)}`;
      downloads.push({
        id: dlId,
        token: dlId,
        server: '📥 سيرفر تحميل Hearbor المباشر (720p HD)',
        quality: '720p HD',
        version: 'sub',
        lang: 'ar',
        downloadUrl: dlUrl
      });
      resolvedDownloads[dlId] = { url: dlUrl, directUrl: dlUrl };
    }

    // 2) 1080p FHD Direct MP4
    if (mfFhd) {
      const id = `a3rb-fhd-${record.anime3rbId}-${ep}`;
      const embedUrl = `/api/stream/mp4-player?url=${encodeURIComponent(mfFhd)}`;
      entries.push({
        id,
        token: id,
        server: '👑 Hearbor Direct 1080p FHD',
        quality: '1080p FHD',
        version: 'sub',
        lang: 'ar',
        embedUrl,
        directUrl: mfFhd,
        isFastCdn: true,
        source: 'anime3rb'
      });
      resolved[id] = { embedUrl, directUrl: mfFhd };

      const dlId = `dl-a3rb-fhd-${record.anime3rbId}-${ep}`;
      const dlUrl = `/api/stream/download?url=${encodeURIComponent(mfFhd)}&filename=${encodeURIComponent(`${record.titleEn}-EP${ep}-1080p.mp4`)}`;
      downloads.push({
        id: dlId,
        token: dlId,
        server: '📥 سيرفر تحميل Hearbor المباشر (1080p FHD)',
        quality: '1080p FHD',
        version: 'sub',
        lang: 'ar',
        downloadUrl: dlUrl
      });
      resolvedDownloads[dlId] = { url: dlUrl, directUrl: dlUrl };
    }

    // 3) 480p SD Direct MP4
    if (mfSd) {
      const id = `a3rb-sd-${record.anime3rbId}-${ep}`;
      const embedUrl = `/api/stream/mp4-player?url=${encodeURIComponent(mfSd)}`;
      entries.push({
        id,
        token: id,
        server: '📱 Hearbor Direct 480p SD',
        quality: '480p SD',
        version: 'sub',
        lang: 'ar',
        embedUrl,
        directUrl: mfSd,
        isFastCdn: true,
        source: 'anime3rb'
      });
      resolved[id] = { embedUrl, directUrl: mfSd };

      const dlId = `dl-a3rb-sd-${record.anime3rbId}-${ep}`;
      const dlUrl = `/api/stream/download?url=${encodeURIComponent(mfSd)}&filename=${encodeURIComponent(`${record.titleEn}-EP${ep}-480p.mp4`)}`;
      downloads.push({
        id: dlId,
        token: dlId,
        server: '📥 سيرفر تحميل Hearbor المباشر (480p SD)',
        quality: '480p SD',
        version: 'sub',
        lang: 'ar',
        downloadUrl: dlUrl
      });
      resolvedDownloads[dlId] = { url: dlUrl, directUrl: dlUrl };
    }

    // 4) Sendvid Direct / Embed
    if (currentEp.SVLink || currentEp.SVLowQ) {
      const svCode = currentEp.SVLink || currentEp.SVLowQ;
      const svEmbed = String(svCode).startsWith('http') ? String(svCode) : `https://sendvid.com/embed/${svCode}`;
      const id = `a3rb-sv-${record.anime3rbId}-${ep}`;
      entries.push({
        id,
        token: id,
        server: '🎬 Hearbor Stream 1 (HD)',
        quality: '720p HD',
        version: 'sub',
        lang: 'ar',
        embedUrl: svEmbed,
        directUrl: svDirect || null,
        isFastCdn: true,
        source: 'anime3rb'
      });
      resolved[id] = { embedUrl: svEmbed, directUrl: svDirect || null };
    }

    // 5) OK.ru Sandbox-Free Embed
    if (currentEp.OKLink) {
      const okEmbed = String(currentEp.OKLink).startsWith('http')
        ? String(currentEp.OKLink)
        : `https://ok.ru/videoembed/${currentEp.OKLink}`;
      const id = `a3rb-ok-${record.anime3rbId}-${ep}`;
      entries.push({
        id,
        token: id,
        server: '🌐 Hearbor Stream 2 (HD)',
        quality: '720p HD',
        version: 'sub',
        lang: 'ar',
        embedUrl: okEmbed,
        directUrl: null,
        isFastCdn: true,
        source: 'anime3rb'
      });
      resolved[id] = { embedUrl: okEmbed, directUrl: null };
    }

    // 6) Google Drive Embed
    if (currentEp.GDFhdQ || currentEp.GDLink) {
      const gdCode = currentEp.GDFhdQ || currentEp.GDLink;
      const gdEmbed = String(gdCode).startsWith('http')
        ? String(gdCode)
        : `https://drive.google.com/file/d/${gdCode}/preview`;
      const id = `a3rb-gd-${record.anime3rbId}-${ep}`;
      entries.push({
        id,
        token: id,
        server: '☁️ Hearbor Cloud 1 (FHD)',
        quality: '1080p FHD',
        version: 'sub',
        lang: 'ar',
        embedUrl: gdEmbed,
        directUrl: null,
        isFastCdn: true,
        source: 'anime3rb'
      });
      resolved[id] = { embedUrl: gdEmbed, directUrl: null };
    }

    // 7) Mega Cloud
    if (currentEp.MALink) {
      const megaHash = String(currentEp.MALink).replace('!', '#');
      const megaEmbed = megaHash.startsWith('http') ? megaHash : `https://mega.nz/embed/${megaHash}`;
      const megaDl = megaHash.startsWith('http') ? megaHash : `https://mega.nz/file/${megaHash}`;
      const id = `a3rb-mega-${record.anime3rbId}-${ep}`;
      entries.push({
        id,
        token: id,
        server: '☁️ Hearbor Cloud 2 (FHD)',
        quality: '1080p FHD',
        version: 'sub',
        lang: 'ar',
        embedUrl: megaEmbed,
        directUrl: null,
        isFastCdn: false,
        source: 'anime3rb'
      });
      resolved[id] = { embedUrl: megaEmbed, directUrl: null };

      const dlId = `dl-a3rb-mega-${record.anime3rbId}-${ep}`;
      downloads.push({
        id: dlId,
        token: dlId,
        server: '📥 سيرفر تحميل Hearbor السحابي',
        quality: 'FHD',
        version: 'sub',
        lang: 'ar',
        downloadUrl: megaDl
      });
      resolvedDownloads[dlId] = { url: megaDl, directUrl: megaDl };
    }

    if (!entries.length) return null;

    const payload = {
      entries,
      downloads,
      resolved,
      resolvedDownloads,
      source: 'anime3rb',
      sourceName: 'سيرفر Hearbor 2'
    };
    streamSet(cacheKey, payload, 2 * 60 * 60 * 1000);
    return payload;
  }
}

export const anime3rbService = new Anime3rbService();
