/**
 * Content & ratings controller — POST /api/content/rate
 */
import crypto from 'crypto';
import { getPrisma } from '../lib/prisma.js';
import { getUserId, fail, prismaError, ensurePrismaUser, isDbUnavailable, dbIsBroken } from '../lib/api.js';
import { db, social, ensureSocialTables, levelFromMinutes, awardBadgesSqlite } from '../lib/socialDb.js';
import { mangalikService, FLAGSHIP_MANGA_MAP } from '../services/mangalik.service.js';
import { aniprojectService, isAniProjectConfigured, isAniProjectMangaId } from '../services/aniproject.service.js';
import { filterMangaList, markHiddenManga } from '../lib/hiddenTitles.js';

/** POST /api/content/rate — body { contentId, episodeId?, score: 1..10 } */
export async function rateContent(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return fail(res, 401, 'Authentication required.');

    const { contentId, episodeId, score, slug, title, type, episodeNumber } = req.body || {};
    if (contentId !== undefined && contentId !== null && typeof contentId !== 'string') {
      return fail(res, 400, 'contentId must be a string.');
    }
    if (episodeId !== undefined && episodeId !== null && typeof episodeId !== 'string') {
      return fail(res, 400, 'episodeId must be a string.');
    }
    const s = Number(score);
    if (!Number.isInteger(s) || s < 1 || s > 10) {
      return fail(res, 400, 'score must be an integer between 1 and 10.');
    }

    // no DATABASE_URL -> SQLite social store (works on every host)
        var socialFallback = () => {
      ensureSocialTables();
      const ep = episodeNumber !== undefined && episodeNumber !== null ? Number(episodeNumber) : 0;
      if (!Number.isInteger(ep) || ep < 0) return fail(res, 400, 'episodeNumber must be a positive integer.');
      if (!slug) return fail(res, 400, 'contentId or slug is required.');
      social.upsertRating(String(userId), String(slug).slice(0, 120), ep, s, title != null ? String(title).slice(0, 200) : null);
      return res.status(200).json({ success: true, message: 'Rating saved successfully.' });
    };
    if (!process.env.DATABASE_URL || dbIsBroken()) return socialFallback();

    const prisma = getPrisma();
    const user = await ensurePrismaUser(prisma, req.user);
    if (!user) return fail(res, 404, 'User not found.');
    const uid = user.id;

    // contentId (spec) or slug (site UI: witanime/AniList slugs) -> Content row
    let cid = contentId ?? null;
    if (!cid && slug) {
      const clean = String(slug).slice(0, 120);
      let row = await prisma.content.findUnique({ where: { slug: clean } });
      if (!row) {
        row = await prisma.content.create({
          data: {
            slug: clean,
            title: String(title || clean).slice(0, 200),
            type: ['ANIME', 'MANGA', 'NOVEL'].includes(type) ? type : 'ANIME'
          }
        });
      }
      cid = row.id;
    }
    if (!cid) return fail(res, 400, 'contentId or slug is required.');

    const content = await prisma.content.findUnique({ where: { id: cid } });
    if (!content) return fail(res, 404, 'Content not found.');

    let epId = episodeId ?? null;
    if (!epId && episodeNumber !== undefined && episodeNumber !== null) {
      const n = Number(episodeNumber);
      if (!Number.isInteger(n) || n < 0) return fail(res, 400, 'episodeNumber must be a positive integer.');
      let ep = await prisma.episodeChapter.findFirst({ where: { content_id: cid, number: n } });
      if (!ep) ep = await prisma.episodeChapter.create({ data: { content_id: cid, number: n, title: `Episode ${n}` } });
      epId = ep.id;
    }
    if (epId) {
      const episode = await prisma.episodeChapter.findUnique({ where: { id: epId } });
      if (!episode) return fail(res, 404, 'Episode not found.');
      if (episode.content_id !== cid) {
        return fail(res, 400, 'Episode does not belong to the given content.');
      }
    }

    // One rating per (user, content, episode|content-level) — upsert-by-hand
    // because the composite unique contains a nullable episode_id.
    const where = { user_id: uid, content_id: cid, episode_id: epId ?? null };
    const existing = await prisma.rating.findFirst({ where });
    if (existing) {
      await prisma.rating.update({ where: { id: existing.id }, data: { score: s } });
    } else {
      await prisma.rating.create({ data: { ...where, score: s } });
    }

    return res.status(200).json({
      success: true,
      message: 'Rating saved successfully.'
    });
  } catch (err) {
      if (isDbUnavailable(err) && typeof socialFallback === 'function') return socialFallback();
    return prismaError(res, err, { notFound: 'Rating target not found.' });
  }
}

/**
 * GET /api/content/rating?slug=&episodeNumber= — the signed-in user's saved
 * score for a show/episode, so the UI can restore highlighted stars.
 */
