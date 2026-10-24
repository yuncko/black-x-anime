/**
 * Hearbor 1 — Anime Witcher Cloud Engine (6,973 Arabic Anime Series, Movies & OVAs)
 * Powered by Algolia Multi-Index Search (QVHT7NPEJG) + Firebase Cloud Firestore (animewitcher-1c66d)
 * Direct Multi-Quality MP4 Resolvers: PixelDrain (PD), FireStream (SF), MediaFire (MF/MF2), StreamTape (ST), KrakenFiles (KF), UpStream (US)
 */

import { ALGOLIA_BLOCKED_TAGS, hasBlockedGenre, withAlgoliaExclusions } from '../../../shared/contentFilter.js';

const ALGOLIA_APP_ID = 'QVHT7NPEJG';
const ALGOLIA_API_KEY = 'ce13098070fa521b536571bafbcfc083';
const ALGOLIA_BASE = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes`;

const FIRESTORE_PROJECT = 'animewitcher-1c66d';
const FIRESTORE_API_KEY = 'AIzaSyAcbWRwfFNnCpoydDXlEALWnM_TYVcJOMU';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`;

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Bidirectional mapping between English UI genre filters and Arabic Algolia tags
const GENRE_TO_AR_TAG = {
  action: 'اكشن',
  fantasy: 'خيال',
  adventure: 'مغامرات',
  supernatural: 'خارق للطبيعة',
  drama: 'دراما',
  comedy: 'كوميدي',
  romance: 'رومانسي',
  'sci-fi': 'خيال علمي',
  scifi: 'خيال علمي',
  mystery: 'غموض',
  sports: 'رياضي',
  horror: 'رعب',
  shounen: 'شونين',
  seinen: 'سينين',
  isekai: 'عالم مختلف',
  psychological: 'نفسي',
  thriller: 'تشويق',
  school: 'مدرسي',
  historical: 'تاريخي',
  mecha: 'ميكا'
};

const AR_TAG_TO_EN = {
  اكشن: 'Action',
  خيال: 'Fantasy',
  فانتازيا: 'Fantasy',
  مغامرات: 'Adventure',
  مغامرة: 'Adventure',
  'خارق للطبيعة': 'Supernatural',
  دراما: 'Drama',
  كوميدي: 'Comedy',
  رومانسي: 'Romance',
  رومنسي: 'Romance',
  'خيال علمي': 'Sci-Fi',
  غموض: 'Mystery',
  رياضي: 'Sports',
  رعب: 'Horror',
  شونين: 'Action',
  'قوة خارقة': 'Action',
  'فنون قتالية': 'Action',
  'عالم مختلف': 'Fantasy',
  اساطير: 'Fantasy',
  سحر: 'Fantasy',
  تشويق: 'Drama',
  نفسي: 'Drama',
  تحقيق: 'Mystery'
};

// In-memory caches
const slugToObjectId = new Map();
const objectIdToHit = new Map();
const showCache = new Map();
const episodeCache = new Map();
const resolvedUrlCache = new Map();

const SHOW_TTL_MS = 15 * 60 * 1000;
const EPISODE_TTL_MS = 10 * 60 * 1000;
const RESOLVED_URL_TTL_MS = 30 * 60 * 1000;

/**
 * Convert an Anime Witcher objectID (e.g. "Ore dake Level Up na Ken Season 2: Arise from the Shadow")
 * into a clean URL-safe slug and register it in memory.
 */
export function toWitcherSlug(objectID) {
  if (!objectID) return '';
  const clean = String(objectID)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const slug = clean ? `aw-${clean}` : `aw-${Buffer.from(String(objectID)).toString('base64url')}`;
  slugToObjectId.set(slug, String(objectID));
  if (clean) {
    slugToObjectId.set(clean, String(objectID));
  }
  return slug;
}

function normalizeTitle(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/^(aw-|wita-|a3rb-|ok-|blkom-|en-\d+-|mal-\d+-)/i, '')
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isWitcherTitleMatch(query, candidateEn, candidateRomaji, candidateSlug) {
  const q = normalizeTitle(query);
  if (!q) return false;
  const targets = [candidateEn, candidateRomaji, candidateSlug]
    .map(normalizeTitle)
    .filter(Boolean);
  for (const t of targets) {
    if (t === q) return true;
    if (t.includes(q) || q.includes(t)) {
      if (Math.min(t.length, q.length) >= 3) return true;
    }
  }
  const qWords = q.split(' ').filter((w) => w.length > 2);
  if (!qWords.length) return false;
  for (const t of targets) {
    const matched = qWords.filter((w) => t.includes(w));
    if (matched.length >= Math.ceil(qWords.length * 0.65)) return true;
  }
  return false;
}

