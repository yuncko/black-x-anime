/**
 * MangaDex REST API Service (v5)
 * Official endpoint: https://api.mangadex.org
 * Specializes in fetching Arabic translated chapters (translatedLanguage: ['ar'])
 * and At-Home high speed CDN page images.
 */

import { cache } from './cache.service.js';

const MANGADEX_BASE = 'https://api.mangadex.org';

async function mangadexFetch(path, params = {}) {
  const url = new URL(path, MANGADEX_BASE);
  Object.entries(params).forEach(([key, val]) => {
    if (Array.isArray(val)) {
      val.forEach((item) => url.searchParams.append(`${key}[]`, item));
    } else if (typeof val === 'object' && val !== null) {
      Object.entries(val).forEach(([nestedKey, nestedVal]) => {
        url.searchParams.append(`${key}[${nestedKey}]`, nestedVal);
      });
    } else if (val !== undefined && val !== null) {
      url.searchParams.set(key, val);
    }
  });

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'HEARBOR/2.0 (Arabic Manga Engine - contact: dev@black-x.app)',
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MangaDex API Error (${res.status}): ${text.slice(0, 150)}`);
  }

  return res.json();
}

export const mangadexService = {
  /**
   * Search MangaDex by title / query
   * @param {string} query
   */
  async searchManga(query, limit = 10) {
    const cacheKey = `mangadex:search:${query?.trim().toLowerCase()}`;
    return cache.wrap(cacheKey, async () => {
      const data = await mangadexFetch('/manga', {
        title: query,
        limit,
        includes: ['cover_art'],
        order: { relevance: 'desc' }
      });

      return (data?.data || []).map((item) => {
        const attrs = item.attributes;
        const title = attrs.title?.en || attrs.title?.ja || Object.values(attrs.title || {})[0];
        const coverRel = item.relationships?.find((r) => r.type === 'cover_art');
        const coverFileName = coverRel?.attributes?.fileName;
        const coverUrl = coverFileName
          ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}.512.jpg`
          : null;

        return {
          source: 'mangadex',
          mangaDexId: item.id,
          title,
          altTitles: attrs.altTitles,
          description: attrs.description?.en || attrs.description?.ar || '',
          status: attrs.status,
          year: attrs.year,
          coverUrl
        };
      });
    }, 3600);
  },

  /**
   * Get Chapters for a Manga strictly filtered to Arabic ('ar')
   * @param {string} mangaDexId
   */
  async getArabicChapters(mangaDexId, limit = 100) {
    const cacheKey = `mangadex:chapters:ar:${mangaDexId}`;
    return cache.wrap(cacheKey, async () => {
      // Fetch specifically translatedLanguage: ['ar']
      const data = await mangadexFetch(`/manga/${mangaDexId}/feed`, {
        translatedLanguage: ['ar'],
        limit,
        order: { chapter: 'asc' },
        includes: ['scanlation_group', 'user']
      });

      return (data?.data || []).map((ch) => {
        const attrs = ch.attributes;
        const groupRel = ch.relationships?.find((r) => r.type === 'scanlation_group');
        return {
          source: 'mangadex',
          chapterId: ch.id,
          chapterNumber: attrs.chapter || '1',
          volume: attrs.volume,
          title: attrs.title || `الفصل ${attrs.chapter || ''}`,
          language: attrs.translatedLanguage, // 'ar'
          pagesCount: attrs.pages,
          publishAt: attrs.publishAt,
          scanlationGroup: groupRel?.attributes?.name || 'مترجم عربي'
        };
      });
    }, 7200); // 2 hours cache
  },

  /**
   * Get High-Speed Chapter Pages from MangaDex At-Home Network
   * @param {string} chapterId
   */
  async getChapterPages(chapterId) {
    const cacheKey = `mangadex:pages:${chapterId}`;
    return cache.wrap(cacheKey, async () => {
      // Step 1: Call @home server endpoint
      const atHome = await mangadexFetch(`/at-home/server/${chapterId}`);
      const baseUrl = atHome.baseUrl;
      const chapterHash = atHome.chapter?.hash;
      const fileNames = atHome.chapter?.data || []; // full quality images

      // Step 2: Build high-speed direct CDN URLs
      const pages = fileNames.map((fileName, index) => ({
        pageNumber: index + 1,
        url: `${baseUrl}/data/${chapterHash}/${fileName}`,
        fallbackUrl: `${baseUrl}/data-saver/${chapterHash}/${atHome.chapter?.dataSaver?.[index] || fileName}`
      }));

      return {
        source: 'mangadex',
        chapterId,
        totalPages: pages.length,
        pages
      };
    }, 7200); // 2 hours cache
  }
};
