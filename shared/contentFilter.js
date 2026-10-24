/**
 * Genres hidden from the whole of Hearbor (owner's decisions, 2026-10-16): Ecchi, Harem and
 * Isekai — first in the APK, then on the website too (phones and computers). Reincarnation
 * («تناسخ») stays.
 *
 * Shared by the server (server/src/lib/hiddenTitles.js filters every website list), the website
 * pages and the app (client/src/mobile/contentFilter.js adds the app's saved-id cache). Pure
 * functions only: no window, no localStorage, no network.
 *
 * - Hearbor 1 (the Algolia anime index) is filtered at the source with negative facet filters,
 *   so totals and pagination stay real (2026-10-16: 7,009 -> 6,034 titles).
 * - Other servers are filtered by the genre names they report. Servers that send placeholder
 *   genres (Hearbor 2's fixed list, some manga sources) cannot be classified by genre; the
 *   server also matches their titles against the hidden Hearbor 1 titles.
 * - AniList excludes them itself (genre_not_in / tag_not_in).
 *
 * To hide another genre: add its exact Algolia `tags` value below (check the real spelling with
 * `facets=tags`), its spellings to BLOCKED_NAMES, and its AniList genre/tag if it has one.
 */

/** Exact `tags` facet values in the Algolia index (`facets=tags`, 2026-10-16:
 *  ايتشي 515, حريم 363, عالم مختلف 347 — 975 titles in all). */
export const ALGOLIA_BLOCKED_TAGS = Object.freeze(['ايتشي', 'حريم', 'عالم مختلف']);

/** AniList: Ecchi is a genre (Hentai is already off through isAdult:false); Isekai and the
 *  harem kinds are tags. */
export const ANILIST_GENRE_NOT_IN = Object.freeze(['Ecchi', 'Hentai']);
export const ANILIST_TAG_NOT_IN = Object.freeze(['Isekai', 'Male Harem', 'Female Harem', 'Mixed Gender Harem']);

/** Arabic/Latin folding so "إيتشي", "ايتشي" and "Ecchi" compare the same way. */
export function normalizeGenre(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // harakat, superscript alef, tatweel
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // آ أ إ ٱ -> ا
    .replace(/\u0649/g, '\u064A') // ى -> ي
    .replace(/\u0629/g, '\u0647') // ة -> ه
    .toLowerCase()
    .replace(/[\s_\-\u2013\u2014/\u00B7\u2022.,]+/g, ' ')
    .trim();
}

const BLOCKED_NAMES = new Set(
  [
    // Ecchi
    'ايتشي',
    'إيتشي',
    'اتشي',
    'إتشي',
    'ecchi',
    'etchi',
    // Harem
    'حريم',
    'حريم عكسي',
    'هاريم',
    'harem',
    'reverse harem',
    'male harem',
    'female harem',
    'mixed gender harem',
    // Isekai
    'عالم مختلف',
    'عالم آخر',
    'إيسيكاي',
    'ايسيكاي',
    'إسيكاي',
    'ايسكاي',
    'isekai'
  ].map(normalizeGenre)
);
// Longer names that contain a hidden genre as a whole word ("Reverse Harem", "حريم عكسي").
// Arabic is matched on word boundaries so a name such as "إيتشيغو" never counts as Ecchi.
const BLOCKED_LATIN_WORDS = /\b(?:ecchi|harem|isekai)\b/;
const BLOCKED_ARABIC_WORDS = ['ايتشي', 'اتشي', 'حريم', 'ايسيكاي', 'اسيكاي', 'عالم مختلف', 'عالم اخر'];

/** Genre/tag entries may be plain names or objects ({ name } from AniList tags). */
function genreName(value) {
  if (value && typeof value === 'object') return value.name ?? value.title ?? value.label ?? '';
  return value;
}

/** True for a genre/tag name that Hearbor hides (any spelling). */
export function isBlockedGenre(value) {
  const name = normalizeGenre(genreName(value));
  if (name.length < 2) return false;
  if (BLOCKED_NAMES.has(name) || BLOCKED_LATIN_WORDS.test(name)) return true;
  const padded = ` ${name} `;
  return BLOCKED_ARABIC_WORDS.some((word) => padded.includes(` ${word} `));
}

/** True when any of the given genre/tag lists contains a hidden genre. */
export function hasBlockedGenre(...lists) {
  return lists.some((list) => Array.isArray(list) && list.some(isBlockedGenre));
}

/** Genre pills without the hidden ones. */
export function visibleGenres(list) {
  return Array.isArray(list) ? list.filter((g) => !isBlockedGenre(g)) : [];
}

/** Adds the exclusions to an Algolia query body; they AND with the query's own facet filters. */
export function withAlgoliaExclusions(payload = {}) {
  const own = payload.facetFilters;
  const base = Array.isArray(own) ? own : own ? [own] : [];
  return { ...payload, facetFilters: [...base, ...ALGOLIA_BLOCKED_TAGS.map((tag) => `tags:-${tag}`)] };
}

/** AniList `media(...)` arguments that drop the hidden genres server-side. */
export const ANILIST_EXCLUSION_ARGS = `genre_not_in: ${JSON.stringify(ANILIST_GENRE_NOT_IN)}, tag_not_in: ${JSON.stringify(ANILIST_TAG_NOT_IN)}`;

const NO_IDS = new Set();

/**
 * Anime card, saved entry, website show object or AniList media. `ids`: hidden Hearbor 1
 * objectIDs (saved entries carry no genres). `bxHidden: true` is the server's own verdict.
 */
export function isHiddenAnime(item, ids = NO_IDS) {
  if (!item || typeof item !== 'object') return false;
  if (item.bxHidden === true) return true;
  if (hasBlockedGenre(item.tags, item.tagsAr, item.genres)) return true;
  return item.objectID != null && ids.has(String(item.objectID));
}

/** Manga card or saved manga entry (classified by the genres its server reports). */
export function isHiddenManga(item) {
  return Boolean(item && typeof item === 'object' && (item.bxHidden === true || hasBlockedGenre(item.genres, item.tags)));
}
