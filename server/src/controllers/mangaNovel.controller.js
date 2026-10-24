/**
 * Manga & Novel Controller — Hearbor Multi-Server Edition (Hearbor 1 / 2 / 3)
 */

import axios from 'axios';
import { mangalikService } from '../services/mangalik.service.js';
import {
  aniprojectService, isAniProjectConfigured, isAniProjectMangaId, isAniProjectChapterId
} from '../services/aniproject.service.js';
import { anilistService } from '../services/anilist.service.js';
import { scraperService } from '../services/scraper.service.js';
import { getPrisma } from '../lib/prisma.js';
import { filterAnimeList, filterMangaList, getHiddenIndex, isHiddenMangaItem, markHiddenManga } from '../lib/hiddenTitles.js';
import { PUBLIC_SITE_HOST } from '../../../shared/publicSite.js';

/** Saved rows keep their data; hidden genres are only left out of what is shown. */
function savedContentOf(row) {
  const c = row?.content || row?.chapter?.content || null;
  if (!c || typeof c !== 'object') return {};
  let genres = c.genres;
  if (typeof genres === 'string') {
    try {
      genres = JSON.parse(genres);
    } catch {
      genres = genres.split(',');
    }
  }
  return { ...c, genres: Array.isArray(genres) ? genres : [] };
}

function getUpstreamHeadersForImage(decodedUrl) {
  let referer = 'https://olympustaff.com/';
  try {
    const u = new URL(decodedUrl);
    const host = u.hostname.toLowerCase();
    if (host.includes('olympustaff')) {
      referer = 'https://olympustaff.com/';
    } else if (host.includes('3asq')) {
      referer = 'https://3asq.online/';
    } else if (host.includes('planeptune') || host.includes('compsci88') || host.includes('weebcentral')) {
      referer = 'https://weebcentral.com/';
    } else if (host.includes('mangadex')) {
      referer = 'https://mangadex.org/';
    } else if (host.includes('azorafly') || host.includes('azoramoon')) {
      referer = 'https://azorafly.com/';
    } else if (host.includes('lekmanga') || host.includes('manga-leko')) {
      referer = 'https://www.lekmanga.com/';
    } else if (host.includes('mangamello')) {
      referer = 'https://plus.mangamello.com/';
    } else if (host.includes('appswat') || host.includes('meshmanga')) {
      referer = 'https://meshmanga.com/';
    } else if (host.includes('dilar.tube')) {
      referer = 'https://v2.dilar.tube/';
    } else if (host.includes('starzmanga')) {
      referer = 'https://starzmanga.com/';
    } else {
      referer = `${u.protocol}//${u.host}/`;
    }
  } catch (_) {}

  return {
    Referer: referer,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
  };
}