export async function getMyRating(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return fail(res, 401, 'Authentication required.');
    const slug = String(req.query.slug || '').trim();
    if (!slug) return fail(res, 400, 'slug is required.');
    const ep = req.query.episodeNumber !== undefined ? Number(req.query.episodeNumber) : 0;
    if (!Number.isInteger(ep) || ep < 0) return fail(res, 400, 'episodeNumber must be a positive integer.');

        var socialFallback = () => {
      ensureSocialTables();
      const row = social.getRating(String(userId), slug.slice(0, 120), ep);
      return res.status(200).json({ success: true, rating: row ? { score: row.score } : null });
    };
    if (!process.env.DATABASE_URL || dbIsBroken()) return socialFallback();

    const prisma = getPrisma();
    const user = await ensurePrismaUser(prisma, req.user);
    const where = { user_id: user.id, content_id: '', episode_id: null };
    // resolve content by slug (or contentId) then find the rating
    let content = null;
    if (req.query.contentId) content = await prisma.content.findUnique({ where: { id: String(req.query.contentId) } });
    if (!content) content = await prisma.content.findUnique({ where: { slug: slug.slice(0, 120) } });
    if (!content) return res.status(200).json({ success: true, rating: null });

    let epId = null;
    if (ep > 0) {
      const epRow = await prisma.episodeChapter.findFirst({ where: { content_id: content.id, number: ep } });
      epId = epRow?.id ?? null;
    }
    const rating = await prisma.rating.findFirst({
      where: { user_id: user.id, content_id: content.id, episode_id: epId }
    });
    return res.status(200).json({ success: true, rating: rating ? { score: rating.score } : null });
  } catch (err) {
      if (isDbUnavailable(err) && typeof socialFallback === 'function') return socialFallback();
    return prismaError(res, err);
  }
}

/**
 * GET /api/content/ratings — every score the signed-in user has saved
 * (used by the profile dashboard / Wrapped card).
 */
export async function listMyRatings(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return fail(res, 401, 'Authentication required.');

    var socialFallback = () => {
      ensureSocialTables();
      return res.status(200).json({ success: true, ratings: social.listRatings(String(userId)) });
    };
    if (!process.env.DATABASE_URL || dbIsBroken()) return socialFallback();

    const prisma = getPrisma();
    const user = await ensurePrismaUser(prisma, req.user);
    if (!user) return res.status(200).json({ success: true, ratings: [] });
    const rows = await prisma.rating.findMany({
      where: { user_id: user.id },
      include: {
        content: { select: { slug: true, title: true } },
        episode: { select: { number: true } }
      },
      orderBy: { updated_at: 'desc' },
      take: 500
    });
    return res.status(200).json({
      success: true,
      ratings: (rows || []).map((r) => ({
        slug: r.content?.slug || r.content_id,
        title: r.content?.title || null,
        episode: r.episode?.number ?? 0,
        score: r.score,
        updatedAt: r.updated_at
      }))
    });
  } catch (err) {
    if (isDbUnavailable(err) && typeof socialFallback === 'function') return socialFallback();
    return prismaError(res, err);
  }
}

/**
 * GET /api/content/library?type=ALL|MANGA|MANHWA&q=&server=all|bx1|bx2|bx3
 */