function enrichGenres(arTags = []) {
  const set = new Set();
  for (const tag of Array.isArray(arTags) ? arTags : []) {
    if (!tag) continue;
    set.add(tag);
    if (AR_TAG_TO_EN[tag]) {
      set.add(AR_TAG_TO_EN[tag]);
    }
  }
  // A record without tags has no known genre: never invent one.
  return Array.from(set);
}

function formatAlgoliaHit(hit) {
  if (!hit || !hit.objectID) return null;
  const objectID = String(hit.objectID);
  const slug = toWitcherSlug(objectID);
  objectIdToHit.set(objectID, hit);

  const titleRomaji = hit.name || objectID;
  const titleEnglish = hit.details?.english_title || titleRomaji;
  const poster =
    hit.aniList_poster?.large ||
    hit.poster?.large ||
    hit.poster_uri ||
    hit.aniList_poster?.medium ||
    hit.poster?.medium ||
    '';
  const banner =
    hit.cover_uri ||
    hit.aniList_poster?.large ||
    hit.poster?.large ||
    poster;

  const malScore = Number(hit.details?.mal_mean || hit.rating?.rate || 0);
  const score = malScore > 0 ? (malScore <= 10 ? Math.round(malScore * 10) : Math.round(malScore)) : null;
  const arTags = Array.isArray(hit.tags) ? hit.tags : [];
  const genres = enrichGenres(arTags);

  return {
    id: slug,
    slug,
    objectID,
    malId: Number(hit.mal_id) || null,
    aniListId: Number(hit.aniList_id) || null,
    title: titleEnglish || titleRomaji,
    titleEn: titleEnglish || titleRomaji,
    titleRomaji,
    titleAr: titleRomaji,
    poster,
    banner,
    synopsis: hit.story || hit.story_en || '',
    synopsisAr: hit.story || '',
    synopsisEn: hit.story_en || '',
    genres,
    tagsAr: arTags,
    type: hit.type || 'مسلسل',
    kind: hit.type === 'فيلم' ? 'movie' : 'anime',
    status: hit.details?.state || 'مستمر',
    year: Number(hit.details?.year) || null,
    season: hit.details?.season && !String(hit.details.season).includes('undefined') ? hit.details.season : null,
    studio: Array.isArray(hit.details?.studio) ? hit.details.studio.join(', ') : '',
    ageRating: hit.details?.age || null,
    views: Number(hit.views || hit.statictes?.fav_count || 0),
    score,
    rating: malScore > 0 ? Number(malScore.toFixed(1)) : null,
    youtubeTrailerId: hit.youtube_video_id || null,
    source: 'witanime',
    sourceName: 'سيرفر Hearbor 1',
    sourceLabel: 'سيرفر Hearbor 1'
  };
}