export const mangaNovelController = {
  /**
   * GET /api/search?query=solo&type=all|manga|novel&server=all|bx1|bx2|bx3
   */
  async search(req, res) {
    try {
      const { query, type = 'all', server = 'all' } = req.query;
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      const results = {
        manga: [],
        novels: [],
        metadata: []
      };

      const promises = [];
      const mangaResults = [];
      const serverId = String(server || 'all').toLowerCase();
      if (serverId === 'bx4') {
        if (!isAniProjectConfigured()) return res.status(503).json({ error: 'source_unavailable', manga: [] });
        try {
          results.manga = (type === 'all' || type === 'manga')
            ? await filterMangaList(await aniprojectService.searchManga(query)) : [];
          return res.json({ ...results, results: results.manga });
        } catch {
          return res.status(502).json({ error: 'upstream', manga: [] });
        }
      }

      if (type === 'all' || type === 'manga') {
        promises.push(mangalikService.searchArabicManga(query, serverId)
          .then((data) => { mangaResults.push(...(data || [])); }).catch(() => {}));
        if (isAniProjectConfigured() && serverId === 'all') {
          promises.push(aniprojectService.searchManga(query)
            .then((data) => { mangaResults.push(...data); }).catch(() => {}));
        }
      }

      if ((type === 'all' || type === 'novel') && typeof scraperService?.searchArabicNovels === 'function') {
        promises.push(
          Promise.resolve(scraperService.searchArabicNovels(query))
            .then((data) => {
              results.novels = data || [];
            })
            .catch(() => {})
        );
      }

      // AniList metadata only for type=all: the web client queries AniList itself,
      // so manga/novel searches stay fast and don't spend the server's rate limit.
      if (type === 'all' && typeof anilistService?.search === 'function') {
        promises.push(
          Promise.resolve(anilistService.search(query))
            .then((data) => {
              results.metadata = data || [];
            })
            .catch(() => {})
        );
      }

      await Promise.allSettled(promises);
      // Ecchi / Harem / Isekai (shared/contentFilter.js, lib/hiddenTitles.js).
      results.manga = await filterMangaList([...new Map(mangaResults.map((item) => [item.id, item])).values()]);
      results.metadata = Array.isArray(results.metadata) ? await filterAnimeList(results.metadata) : results.metadata;
      return res.json({
        ...results,
        results: results.manga
      });
    } catch (error) {
      console.error('Search Controller Error:', error);
      return res.status(500).json({ error: 'Failed to execute search' });
    }
  },

  /**
   * GET /api/manga/:id
   */
  async getMangaDetails(req, res) {
    try {
      const { id } = req.params;
      if (isAniProjectMangaId(id)) {
        if (!isAniProjectConfigured()) return res.status(503).json({ error: 'source_unavailable' });
        const item = await aniprojectService.getManga(id);
        return item ? res.json(await markHiddenManga(item)) : res.status(404).json({ error: 'not_found' });
      }
      const meta = await mangalikService.getSeriesMetadata(id);
      if (meta) {
        return res.json(await markHiddenManga(meta));
      }
      if (!Number.isNaN(Number(id))) {
        const details = await anilistService.getDetails(id);
        return res.json(details);
      }
      return res.json({ id, message: 'Use /chapters to get chapters for this Hearbor Manga ID' });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch manga details' });
    }
  },

  /**
   * GET /api/manga/:id/chapters?server=bx1|bx2|bx3
   */
  async getMangaChapters(req, res) {
    try {
      const { id } = req.params;
      const preferredServer = String(req.query.server || '').trim().toLowerCase();
      if (isAniProjectMangaId(id)) {
        if (!isAniProjectConfigured()) return res.status(503).json({ error: 'source_unavailable', chapters: [] });
        const item = await aniprojectService.getManga(id);
        if (!item) return res.status(404).json({ error: 'not_found', chapters: [] });
        const chapters = await aniprojectService.getMangaChapters(id);
        return res.json({
          chapters,
          availableServers: [{ id: 'bx4', name: 'سيرفر Hearbor 4', labelEn: 'Hearbor Server 4' }],
          activeServer: 'bx4'
        });
      }

      const handles = await mangalikService.resolveSeriesHandles(id);
      const availableServers = [];
      if (handles.bx1) {
        availableServers.push({
          id: 'bx1',
          name: 'سيرفر Hearbor 1 (مانهوا عربية)',
          labelEn: 'Hearbor 1 (AR Manhwa)'
        });
      }
      if (handles.bx2) {
        availableServers.push({
          id: 'bx2',
          name: 'سيرفر Hearbor 2 (مانجا عربية)',
          labelEn: 'Hearbor 2 (AR Manga)'
        });
      }
      if (handles.bx3) {
        availableServers.push({
          id: 'bx3',
          name: 'سيرفر Hearbor 3 (المكتبة العالمية الشاملة)',
          labelEn: 'Hearbor 3 (Global HD)'
        });
      }

      const chapters = await mangalikService.getArabicChapters(id, preferredServer);
      const activeServer = chapters[0]?.server || preferredServer || availableServers[0]?.id || 'bx1';

      return res.json({
        chapters,
        availableServers,
        activeServer
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch manga chapters', chapters: [] });
    }
  },

  /**
   * GET /api/manga/chapter/:chapter_id/pages?server=bx1|bx2|bx3
   */
  async getChapterPages(req, res) {
    try {
      const { chapter_id } = req.params;
      const preferredServer = String(req.query.server || '').trim().toLowerCase();
      if (isAniProjectChapterId(chapter_id)) {
        if (!isAniProjectConfigured()) return res.status(503).json({ error: 'source_unavailable', pages: [] });
        const pages = await aniprojectService.getChapterPages(chapter_id);
        return res.json({ pages });
      }
      const pages = await mangalikService.getArabicChapterPages(chapter_id, preferredServer);
      return res.json({ pages });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch chapter pages', pages: [] });
    }
  },

  /**
   * GET /api/manga/chapter/:chapter_id/download?title=...&chapter=...&server=bx1|bx2|bx3
   * Generates a standalone offline-ready Hearbor Chapter Reader HTML file containing all chapter pages.
   */
  async downloadChapter(req, res) {
    try {
      const { chapter_id } = req.params;
      const preferredServer = String(req.query.server || '').trim().toLowerCase();
      const title = String(req.query.title || 'Hearbor Manga').trim().slice(0, 120);
      const chapterNum = String(req.query.chapter || '1').trim().slice(0, 30);
      if (isAniProjectChapterId(chapter_id) && !isAniProjectConfigured()) {
        return res.status(503).json({ error: 'source_unavailable' });
      }
      const pages = isAniProjectChapterId(chapter_id)
        ? await aniprojectService.getChapterPages(chapter_id)
        : await mangalikService.getArabicChapterPages(chapter_id, preferredServer);
      if (!pages || pages.length === 0) {
        return res.status(404).json({ error: 'No pages found for this chapter' });
      }

      const protocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0] === 'https' ? 'https' : 'http';
      const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(req.get('host') || '') ? req.get('host') : PUBLIC_SITE_HOST;
      const baseUrl = `${protocol}://${host}`;
      const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);
      const imgTags = pages
        .map((p, idx) => {
          const image = p.url || p.imageUrl;
          const proxied = `${baseUrl}/api/proxy/image?url=${encodeURIComponent(image)}`;
          return `<div class="page"><img src="${escapeHtml(proxied)}" data-direct="${escapeHtml(image)}" onerror="if(this.src!==this.dataset.direct)this.src=this.dataset.direct" alt="Page ${idx + 1}" loading="eager" /><span class="num">${idx + 1} / ${pages.length}</span></div>`;
        })
        .join('\n');

      const htmlDoc = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} - الفصل ${escapeHtml(chapterNum)} | Hearbor</title>
  <style>
    body { margin: 0; background: #000; color: #fff; font-family: system-ui, -apple-system, sans-serif; text-align: center; }
    header { position: sticky; top: 0; z-index: 10; background: rgba(5,5,8,0.92); backdrop-filter: blur(12px); padding: 12px 20px; border-bottom: 1px solid rgba(255,255,255,0.12); display: flex; justify-content: space-between; align-items: center; }
    .brand { font-weight: 900; letter-spacing: 1px; color: #fff; }
    .container { max-width: 820px; margin: 0 auto; }
    .page { position: relative; line-height: 0; background: #050508; }
    .page img { width: 100%; height: auto; display: block; }
    .num { position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.75); color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 12px; line-height: 1.2; }
  </style>
</head>
<body>
  <header>
    <div class="brand">Hearbor MANGA</div>
    <div>${escapeHtml(title)} — الفصل ${escapeHtml(chapterNum)} (${pages.length} صفحة)</div>
  </header>
  <div class="container">
    ${imgTags}
  </div>
</body>
</html>`;

      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="HEARBOR-Chapter-${encodeURIComponent(chapterNum)}.html"`);
      return res.send(htmlDoc);
    } catch (error) {
      console.error('Chapter download error:', error.message);
      return res.status(500).json({ error: 'Failed to download chapter' });
    }
  },

  /**
   * GET /api/novels/:id
   */
  async getNovelDetails(req, res) {
    try {
      const { id } = req.params;
      if (!Number.isNaN(Number(id))) {
        const details = await anilistService.getDetails(id);
        return res.json(details);
      }
      return res.json({ slug: id, message: 'Use /chapters to get novel chapters' });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch novel details' });
    }
  },

  /**
   * GET /api/novels/:id/chapters
   */
  async getNovelChapters(req, res) {
    try {
      const { id } = req.params;
      const chapters = await mangalikService.getNovelChapters(id);
      return res.json({ chapters });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch novel chapters', chapters: [] });
    }
  },

  /**
   * GET /api/novels/chapter/:chapter_id
   */
  async getNovelChapter(req, res) {
    try {
      const { chapter_id } = req.params;
      const content = await mangalikService.getNovelChapterContent(chapter_id);
      return res.json(content);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch novel chapter text' });
    }
  },

  /**
   * GET /api/proxy/image?url=...&download=1&filename=...
   * Host-aware image proxy for Hearbor 1 (OlympusStaff), Hearbor 2 (3asq), and Hearbor 3 (WeebCentral / MangaDex).
   */
  async imageProxy(req, res) {
    try {
      const { url, download, filename } = req.query;
      if (!url) {
        return res.status(400).send('URL is required');
      }

      const decodedUrl = decodeURIComponent(String(url)).trim().replace(/ /g, '%20');
      const headers = getUpstreamHeadersForImage(decodedUrl);

      const response = await axios.get(decodedUrl, {
        responseType: 'arraybuffer',
        headers,
        timeout: 20000
      });

      const contentType = response.headers['content-type'] || 'image/jpeg';
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=86400');
      res.set('Access-Control-Allow-Origin', '*');

      if (download === '1' || download === 'true') {
        const ext = contentType.includes('png')
          ? 'png'
          : contentType.includes('webp')
          ? 'webp'
          : 'jpg';
        const safeName = String(filename || `black-x-page.${ext}`).replace(/[^a-zA-Z0-9._-]+/g, '-');
        res.set('Content-Disposition', `attachment; filename="${safeName}"`);
      }

      return res.send(Buffer.from(response.data));
    } catch (error) {
      console.error('Image Proxy Error:', error.message);
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
        <rect width="100%" height="100%" fill="#05070e"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#38bdf8" font-family="sans-serif" font-size="20">Hearbor CDN — اضغط لإعادة المحاولة أو بدّل السيرفر</text>
      </svg>`;
      res.set('Content-Type', 'image/svg+xml');
      return res.status(200).send(fallbackSvg);
    }
  },

  /* =========================================================================
   * USER TRACKING, BOOKMARKS, HISTORY & NOTIFICATIONS
   * ========================================================================= */
  async toggleBookmark(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { contentId, status = 'READING' } = req.body;
      const prisma = getPrisma();

      const existing = await prisma.userBookmark.findUnique({
        where: { user_id_content_id: { user_id: userId, content_id: contentId } }
      });

      if (existing) {
        await prisma.userBookmark.delete({ where: { id: existing.id } });
        return res.json({ bookmarked: false, message: 'Bookmark removed' });
      } else {
        const bookmark = await prisma.userBookmark.create({
          data: { user_id: userId, content_id: contentId, status }
        });
        return res.json({ bookmarked: true, bookmark });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Failed to toggle bookmark' });
    }
  },

  async getBookmarks(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const prisma = getPrisma();
      const bookmarks = await prisma.userBookmark.findMany({
        where: { user_id: userId },
        include: { content: true },
        orderBy: { created_at: 'desc' }
      });

      const index = await getHiddenIndex();
      return res.json({ bookmarks: bookmarks.filter((b) => !isHiddenMangaItem(savedContentOf(b), index)) });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch bookmarks', bookmarks: [] });
    }
  },

  async updateReadingHistory(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { contentId, chapterId, number, title, lastPage = 1, scrollPos = 0 } = req.body;
      const prisma = getPrisma();

      let chapter = await prisma.episodeChapter.findUnique({ where: { id: chapterId } });
      if (!chapter && contentId) {
        chapter = await prisma.episodeChapter.upsert({
          where: { content_id_number: { content_id: contentId, number: Number(number) || 1 } },
          update: { title },
          create: {
            content_id: contentId,
            number: Number(number) || 1,
            title: title || `Chapter ${number}`,
            source_url: chapterId
          }
        });
      }

      if (!chapter) {
        return res.status(404).json({ error: 'Chapter could not be resolved' });
      }

      const history = await prisma.readingHistory.upsert({
        where: { user_id_chapter_id: { user_id: userId, chapter_id: chapter.id } },
        update: {
          last_page: Number(lastPage),
          scroll_position: Number(scrollPos)
        },
        create: {
          user_id: userId,
          chapter_id: chapter.id,
          last_page: Number(lastPage),
          scroll_position: Number(scrollPos)
        }
      });

      return res.json({ history });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to update reading history' });
    }
  },

  async getReadingHistory(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const prisma = getPrisma();
      const history = await prisma.readingHistory.findMany({
        where: { user_id: userId },
        include: {
          chapter: {
            include: { content: true }
          }
        },
        orderBy: { updated_at: 'desc' },
        take: 30
      });

      const index = await getHiddenIndex();
      return res.json({ history: history.filter((h) => !isHiddenMangaItem(savedContentOf(h), index)) });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch reading history', history: [] });
    }
  },

  async getNotifications(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const prisma = getPrisma();
      const notifications = await prisma.notification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: 20
      });

      return res.json({ notifications });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch notifications', notifications: [] });
    }
  }
};
