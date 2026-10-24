import { apiGet as cacheGet, apiGetStale, apiSet as cacheSet, upsertAnime, getAnimeRow, parseAnimeRow } from './db.js';
import { ANILIST_EXCLUSION_ARGS, hasBlockedGenre } from '../../shared/contentFilter.js';

// Ecchi / Harem / Isekai are hidden from Hearbor (shared/contentFilter.js): list queries ask
// AniList to drop them; lists that cannot be filtered in the query (the airing schedule) are
// checked against genres + tags.
const HIDE = ANILIST_EXCLUSION_ARGS;
const visibleMedia = (m) => Boolean(m) && !hasBlockedGenre(m.genres, (m.tags || []).map((t) => t?.name));

const ANILIST_URL = 'https://graphql.anilist.co';

const MEDIA_FRAGMENT = `
  id
  idMal
  type
  status
  format
  episodes
  duration
  title { romaji english native }
  description(asHtml: false)
  coverImage { extraLarge large color }
  bannerImage
  genres
  tags { name }
  averageScore
  meanScore
  popularity
  season
  seasonYear
  nextAiringEpisode { episode airingAt }
  studios(isMain: true) { nodes { name } }
`;

/** Normalize an AniList media object into our flat shape + cache it. */
function normalizeMedia(m, extra = {}) {
  if (!m) return null;
  const flat = {
    id: m.id,
    title_romaji: m.title?.romaji || m.title?.english || 'Untitled',
    title_english: m.title?.english || m.title?.romaji || 'Untitled',
    title_arabic: extra.title_arabic ?? null,
    description: (m.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(),
    cover_url: m.coverImage?.extraLarge || m.coverImage?.large || null,
    banner_url: m.bannerImage || null,
    color: m.coverImage?.color || '#8b5cf6',
    genres: m.genres || [],
    episodes: m.episodes ?? null,
    status: m.status ?? null,
    format: m.format ?? null,
    season: m.season ?? null,
    season_year: m.seasonYear ?? null,
    score: m.averageScore ?? null,
    popularity: m.popularity ?? null,
    next_episode: m.nextAiringEpisode?.episode ?? null,
    next_airing_at: m.nextAiringEpisode?.airingAt ?? null,
    trending: extra.trending ? 1 : 0,
    raw: m
  };
  upsertAnime(flat);
  return flat;
}

export function mediaToJson(flat) {
  if (!flat) return null;
  return parseAnimeRow({
    ...flat,
    title_romaji: flat.title_romaji,
    genres: JSON.stringify(flat.genres || [])
  });
}

let lastFetch = 0;
const MIN_INTERVAL = 400; // stay well under AniList rate limits

async function anilistQuery(query, variables = {}) {
  // gentle client-side throttle
  const wait = MIN_INTERVAL - (Date.now() - lastFetch);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetch = Date.now();

  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AniList HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.errors?.length) throw new Error(`AniList: ${json.errors[0].message}`);
  return json.data;
}

async function cachedQuery(cacheKey, ttl, query, variables, mapper) {
  const hit = cacheGet(cacheKey);
  if (hit) return hit;
  const data = await anilistQuery(query, variables);
  const mapped = mapper(data);
  cacheSet(cacheKey, mapped, ttl);
  return mapped;
}

/* ------------------------------ queries ------------------------------ */

export async function fetchTrending() {
  return cachedQuery(
    'anilist:trending:v4',
    20 * 60 * 1000,
    `query ($page: Int) {
      Page(page: $page, perPage: 16) {
        media(sort: TRENDING_DESC, type: ANIME, countryOfOrigin: "JP", status_in: [FINISHED, RELEASING], isAdult: false, ${HIDE}) { ${MEDIA_FRAGMENT} }
      }
    }`,
    { page: 1 },
    (data) => data.Page.media.map((m) => mediaToJson(normalizeMedia(m, { trending: true })))
  );
}

export async function fetchTopRanked(perPage = 15) {
  return cachedQuery(
    `anilist:rankings:top:v4:${perPage}`,
    30 * 60 * 1000,
    `query ($page: Int) {
      Page(page: $page, perPage: ${perPage}) {
        media(sort: [SCORE_DESC, POPULARITY_DESC], type: ANIME, countryOfOrigin: "JP", status_in: [FINISHED, RELEASING], isAdult: false, ${HIDE}) { ${MEDIA_FRAGMENT} }
      }
    }`,
    { page: 1 },
    (data) => data.Page.media.map((m) => mediaToJson(normalizeMedia(m)))
  );
}

export async function fetchSeason(season, seasonYear) {
  return cachedQuery(
    `anilist:season:v2:${season}:${seasonYear}`,
    30 * 60 * 1000,
    `query ($season: MediaSeason, $year: Int) {
      Page(perPage: 16) {
        media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, isAdult: false, ${HIDE}) { ${MEDIA_FRAGMENT} }
      }
    }`,
    { season, year: seasonYear },
    (data) => data.Page.media.map((m) => mediaToJson(normalizeMedia(m)))
  );
}

