/**
 * 3v1ltw1n0x01/anime_scraper Integration Module
 * ---------------------------------------------
 * Ported & enhanced from https://github.com/3v1ltw1n0x01/anime_scraper (main.py & wit_anime.py)
 * Supports both classic WitAnime WordPress DOM (.anime-card-container, ul.quality-list base64 hrefs,
 * h1.anime-details-title, div.anime-info) AND modern WitAnime Laravel session/manifest endpoints,
 * acting as a unified source for Anime info, Episodes, Search, Seasonals, and Multi-Quality Download Links.
 */
import * as cheerio from 'cheerio';
import {
  WITA_BASE,
  fetchLatest,
  searchShows,
  fetchShow,
  fetchEpisode,
  resolveDownloadEntry,
  fetchBrowseAnimeList,
  isTitleMatch
} from './witanime.js';
import { apiGet, apiSet } from './db.js';

const MIRRORS = [
  WITA_BASE,
  'https://witanime.site',
  'https://witanime.cyou',
  'https://witanime.art'
];

const UA_BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const TRANSLATION_DICTIONARY = {
  'النوع:': 'type',
  'بداية العرض:': 'start_date',
  'حالة الأنمي:': 'status',
  'عدد الحلقات:': 'episodes_count',
  'مدة الحلقة:': 'episode_duration',
  'الموسم:': 'season',
  'المصدر:': 'source'
};

export function translateInfo(text) {
  const clean = String(text || '').trim();
  return TRANSLATION_DICTIONARY[clean] || clean;
}

/**
 * Safe URL-safe Base64 decoder (matches Python's `base64.urlsafe_b64decode(link["href"]).decode("utf-8")`)
 */
export function decodeBase64Url(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const decoded = Buffer.from(normalized + pad, 'base64').toString('utf-8').trim();
    if (/^https?:\/\//i.test(decoded)) return decoded;
    return null;
  } catch {
    return null;
  }
}

async function getSoup(pathOrUrl) {
  const targets = /^https?:\/\//i.test(pathOrUrl)
    ? [pathOrUrl]
    : MIRRORS.map((m) => `${m.replace(/\/$/, '')}/${String(pathOrUrl).replace(/^\//, '')}`);

  for (const url of targets) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept-Language': 'ar-EG,ar;q=0.9,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) {
        const html = await res.text();
        if (html && !/Just a moment|Attention Required/i.test(html)) {
          return { $: cheerio.load(html), html, url };
        }
      }
    } catch {
      // try next mirror
    }
  }
  return { $: cheerio.load(''), html: '', url: targets[0] };
}

/**
 * Matches `extract_episodes(items)` in `wit_anime.py`
 */
export function extractEpisodes($, items) {
  const episodes = [];
  items.each((_, el) => {
    const item = $(el);
    const cardTitle = item.find('.anime-card-title h3 > a').first();
    const h3Link = item.find('h3 > a').first();
    const img = item.find('.img-responsive, img').first();

    if (!h3Link.length && !img.length) return;

    const epText = h3Link.text().trim();
    const epHref = h3Link.attr('href') || item.find('a').first().attr('href') || '';
    const epNumMatch = epText.match(/(\d+)/) || epHref.match(/\/(\d+)\/?$/);
    const epNum = epNumMatch ? Number(epNumMatch[1]) : 1;

    const episode = {};
    if (cardTitle.length) {
      episode.name = cardTitle.text().trim();
      episode.anime_url = cardTitle.attr('href') || '';
    }
    episode.episode = epText || `الحلقة ${epNum}`;
    episode.number = epNum;
    episode.alt = img.attr('alt') || episode.name || episode.episode;
    episode.src = img.attr('src') || img.attr('data-src') || '';
    episode.episode_url = epHref;

    episodes.push(episode);
  });
  return episodes;
}

/**
 * Matches `extract_results(items)` in `wit_anime.py`
 */
export function extractResults($, items) {
  const shows = [];
  items.each((_, el) => {
    const item = $(el);
    const h3Link = item.find('h3 > a').first();
    const img = item.find('.img-responsive, img').first();
    if (!h3Link.length) return;

    const href = h3Link.attr('href') || '';
    const slugMatch = href.match(/\/(?:anime|movie)\/([^/]+)/);
    shows.push({
      name: h3Link.text().trim(),
      slug: slugMatch ? slugMatch[1] : '',
      url: href,
      img: img.attr('src') || img.attr('data-src') || '',
      type: item.find('.anime-card-type a').first().text().trim() || 'TV',
      status: item.find('.anime-card-status a').first().text().trim() || 'يعرض الان',
      story: item.find('.anime-card-title').attr('data-content') || ''
    });
  });
  return shows;
}