async function queryAlgoliaIndex(indexName, body = {}) {
  const url = `${ALGOLIA_BASE}/${encodeURIComponent(indexName)}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) {
    throw new Error(`Algolia ${indexName} returned ${res.status}`);
  }
  return res.json();
}

/**
 * Resolve any slug, objectID, or title to an exact Anime Witcher objectID & metadata hit.
 */
export async function resolveWitcherObjectId(slugOrQuery) {
  if (!slugOrQuery) return null;
  const raw = String(slugOrQuery).trim();

  if (objectIdToHit.has(raw)) {
    return { objectID: raw, hit: objectIdToHit.get(raw) };
  }
  if (slugToObjectId.has(raw)) {
    const objId = slugToObjectId.get(raw);
    return { objectID: objId, hit: objectIdToHit.get(objId) || null };
  }

  // Strip known prefixes (aw-, wita-, a3rb-, ok-, blkom-, en-123-, mal-123-)
  const malMatch = raw.match(/^(?:mal|en)-(\d+)(?:-(.+))?$/i);
  const targetMalId = malMatch ? malMatch[1] : null;
  const cleanedQuery = (malMatch && malMatch[2] ? malMatch[2] : raw)
    .replace(/^(aw-|wita-|a3rb-|ok-|blkom-|ani-)/i, '')
    .replace(/-episode-\d+.*$/i, '')
    .replace(/-/g, ' ')
    .trim();

  if (!cleanedQuery && !targetMalId) return null;

  try {
    const data = await queryAlgoliaIndex('series', {
      query: cleanedQuery || targetMalId,
      hitsPerPage: 15
    });
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    for (const h of hits) {
      formatAlgoliaHit(h); // registers slugToObjectId and objectIdToHit
    }

    // 1. Exact MAL ID match if provided
    if (targetMalId) {
      const byMal = hits.find((h) => String(h.mal_id) === String(targetMalId));
      if (byMal) return { objectID: byMal.objectID, hit: byMal };
    }

    // 2. Exact slug match
    const bySlug = hits.find(
      (h) => toWitcherSlug(h.objectID) === raw || toWitcherSlug(h.objectID) === `aw-${raw}`
    );
    if (bySlug) return { objectID: bySlug.objectID, hit: bySlug };

    // 3. Exact normalized title match
    const normQ = normalizeTitle(cleanedQuery);
    const exactTitle = hits.find(
      (h) =>
        normalizeTitle(h.objectID) === normQ ||
        normalizeTitle(h.name) === normQ ||
        normalizeTitle(h.details?.english_title) === normQ
    );
    if (exactTitle) return { objectID: exactTitle.objectID, hit: exactTitle };

    // 4. Verified fuzzy title match
    const fuzzy = hits.find((h) =>
      isWitcherTitleMatch(cleanedQuery, h.details?.english_title, h.name, h.objectID)
    );
    if (fuzzy) return { objectID: fuzzy.objectID, hit: fuzzy };
  } catch (err) {
    console.warn('[animeWitcher.resolveWitcherObjectId]', err.message);
  }

  return null;
}

/**
 * Browse the full catalog from Anime Witcher's Algolia indices.
 * `totalCount` is Algolia's own nbHits, or null when the index did not report it.
 */
export async function fetchWitcherCatalog({
  page = 1,
  hitsPerPage = 60,
  sort = 'popular',
  genre = '',
  query = ''
} = {}) {
  const indexMap = {
    popular: 'series_fav_count_desc',
    trending: 'series_fav_count_desc',
    top: 'best_mal_ranked',
    latest: 'series_date_created',
    newest: 'series_date_created',
    name: 'series_name_asc'
  };
  const indexName = indexMap[String(sort || 'popular').toLowerCase()] || 'series_fav_count_desc';
  const algoliaPage = Math.max(0, (Number(page) || 1) - 1);

  const payload = {
    query: String(query || '').trim(),
    page: algoliaPage,
    hitsPerPage: Math.min(100, Math.max(12, Number(hitsPerPage) || 60))
  };

  if (genre && genre !== 'all') {
    const cleanG = String(genre).trim();
    const arTag = GENRE_TO_AR_TAG[cleanG.toLowerCase()] || cleanG;
    payload.facetFilters = [[`tags:${arTag}`]];
  }

  // Ecchi / Harem / Isekai are excluded by Algolia itself, so totals and pages stay real
  // (shared/contentFilter.js). Hits are checked once more in case a tag is spelled differently.
  const data = await queryAlgoliaIndex(indexName, withAlgoliaExclusions(payload));
  const items = (data?.hits || []).filter((h) => !hasBlockedGenre(h?.tags)).map(formatAlgoliaHit).filter(Boolean);

  return {
    page: algoliaPage + 1,
    totalPages: Number(data?.nbPages) || 1,
    totalCount: Number(data?.nbHits) || null,
    hasNext: algoliaPage + 1 < (Number(data?.nbPages) || 1),
    items
  };
}

/**
 * Fetch latest updated anime & episodes from Anime Witcher ('recent' + 'series_date_created')
 */
export async function fetchWitcherLatest(page = 1, hitsPerPage = 48) {
  const algoliaPage = Math.max(0, (Number(page) || 1) - 1);
  const [recentRes, newestRes] = await Promise.all([
    queryAlgoliaIndex('recent', { query: '', page: algoliaPage, hitsPerPage }).catch(() => ({ hits: [] })),
    algoliaPage === 0
      ? queryAlgoliaIndex('series_date_created', { query: '', page: 0, hitsPerPage: 24 }).catch(() => ({ hits: [] }))
      : Promise.resolve({ hits: [] })
  ]);

  const seen = new Set();
  const list = [];

  for (const h of [...(recentRes?.hits || []), ...(newestRes?.hits || [])]) {
    if (hasBlockedGenre(h?.tags)) continue; // hidden genres (the `recent` index cannot facet on tags)
    const formatted = formatAlgoliaHit(h);
    if (!formatted || seen.has(formatted.slug)) continue;
    seen.add(formatted.slug);
    list.push({
      ...formatted,
      episode: null,
      episodeLabel: h.details?.state === 'مستمر' ? 'حلقات جديدة' : formatted.type || 'أنمي'
    });
  }

  return list;
}

/**
 * Every hidden Hearbor 1 title (Ecchi / Harem / Isekai): objectID, slug and names. One query
 * per tag, each well under Algolia's 1,000-hit page cap. Used by server/src/lib/hiddenTitles.js
 * to recognise the same titles on other servers and in saved lists (which carry no genres).
 */
export async function fetchHiddenWitcherRecords() {
  const results = await Promise.all(
    ALGOLIA_BLOCKED_TAGS.map((tag) =>
      queryAlgoliaIndex('series_fav_count_desc', {
        query: '',
        facetFilters: [[`tags:${tag}`]],
        hitsPerPage: 1000,
        attributesToRetrieve: ['objectID', 'name', 'details.english_title'],
        attributesToHighlight: [],
        attributesToSnippet: [],
        analytics: false
      })
    )
  );
  const out = new Map();
  for (const res of results) {
    for (const h of res?.hits || []) {
      if (!h?.objectID || out.has(h.objectID)) continue;
      out.set(h.objectID, {
        objectID: String(h.objectID),
        slug: toWitcherSlug(h.objectID),
        // Main and English names only: alternative names can be generic franchise names.
        names: [h.name, h.details?.english_title].filter(Boolean).map(String)
      });
    }
  }
  return [...out.values()];
}

/**
 * Search across all 6,973 anime in Anime Witcher
 */
export async function searchWitcherShows(query, hitsPerPage = 40) {
  const q = String(query || '').trim();
  if (!q) return [];
  const data = await queryAlgoliaIndex('series', {
    query: q,
    hitsPerPage
  });
  return (data?.hits || []).filter((h) => !hasBlockedGenre(h?.tags)).map(formatAlgoliaHit).filter(Boolean);
}

/**
 * Fetch random/discovery anime picks from a random page of the 6,973-anime catalog
 */
export async function fetchWitcherRandomAnime(count = 24) {
  const randomPage = Math.floor(Math.random() * 45); // top 45 pages (~2,700 popular anime)
  const data = await queryAlgoliaIndex(
    'series_fav_count_desc',
    withAlgoliaExclusions({
      query: '',
      page: randomPage,
      hitsPerPage: Math.min(60, Math.max(24, count * 2))
    })
  );
  const items = (data?.hits || []).filter((h) => !hasBlockedGenre(h?.tags)).map(formatAlgoliaHit).filter(Boolean);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, count);
}

/**
 * Fetch full anime details + episodes list from Firestore (episodes_summery/summery)
 */
export async function fetchWitcherShow(slugOrObjectId) {
  const resolved = await resolveWitcherObjectId(slugOrObjectId);
  if (!resolved?.objectID) return null;

  const { objectID } = resolved;
  let { hit } = resolved;

  const cacheKey = `show:${objectID}`;
  const cached = showCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // If we don't have full Algolia hit metadata yet, fetch it
  if (!hit) {
    try {
      const qData = await queryAlgoliaIndex('series', { query: objectID, hitsPerPage: 5 });
      hit = (qData?.hits || []).find((h) => h.objectID === objectID) || qData?.hits?.[0] || null;
      if (hit) formatAlgoliaHit(hit);
    } catch (_) {}
  }

  // Fetch episodes_summery/summery from Firestore
  const encId = encodeURIComponent(objectID);
  const sumUrl = `${FIRESTORE_BASE}/anime_list/${encId}/episodes_summery/summery?key=${FIRESTORE_API_KEY}`;
  let episodes = [];

  try {
    const res = await fetch(sumUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    if (res.ok) {
      const doc = await res.json();
      const rawValues = doc?.fields?.episodes?.arrayValue?.values || [];
      episodes = rawValues
        .map((item, idx) => {
          const f = item?.mapValue?.fields || {};
          const docId = f.doc_id?.stringValue || String(idx + 1).padStart(3, '0');
          const rawName = f.name?.stringValue || `الحلقة ${idx + 1}`;
          const numMatch = rawName.match(/(\d+(?:\.\d+)?)/) || docId.match(/(\d+)/);
          const epNum = numMatch ? Number(numMatch[1]) : idx + 1;
          const titleAr = f.title_translated?.stringValue || '';
          const thumb = f.thumb_uri?.stringValue || '';
          const filler = Boolean(f.filler?.booleanValue);

          const validEpNum = Number.isFinite(epNum) && epNum > 0 ? epNum : idx + 1;
          return {
            episode: validEpNum,
            number: validEpNum,
            docId,
            title: titleAr ? `${rawName} — ${titleAr}` : rawName,
            titleAr: titleAr || rawName,
            thumb,
            isFiller: filler
          };
        })
        .sort((a, b) => a.episode - b.episode || b.docId.length - a.docId.length);

      // Deduplicate episodes with the same episode number (e.g. docId '0001' vs '1'), keeping the padded docId
      const seenEps = new Set();
      episodes = episodes.filter((ep) => {
        if (seenEps.has(ep.episode)) return false;
        seenEps.add(ep.episode);
        return true;
      });
    }
  } catch (err) {
    console.warn('[animeWitcher.fetchWitcherShow] Firestore episodes_summery error:', err.message);
  }

  const baseInfo = hit
    ? formatAlgoliaHit(hit)
    : {
        slug: toWitcherSlug(objectID),
        objectID,
        title: objectID,
        titleEn: objectID,
        titleAr: objectID,
        poster: '',
        banner: '',
        synopsis: '',
        genres: [],
        status: 'مستمر',
        year: null,
        score: null,
        rating: null
      };

  const show = {
    ...baseInfo,
    episodeCount: episodes.length || 1,
    episodes: episodes.length
      ? episodes
      : [{ episode: 1, number: 1, docId: '001', title: 'الحلقة 1', titleAr: 'الحلقة 1' }],
    source: 'witanime',
    sourceName: 'سيرفر Hearbor 1',
    sourceLabel: 'سيرفر Hearbor 1'
  };

  showCache.set(cacheKey, { value: show, expiresAt: Date.now() + SHOW_TTL_MS });
  return show;
}

/**
 * Resolve an intermediate server link (PD, SF, MF, MF2, ST, KF, US) into a direct playable .mp4 URL
 */
export async function resolveWitcherDirectVideoUrl(serverCode, rawLink) {
  if (!rawLink || typeof rawLink !== 'string') return null;
  const code = String(serverCode || '').toUpperCase().trim();
  const link = rawLink.trim();

  const cacheKey = `${code}:${link}`;
  const cached = resolvedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let directMp4 = null;

  try {
    // 1. PixelDrain (PD): https://pixeldrain.com/u/{id} -> https://pixeldrain.com/api/file/{id} (verify not 404)
    if (code === 'PD' || link.includes('pixeldrain.com')) {
      const pdMatch = link.match(/pixeldrain\.com\/(?:u|api\/file)\/([A-Za-z0-9_-]+)/i);
      if (pdMatch?.[1]) {
        const pdId = pdMatch[1];
        try {
          const infoRes = await fetch(`https://pixeldrain.com/api/file/${pdId}/info`, {
            headers: { 'User-Agent': DESKTOP_UA, Accept: 'application/json' },
            signal: AbortSignal.timeout(3500)
          });
          if (infoRes.status !== 404) {
            directMp4 = `https://pixeldrain.com/api/file/${pdId}`;
          }
        } catch {
          directMp4 = `https://pixeldrain.com/api/file/${pdId}`;
        }
      }
    }
    // 2. FireStream (SF): https://firestream.to/d/{id} -> "downloadUrl":"https://us-cdn-0.firestream.to/.../video.mp4..."
    else if (code === 'SF' || link.includes('firestream.to')) {
      const html = await fetch(link, {
        headers: { 'User-Agent': DESKTOP_UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(10000)
      }).then((r) => r.text());
      const sfMatch =
        html.match(/"downloadUrl"\s*:\s*"([^"]+)"/) ||
        html.match(/https?:\/\/[a-z0-9.-]*firestream\.to\/encodings\/[^\s"']+/i);
      if (sfMatch?.[1] || sfMatch?.[0]) {
        directMp4 = (sfMatch[1] || sfMatch[0]).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      }
    }
    // 3. MediaFire Standard & Premium (MF / MF2): extract direct https://downloadXXXX.mediafire.com/.../*.mp4
    else if (code === 'MF' || code === 'MF2' || link.includes('mediafire.com')) {
      const res = await fetch(link, {
        headers: { 'User-Agent': DESKTOP_UA, Accept: 'text/html' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000)
      });
      const loc = res.headers.get('location');
      if (loc && loc.includes('download') && loc.includes('mediafire.com')) {
        directMp4 = loc;
      } else {
        const html = await res.text();
        const mfDirect =
          html.match(/href="(https?:\/\/download\d+\.mediafire\.com\/[^"]+)"/i)?.[1] ||
          html.match(/aria-label="Download file"\s+href="(https?:\/\/[^"]+)"/i)?.[1];
        if (mfDirect) {
          directMp4 = mfDirect;
        } else {
          const scrambled = html.match(/data-scrambled-url="([^"]+)"/i)?.[1];
          if (scrambled) {
            directMp4 = Buffer.from(scrambled, 'base64').toString('utf8');
          }
        }
      }
    }
    // 4. StreamTape (ST): extract norobotlink token -> https://streamtape.com/get_video?id=...
    else if (code === 'ST' || link.includes('streamtape.com')) {
      const html = await fetch(link, {
        headers: { 'User-Agent': DESKTOP_UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(10000)
      }).then((r) => r.text());
      const w1 = "document.getElementById('norobotlink').innerHTML = '";
      const i1 = html.indexOf(w1);
      if (i1 !== -1) {
        const i2 = html.indexOf(';</script>', i1);
        const expr = html.slice(i1 + w1.length, i2);
        const m = expr.match(/\('([^']+)'\)\.substring\((\d+)\)(?:\.substring\((\d+)\))?/);
        if (m) {
          const tail = m[1].substring(Number(m[2])).substring(Number(m[3] || 0));
          const getVideoUrl = `https://streamtape.com${tail.startsWith('/') ? '' : '/'}${tail}`;
          const redir = await fetch(getVideoUrl, {
            headers: { 'User-Agent': DESKTOP_UA },
            redirect: 'manual',
            signal: AbortSignal.timeout(8000)
          });
          directMp4 = redir.headers.get('location') || getVideoUrl;
        }
      }
    }
    // 5. KrakenFiles (KF) & UpStream (US): <source src="https://..." type="video/mp4"
    else if (code === 'KF' || code === 'US' || link.includes('krakenfiles.com') || link.includes('upstream')) {
      const html = await fetch(link, {
        headers: { 'User-Agent': DESKTOP_UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(10000)
      }).then((r) => r.text());
      const srcMatch = html.match(/<source\s+src="((?:https?:)?\/\/[^"]+)"\s+type="video\/mp4"/i);
      if (srcMatch?.[1]) {
        directMp4 = srcMatch[1].startsWith('//') ? `https:${srcMatch[1]}` : srcMatch[1];
      }
    }
    // 6. Direct MP4/M3U8 or BunnyCDN (BU)
    else if (/\.(mp4|m3u8)(\?|$)/i.test(link) || link.includes('b-cdn.net')) {
      directMp4 = link;
    }
  } catch (err) {
    console.warn(`[animeWitcher.resolveWitcherDirectVideoUrl] ${code} failed:`, err.message);
  }

  if (directMp4) {
    resolvedUrlCache.set(cacheKey, { value: directMp4, expiresAt: Date.now() + RESOLVED_URL_TTL_MS });
  }
  return directMp4;
}