/**
 * Air times for the most popular Japanese anime on air now, between two unix
 * times (seconds). Up to two AniList pages (100 shows; the second only when
 * AniList says there is one), cached 15 minutes; the hidden genres are excluded
 * by the query itself and again by visibleMedia. A weekly show's next episode
 * always falls within the next 7 days, so a 7-day window covers every weekday.
 * (The old airingSchedules query got only the first 50 slots of the week,
 * which ran out after two or three days and left the rest of the week empty.)
 * Each media carries its MyAnimeList id (`malId`), so the app can match the
 * catalogue (whose records only know the MAL id) to the real air time.
 */
const AIRING_PAGES = 2;
const AIRING_QUERY = `query ($page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(status: RELEASING, type: ANIME, countryOfOrigin: "JP", sort: POPULARITY_DESC, isAdult: false, ${HIDE}) { ${MEDIA_FRAGMENT} }
  }
}`;

function slimAiring(list) {
  return list
    .filter(visibleMedia)
    .map((m) => ({ ...mediaToJson(normalizeMedia(m)), malId: Number(m.idMal) > 0 ? Number(m.idMal) : null }))
    .filter((m) => m.nextAiringAt > 0)
    // The schedule never shows the synopsis; keep the response small.
    .map((m) => {
      const slim = { ...m };
      delete slim.description;
      return slim;
    });
}

async function fetchAiringNow() {
  const cacheKey = 'anilist:airing-now:v2';
  const hit = cacheGet(cacheKey);
  if (hit) return hit;
  const media = [];
  const seen = new Set();
  for (let page = 1; page <= AIRING_PAGES; page += 1) {
    let data;
    try {
      data = await anilistQuery(AIRING_QUERY, { page });
    } catch (err) {
      if (page === 1) throw err;
      break; // keep the first page when the second one fails
    }
    for (const m of data?.Page?.media || []) {
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      media.push(m);
    }
    if (!data?.Page?.pageInfo?.hasNextPage) break;
  }
  const mapped = slimAiring(media);
  cacheSet(cacheKey, mapped, 15 * 60 * 1000);
  return mapped;
}

export async function fetchSchedule(fromSec, toSec) {
  const airing = await fetchAiringNow();
  return airing
    .filter((m) => m.nextAiringAt >= fromSec && m.nextAiringAt < toSec)
    .map((m) => ({ episode: m.nextEpisode, airingAt: m.nextAiringAt, media: m }))
    .sort((a, b) => a.airingAt - b.airingAt);
}

export async function fetchAnime(id) {
  const cacheKey = `anilist:media:${id}`;
  return cachedQuery(
    cacheKey,
    60 * 60 * 1000,
    `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FRAGMENT} } }`,
    { id },
    (data) => mediaToJson(normalizeMedia(data.Media))
  );
}

export async function fetchAnimeRaw(id) {
  const data = await anilistQuery(
    `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FRAGMENT} } }`,
    { id }
  );
  return mediaToJson(normalizeMedia(data.Media));
}

export async function fetchSearch(q) {
  return cachedQuery(
    `anilist:search:v2:${q.toLowerCase().trim()}`,
    30 * 60 * 1000,
    `query ($search: String) {
      Page(perPage: 12) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false, ${HIDE}) { ${MEDIA_FRAGMENT} }
      }
    }`,
    { search: q },
    (data) => data.Page.media.map((m) => mediaToJson(normalizeMedia(m)))
  );
}

export async function fetchByIds(ids) {
  const unique = [...new Set(ids.map(Number).filter(Boolean))];
  const out = new Map();
  const missing = [];
  for (const id of unique) {
    const row = getAnimeRow(id);
    if (row && row.cached_at) out.set(id, parseAnimeRow(row));
    else missing.push(id);
  }
  // batch-fetch missing in chunks of 8 using aliases
  for (let i = 0; i < missing.length; i += 8) {
    const chunk = missing.slice(i, i + 8);
    const parts = chunk.map((id, idx) => `m${idx}: Media(id: ${id}, type: ANIME) { ${MEDIA_FRAGMENT} }`).join('\n');
    try {
      const data = await anilistQuery(`{ ${parts} }`);
      chunk.forEach((id, idx) => {
        const flat = normalizeMedia(data[`m${idx}`]);
        if (flat) out.set(id, mediaToJson(flat));
      });
    } catch (err) {
      console.error('[anilist] batch fetch failed:', err.message);
    }
  }
  return out;
}

/** Current season helper based on today's date (server-side). */
export function currentSeasonInfo(date = new Date()) {
  const month = date.getMonth() + 1;
  const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
  return { season, year: date.getFullYear() };
}
