/**
 * Strict title check for linking one show across Hearbor servers.
 *
 * The general isTitleMatch() (server/src/witanime.js) accepts two thirds of the
 * query words, which is fine for search filtering but not for attaching another
 * server's episodes to a show: it paired "Tensei shitara Ken deshita 2" with
 * "Tensei shitara Slime Datta Ken" and served Slime episodes on the Reincarnated
 * as a Sword page. Here every significant query word must appear, most of the
 * candidate's own words must be covered, and season numbers must agree.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'of', 'for', 'with', 'from', 'to',
  'no', 'ni', 'wa', 'ga', 'wo', 'de',
  'season', 'part', 'cour', 'tv', 'anime', 'movie', 'film'
]);

const ROMAN = Object.freeze({ ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 });

export function normalizeCrossTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** 1 unless the title names a later season ("Season 2", "2nd Season", "II", a trailing "2"). */
export function seasonNumberOf(value) {
  const s = normalizeCrossTitle(value);
  if (!s) return 1;
  const explicit =
    s.match(/\b(?:season|s)\s*(\d{1,2})\b/) ||
    s.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/) ||
    s.match(/\b(?:part|cour)\s*(\d{1,2})\b/);
  if (explicit) return Number(explicit[1]) || 1;
  const roman = s.match(/\b(ii|iii|iv|v|vi|vii|viii)$/);
  if (roman) return ROMAN[roman[1]];
  const trailing = s.match(/\s(\d{1,2})$/);
  if (trailing) {
    const n = Number(trailing[1]);
    if (n >= 2 && n <= 20) return n;
  }
  return 1;
}

function significantWords(value) {
  return [
    ...new Set(
      normalizeCrossTitle(value)
        .split(' ')
        .filter(
          (w) =>
            w &&
            !STOP_WORDS.has(w) &&
            !/^\d+$/.test(w) &&
            !/^\d+(?:st|nd|rd|th)$/.test(w) &&
            !/^s\d+$/.test(w) &&
            !Object.prototype.hasOwnProperty.call(ROMAN, w)
        )
    )
  ];
}

/**
 * True when `query` (e.g. words from a Hearbor 1 slug) names the same show as
 * any of `candidateTitles` (e.g. a Hearbor 2 catalogue entry).
 */
export function isStrictCrossSourceMatch(query, ...candidateTitles) {
  const qNorm = normalizeCrossTitle(query);
  if (!qNorm) return false;
  const qSeason = seasonNumberOf(query);
  const qWords = significantWords(query);
  for (const title of candidateTitles) {
    const cNorm = normalizeCrossTitle(title);
    if (!cNorm) continue;
    if (cNorm === qNorm) return true;
    if (seasonNumberOf(title) !== qSeason) continue;
    const cWords = significantWords(title);
    if (!qWords.length || !cWords.length) continue;
    const cSet = new Set(cWords);
    const qSet = new Set(qWords);
    const everyQueryWord = qWords.every((w) => cSet.has(w));
    const candidateCoverage = cWords.filter((w) => qSet.has(w)).length / cWords.length;
    if (everyQueryWord && candidateCoverage >= 0.75) return true;
  }
  return false;
}
