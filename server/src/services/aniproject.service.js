/*
 * Optional AniProject v3 backend adapter. The GitHub release is source code,
 * not a hosted catalog: operators must supply their own backend URL. No code
 * from that CC BY-NC-SA project is bundled here; these are its public routes.
 *
 * Anime:  /search/anime/consumet/zoro, /media-info/anime/consumet/zoro,
 *         /episodes/consumet/zoro/episode
 * Manga:  /search/manga/consumet/mangadex/:query,
 *         /chapters/consumet/mangadex/all|chapter
 */
import { mangalikService } from './mangalik.service.js';

export const ANIPROJECT_ANIME_SOURCE = 'aniproject';
export const ANIPROJECT_MANGA_SERVER = 'bx4';
const LABEL = 'سيرفر Hearbor 4';
const MAX_ID_LENGTH = 180;
const MAX_QUERY_LENGTH = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function configuredBase() {
  const raw = String(process.env.ANIPROJECT_API_URL || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const localDev = !process.env.VERCEL && process.env.NODE_ENV !== 'production' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(localDev && url.protocol === 'http:')) ||
        url.username || url.password || url.search || url.hash || !url.hostname ||
        url.hostname.endsWith('.local') || url.hostname.endsWith('.internal')) return null;
    return url.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function isAniProjectConfigured() {
  return Boolean(configuredBase());
}

// These hosts are explicitly configured by the operator, not learned from a
// response or a request. Never turn an upstream video URL into an open proxy.
export function isAniProjectMediaHost(host) {
  const hostname = String(host || '').toLowerCase().replace(/\.$/, '');
  return String(process.env.ANIPROJECT_MEDIA_HOSTS || '').split(',').some((item) => {
    const allowed = item.trim().toLowerCase();
    if (!/^(?=.{4,253}$)[a-z0-9.-]+\.[a-z]{2,}$/.test(allowed) ||
        allowed.includes('..') || allowed.endsWith('.local') || allowed.endsWith('.internal')) return false;
    return hostname === allowed || hostname.endsWith(`.${allowed}`);
  });
}

function sourceError(code) {
  return Object.assign(new Error(code), { code });
}

function resultList(body) {
  if (!Array.isArray(body.results)) throw sourceError('upstream');
  return body.results;
}

