/**
 * Manga & Novel API Routes
 */

import { Router } from 'express';
import { mangaNovelController } from '../controllers/mangaNovel.controller.js';

const router = Router();

// Search: Aggregates Hearbor 1, Hearbor 2, and Hearbor 3 Manga & Manhwa Engines
router.get('/search', mangaNovelController.search);

// Manga & Manhwa Routes
router.get('/manga/:id', mangaNovelController.getMangaDetails);
router.get('/manga/:id/chapters', mangaNovelController.getMangaChapters);
router.get('/manga/chapter/:chapter_id/pages', mangaNovelController.getChapterPages);
router.get('/manga/chapter/:chapter_id/download', mangaNovelController.downloadChapter);

// Light Novels Routes
router.get('/novels/:id', mangaNovelController.getNovelDetails);
router.get('/novels/:id/chapters', mangaNovelController.getNovelChapters);
router.get('/novels/chapter/:chapter_id', mangaNovelController.getNovelChapter);

// User Tracking & History
router.post('/tracking/bookmark', mangaNovelController.toggleBookmark);
router.get('/tracking/bookmarks', mangaNovelController.getBookmarks);
router.post('/tracking/history', mangaNovelController.updateReadingHistory);
router.get('/tracking/history', mangaNovelController.getReadingHistory);
router.get('/tracking/notifications', mangaNovelController.getNotifications);

// Image Proxy (Anti-hotlink & CORS bypass for Hearbor 1 / 2 / 3)
router.get('/proxy/image', mangaNovelController.imageProxy);

export default router;