export async function getLibrary(req, res) {
  try {
    const type = String(req.query.type || 'ALL').trim().toUpperCase();
    const q = String(req.query.q || '').trim();
    const server = String(req.query.server || 'all').trim().toLowerCase();
    if (server === 'bx4') {
      if (!isAniProjectConfigured()) return res.status(503).json({ success: false, error: 'source_unavailable', items: [] });
      const page = Math.max(1, Number(req.query.page) || 1);
      try {
        const found = q && page === 1 ? await filterMangaList(await aniprojectService.searchManga(q)) : [];
        const items = type === 'ALL' ? found : found.filter((item) => item.type === type);
        return res.json({ success: true, totalCount: items.length, page, hasNext: false, items });
      } catch {
        return res.status(502).json({ success: false, error: 'upstream', items: [] });
      }
    }
    ensureSocialTables();

    // Base curated flagship library items
    let items = social.getLibraryItems(type, q).map((it) => {
      const f = FLAGSHIP_MANGA_MAP[it.id];
      const availableServers = [];
      if (f?.osSlug) availableServers.push('bx1');
      if (f?.asqSlug) availableServers.push('bx2');
      if (f?.wcSeriesId) availableServers.push('bx3');
      if (availableServers.length === 0) availableServers.push('bx1', 'bx2', 'bx3');
      return {
        ...it,
        source: availableServers.includes('bx1')
          ? 'Hearbor 1'
          : availableServers.includes('bx2')
          ? 'Hearbor 2'
          : 'Hearbor 3',
        availableServers
      };
    });

    if (server !== 'all') {
      items = items.filter((it) => Array.isArray(it.availableServers) && it.availableServers.includes(server));
    }

    // Dynamically enrich with live catalogs from Hearbor 1 (MangaMello Plus 14,331 + Azorafly 2,453 + Olympus) & Hearbor 2 (MangaSwat 1,669 + Dilar 9,164 + 3asq)
    const page = Math.max(1, Number(req.query.page) || 1);
    const dynamicTasks = [];
    if (q) {
      dynamicTasks.push(mangalikService.searchArabicManga(q, server));
      if (server === 'all' && isAniProjectConfigured()) {
        dynamicTasks.push(aniprojectService.searchManga(q));
      }
    } else {
      if (server === 'all' || server === 'bx1') {
        dynamicTasks.push(mangalikService.getMangaMelloCatalog(page));
        dynamicTasks.push(mangalikService.getAzoraflyCatalog(page));
        dynamicTasks.push(mangalikService.getOlympusCatalog(page));
      }
      if (server === 'all' || server === 'bx2') {
        dynamicTasks.push(mangalikService.getMangaSwatCatalog(page));
        dynamicTasks.push(mangalikService.getDilarCatalog(page));
        dynamicTasks.push(mangalikService.get3asqCatalog());
      }
      if (server === 'all' || server === 'bx3') {
        dynamicTasks.push(mangalikService.getAniListMasterCatalog(page, 'KR'));
        dynamicTasks.push(mangalikService.getAniListMasterCatalog(page, 'JP'));
        dynamicTasks.push(mangalikService.getAniListMasterCatalog(page, 'CN'));
      }
    }

    const settled = await Promise.allSettled(dynamicTasks);
    const existingTitles = new Set(items.map((i) => String(i.title_en || i.title || '').toLowerCase().trim()));
    const mappedOsSlugs = new Set(
      Object.values(FLAGSHIP_MANGA_MAP)
        .map((f) => f.osSlug)
        .filter(Boolean)
    );
    const mappedAsqSlugs = new Set(
      Object.values(FLAGSHIP_MANGA_MAP)
        .map((f) => f.asqSlug)
        .filter(Boolean)
    );

    for (const resTask of settled) {
      if (resTask.status === 'fulfilled' && Array.isArray(resTask.value)) {
        for (const dyn of resTask.value) {
          if (type !== 'ALL' && dyn.type !== type) continue;
          const rawSlug = dyn.id.replace(/^(os|asq|wc|mm|az|sw|dt|al|md):/, '');
          if (mappedOsSlugs.has(rawSlug) || mappedAsqSlugs.has(rawSlug)) continue;
          const normTitle = String(dyn.title_en || dyn.title || '').toLowerCase().trim();
          if (existingTitles.has(normTitle)) continue;
          existingTitles.add(normTitle);
          items.push({
            ...dyn,
            availableServers: [dyn.server || 'bx1']
          });
        }
      }
    }

    // Ecchi / Harem / Isekai (shared/contentFilter.js, lib/hiddenTitles.js).
    items = await filterMangaList(items);

    // The upstream catalogs only return pages, never a grand total, so the
    // total is reported as unknown (null) instead of an invented number.
    // `count` is the real number of unique items in this response.
    return res.json({
      success: true,
      count: items.length,
      totalCount: null,
      page,
      items
    });
  } catch (err) {
    console.error('getLibrary error:', err);
    return res.status(500).json({ success: false, error: 'failed_to_fetch_library', items: [] });
  }
}

/**
 * GET /api/content/library/:id?server=bx1|bx2|bx3
 */
export async function getLibraryItemDetail(req, res) {
  try {
    const { id } = req.params;
    const preferredServer = String(req.query.server || '').trim().toLowerCase();

    if (isAniProjectMangaId(id)) {
      if (!isAniProjectConfigured()) return res.status(503).json({ success: false, error: 'source_unavailable' });
      const item = await aniprojectService.getManga(id);
      if (!item) return res.status(404).json({ success: false, error: 'not_found' });
      try {
        const chapters = await aniprojectService.getMangaChapters(id);
        return res.json({ success: true, item: {
          ...(await markHiddenManga(item)), chapters_count: chapters.length,
          availableServers: [{ id: 'bx4', name: 'سيرفر Hearbor 4', labelEn: 'Hearbor Server 4' }],
          activeServer: 'bx4',
          chapters: chapters.map((chapter) => ({ ...chapter, number: chapter.chapterNumber }))
        } });
      } catch {
        return res.status(502).json({ success: false, error: 'upstream' });
      }
    }

    ensureSocialTables();
    let item = social.getLibraryItem(id);
    if (!item) {
      item = await mangalikService.getSeriesMetadata(id);
    }
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const handles = await mangalikService.resolveSeriesHandles(id);
    const availableServers = [];
    if (handles.bx1) {
      availableServers.push({ id: 'bx1', name: 'سيرفر Hearbor 1 (مانهوا عربية)', labelEn: 'Hearbor 1 (AR Manhwa)' });
    }
    if (handles.bx2) {
      availableServers.push({ id: 'bx2', name: 'سيرفر Hearbor 2 (مانجا عربية)', labelEn: 'Hearbor 2 (AR Manga)' });
    }
    if (handles.bx3) {
      availableServers.push({ id: 'bx3', name: 'سيرفر Hearbor 3 (المكتبة العالمية الشاملة)', labelEn: 'Hearbor 3 (Global HD)' });
    }

    let chapters = [];
    let activeServer = preferredServer || (availableServers[0]?.id ?? 'bx1');
    try {
      const liveChapters = await mangalikService.getArabicChapters(id, preferredServer);
      if (liveChapters && liveChapters.length > 0) {
        activeServer = liveChapters[0].server || activeServer;
        chapters = liveChapters.map((c) => ({
          number: c.chapterNumber || c.slug,
          chapterId: c.chapterId,
          title: c.title || `الفصل ${c.chapterNumber}`,
          url: c.url,
          slug: c.slug,
          server: c.server || activeServer,
          // Unknown stays unknown: no invented year or translation team.
          releaseDate: c.releaseDate || null,
          scanlationGroup: c.scanlationGroup || ''
        }));
      }
    } catch (_) {}

    return res.json({
      success: true,
      item: {
        ...(await markHiddenManga(item)),
        chapters_count: chapters.length || item.chapters_count || null,
        availableServers,
        activeServer,
        chapters
      }
    });
  } catch (err) {
    console.error('getLibraryItemDetail error:', err);
    return res.status(500).json({ success: false, error: 'failed_to_fetch_item' });
  }
}