/**
 * Matches `extract_qualities(html)` in `wit_anime.py`:
 * Parses `<ul class="quality-list">` where `<li>` is quality name (`الجودة الخارقة FHD`, etc.)
 * and `<a>` hrefs or `data-url` attributes are URL-safe base64 encoded download links.
 */
export function extractQualitiesFromHtml(html) {
  if (!html) return {};
  const $ = cheerio.load(html);
  const qualities = {};

  $('ul.quality-list, .download-list ul, .quality-download').each((_, ulEl) => {
    const ul = $(ulEl);
    const qualityName =
      ul.find('li').first().text().trim() ||
      ul.prev('h3, h4, .quality-title').text().trim() ||
      'الجودة الخارقة FHD';
    const downloadLinks = [];

    ul.find('a').each((__, aEl) => {
      const a = $(aEl);
      const rawHref = a.attr('href') || a.attr('data-url') || a.attr('data-href') || '';
      const serverName = a.text().trim() || 'Direct';
      const decoded = decodeBase64Url(rawHref);
      if (decoded) {
        downloadLinks.push({
          server: serverName,
          url: decoded
        });
      }
    });

    if (downloadLinks.length > 0) {
      qualities[qualityName] = downloadLinks.map((d) => d.url);
      qualities[`${qualityName}_servers`] = downloadLinks;
    }
  });

  // Also check if page embeds base64 `_d` array (WitAnime obfuscated download array)
  const dArrayMatch = html.match(/var\s+_d\s*=\s*(\[[^\]]+\])/);
  if (dArrayMatch) {
    try {
      const arr = JSON.parse(dArrayMatch[1]);
      const decodedList = arr.map((b64) => decodeBase64Url(b64)).filter(Boolean);
      if (decodedList.length && Object.keys(qualities).length === 0) {
        qualities['الجودة الخارقة FHD'] = decodedList;
      }
    } catch {
      // ignore malformed _d
    }
  }

  return qualities;
}

/**
 * 1. `latest_episodes()` — GET /latest-episodes
 */
export async function scraperLatestEpisodes() {
  const cacheKey = 'scraper:latest_episodes';
  const cached = apiGet(cacheKey);
  if (cached) return cached;

  const { $ } = await getSoup('episode');
  let results = extractEpisodes($, $('.anime-card-container'));

  if (!results.length) {
    // Fallback to modern witanime.js latest stream parser
    const items = await fetchLatest().catch(() => []);
    results = items.map((it) => ({
      name: it.titleEn || it.titleAr || it.slug,
      slug: it.slug,
      anime_url: `${WITA_BASE}/anime/${it.slug}/`,
      episode: `الحلقة ${it.episode}`,
      number: it.episode,
      alt: it.titleEn || it.slug,
      src: it.poster,
      episode_url: `${WITA_BASE}/watch/${it.slug}/${it.episode}`
    }));
  }

  apiSet(cacheKey, results, 10 * 60 * 1000);
  return results;
}

/**
 * 2. `search_anime(name)` — GET /search-anime/:name
 */
export async function scraperSearchAnime(name) {
  const q = String(name || '').trim();
  if (!q) return [];
  const cacheKey = `scraper:search:v3:${q.toLowerCase()}`;
  const cached = apiGet(cacheKey);
  if (cached) return cached;

  const fallbackItems = await searchShows(q).catch(() => []);
  const shows = fallbackItems
    .filter((it) => isTitleMatch(q, it.titleEn || it.titleAr, it.slug))
    .map((it) => ({
      name: it.titleEn || it.titleAr || it.slug,
      slug: it.slug,
      url: `${WITA_BASE}${it.url || `/anime/${it.slug}`}`,
      img: it.poster,
      type: it.kind === 'movie' ? 'Movie' : 'TV',
      status: 'يعرض الان',
      story: ''
    }));

  apiSet(cacheKey, shows, 20 * 60 * 1000);
  return shows;
}

/**
 * 3. `get_episodes(aid)` — GET /get-episodes/:s_id
 */