const SERVER_DISPLAY_NAMES = {
  PD: '👑 Hearbor 1 — PixelDrain Ultra',
  SF: '⚡ Hearbor 1 — FireStream CDN',
  MF2: '🚀 Hearbor 1 — MediaFire Pro CDN',
  MF: '🚀 Hearbor 1 — MediaFire Cloud',
  BU: '💎 Hearbor 1 — BunnyCDN Direct',
  ST: '🎬 Hearbor 1 — StreamTape HD',
  KF: '🔥 Hearbor 1 — KrakenFiles Direct',
  US: '🌐 Hearbor 1 — UpStream Direct',
  VT: '📺 Hearbor 1 — VidTube Cloud',
  MG: '☁️ Hearbor 1 — Mega Cloud'
};

const SERVER_PRIORITY = {
  PD: 1,
  SF: 2,
  MF2: 3,
  MF: 4,
  BU: 5,
  KF: 6,
  US: 7,
  ST: 8,
  VT: 9,
  MG: 10
};

function parseQualityScore(q) {
  const m = String(q || '').match(/(\d+)/);
  return m ? Number(m[1]) : 720;
}

/**
 * Fetch all streaming & download servers for an episode from Anime Witcher Firestore
 */
export async function fetchWitcherEpisode(slugOrObjectId, episodeNumber) {
  const epNum = Math.max(1, Number(episodeNumber) || 1);
  const show = await fetchWitcherShow(slugOrObjectId);
  if (!show?.objectID) return null;

  const { objectID, slug } = show;
  const cacheKey = `ep:${objectID}:${epNum}`;
  const cached = episodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Determine exact Firestore episode doc_id (e.g. "001", "0001", "012", "1180")
  const matchedEp =
    (show.episodes || []).find((e) => Number(e.number) === epNum) ||
    (show.episodes || [])[epNum - 1] ||
    null;

  const candidateDocIds = Array.from(
    new Set(
      [
        matchedEp?.docId,
        String(epNum).padStart(3, '0'),
        String(epNum).padStart(4, '0'),
        String(epNum).padStart(2, '0'),
        String(epNum)
      ].filter(Boolean)
    )
  );

  const encId = encodeURIComponent(objectID);
  let rawServers = [];
  let activeDocId = candidateDocIds[0];

  for (const docId of candidateDocIds) {
    const encEp = encodeURIComponent(docId);
    const srv2Url = `${FIRESTORE_BASE}/anime_list/${encId}/episodes/${encEp}/servers2/all_servers?key=${FIRESTORE_API_KEY}`;
    const srv1Url = `${FIRESTORE_BASE}/anime_list/${encId}/episodes/${encEp}/servers?key=${FIRESTORE_API_KEY}`;

    const [r2, r1] = await Promise.all([
      fetch(srv2Url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }).catch(() => null),
      fetch(srv1Url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }).catch(() => null)
    ]);

    const combined = [];
    if (r2 && r2.ok) {
      const d2 = await r2.json().catch(() => null);
      const vals = d2?.fields?.servers?.arrayValue?.values || [];
      for (const v of vals) {
        const f = v?.mapValue?.fields || {};
        if (f.link?.stringValue && f.name?.stringValue) {
          combined.push({
            name: f.name.stringValue.toUpperCase().trim(),
            quality: f.quality?.stringValue || '1080p',
            link: f.link.stringValue.trim(),
            visible: f.visible?.booleanValue !== false
          });
        }
      }
    }

    if (r1 && r1.ok) {
      const d1 = await r1.json().catch(() => null);
      const docs = d1?.documents || [];
      for (const doc of docs) {
        const f = doc?.fields || {};
        if (f.link?.stringValue && f.name?.stringValue) {
          combined.push({
            name: f.name.stringValue.toUpperCase().trim(),
            quality: f.quality?.stringValue || '1080p',
            link: f.link.stringValue.trim(),
            visible: f.visible?.booleanValue !== false
          });
        }
      }
    }

    if (combined.length > 0) {
      activeDocId = docId;
      const seenLinks = new Set();
      rawServers = combined.filter((s) => {
        const k = `${s.name}|${s.quality}|${s.link}`;
        if (seenLinks.has(k)) return false;
        seenLinks.add(k);
        return true;
      });
      break;
    }
  }

  // Filter out empty or non-direct hosts if better ones exist
  const validServers = rawServers
    .filter((s) => s.link && s.visible !== false)
    .sort((a, b) => {
      const pA = SERVER_PRIORITY[a.name] || 99;
      const pB = SERVER_PRIORITY[b.name] || 99;
      if (pA !== pB) return pA - pB;
      return parseQualityScore(b.quality) - parseQualityScore(a.quality);
    });

  if (!validServers.length) return null;

  const entries = [];
  const downloads = [];
  const resolved = {};
  const resolvedDownloads = {};

  // Eagerly resolve all PixelDrain (0ms) + top 2 FireStream/MediaFire servers in parallel so playback starts immediately
  const eagerTasks = [];

  validServers.forEach((srv, idx) => {
    const code = String(srv.name || 'SRV').toUpperCase();
    const quality = srv.quality || '1080p';
    const qBadge =
      parseQualityScore(quality) >= 1080
        ? 'FHD 1080p'
        : parseQualityScore(quality) >= 720
        ? 'HD 720p'
        : quality;
    const baseLabel = SERVER_DISPLAY_NAMES[code] || `⚡ Hearbor 1 — ${code}`;
    const entryId = `aw-${code.toLowerCase()}-${quality}-${idx}`;
    const dlId = `dl-${entryId}`;
    const safeFile = `${slug}-ep-${epNum}-${quality}.mp4`;

    // Skip MG (Mega.nz) from in-browser video player entries (keep in downloads), as Mega requires client decryption
    if (code === 'MG') {
      downloads.push({
        id: dlId,
        server: `${baseLabel} (${quality})`,
        quality: qBadge,
        downloadUrl: srv.link,
        directUrl: srv.link,
        rawLink: srv.link,
        serverCode: code
      });
      resolvedDownloads[dlId] = { downloadUrl: srv.link, directUrl: srv.link };
      return;
    }

    const entryObj = {
      id: entryId,
      server: `${baseLabel} (${quality})`,
      quality: qBadge,
      version: 'sub',
      lang: 'ar',
      isFastCdn: code === 'PD' || code === 'SF' || code === 'MF2' || code === 'MF' || code === 'BU',
      serverCode: code,
      rawLink: srv.link,
      embedUrl: null,
      directUrl: null
    };
    entries.push(entryObj);

    const dlObj = {
      id: dlId,
      server: `📥 ${baseLabel} (${quality} MP4)`,
      quality: qBadge,
      serverCode: code,
      rawLink: srv.link,
      safeFile,
      downloadUrl: null,
      directUrl: null
    };
    downloads.push(dlObj);

    // PixelDrain resolves synchronously in 0ms; resolve all SF/MF servers eagerly too
    if (code === 'PD' || eagerTasks.length < 12) {
      eagerTasks.push(
        resolveWitcherDirectVideoUrl(code, srv.link).then((directMp4) => {
          if (!directMp4) return;
          const mp4PlayerUrl = `/api/stream/mp4-player?url=${encodeURIComponent(directMp4)}`;
          const dlProxyUrl = `/api/stream/download?url=${encodeURIComponent(directMp4)}&filename=${encodeURIComponent(safeFile)}`;

          // Keep directUrl as raw https:// MP4 URL because VideoPlayer.jsx wraps directUrl in /api/stream/proxy?url=...
          entryObj.embedUrl = mp4PlayerUrl;
          entryObj.directUrl = directMp4;
          resolved[entryId] = {
            embedUrl: mp4PlayerUrl,
            directUrl: directMp4
          };

          dlObj.downloadUrl = dlProxyUrl;
          dlObj.directUrl = dlProxyUrl;
          resolvedDownloads[dlId] = {
            downloadUrl: dlProxyUrl,
            directUrl: dlProxyUrl
          };
        })
      );
    }
  });

  await Promise.all(eagerTasks);

  // Filter out entries whose eager resolution failed (e.g. dead MediaFire file) if resolved ones exist
  const workingEntries = entries.filter((e) => e.directUrl || e.embedUrl);
  const finalEntries = workingEntries.length > 0 ? workingEntries : entries;

  // Put already-resolved entries first (1080p -> 720p -> 480p) so first entry always plays immediately
  finalEntries.sort((a, b) => {
    const aRes = Boolean(a.directUrl || a.embedUrl);
    const bRes = Boolean(b.directUrl || b.embedUrl);
    if (aRes !== bRes) return bRes ? 1 : -1;
    const pA = SERVER_PRIORITY[a.serverCode] || 99;
    const pB = SERVER_PRIORITY[b.serverCode] || 99;
    if (pA !== pB) return pA - pB;
    return parseQualityScore(b.quality) - parseQualityScore(a.quality);
  });

  const payload = {
    slug,
    objectID,
    episode: epNum,
    episodeDocId: activeDocId,
    title: show.titleAr || show.titleEn,
    episodeTitle: matchedEp?.title || `الحلقة ${epNum}`,
    poster: show.poster,
    totalEpisodes: show.episodeCount || show.episodes?.length || epNum,
    prevEpisode: epNum > 1 ? epNum - 1 : null,
    nextEpisode: epNum < (show.episodeCount || 0) ? epNum + 1 : null,
    entries: finalEntries,
    resolved,
    downloads,
    resolvedDownloads,
    source: 'witanime',
    sourceName: 'سيرفر Hearbor 1'
  };

  episodeCache.set(cacheKey, { value: payload, expiresAt: Date.now() + EPISODE_TTL_MS });
  return payload;
}