/**
 * POST /api/content/library/:id/read — logs reading minutes & awards XP/leveling!
 */
export async function logReadingProgress(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return fail(res, 401, 'Authentication required.');
    const { minutes = 15 } = req.body || {};
    const delta = Math.max(1, Math.min(180, Number(minutes) || 15));
    
    ensureSocialTables();
    const key = String(userId);
    const before = social.getStats(key);
    const prevTotal = (before?.total_watch_time_min || 0) + (before?.total_read_time_min || 0);
    const prevLevel = levelFromMinutes(prevTotal);

    const row = social.upsertStats(key, 'total_read_time_min', delta);
    const total = row.total_watch_time_min + row.total_read_time_min;
    const newLevel = levelFromMinutes(total);
    if (row.current_level !== newLevel) social.setLevel(key, newLevel);
    awardBadgesSqlite(key, total);

    return res.json({
      success: true,
      message: 'Reading session recorded!',
      minutesAdded: delta,
      totalReadMinutes: row.total_read_time_min,
      currentLevel: newLevel,
      levelUp: newLevel > prevLevel
    });
  } catch (err) {
    console.error('logReadingProgress error:', err);
    return res.status(500).json({ success: false, error: 'failed_to_record_progress' });
  }
}

/* =========================================================================
 * PREMIUM ANIME DISCOVERY (GENRE-BASED) — GET /api/content/random
 * ========================================================================= */

const CANONICAL_GENRE_MAP = {
  action: 'Action',
  adventure: 'Adventure',
  comedy: 'Comedy',
  drama: 'Drama',
  fantasy: 'Fantasy',
  horror: 'Horror',
  mecha: 'Mecha',
  mystery: 'Mystery',
  psychological: 'Psychological',
  romance: 'Romance',
  'sci-fi': 'Sci-Fi',
  scifi: 'Sci-Fi',
  school: 'School',
  'slice of life': 'Slice of Life',
  'slice-of-life': 'Slice of Life',
  sliceoflife: 'Slice of Life',
  sports: 'Sports',
  supernatural: 'Supernatural',
  thriller: 'Thriller',
  suspense: 'Thriller'
};

const ANILIST_VALID_GENRES = new Set([
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mecha', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi',
  'Slice of Life', 'Sports', 'Supernatural', 'Thriller'
]);