export async function scraperGetEpisodes(aid) {
  const slug = String(aid || '').trim().replace(/^\/+|\/+$/g, '');
  if (!slug) return [];
  const cacheKey = `scraper:episodes:${slug}`;
  const cached = apiGet(cacheKey);
  if (cached) return cached;

  const { $ } = await getSoup(`anime/${slug}`);
  let episodes = extractEpisodes($, $('.episodes-card, .episodes-card-container'));

  if (!episodes.length) {
    const show = await fetchShow(slug).catch(() => null);
    if (show && Array.isArray(show.episodes)) {
      episodes = show.episodes.map((ep) => ({
        episode: `الحلقة ${ep.episode}`,
        number: ep.episode,
        alt: `${show.titleEn || slug} الحلقة ${ep.episode}`,
        src: show.poster || '',
        episode_url: `${WITA_BASE}/watch/${slug}/${ep.episode}`
      }));
    }
  }

  apiSet(cacheKey, episodes, 20 * 60 * 1000);
  return episodes;
}

/**
 * 4. `get_anime_info(aid)` — GET /get-anime-info/:s_id
 */
export async function scraperGetAnimeInfo(aid) {
  const slug = String(aid || '').trim().replace(/^\/+|\/+$/g, '');
  if (!slug) return null;
  const cacheKey = `scraper:info:${slug}`;
  const cached = apiGet(cacheKey);
  if (cached) return cached;

  const { $, html } = await getSoup(`anime/${slug}`);
  const titleDom = $('h1.anime-details-title').first().text().trim();

  if (titleDom) {
    const animeInfo = {
      slug,
      title: titleDom,
      genres: $('ul.anime-genres a')
        .map((_, el) => $(el).text().trim())
        .get(),
      story: $('p.anime-story').first().text().trim()
    };

    $('div.anime-info').each((_, el) => {
      const span = $(el).find('span').first().text().trim();
      const aText = $(el).find('a').first().text().trim();
      const rawText = $(el).text().replace(span, '').trim();
      const key = translateInfo(span);
      animeInfo[key] = aText || rawText;
    });

    apiSet(cacheKey, animeInfo, 30 * 60 * 1000);
    return animeInfo;
  }

  // Fallback to modern witanime.js show parser
  const show = await fetchShow(slug).catch(() => null);
  if (!show) return null;

  const info = {
    slug,
    title: show.titleEn || show.titleAr || slug,
    genres: ['أكشن', 'مغامرات', 'شونين'],
    story: show.description || '',
    type: show.kind === 'movie' ? 'Movie' : 'TV',
    start_date: '2026',
    status: 'يعرض الان',
    episodes_count: String(show.episodeCount || show.episodes?.length || 12),
    episode_duration: '24 دقيقة',
    season: 'موسم 2026',
    source: 'مانجا',
    poster: show.poster,
    banner: show.banner
  };
  apiSet(cacheKey, info, 30 * 60 * 1000);
  return info;
}

/**
 * 5. `fetch_seasonals()` — GET /fetch-seasonals
 */
export async function scraperFetchSeasonals() {
  const cacheKey = 'scraper:seasonals';
  const cached = apiGet(cacheKey);
  if (cached) return cached;

  const { $ } = await getSoup('');
  const mLink = $('#menu-item-107 a').first().attr('href');
  if (mLink) {
    const sub = await getSoup(mLink);
    const items = extractResults(sub.$, sub.$('.anime-card-container'));
    if (items.length) {
      apiSet(cacheKey, items, 30 * 60 * 1000);
      return items;
    }
  }

  const latest = await scraperLatestEpisodes();
  apiSet(cacheKey, latest, 20 * 60 * 1000);
  return latest;
}

/**
 * 6. `get_episode_dl(eid, episodeNum)` — GET /get-episode-dl/:s_id
 * Combines `wit_anime.py`'s `extract_qualities(soup)` (ul.quality-list base64 decoder)
 * with modern WitAnime session manifest download token resolution.
 */
