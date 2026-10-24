/**
 * Ecchi, Harem and Isekai are hidden from the whole of Hearbor (owner's decisions, 2026-10-16:
 * the APK first, then the website on phones and computers). The rules are shared with the app
 * and the website pages (shared/contentFilter.js); this module applies them to every list the
 * website API returns, so no page can forget it:
 *
 * - by genre: anything carrying a hidden genre/tag (Hearbor 1 tags, AniList genres/tags, the
 *   genres other servers report);
 * - by identity: Hearbor 1's hidden titles (fetched from Algolia, cached) are also recognised by
 *   slug/objectID — saved lists carry no genres — and by exact title on the other servers, whose
 *   genres are often placeholders.
 *
 * Single title pages are not refused here: they come back marked `bxHidden: true` and the
 * website / app show "not available" (older APKs keep working for everything else).
 */
import { isHiddenAnime, isHiddenManga } from '../../../shared/contentFilter.js';
import { fetchHiddenWitcherRecords } from '../services/animeWitcher.service.js';

const TTL_MS = 12 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const FIRST_LOAD_TIMEOUT_MS = 4000;

const EMPTY = Object.freeze({ ids: new Set(), slugs: new Set(), titles: new Set(), at: 0, size: 0 });
let current = EMPTY;
let loadedAt = 0;
let failedAt = 0;
let loading = null;

/** Exact title key: letters and digits only (Latin + Arabic), lower case. */
export function titleKey(value) {
  const key = String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u0621-\u064A]+/g, '');
  // Very short names ("K", "Air") are too ambiguous to match across servers.
  return key.length >= 4 ? key : '';
}

export function buildHiddenIndex(records = []) {
  const ids = new Set();
  const slugs = new Set();
  const titles = new Set();
  for (const r of records) {
    if (r?.objectID) ids.add(String(r.objectID));
    if (r?.slug) slugs.add(String(r.slug));
    for (const name of r?.names || []) {
      const key = titleKey(name);
      if (key) titles.add(key);
    }
  }
  return { ids, slugs, titles, at: Date.now(), size: ids.size };
}

async function load() {
  try {
    const records = await fetchHiddenWitcherRecords();
    if (records.length) {
      current = buildHiddenIndex(records);
      loadedAt = Date.now();
    } else {
      failedAt = Date.now();
    }
  } catch (err) {
    failedAt = Date.now();
    console.warn('[hiddenTitles] could not load the hidden Hearbor 1 titles:', err?.message || err);
  } finally {
    loading = null;
  }
  return current;
}

/**
 * The hidden-title index. The first call waits (at most a few seconds) for Algolia; later calls
 * return at once and refresh in the background twice a day. Never throws: when Algolia is down
 * the genre rules still apply.
 */
export async function getHiddenIndex() {
  const now = Date.now();
  const fresh = loadedAt && now - loadedAt < TTL_MS;
  const coolingDown = failedAt && now - failedAt < RETRY_MS;
  if (fresh || coolingDown) return current;
  if (!loading) loading = load();
  if (loadedAt) return current; // stale but usable: refresh in the background
  return Promise.race([loading, new Promise((resolve) => setTimeout(() => resolve(current), FIRST_LOAD_TIMEOUT_MS))]);
}

/** For tests: a fixed list of hidden titles, or `null` to behave as if Algolia were down. */
export function setHiddenIndexForTests(records) {
  current = records ? buildHiddenIndex(records) : EMPTY;
  loadedAt = records ? Date.now() : 0;
  failedAt = records ? 0 : Date.now();
}

function matchesIdentity(item, index) {
  const slug = String(item.slug || '');
  if (slug && index.slugs.has(slug)) return true;
  if (item.objectID != null && index.ids.has(String(item.objectID))) return true;
  // Hearbor 1 records carry their real tags (checked by genre); titles are only matched for the
  // other servers and for saved entries, which have no reliable genres.
  if (Array.isArray(item.tagsAr) && item.tagsAr.length) return false;
  for (const name of [item.titleRomaji, item.title, item.titleEn, item.name, item.title_romaji, item.title_english, item.title_en, item.englishTitle]) {
    const key = titleKey(name);
    if (key && index.titles.has(key)) return true;
  }
  return false;
}

/** Anime row (any server, AniList, saved entry). */
export function isHiddenAnimeItem(item, index = current) {
  if (!item || typeof item !== 'object') return false;
  return isHiddenAnime(item, index.ids) || matchesIdentity(item, index);
}

/** Manga row: its genres, or the exact title of a hidden anime (the same work). */
export function isHiddenMangaItem(item, index = current) {
  if (!item || typeof item !== 'object') return false;
  return isHiddenManga(item) || matchesIdentity(item, index);
}

export async function filterAnimeList(list) {
  if (!Array.isArray(list) || !list.length) return Array.isArray(list) ? list : [];
  const index = await getHiddenIndex();
  return list.filter((item) => !isHiddenAnimeItem(item, index));
}

export async function filterMangaList(list) {
  if (!Array.isArray(list) || !list.length) return Array.isArray(list) ? list : [];
  const index = await getHiddenIndex();
  return list.filter((item) => !isHiddenMangaItem(item, index));
}

/** Single title page: the same object, marked `bxHidden: true` when it is hidden. */
export async function markHiddenAnime(show) {
  if (!show || typeof show !== 'object') return show;
  const index = await getHiddenIndex();
  return isHiddenAnimeItem(show, index) ? { ...show, bxHidden: true } : show;
}

export async function markHiddenManga(item) {
  if (!item || typeof item !== 'object') return item;
  const index = await getHiddenIndex();
  return isHiddenMangaItem(item, index) ? { ...item, bxHidden: true } : item;
}