const CURATED_ANIME_SEED = [
  {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    slug: 'en-40748-jujutsu-kaisen',
    title: 'Jujutsu Kaisen',
    title_ar: 'جوجوتسو كايسن',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-bbBWj4pEFseh.jpg',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/113415-jQBSkxWAAk83.jpg',
    description: 'A boy swallows a cursed talisman — the finger of a demon — and becomes cursed himself. He enters Tokyo Jujutsu High School to locate the demon’s other body parts and exorcise himself.',
    description_ar: 'يبتلع فتى إصبعاً ملعوناً لملك اللعنات، لينضم إلى مدرسة طوكيو التقنية العليا للسحر لطرد اللعنات وإنقاذ البشرية.',
    genres: ['Action', 'School', 'Supernatural', 'Drama'],
    score: 86,
    episodes: 24,
    year: 2020
  },
  {
    id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
    slug: 'en_anime:98659:youkoso-jitsuryoku-shijou-shugi-no-kyoushitsu-e',
    title: 'Classroom of the Elite',
    title_ar: 'فصل النخبة',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx98659-sH5z5efX61e2.jpg',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/98659-u46B5R73tJ95.jpg',
    description: 'Kiyotaka Ayanokouji enrolls at the prestigious Tokyo Metropolitan Advanced Nurturing High School, where students are ranked by merit and only the most ruthless strategists survive.',
    description_ar: 'يلتحق أيانوكوجي كيوتاكا بمدرسة طوكيو المتقدمة المرموقة حيث تُحدد مكانة الطلاب وفق نقاط الجدارة في صراع نفسي صامت.',
    genres: ['Psychological', 'School', 'Drama', 'Thriller'],
    score: 78,
    episodes: 12,
    year: 2017
  },
  {
    id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    slug: 'en_anime:171018:dandadan',
    title: 'DAN DA DAN',
    title_ar: 'دان دا دان',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171018-2ldCj6QyWUOa.jpg',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/171018-r0c3dfD5D28P.jpg',
    description: 'Momo Ayase, a high school girl who believes in ghosts, and Okarun, an occult-obsessed classmate who believes in aliens, collide with overwhelming supernatural and extraterrestrial forces.',
    description_ar: 'مومو أياسي التي تؤمن بالأشباح وزميلها أوكارون الذي يؤمن بالفضائيين يدخلان في مواجهات خارقة للطبيعة مليئة بالأكشن والغموض.',
    genres: ['Action', 'School', 'Supernatural', 'Sci-Fi', 'Comedy'],
    score: 87,
    episodes: 12,
    year: 2024
  },
  {
    id: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a14',
    slug: 'en_anime:154587:sousou-no-frieren',
    title: "Frieren: Beyond Journey's End",
    title_ar: 'فريرين: ما وراء نهاية الرحلة',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-gHSraOSa0nBG.jpg',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587-ivXNJ23SM1xB.jpg',
    description: 'After a ten-year quest to defeat the Demon King, the elven mage Frieren embarks on a new journey across the continent to understand the fleeting nature of human life and memory.',
    description_ar: 'بعد هزيمة ملك الشياطين في رحلة دامت عشر سنوات، تبدأ الساحرة الإلفية فريرين رحلة جديدة لفهم معنى الحياة البشرية والذكريات.',
    genres: ['Adventure', 'Drama', 'Fantasy'],
    score: 91,
    episodes: 28,
    year: 2023
  },
  {
    id: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a15',
    slug: 'en_anime:151807:ore-dake-level-up-na-ken',
    title: 'Solo Leveling',
    title_ar: 'سولو ليفلينج: الارتقاء الفردي',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-m1gX3iwfIsLu.png',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/151807-37yfQA3ym8PA.jpg',
    description: 'In a world where hunters battle deadly monsters inside dimensional gates, the weakest hunter of all mankind, Sung Jinwoo, awakens a mysterious system that allows only him to level up infinitely.',
    description_ar: 'في عالم يقاتل فيه الصيادون الوحوش داخل البوابات، يستيقظ أضعف صياد في البشرية سونغ جين-وو على نظام غامض يمنحه وحده قدرة التطور بلا حدود.',
    genres: ['Action', 'Adventure', 'Fantasy'],
    score: 85,
    episodes: 12,
    year: 2024
  },
  {
    id: 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a16',
    slug: 'en_anime:1535:death-note',
    title: 'Death Note',
    title_ar: 'مذكرة الموت',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1535-lawCwhzhi96X.jpg',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535.jpg',
    description: 'Brilliant high school student Light Yagami discovers a supernatural notebook dropped by a Shinigami that grants its user the ability to kill anyone whose name and face they know.',
    description_ar: 'يعثر الطالب العبقري لايت ياغامي على مذكرة خارقة للطبيعة أسقطها شينيغامي تمنحه القدرة على إنهاء حياة أي شخص يكتب اسمه فيها.',
    genres: ['Mystery', 'Psychological', 'Supernatural', 'Thriller', 'School'],
    score: 84,
    episodes: 37,
    year: 2006
  },
  {
    id: 'a6eebc99-9c0b-4ef8-bb6d-6bb9bd380a17',
    slug: 'en_anime:9253:steins-gate',
    title: 'Steins;Gate',
    title_ar: 'شتاينز غيت',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx9253-7pdcVzQSkKxT.jpg',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/9253-tI27564K83O6.jpg',
    description: 'Eccentric scientist Rintaro Okabe and his Akihabara lab members accidentally invent a device capable of sending messages into the past, triggering a catastrophic conspiracy across worldlines.',
    description_ar: 'يتمكن العالم غريب الأطوار أوكابي رينتارو وأعضاء مختبره في أكيهابارا من إرسال رسائل إلى الماضي، مما يفتح الباب أمام مؤامرة زمنية خطيرة.',
    genres: ['Psychological', 'Sci-Fi', 'Thriller', 'Mystery'],
    score: 90,
    episodes: 24,
    year: 2011
  },
  {
    id: 'b7eebc99-9c0b-4ef8-bb6d-6bb9bd380a18',
    slug: 'en_anime:20755:ansatsu-kyoushitsu',
    title: 'Assassination Classroom',
    title_ar: 'فصل الاغتيال',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20755-q0b3s1c3s0r5.jpg',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/20755-D7m1vU4rW7xQ.jpg',
    description: 'The misfits of Class 3-E at Kunugigaoka Junior High are tasked with assassinating their new homeroom teacher — an octopus-like super-being who has vowed to destroy Earth after graduation.',
    description_ar: 'يُكلف طلاب الفصل 3-E باغتيال معلمهم الجديد الخارق قبل التخرج لإنقاذ كوكب الأرض، بينما يصنع منهم أفضل الطلاب في المدرسة.',
    genres: ['Action', 'Comedy', 'School', 'Sci-Fi'],
    score: 80,
    episodes: 22,
    year: 2015
  },
  {
    id: 'c8eebc99-9c0b-4ef8-bb6d-6bb9bd380a19',
    slug: 'en_anime:21507:mob-psycho-100',
    title: 'Mob Psycho 100',
    title_ar: 'موب سايكو 100',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21507-BICFOA91vi4L.jpg',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21507-Qx8F3Z2wY6vK.jpg',
    description: 'Shigeo "Mob" Kageyama is an eighth-grade student with immense psychic power who just wants to live a normal school life — until his suppressed emotions reach 100%.',
    description_ar: 'شيجيو كاجياما الملقب بـ موب طالب في المرحلة المتوسطة يمتلك قوى نفسية هائلة، يحاول عيش حياة مدرسية عادية قبل أن يصل عداد مشاعره إلى 100%.',
    genres: ['Action', 'Comedy', 'Psychological', 'Slice of Life', 'Supernatural', 'School'],
    score: 85,
    episodes: 12,
    year: 2016
  },
  {
    id: 'd9eebc99-9c0b-4ef8-bb6d-6bb9bd380a20',
    slug: 'en_anime:101922:kimetsu-no-yaiba',
    title: 'Demon Slayer: Kimetsu no Yaiba',
    title_ar: 'قاتل الشياطين: كيميتسو نو يايبا',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WBsBl0ClmgYL.jpg',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-YfZhKBUDDS6L.jpg',
    description: 'After his family is slaughtered by demons and his younger sister Nezuko is turned into one, Tanjiro Kamado joins the Demon Slayer Corps to find a cure and avenge his family.',
    description_ar: 'بعد مقتل عائلته وتحول شقيقته الصغرى نيزوكو إلى شيطان، ينضم تانجيرو كامادو إلى فيلق قتلة الشياطين لإعادة شقيقته إلى بشرية.',
    genres: ['Action', 'Adventure', 'Drama', 'Fantasy', 'Supernatural'],
    score: 83,
    episodes: 26,
    year: 2019
  },
  {
    id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21',
    slug: 'en_anime:104578:shingeki-no-kyojin-season-3-part-2',
    title: 'Attack on Titan',
    title_ar: 'هجوم العمالقة',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-C6FPmWm59CyP.jpg',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg',
    description: 'Centuries ago, mankind was slaughtered to near extinction by monstrous humanoid creatures called Titans, forcing humans to hide behind enormous concentric walls.',
    description_ar: 'تحتمي البشرية خلف أسوار عملاقة هرباً من العمالقة، إلى أن يتحطم السور ويبدأ إيرين ييغر رحلة الانتقام وكشف أسرار العالم.',
    genres: ['Action', 'Drama', 'Fantasy', 'Mystery', 'Psychological'],
    score: 90,
    episodes: 25,
    year: 2013
  },
  {
    id: 'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    slug: 'en_anime:101348:kaguya-sama-wa-kokurasetai-tensaitachi-no-renai-zunousen',
    title: 'Kaguya-sama: Love is War',
    title_ar: 'كاغويا ساما: الحب حرب',
    cover_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101921-VvdGQn1jc6fb.jpg',
    banner_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101921-GgvvF5l0F7G2.jpg',
    description: 'At the elite Shuchiin Academy, student council president Miyuki Shirogane and vice president Kaguya Shinomiya wage high-stakes psychological warfare to force the other to confess first.',
    description_ar: 'في أكاديمية شوتشين للنخبة، يخوض رئيس مجلس الطلبة ميوكي شيروغاني ونائبته كاغويا شينوميا حرباً نفسية عبقرية لإجبار الطرف الآخر على الاعتراف بالحب أولاً.',
    genres: ['Comedy', 'Psychological', 'Romance', 'School', 'Slice of Life'],
    score: 84,
    episodes: 12,
    year: 2019
  }
];