/**
 * On-demand resolver for any individual entryId (e.g. aw-mf-1080p-3)
 */
export async function resolveWitcherEntry(slugOrObjectId, episodeNumber, entryId) {
  const epData = await fetchWitcherEpisode(slugOrObjectId, episodeNumber);
  if (!epData) return null;

  if (epData.resolved?.[entryId]) {
    return epData.resolved[entryId];
  }

  const entry = (epData.entries || []).find((e) => e.id === entryId);
  if (!entry) return null;

  if (entry.directUrl || entry.embedUrl) {
    return { embedUrl: entry.embedUrl, directUrl: entry.directUrl };
  }

  const directMp4 = await resolveWitcherDirectVideoUrl(entry.serverCode, entry.rawLink);
  if (!directMp4) return null;

  const mp4PlayerUrl = `/api/stream/mp4-player?url=${encodeURIComponent(directMp4)}`;
  const source = { embedUrl: mp4PlayerUrl, directUrl: directMp4 };

  entry.embedUrl = mp4PlayerUrl;
  entry.directUrl = directMp4;
  epData.resolved[entryId] = source;
  return source;
}

/**
 * On-demand resolver for any download entryId (e.g. dl-aw-mf-1080p-3)
 */
export async function resolveWitcherDownloadEntry(slugOrObjectId, episodeNumber, entryId) {
  const epData = await fetchWitcherEpisode(slugOrObjectId, episodeNumber);
  if (!epData) return null;

  if (epData.resolvedDownloads?.[entryId]) {
    return epData.resolvedDownloads[entryId];
  }

  const dl = (epData.downloads || []).find((d) => d.id === entryId);
  if (!dl) return null;

  if (dl.downloadUrl) {
    return { url: dl.downloadUrl, downloadUrl: dl.downloadUrl, directUrl: dl.downloadUrl };
  }

  const directMp4 = await resolveWitcherDirectVideoUrl(dl.serverCode, dl.rawLink);
  if (!directMp4) {
    return { url: dl.rawLink, downloadUrl: dl.rawLink, directUrl: dl.rawLink };
  }

  const dlProxyUrl = `/api/stream/download?url=${encodeURIComponent(directMp4)}&filename=${encodeURIComponent(dl.safeFile || 'episode.mp4')}`;
  const source = { url: dlProxyUrl, downloadUrl: dlProxyUrl, directUrl: dlProxyUrl };
  dl.downloadUrl = dlProxyUrl;
  dl.directUrl = dlProxyUrl;
  epData.resolvedDownloads[entryId] = source;
  return source;
}