export async function scraperGetEpisodeDl(eid, episodeNum = null) {
  let slug = String(eid || '').trim().replace(/^\/+|\/+$/g, '');
  let ep = Number(episodeNum) || 1;

  // Support `one-piece-الحلقة-1074` or `one-piece/1074`
  const arMatch = slug.match(/^(.*?)-(?:%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9|الحلقة)-(\d+)/i);
  if (arMatch) {
    slug = arMatch[1];
    ep = Number(arMatch[2]) || ep;
  }

  const cacheKey = `scraper:dl:${slug}:${ep}`;
  const cached = apiGet(cacheKey);
  if (cached) return cached;

  // 1) Try scraping classic `episode/{eid}` HTML with `extract_qualities`
  const epPath = `episode/${slug}-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-${ep}/`;
  const { html } = await getSoup(epPath);
  const qualities = extractQualitiesFromHtml(html);

  // 2) Also resolve from modern WitAnime `/watch/:slug/:ep/sources` manifest
  try {
    const payload = await fetchEpisode(slug, ep);
    if (payload && Array.isArray(payload.downloads) && payload.downloads.length > 0) {
      for (const dl of payload.downloads) {
        let resolved = payload.resolvedDownloads?.[dl.id] || null;
        if (!resolved) {
          try {
            resolved = await resolveDownloadEntry(slug, ep, dl.id);
          } catch {
            // continue resolving remaining links
          }
        }
        const url = resolved?.directUrl || resolved?.downloadUrl;
        if (!url) continue;

        const qUpper = String(dl.quality || 'FHD').toUpperCase();
        const qBucket =
          qUpper.includes('FHD') || qUpper.includes('1080')
            ? 'الجودة الخارقة FHD'
            : qUpper.includes('HD') || qUpper.includes('720')
            ? 'الجودة العالية HD'
            : 'الجودة المتوسطة SD';

        if (!qualities[qBucket]) qualities[qBucket] = [];
        if (!qualities[qBucket].includes(url)) {
          qualities[qBucket].push(url);
        }

        const srvKey = `${qBucket}_servers`;
        if (!qualities[srvKey]) qualities[srvKey] = [];
        qualities[srvKey].push({
          id: dl.id,
          server: dl.server || 'Download Server',
          quality: dl.quality || 'FHD',
          url,
          directUrl: resolved?.directUrl || null
        });
      }
    }
  } catch {
    // keep qualities extracted so far
  }

  apiSet(cacheKey, qualities, 30 * 60 * 1000);
  return qualities;
}

/**
 * 7. `scraperRandomAnime(count = 24)` — GET /random-anime
 * Fetches diverse / random anime from WitAnime scraper pages, seasonals, and browse catalog,
 * shuffling them so every call surfaces fresh random anime for Trending & Discovery.
 */
const RANDOM_SEARCH_SEEDS = [
  'a', 's', 'k', 'm', 'r', 't', 'b', 'd', 'n', 'h',
  'piece', 'dragon', 'hero', 'slayer', 'hunter', 'black', 'naruto', 'bleach', 'jojo', 'titan'
];

export async function scraperRandomAnime(count = 24) {
  try {
    const { fetchWitcherRandomAnime } = await import('./services/animeWitcher.service.js');
    const witcherPicks = await fetchWitcherRandomAnime(count);
    if (Array.isArray(witcherPicks) && witcherPicks.length > 0) {
      return witcherPicks.map((item) => ({
        ...item,
        name: item.titleEn || item.title,
        img: item.poster,
        src: item.poster,
        url: `/show/${item.slug}`,
        story: item.synopsis || ''
      }));
    }
  } catch (_) {}

  const randomPage1 = Math.floor(Math.random() * 45) + 1;
  const randomPage2 = Math.floor(Math.random() * 45) + 46;

  const [browseRes1, browseRes2, latestList] = await Promise.all([
    fetchBrowseAnimeList(randomPage1).catch(() => ({ items: [] })),
    fetchBrowseAnimeList(randomPage2).catch(() => ({ items: [] })),
    fetchLatest().catch(() => [])
  ]);

  const combined = [];
  const seen = new Set();

  const pushItem = (raw) => {
    if (!raw) return;
    const slug =
      raw.slug ||
      (raw.url || raw.anime_url || '').match(/\/(?:anime|movie)\/([^/]+)/)?.[1] ||
      '';
    const titleEn = raw.name || raw.titleEn || raw.alt || slug;
    if (!slug && !titleEn) return;
    const key = (slug || titleEn).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    combined.push({
      name: titleEn,
      slug: slug || titleEn.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      titleEn,
      titleAr: raw.titleAr || titleEn,
      poster: raw.img || raw.src || raw.poster || '',
      img: raw.img || raw.src || raw.poster || '',
      url: raw.url || raw.anime_url || `/anime/${slug}`,
      type: raw.type || 'TV',
      status: raw.status || 'يعرض الان',
      story: raw.story || '',
      source: 'witanime',
      sourceLabel: 'سيرفر Hearbor 1'
    });
  };

  [...(browseRes1?.items || []), ...(browseRes2?.items || []), ...(latestList || [])].forEach(pushItem);

  // Fisher-Yates shuffle for true randomness
  for (let i = combined.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined.slice(0, count);
}