let sqliteContentsReady = false;
function ensureSqliteContentsTable() {
  if (sqliteContentsReady) return;
  sqliteContentsReady = true;
  db.exec(`
    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE,
      title TEXT NOT NULL,
      title_ar TEXT,
      type TEXT NOT NULL DEFAULT 'ANIME',
      description TEXT,
      description_ar TEXT,
      cover_url TEXT,
      banner_url TEXT,
      genres TEXT NOT NULL DEFAULT '[]',
      score INTEGER,
      episodes INTEGER,
      season_year INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO contents (id, slug, title, title_ar, type, description, description_ar, cover_url, banner_url, genres, score, episodes, season_year)
    VALUES (@id, @slug, @title, @title_ar, 'ANIME', @description, @description_ar, @cover_url, @banner_url, @genres, @score, @episodes, @year)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      title_ar = COALESCE(excluded.title_ar, contents.title_ar),
      description = COALESCE(excluded.description, contents.description),
      description_ar = COALESCE(excluded.description_ar, contents.description_ar),
      cover_url = COALESCE(excluded.cover_url, contents.cover_url),
      banner_url = COALESCE(excluded.banner_url, contents.banner_url),
      genres = excluded.genres,
      score = COALESCE(excluded.score, contents.score),
      episodes = COALESCE(excluded.episodes, contents.episodes),
      season_year = COALESCE(excluded.season_year, contents.season_year)
  `);

  const tx = db.transaction((items) => {
    for (const item of items) {
      upsertStmt.run({
        ...item,
        genres: JSON.stringify(item.genres || [])
      });
    }
  });
  tx(CURATED_ANIME_SEED);
}