async function request(path, params) {
  const base = configuredBase();
  if (!base) throw sourceError('source_unavailable');
  const url = new URL(`${base}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(8000)
  });
  // The v3 search/chapters controllers use 404 + an empty results array for
  // legitimate misses. Do not turn a title with no matches into a 502; a
  // missing route or an actual upstream failure must still be an error.
  if (!response.ok && response.status !== 404) throw sourceError('upstream');
  let body;
  try { body = await response.json(); } catch { throw sourceError('upstream'); }
  if (!body || typeof body !== 'object' || body.error ||
      (response.status === 404 && !(
        (Array.isArray(body.results) && body.results.length === 0) || body.result === null
      ))) throw sourceError('upstream');
  return body;
}

function encodeId(value, prefix) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_ID_LENGTH || /[\x00-\x1f\x7f]/.test(value)) return null;
  return `${prefix}${Buffer.from(value, 'utf8').toString('base64url')}`;
}

function decodeId(value, prefix) {
  const raw = String(value || '');
  const encoded = raw.startsWith(prefix) ? raw.slice(prefix.length) : '';
  if (!encoded || encoded.length > 4 * MAX_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  return encodeId(decoded, prefix) === raw ? decoded : null;
}

export const isAniProjectAnimeSlug = (value) => String(value || '').startsWith('ap-');
export const isAniProjectMangaId = (value) => String(value || '').startsWith('ap:');
export const isAniProjectChapterId = (value) => String(value || '').startsWith('apc:');

function safeUrl(value, mangaOnly = false) {
  if (typeof value !== 'string' || value.length > 4096) return '';
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        !url.hostname || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[|::)/i.test(url.hostname) ||
        url.hostname.endsWith('.local') || url.hostname.endsWith('.internal')) return '';
    if (mangaOnly && (url.protocol !== 'https:' || !(
      url.hostname === 'uploads.mangadex.org' ||
      url.hostname.endsWith('.mangadex.org') ||
      url.hostname === 'mangadex.network' ||
      url.hostname.endsWith('.mangadex.network')
    ))) return '';
    return url.href;
  } catch {
    return '';
  }
}

const mangaCache = new Map();
function cacheManga(item) {
  if (mangaCache.size >= 150) mangaCache.delete(mangaCache.keys().next().value);
  mangaCache.set(item.id, { item, expiry: Date.now() + 10 * 60 * 1000 });
}

function mangaFromRow(row) {
  const id = encodeId(row?.id, 'ap:');
  if (!id) return null;
  const title = String(row.title || '').trim() || 'Manga';
  const item = {
    id,
    mangalikSlug: id,
    title: title,
    title_ar: title,
    title_en: title,
    poster: safeUrl(row.image || '', true),
    banner: safeUrl(row.image || '', true),
    description_ar: String(row.description || ''),
    description_en: String(row.description || ''),
    type: 'MANGA',
    status: String(row.status || ''),
    rating: Number(row.rating) || null,
    chapters_count: null,
    source: 'Hearbor 4',
    server: ANIPROJECT_MANGA_SERVER,
    availableServers: [ANIPROJECT_MANGA_SERVER]
  };
  cacheManga(item);
  return item;
}

export const aniprojectService = {
  async searchAnime(query) {
    const q = String(query || '').trim().slice(0, MAX_QUERY_LENGTH);
    if (!q || !isAniProjectConfigured()) return [];
    const data = await request('search/anime/consumet/zoro', { query: q });
    return resultList(data).map((row) => {
      const slug = encodeId(row?.id, 'ap-');
      if (!slug) return null;
      const title = String(row.title || row.name || row.id);
      return {
        slug, titleEn: title, titleAr: title, poster: safeUrl(row.image || ''),
        source: ANIPROJECT_ANIME_SOURCE, sourceLabel: LABEL, sourceName: LABEL,
        kind: 'anime'
      };
    }).filter(Boolean);
  },

  async getShow(slug) {
    const id = decodeId(slug, 'ap-');
    if (!id) return null;
    const data = await request('media-info/anime/consumet/zoro', { query: id });
    if (!Object.hasOwn(data, 'result')) throw sourceError('upstream');
    const row = data.result;
    if (!row || typeof row !== 'object' || !row.title) return null;
    const title = String(row.title);
    const episodes = (Array.isArray(row.episodes) ? row.episodes : [])
      .map((ep) => ({ id: encodeId(ep?.id, 'ape-'), number: Number(ep?.number) }))
      .filter((ep) => ep.id && Number.isInteger(ep.number) && ep.number > 0)
      .map((ep) => ({ ...ep, episode: ep.number, title: `${title} - ${ep.number}` }))
      .sort((a, b) => a.number - b.number);
    return {
      slug, titleEn: title, titleAr: title,
      poster: safeUrl(row.image || ''), banner: safeUrl(row.image || ''),
      description: String(row.description || '').replace(/<[^>]*>/g, ''),
      episodeCount: episodes.length || Number(row.totalEpisodes) || 0,
      episodes, genres: Array.isArray(row.genres) ? row.genres : [],
      status: String(row.status || ''), source: ANIPROJECT_ANIME_SOURCE, sourceName: LABEL
    };
  },

  async getEpisode(slug, number) {
    if (!Number.isInteger(number) || number < 1) return null;
    const show = await this.getShow(slug);
    const episode = show?.episodes.find((ep) => ep.number === number);
    if (!episode) return null;
    const data = await request('episodes/consumet/zoro/episode', { id: decodeId(episode.id, 'ape-') });
    const result = data.results;
    if (!result || typeof result !== 'object') throw sourceError('upstream');
    const sources = Array.isArray(result.sources) ? result.sources : [];
    const referer = safeUrl(result?.headers?.Referer || result?.headers?.referer);
    const entries = [];
    const resolved = {};
    sources.forEach((row, index) => {
      const url = safeUrl(row?.url);
      if (!url) return;
      const id = `ap-${index}`;
      const hls = Boolean(row.isM3U8) || /\.m3u8(?:$|\?)/i.test(url);
      const proxied = isAniProjectMediaHost(new URL(url).hostname);
      const refParam = referer ? `&ref=${encodeURIComponent(referer)}` : '';
      const source = hls
        ? {
            directUrl: proxied ? `/api/stream/hls-proxy?url=${encodeURIComponent(url)}${refParam}` : url,
            browserDirect: true, isHls: true
          }
        : {
            directUrl: proxied ? `/api/stream/proxy?url=${encodeURIComponent(url)}${refParam}` : url,
            browserDirect: !proxied, isHls: false
          };
      entries.push({ id, server: 'Hearbor 4', quality: String(row.quality || 'Auto'), version: 'sub', ...source });
      resolved[id] = source;
    });
    const downloadUrl = safeUrl(result?.download);
    const downloads = downloadUrl ? [{
      id: 'dl-ap-0', server: 'Hearbor 4', quality: 'Download', downloadUrl
    }] : [];
    return {
      slug, episode: number, title: `${show.titleEn} - ${number}`,
      entries, downloads, resolved,
      resolvedDownloads: downloadUrl ? { 'dl-ap-0': { url: downloadUrl, directUrl: downloadUrl } } : {}
    };
  },

  async resolveEntry(slug, number, entryId) {
    if (!isAniProjectAnimeSlug(slug) || !/^ap-\d+$/.test(entryId)) return null;
    const episode = await this.getEpisode(slug, number);
    return episode?.resolved[entryId] || null;
  },

  async resolveDownload(slug, number, entryId) {
    if (!isAniProjectAnimeSlug(slug) || entryId !== 'dl-ap-0') return null;
    const episode = await this.getEpisode(slug, number);
    return episode?.resolvedDownloads[entryId] || null;
  },

  async searchManga(query) {
    const q = String(query || '').trim().slice(0, MAX_QUERY_LENGTH);
    if (!q || !isAniProjectConfigured()) return [];
    const data = await request(`search/manga/consumet/mangadex/${encodeURIComponent(q)}`);
    return resultList(data).map(mangaFromRow).filter(Boolean);
  },

  async getManga(id) {
    if (!decodeId(id, 'ap:')) return null;
    const cached = mangaCache.get(id);
    if (cached?.expiry > Date.now()) return cached.item;
    return {
      id, mangalikSlug: id, title: 'Manga', title_ar: 'مانجا', title_en: 'Manga',
      source: 'Hearbor 4', server: ANIPROJECT_MANGA_SERVER,
      availableServers: [ANIPROJECT_MANGA_SERVER]
    };
  },

  async getMangaChapters(id) {
    const rawId = decodeId(id, 'ap:');
    if (!rawId) return [];
    const data = await request('chapters/consumet/mangadex/all', { id: rawId });
    return resultList(data).map((row) => {
      const chapterId = encodeId(row?.id, 'apc:');
      if (!chapterId) return null;
      const chapterNumber = String(row.chapterNumber ?? '').trim();
      return {
        chapterId, slug: chapterId, chapterNumber,
        title: String(row.title || `الفصل ${chapterNumber}`),
        server: ANIPROJECT_MANGA_SERVER,
        pagesCount: Number(row.pages) || 0
      };
    }).filter(Boolean);
  },

  async getChapterPages(chapterId) {
    const id = decodeId(chapterId, 'apc:');
    if (!id) return [];
    let rows = [];
    try {
      const data = await request('chapters/consumet/mangadex/chapter', { id });
      rows = Array.isArray(data.results) ? data.results :
        Array.isArray(data.results?.pages) ? data.results.pages : null;
      if (!rows) throw sourceError('upstream');
    } catch (err) {
      if (!UUID.test(id)) throw err;
    }
    // The v3 chapter wrapper sometimes returns [] even for valid chapters.
    // Only fall back to the existing MangaDex at-home adapter for UUIDs.
    if (!rows.length && UUID.test(id)) {
      rows = await mangalikService.getMangaDexChapterPages(id);
    }
    return rows.map((page, index) => {
      const imageUrl = safeUrl(page?.img || page?.imageUrl || page?.url, true);
      return imageUrl ? { pageNumber: index + 1, imageUrl, url: imageUrl } : null;
    }).filter(Boolean);
  }
};
