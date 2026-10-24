/**
 * Ecchi, Harem and Isekai are hidden from the whole app (owner's decision, 2026-10-16; the
 * website hides them too). The rules themselves live in shared/contentFilter.js (also used by
 * the server and the website pages); this file adds what only the app needs: the cached ids of
 * hidden Hearbor 1 titles, because saved entries (favorites, history, follows) carry no genres.
 *
 * Titles carrying a hidden genre never show up in the app: home rows, search and its filters,
 * schedule, recommendations, similar titles, typed search, manga lists, saved lists (hidden on
 * screen only; the account data synced with the website is never edited), new-episode alerts,
 * and the details pages refuse to open them.
 */
import { ALGOLIA_BLOCKED_TAGS, isHiddenAnime as isHiddenAnimeWith } from '../../../shared/contentFilter.js';

export {
  ALGOLIA_BLOCKED_TAGS,
  ANILIST_GENRE_NOT_IN,
  ANILIST_TAG_NOT_IN,
  hasBlockedGenre,
  isBlockedGenre,
  isHiddenManga,
  normalizeGenre,
  visibleGenres,
  withAlgoliaExclusions
} from '../../../shared/contentFilter.js';

/* ---- Hidden Hearbor 1 ids: saved entries (favorites, history, follows) carry no genres ---- */

const IDS_KEY = 'bx_mob_hidden_ids_v1';
const IDS_TTL_MS = 24 * 60 * 60 * 1000;
let hiddenIds = new Set();
let hiddenIdsAt = 0;

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(IDS_KEY) || 'null');
    if (saved && Array.isArray(saved.ids)) {
      hiddenIds = new Set(saved.ids.map(String));
      hiddenIdsAt = Number(saved.at) || 0;
    }
  }
} catch {
  /* first run, private storage or not a browser */
}

/** The current hidden-id set (replaced, never mutated, when refreshed). */
export function getHiddenIds() {
  return hiddenIds;
}

/**
 * Loads the ids of every hidden Hearbor 1 title (one query per tag, each well under Algolia's
 * 1,000-hit page cap) at most once a day. `rawQuery(index, body)` must be the Algolia query
 * WITHOUT the exclusions. Resolves to the new Set, or null when nothing changed.
 */
export async function refreshHiddenIds(rawQuery, { force = false } = {}) {
  if (!force && hiddenIdsAt && Date.now() - hiddenIdsAt < IDS_TTL_MS) return null;
  const results = await Promise.all(
    ALGOLIA_BLOCKED_TAGS.map((tag) =>
      rawQuery('series_fav_count_desc', {
        query: '',
        facetFilters: [[`tags:${tag}`]],
        hitsPerPage: 1000,
        attributesToRetrieve: ['objectID'],
        attributesToHighlight: [],
        attributesToSnippet: [],
        analytics: false
      })
    )
  );
  const ids = new Set();
  for (const res of results) for (const hit of res?.hits || []) if (hit?.objectID) ids.add(String(hit.objectID));
  if (!ids.size) return null;
  hiddenIds = ids;
  hiddenIdsAt = Date.now();
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(IDS_KEY, JSON.stringify({ at: hiddenIdsAt, ids: [...ids] }));
  } catch {
    /* storage full: keep the in-memory set */
  }
  return ids;
}

/** Anime card, saved entry or website show object (the app's cached hidden ids by default). */
export function isHiddenAnime(item, ids = hiddenIds) {
  return isHiddenAnimeWith(item, ids);
}