function toDeterministicUuid(input) {
  const s = String(input || '');
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s.toLowerCase();
  }
  const hash = crypto.createHash('sha256').update(`blackx-anime:${s}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function normalizeGenresList(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {
      return raw.split(',').map((g) => g.trim()).filter(Boolean);
    }
  }
  return [];
}

function slugifyTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'anime';
}

async function fetchLiveAniListByGenres(canonicalGenres = []) {
  try {
    const wantsSchool = canonicalGenres.some((g) => g.toLowerCase() === 'school');
    const apiGenres = canonicalGenres.filter((g) => ANILIST_VALID_GENRES.has(g));

    const query = `
      query ($genres: [String], $tags: [String], $page: Int) {
        Page(page: $page, perPage: 28) {
          media(
            type: ANIME,
            countryOfOrigin: "JP",
            isAdult: false,
            sort: [POPULARITY_DESC, SCORE_DESC],
            genre_in: $genres,
            tag_in: $tags
          ) {
            id
            idMal
            title { english romaji native }
            description(asHtml: false)
            coverImage { extraLarge large }
            bannerImage
            genres
            tags { name rank }
            averageScore
            episodes
            seasonYear
          }
        }
      }
    `;

    const variables = {
      page: 1,
      genres: apiGenres.length > 0 ? apiGenres : undefined,
      tags: wantsSchool ? ['School'] : undefined
    };

    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(4500)
    });

    if (!res.ok) return [];
    const json = await res.json();
    const mediaList = json?.data?.Page?.media || [];

    return mediaList.map((m) => {
      const title = m.title?.english || m.title?.romaji || 'Untitled Anime';
      const baseGenres = Array.isArray(m.genres) ? [...m.genres] : [];
      const hasSchoolTag = wantsSchool || (m.tags || []).some((t) => t.name === 'School' && (t.rank || 0) >= 50);
      if (hasSchoolTag && !baseGenres.includes('School')) {
        baseGenres.push('School');
      }
      const cleanDesc = String(m.description || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const slug = m.idMal
        ? `en-${m.idMal}-${slugifyTitle(m.title?.romaji || title)}`
        : `en-${slugifyTitle(m.title?.romaji || title)}`;
      return {
        id: toDeterministicUuid(slug),
        slug,
        title,
        title_ar: null,
        cover_url: m.coverImage?.extraLarge || m.coverImage?.large || '',
        banner_url: m.bannerImage || null,
        description: cleanDesc || 'A critically acclaimed Japanese anime series streaming on Hearbor.',
        description_ar: null,
        genres: baseGenres,
        score: m.averageScore || null,
        episodes: m.episodes || null,
        year: m.seasonYear || null
      };
    });
  } catch {
    return [];
  }
}

let lastPickedAnimeId = null;

/**
 * GET /api/content/random?genres=action,school
 * Queries the Content table (where type is 'ANIME'), filters by genres if provided,
 * and returns a single randomly selected anime record.
 */
export async function getRandomContent(req, res) {
  try {
    ensureSqliteContentsTable();

    const rawGenres = String(req.query.genres || '').trim();
    const excludeId = String(req.query.exclude || '').trim();
    const requestedTokens = rawGenres
      ? rawGenres
          .split(',')
          .map((g) => g.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const canonicalGenres = [
      ...new Set(
        requestedTokens.map((t) => CANONICAL_GENRE_MAP[t] || (t.charAt(0).toUpperCase() + t.slice(1)))
      )
    ];

    const matchesGenres = (itemGenres = []) => {
      if (canonicalGenres.length === 0) return true;
      const lowerSet = new Set(itemGenres.map((g) => String(g).toLowerCase()));
      return canonicalGenres.every((reqG) => lowerSet.has(reqG.toLowerCase()));
    };

    const matchesAtLeastOneGenre = (itemGenres = []) => {
      if (canonicalGenres.length === 0) return true;
      const lowerSet = new Set(itemGenres.map((g) => String(g).toLowerCase()));
      return canonicalGenres.some((reqG) => lowerSet.has(reqG.toLowerCase()));
    };

    let candidates = [];

    // 1. Query Prisma Content table (where type === 'ANIME') when DATABASE_URL is available
    if (process.env.DATABASE_URL && !dbIsBroken()) {
      try {
        const prisma = getPrisma();
        const prismaRows = await prisma.content.findMany({
          where: { type: 'ANIME' },
          take: 200
        });
        for (const r of prismaRows) {
          const gList = normalizeGenresList(r.genres);
          if (r.cover_url && matchesGenres(gList)) {
            candidates.push({
              id: toDeterministicUuid(r.id),
              slug: r.slug || `en_anime:${slugifyTitle(r.title)}`,
              title: r.title,
              title_ar: null,
              cover_url: r.cover_url,
              banner_url: null,
              description: r.description || '',
              description_ar: null,
              genres: gList.length ? gList : canonicalGenres,
              score: null,
              episodes: null,
              year: null
            });
          }
        }
      } catch {
        // Fallback smoothly to SQLite + live AniList catalog
      }
    }

    // 2. Query SQLite `contents` (where type = 'ANIME') & `anime_cache`
    const sqliteRows = db.prepare(`SELECT * FROM contents WHERE type = 'ANIME'`).all();
    for (const row of sqliteRows) {
      const gList = normalizeGenresList(row.genres);
      if (row.cover_url && matchesGenres(gList)) {
        candidates.push({
          id: toDeterministicUuid(row.id || row.slug),
          slug: row.slug,
          title: row.title,
          title_ar: row.title_ar || null,
          cover_url: row.cover_url,
          banner_url: row.banner_url || null,
          description: row.description || '',
          description_ar: row.description_ar || null,
          genres: gList,
          score: row.score || null,
          episodes: row.episodes || null,
          year: row.season_year || null
        });
      }
    }

    const cacheRows = db.prepare(`SELECT * FROM anime_cache WHERE cover_url IS NOT NULL LIMIT 250`).all();
    for (const row of cacheRows) {
      const gList = normalizeGenresList(row.genres);
      if (row.cover_url && matchesGenres(gList)) {
        const title = row.title_english || row.title_romaji || 'Untitled';
        const slug = `en_anime:${row.id}:${slugifyTitle(row.title_romaji || title)}`;
        candidates.push({
          id: toDeterministicUuid(slug),
          slug,
          title,
          title_ar: row.title_arabic || null,
          cover_url: row.cover_url,
          banner_url: row.banner_url || null,
          description: (row.description || '').replace(/<[^>]+>/g, '').trim(),
          description_ar: null,
          genres: gList,
          score: row.score || null,
          episodes: row.episodes || null,
          year: row.season_year || null
        });
      }
    }

    // 3. Enrich with live AniList catalog for deep genre discovery
    if (candidates.length < 12) {
      const liveItems = await fetchLiveAniListByGenres(canonicalGenres);
      for (const item of liveItems) {
        if (item.cover_url && matchesGenres(item.genres)) {
          candidates.push(item);
          try {
            db.prepare(`
              INSERT OR IGNORE INTO contents (id, slug, title, type, description, cover_url, banner_url, genres, score, episodes, season_year)
              VALUES (?, ?, ?, 'ANIME', ?, ?, ?, ?, ?, ?, ?)
            `).run(
              item.id,
              item.slug,
              item.title,
              item.description,
              item.cover_url,
              item.banner_url,
              JSON.stringify(item.genres || []),
              item.score,
              item.episodes,
              item.year
            );
          } catch {}
        }
      }
    }

    // 4. Deduplicate by slug/title
    const uniqueMap = new Map();
    for (const c of candidates) {
      const key = (c.title || '').toLowerCase().trim();
      if (!key || !c.cover_url) continue;
      if (!uniqueMap.has(key)) uniqueMap.set(key, c);
    }
    let pool = Array.from(uniqueMap.values());

    // Relax to any matching genre if strict intersection had 0 results
    if (pool.length === 0) {
      for (const row of sqliteRows) {
        const gList = normalizeGenresList(row.genres);
        if (row.cover_url && matchesAtLeastOneGenre(gList)) {
          pool.push({
            id: toDeterministicUuid(row.id || row.slug),
            slug: row.slug,
            title: row.title,
            title_ar: row.title_ar || null,
            cover_url: row.cover_url,
            banner_url: row.banner_url || null,
            description: row.description || '',
            description_ar: row.description_ar || null,
            genres: gList.length ? gList : canonicalGenres,
            score: row.score || null,
            episodes: row.episodes || null,
            year: row.season_year || null
          });
        }
      }
    }

    // Ultimate fallback so endpoint never returns empty
    if (pool.length === 0) {
      pool = CURATED_ANIME_SEED.map((item) => ({
        ...item,
        genres: canonicalGenres.length ? [...new Set([...item.genres, ...canonicalGenres])] : item.genres
      }));
    }

    // Avoid repeating the exact same anime consecutively when possible
    let filteredPool = pool;
    if (pool.length > 1) {
      const avoid = new Set([excludeId, lastPickedAnimeId].filter(Boolean));
      const withoutAvoid = pool.filter((item) => !avoid.has(item.id) && !avoid.has(item.slug));
      if (withoutAvoid.length > 0) filteredPool = withoutAvoid;
    }

    const picked = filteredPool[Math.floor(Math.random() * filteredPool.length)];
    lastPickedAnimeId = picked.id;

    return res.status(200).json({
      success: true,
      data: {
        id: picked.id,
        title: picked.title,
        cover_url: picked.cover_url,
        description: picked.description,
        genres: picked.genres,
        slug: picked.slug,
        title_ar: picked.title_ar || null,
        description_ar: picked.description_ar || null,
        banner_url: picked.banner_url || null,
        score: picked.score || null,
        episodes: picked.episodes || null,
        year: picked.year || null
      }
    });
  } catch (err) {
    console.error('getRandomContent error:', err);
    const fallback = CURATED_ANIME_SEED[0];
    return res.status(200).json({
      success: true,
      data: {
        id: fallback.id,
        title: fallback.title,
        cover_url: fallback.cover_url,
        description: fallback.description,
        genres: fallback.genres,
        slug: fallback.slug,
        title_ar: fallback.title_ar,
        description_ar: fallback.description_ar
      }
    });
  }
}
