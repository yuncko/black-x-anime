/**
 * AniList GraphQL Service for Manga & Light Novels
 * Official endpoint: https://graphql.anilist.co
 */

import { cache } from './cache.service.js';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

async function anilistRequest(query, variables = {}) {
  const res = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'HEARBOR/2.0 (Arabic Manga Engine)'
    },
    body: JSON.stringify({ query, variables }),
    // Never let a stalled AniList request hold up search/detail responses.
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AniList API Error (${res.status}): ${text.slice(0, 150)}`);
  }

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`AniList GraphQL Error: ${json.errors[0].message}`);
  }

  return json.data;
}

const MANGA_DETAIL_QUERY = `
  query GetMangaDetail($id: Int) {
    Media(id: $id, type: MANGA) {
      id
      idMal
      title {
        romaji
        english
        native
      }
      format
      status
      description(asHtml: false)
      startDate {
        year
        month
        day
      }
      chapters
      volumes
      countryOfOrigin
      source
      coverImage {
        extraLarge
        large
        medium
        color
      }
      bannerImage
      genres
      synonyms
      averageScore
      popularity
      rankings {
        rank
        type
        allTime
      }
      staff(perPage: 3) {
        nodes {
          id
          name {
            full
            native
          }
        }
      }
    }
  }
`;

const MANGA_SEARCH_QUERY = `
  query SearchManga($query: String, $format: MediaFormat, $page: Int = 1, $perPage: Int = 20) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        hasNextPage
      }
      media(search: $query, type: MANGA, format: $format, sort: POPULARITY_DESC) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        format
        status
        description(asHtml: false)
        chapters
        genres
        averageScore
        coverImage {
          large
          color
        }
      }
    }
  }
`;

export const anilistService = {
  /**
   * Search Manga or Light Novels
   * @param {string} query
   * @param {'MANGA'|'NOVEL'} [format]
   */
  async search(query, format = null) {
    const cacheKey = `anilist:search:${format || 'ALL'}:${query?.trim().toLowerCase()}`;
    return cache.wrap(cacheKey, async () => {
      const vars = { query, page: 1, perPage: 20 };
      if (format) vars.format = format;
      const data = await anilistRequest(MANGA_SEARCH_QUERY, vars);
      return (data?.Page?.media || []).map((m) => ({
        source: 'anilist',
        id: m.id,
        idMal: m.idMal,
        title: m.title.english || m.title.romaji || m.title.native,
        nativeTitle: m.title.native,
        romajiTitle: m.title.romaji,
        format: m.format, // MANGA, NOVEL, ONE_SHOT
        status: m.status,
        description: m.description,
        coverImage: m.coverImage?.large,
        coverColor: m.coverImage?.color,
        genres: m.genres,
        score: m.averageScore,
        chaptersCount: m.chapters
      }));
    }, 3600); // 1 hour cache
  },

  /**
   * Get Media Details by ID
   * @param {number|string} id
   */
  async getDetails(id) {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return null;

    const cacheKey = `anilist:manga:${numId}`;
    return cache.wrap(cacheKey, async () => {
      const data = await anilistRequest(MANGA_DETAIL_QUERY, { id: numId });
      const m = data?.Media;
      if (!m) return null;

      return {
        id: m.id,
        idMal: m.idMal,
        title: m.title.english || m.title.romaji,
        titleArabicEstimate: m.title.english, // Will be enriched by search match
        romajiTitle: m.title.romaji,
        nativeTitle: m.title.native,
        synonyms: m.synonyms || [],
        format: m.format, // MANGA or NOVEL
        status: m.status,
        description: m.description,
        coverImage: m.coverImage?.extraLarge || m.coverImage?.large,
        bannerImage: m.bannerImage,
        coverColor: m.coverImage?.color,
        genres: m.genres,
        averageScore: m.averageScore,
        popularity: m.popularity,
        countryOfOrigin: m.countryOfOrigin, // JP, KR (Manhwa), CN (Manhua)
        isManhwa: m.countryOfOrigin === 'KR',
        isManhua: m.countryOfOrigin === 'CN',
        chaptersTotal: m.chapters,
        volumesTotal: m.volumes,
        authors: (m.staff?.nodes || []).map((s) => s.name.full)
      };
    }, 7200); // 2 hours cache
  }
};
