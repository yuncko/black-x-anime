import { Router } from 'express';
import { requireAuth, optionalAuth } from '../auth.js';
import { fetchLatest, searchShows, fetchShow, fetchEpisode, resolveEntry, resolveDownloadEntry, scrapeHealth, scrapeDiagnostics, fetchBrowseAnimeList, isTitleMatch } from '../witanime.js';
import { scraperGetEpisodeDl, scraperSearchAnime } from '../animeScraperApi.js';
import {
  fetchWitcherCatalog,
  fetchWitcherLatest,
  searchWitcherShows,
  fetchWitcherShow,
  fetchWitcherEpisode,
  resolveWitcherEntry,
  resolveWitcherDownloadEntry
} from '../services/animeWitcher.service.js';
import { anime3rbService } from '../services/anime3rb.service.js';
import { okanimeService } from '../services/okanime.service.js';
import { animeblkomService } from '../services/animeblkom.service.js';
import { englishAnimeService } from '../services/englishAnime.service.js';
import {
  aniprojectService, isAniProjectConfigured, isAniProjectAnimeSlug,
  isAniProjectMediaHost
} from '../services/aniproject.service.js';
import { filterAnimeList, markHiddenAnime } from '../lib/hiddenTitles.js';
import {
  getTranslatedEpisodeSubtitles,
  parseSubtitles,
  translateLinesToArabic,
  buildVttFromCues,
  buildSrtFromCues
} from '../subtitleTranslator.js';

const router = Router();

/** GET /api/stream/sources — list available anime streaming sources under Hearbor */
router.get('/sources', (req, res) => {
  res.json({
    sources: [
      {
        id: 'all',
        nameAr: '🌟 جميع سيرفرات Hearbor (الكل)',
        nameEn: 'All Hearbor Servers',
        badge: 'Hearbor'
      },
      {
        id: 'witanime',
        nameAr: '👑 سيرفر Hearbor 1',
        nameEn: 'Hearbor Server 1',
        badge: 'Hearbor 1'
      },
      {
        id: 'anime3rb',
        nameAr: '⚡ سيرفر Hearbor 2',
        nameEn: 'Hearbor Server 2',
        badge: 'Hearbor 2'
      },
      {
        id: 'english',
        nameAr: '🌐 سيرفر Hearbor 3',
        nameEn: 'Hearbor Server 3',
        badge: 'Hearbor 3'
      },
      ...(isAniProjectConfigured() ? [{
        id: 'aniproject',
        nameAr: 'سيرفر Hearbor 4 (بحث)',
        nameEn: 'Hearbor Server 4 (Search)',
        badge: 'Hearbor 4',
        searchOnly: true
      }] : [])
    ]
  });
});

/** GET /api/stream/catalog — catalog of anime across all Hearbor servers (total reported by Hearbor 1 when available) */
router.get('/catalog', async (req, res) => {
  const source = (req.query.source || 'all').toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1);
  const sort = String(req.query.sort || 'popular').toLowerCase();
  const genre = String(req.query.genre || '').trim();

  // AniProject v3 exposes a searchable provider, not a browsable streaming
  // catalog. Never present AniList metadata as playable Hearbor 4 entries.
  if (source === 'aniproject') {
    return res.json({ items: [], count: 0, totalCount: 0, totalPages: 0, hasNext: false, page });
  }

  try {
    let items = [];
    let totalCount = 0;
    let totalPages = 1;
    let hasNext = false;

    const tasks = [];
    if (source === 'all' || source === 'witanime') {
      tasks.push(
        fetchWitcherCatalog({ page, hitsPerPage: 60, sort, genre })
          .then((awCatalog) => {
            totalCount = Math.max(totalCount, Number(awCatalog?.totalCount) || 0);
            totalPages = Math.max(totalPages, Number(awCatalog?.totalPages) || 1);
            hasNext = Boolean(awCatalog?.hasNext);
            return (awCatalog?.items || []).map((a) => ({
              ...a,
              source: 'witanime',
              sourceName: 'سيرفر Hearbor 1',
              sourceLabel: 'سيرفر Hearbor 1'
            }));
          })
          .catch(() =>
            fetchBrowseAnimeList(page)
              .then((witaBrowse) =>
                (witaBrowse?.items || []).map((a) => ({
                  ...a,
                  source: 'witanime',
                  sourceName: 'سيرفر Hearbor 1',
                  sourceLabel: 'سيرفر Hearbor 1'
                }))
              )
              .catch(() => [])
          )
      );
    }

    if ((source === 'all' || source === 'anime3rb') && (!genre || genre === 'all')) {
      tasks.push(
        anime3rbService
          .getLatestEpisodes(page)
          .then((a3rbList) =>
            (a3rbList || []).map((a) => ({
              ...a,
              source: 'anime3rb',
              sourceName: 'سيرفر Hearbor 2',
              sourceLabel: 'سيرفر Hearbor 2'
            }))
          )
          .catch(() => [])
      );
    }

    if ((source === 'all' || source === 'english') && (!genre || genre === 'all')) {
      tasks.push(
        englishAnimeService
          .getLatestEpisodes(page)
          .then((enLatest) =>
            (enLatest || []).map((a) => ({
              ...a,
              source: 'english',
              sourceName: 'سيرفر Hearbor 3',
              sourceLabel: 'سيرفر Hearbor 3'
            }))
          )
          .catch(() => [])
      );
    }

    const results = await Promise.all(tasks);
    for (const group of results) {
      items = items.concat(group);
    }
    // Ecchi / Harem / Isekai (shared/contentFilter.js). Hearbor 1 already excludes them in the
    // Algolia query, so its total and pages stay real.
    items = await filterAnimeList(items);

    res.json({
      items,
      count: items.length,
      // Real catalog size from Hearbor 1's search index; null when that source
      // did not answer (never the page size presented as a total).
      totalCount: totalCount || null,
      totalPages,
      hasNext,
      page
    });
  } catch (err) {
    res.status(500).json({ error: 'catalog_error', items: [] });
  }
});

/**
 * GET /api/stream/stats — real catalog size reported by Hearbor 1's search
 * index, used by every "N anime" label on the site. Answers 503 (never a
 * guessed number) when the index is unreachable; the CDN then keeps serving
 * the last good value thanks to stale-if-error.
 */
router.get('/stats', async (req, res) => {
  try {
    const catalog = await fetchWitcherCatalog({ page: 1, hitsPerPage: 12 });
    const animeTotal = Number(catalog?.totalCount) || null;
    if (!animeTotal) return res.status(503).json({ animeTotal: null });
    return res.json({ animeTotal });
  } catch {
    return res.status(503).json({ animeTotal: null });
  }
});

/** GET /api/stream/health — is the source reachable */
router.get('/health', async (req, res) => {
  res.json(await scrapeHealth());
});

/** GET /api/stream/diagnostics — how this host's IP/UA is treated by the WAF */
router.get('/diagnostics', async (req, res) => {
  try {
    res.json(await scrapeDiagnostics());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/stream/latest — latest episodes grid across Hearbor Server 1, 2 & 3 */
router.get('/latest', async (req, res) => {
  const source = (req.query.source || 'all').toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1);
  if (source === 'aniproject') {
    return res.json({ items: [], count: 0, page }); // No latest-feed API in v3.
  }
  try {
    let witaItems = [];
    let a3rbItems = [];
    let enItems = [];

    const tasks = [];
    if (source === 'all' || source === 'witanime') {
      tasks.push(
        Promise.all([
          fetchWitcherLatest(page, 48).catch(() => []),
          page === 1 ? fetchLatest().catch(() => []) : Promise.resolve([])
        ])
          .then(([awList, wList]) => {
            const seen = new Set();
            const mergedWita = [];
            for (const it of [...(awList || []), ...(wList || [])]) {
              if (!it?.slug || seen.has(it.slug)) continue;
              seen.add(it.slug);
              mergedWita.push({
                ...it,
                source: 'witanime',
                sourceLabel: 'سيرفر Hearbor 1'
              });
            }
            witaItems = mergedWita;
          })
          .catch(() => {})
      );
    }

    if (source === 'all' || source === 'anime3rb') {
      tasks.push(
        anime3rbService
          .getLatestEpisodes(1)
          .then((a) => {
            a3rbItems = (a || []).map((it) => ({
              ...it,
              source: 'anime3rb',
              sourceLabel: 'سيرفر Hearbor 2'
            }));
          })
          .catch(() => {})
      );
    }

    if (source === 'all' || source === 'english') {
      tasks.push(
        englishAnimeService
          .getLatestEpisodes(1)
          .then((en) => {
            enItems = (en || []).map((it) => ({
              ...it,
              source: 'english',
              sourceLabel: 'سيرفر Hearbor 3'
            }));
          })
          .catch(() => {})
      );
    }

    await Promise.all(tasks);

    let combined = [];
    if (source === 'anime3rb') {
      combined = a3rbItems;
    } else if (source === 'witanime') {
      combined = witaItems;
    } else if (source === 'english') {
      combined = enItems;
    } else {
      const maxLen = Math.max(witaItems.length, a3rbItems.length, enItems.length);
      const seen = new Set();
      for (let i = 0; i < maxLen; i++) {
        if (i < witaItems.length) {
          const k = `wita:${witaItems[i].slug}`;
          if (!seen.has(k)) {
            seen.add(k);
            combined.push(witaItems[i]);
          }
        }
        if (i < a3rbItems.length) {
          const k = `a3rb:${a3rbItems[i].slug}`;
          if (!seen.has(k)) {
            seen.add(k);
            combined.push(a3rbItems[i]);
          }
        }
        if (i < enItems.length) {
          const k = `en:${enItems[i].slug}`;
          if (!seen.has(k)) {
            seen.add(k);
            combined.push(enItems[i]);
          }
        }
      }
    }

    combined = await filterAnimeList(combined); // hidden genres (lib/hiddenTitles.js)
    res.json({ items: combined, totalCount: combined.length });
  } catch (err) {
    console.error('[stream/latest]', err.message);
    res.status(502).json({ error: 'upstream', message: 'Streaming source unreachable', items: [] });
  }
});

/** GET /api/stream/search?q=&source= */
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const source = (req.query.source || 'all').toLowerCase();
  if (!q) return res.json({ items: [], results: [] });
  if (source === 'aniproject' && !isAniProjectConfigured()) {
    return res.status(503).json({ error: 'source_unavailable', items: [], results: [] });
  }
  try {
    if (source === 'aniproject') {
      const items = await filterAnimeList(await aniprojectService.searchAnime(q));
      return res.json({ items, results: items, totalCount: items.length });
    }
    let witaResults = [];
    let a3rbResults = [];
    let enResults = [];
    let apResults = [];

    const tasks = [];
    if (source === 'all' || source === 'witanime') {
      tasks.push(
        Promise.all([
          searchWitcherShows(q, 40).catch(() => []),
          searchShows(q).catch(() => []),
          scraperSearchAnime(q).catch(() => [])
        ]).then(([awList, w, sList]) => {
          const fromAw = (awList || []).map((it) => ({
            ...it,
            source: 'witanime',
            sourceLabel: 'سيرفر Hearbor 1'
          }));
          const fromW = (w || [])
            .filter((it) => isTitleMatch(q, it.titleEn || it.titleAr, it.slug))
            .map((it) => ({
              ...it,
              source: 'witanime',
              sourceLabel: 'سيرفر Hearbor 1'
            }));
          const fromS = (sList || [])
            .filter((s) => s.slug && isTitleMatch(q, s.name, s.slug))
            .map((s) => ({
              slug: s.slug,
              kind: s.type === 'Movie' ? 'movie' : 'anime',
              titleEn: s.name || s.slug,
              titleAr: s.name || s.slug,
              poster: s.img || '',
              url: `/anime/${s.slug}`,
              source: 'witanime',
              sourceLabel: 'سيرفر Hearbor 1'
            }));
          witaResults = [...fromAw, ...fromW, ...fromS];
        })
      );
    }

    if (source === 'all' || source === 'anime3rb') {
      tasks.push(
        anime3rbService
          .search(q)
          .then((a) => {
            a3rbResults = (a || []).map((it) => ({
              ...it,
              source: 'anime3rb',
              sourceLabel: 'سيرفر Hearbor 2'
            }));
          })
          .catch(() => {})
      );
    }

    if (source === 'all' || source === 'english') {
      tasks.push(
        englishAnimeService
          .search(q)
          .then((en) => {
            enResults = (en || []).map((it) => ({
              ...it,
              source: 'english',
              hasAutoArabicSub: true,
              sourceLabel: 'سيرفر Hearbor 3'
            }));
          })
          .catch(() => {})
      );
    }

    if (isAniProjectConfigured() && (source === 'all' || source === 'aniproject')) {
      tasks.push(aniprojectService.searchAnime(q)
        .then((items) => { apResults = items; })
        .catch(() => {}));
    }
    await Promise.all(tasks);

    const seen = new Set();
    let merged = [];
    for (const item of [...witaResults, ...a3rbResults, ...enResults, ...apResults]) {
      const key = `${item.source || 'src'}:${item.slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
    merged = await filterAnimeList(merged); // hidden genres (lib/hiddenTitles.js)

    res.json({ items: merged, results: merged, totalCount: merged.length });
  } catch (err) {
    console.error('[stream/search]', err.message);
    res.status(502).json({ error: 'upstream', message: 'Streaming source unreachable', items: [], results: [] });
  }
});

/** GET /api/stream/show/:slug?source= — metadata + episode list */
router.get('/show/:slug', async (req, res) => {
  const { slug } = req.params;
  const source = (req.query.source || '').toLowerCase();
  if ((source === 'aniproject' || isAniProjectAnimeSlug(slug)) && !isAniProjectConfigured()) {
    return res.status(503).json({ error: 'source_unavailable' });
  }

  try {
    let show = null;

    if (source === 'aniproject' || isAniProjectAnimeSlug(slug)) {
      show = await aniprojectService.getShow(slug);
    } else if (source === 'english' || slug.startsWith('en-') || slug.startsWith('mal-') || slug.startsWith('en_anime:')) {
      show = await englishAnimeService.getShow(slug);
      if (!show) {
        show = await fetchWitcherShow(slug).catch(() => null);
      }
    } else if (source === 'anime3rb' || slug.startsWith('a3rb-') || source === 'okanime' || slug.startsWith('ok-') || source === 'animeblkom' || slug.startsWith('blkom-')) {
      const cleanA3rb = slug.replace(/^(a3rb-|ok-|blkom-)/, '');
      show = await anime3rbService.getShow(cleanA3rb);
      if (!show) {
        const spacedTitle = cleanA3rb.replace(/^x/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
        show = await fetchWitcherShow(spacedTitle || slug).catch(() => null);
      }
    } else {
      // 1) Primary source: Hearbor Server 1 (Anime Witcher 6,973-anime Cloud Engine)
      try {
        show = await fetchWitcherShow(slug);
        if (show) {
          show.source = 'witanime';
          show.sourceName = 'سيرفر Hearbor 1';
        }
      } catch (_) {}

      // 2) Secondary Hearbor 1 lookup via WitAnime direct slug or search
      if (!show) {
        try {
          show = await fetchShow(slug);
          if (show) {
            show.source = 'witanime';
            show.sourceName = 'سيرفر Hearbor 1';
          }
        } catch (_) {}
      }

      if (!show) {
        try {
          const queryWords = slug.replace(/^(aw-|ok-|blkom-|a3rb-|ani-|en-|mal-)/, '').replace(/-/g, ' ').trim();
          const candidates = await searchShows(queryWords);
          const verified = (candidates || []).find((c) => isTitleMatch(queryWords, c.titleEn || c.titleAr, c.slug));
          if (verified?.slug) {
            show = await fetchShow(verified.slug);
            if (show) {
              show.source = 'witanime';
              show.sourceName = 'سيرفر Hearbor 1';
            }
          }
        } catch (_) {}
      }

      // 3) Check Hearbor Server 2 (Animeify v4 API) with strict title verification
      if (!show) {
        try {
          show = await anime3rbService.getShow(slug);
        } catch (_) {}
      }

      // 4) Fallback to Hearbor Server 3
      if (!show) {
        try {
          show = await englishAnimeService.getShow(slug);
        } catch (_) {}
      }
    }

    if (!show) return res.status(404).json({ error: 'not_found', message: 'Show not found' });
    // A hidden genre comes back as `bxHidden: true`: the website and the app say "not available".
    res.json({ show: await markHiddenAnime(show) });
  } catch (err) {
    console.error('[stream/show]', err.message);
    res.status(502).json({ error: 'upstream', message: 'Streaming source unreachable' });
  }
});

/** GET /api/stream/episode/:slug/:ep — manifest entries + eagerly-resolved first source */
router.get('/episode/:slug/:ep', optionalAuth, async (req, res) => {
  const episode = Number(req.params.ep);
  const cleanSlug = req.params.slug.replace(/^(ok-|blkom-|a3rb-)/, '');
  const sourceParam = (req.query.source || '').toLowerCase();

  if (!Number.isInteger(episode) || episode < 1) {
    return res.status(400).json({ error: 'invalid_episode', message: 'Invalid episode number' });
  }
  if ((sourceParam === 'aniproject' || isAniProjectAnimeSlug(req.params.slug)) && !isAniProjectConfigured()) {
    return res.status(503).json({ error: 'source_unavailable' });
  }

  try {
    let data = null;

    if (sourceParam === 'aniproject' || isAniProjectAnimeSlug(req.params.slug)) {
      data = await aniprojectService.getEpisode(req.params.slug, episode);
    } else if (sourceParam === 'english' || req.params.slug.startsWith('en-') || req.params.slug.startsWith('mal-') || req.params.slug.startsWith('en_anime:')) {
      data = await englishAnimeService.getEpisode(req.params.slug, episode);
      // Cross-enrich with Hearbor 1 (Anime Witcher) Arabic 1080p MP4 servers if available
      if (data) {
        try {
          const awEp = await fetchWitcherEpisode(req.params.slug, episode).catch(() => null);
          if (awEp?.entries?.length) {
            for (const ae of awEp.entries) {
              data.entries.push({ ...ae, awSlug: awEp.slug });
            }
            Object.assign(data.resolved, awEp.resolved || {});
            for (const ad of awEp.downloads || []) {
              data.downloads.push({ ...ad, awSlug: awEp.slug });
            }
            Object.assign(data.resolvedDownloads, awEp.resolvedDownloads || {});
          }
        } catch (_) {}
      }
    } else if (sourceParam === 'anime3rb' || req.params.slug.startsWith('a3rb-') || sourceParam === 'okanime' || req.params.slug.startsWith('ok-') || sourceParam === 'animeblkom' || req.params.slug.startsWith('blkom-')) {
      data = await anime3rbService.getEpisode(cleanSlug, episode);
      // Cross-enrich with Hearbor Server 1 (Anime Witcher + WitAnime) if title matches
      if (data) {
        try {
          const searchTitle = cleanSlug.replace(/^x/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
          const awEp = await fetchWitcherEpisode(searchTitle, episode).catch(() => null);
          if (awEp?.entries?.length) {
            for (const ae of awEp.entries) {
              data.entries.push({ ...ae, awSlug: awEp.slug });
            }
            Object.assign(data.resolved, awEp.resolved || {});
            for (const ad of awEp.downloads || []) {
              data.downloads.push({ ...ad, awSlug: awEp.slug });
            }
            Object.assign(data.resolvedDownloads, awEp.resolvedDownloads || {});
          }
        } catch (_) {}
      } else {
        const spacedTitle = cleanSlug.replace(/^x/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
        data = await fetchWitcherEpisode(spacedTitle || cleanSlug, episode).catch(() => null);
      }
    } else {
      // 1) Primary source: Hearbor Server 1 (Anime Witcher 1080p/720p/480p Direct MP4 + WitAnime) + cross-linked Hearbor Server 2
      const [awEp, witaEp, bx2Ep] = await Promise.all([
        fetchWitcherEpisode(cleanSlug, episode).catch(() => null),
        !cleanSlug.startsWith('aw-') ? fetchEpisode(cleanSlug, episode).catch(() => null) : Promise.resolve(null),
        anime3rbService.getEpisode(cleanSlug.replace(/^aw-/, ''), episode).catch(() => null)
      ]);

      const baseEp = awEp || witaEp || bx2Ep;
      if (baseEp) {
        data = {
          ...baseEp,
          entries: [
            ...(awEp?.entries || []),
            ...(bx2Ep?.entries || []),
            ...(witaEp?.entries || [])
          ],
          downloads: [
            ...(awEp?.downloads || []),
            ...(bx2Ep?.downloads || []),
            ...(witaEp?.downloads || [])
          ],
          resolved: {
            ...(witaEp?.resolved || {}),
            ...(bx2Ep?.resolved || {}),
            ...(awEp?.resolved || {})
          },
          resolvedDownloads: {
            ...(witaEp?.resolvedDownloads || {}),
            ...(bx2Ep?.resolvedDownloads || {}),
            ...(awEp?.resolvedDownloads || {})
          }
        };
      }

      // 2) Fallback to Hearbor Server 3 if not on Server 1 or 2
      if (!data || !data.entries?.length) {
        try {
          data = await englishAnimeService.getEpisode(cleanSlug, episode);
        } catch (_) {}
      }
    }

    if (!data) return res.status(404).json({ error: 'not_found', message: 'Episode not found' });

    const isDev = req.user?.role === 'developer';
    const vipStatus = isDev ? 'VIP Monarch' : (req.user?.vip_status || null);
    const isVipBasic = vipStatus === 'VIP Basic' || vipStatus === 'VIP Monarch' || isDev;
    const isVipMonarch = vipStatus === 'VIP Monarch' || isDev;

    const rawEntries = Array.isArray(data.entries) ? [...data.entries] : [];
    const prioritizedEntries = rawEntries.map((e) => {
      const isFastCdn = !isAniProjectAnimeSlug(req.params.slug) && (
        Boolean(e.isFastCdn) ||
        Boolean(e.directUrl) ||
        e.server?.toLowerCase().includes('direct') ||
        e.server?.toLowerCase().includes('stream') ||
        e.server?.toLowerCase().includes('cloud')
      );

      return {
        ...e,
        isVipOnly: false,
        isFastCdn,
        serverTag: isFastCdn ? '⚡ Hearbor Fast CDN' : null
      };
    });

    // VIP (Basic and Monarch) only changes the order: direct/CDN servers first (stable sort).
    // There is no 4K / HDR / 60 fps server. Monarch used to get a synthetic
    // «👑 Hearbor Monarch 4K HDR (60fps Ultra)» entry that replayed the first real server
    // under a fake quality label; it was removed with the owner's OK (2026-10-16).
    // Never add invented servers or quality labels here.
    const entries = prioritizedEntries;
    if (isVipBasic) {
      entries.sort((a, b) => (b.isFastCdn ? 1 : 0) - (a.isFastCdn ? 1 : 0));
    }

    res.json({
      ...data,
      resolved: { ...(data.resolved || {}) },
      entries,
      vipTier: vipStatus || 'Free Otaku',
      isVipBasic,
      isVipMonarch
    });
  } catch (err) {
    console.error('[stream/episode]', err.message);
    res.status(502).json({ error: err.code || 'upstream', message: 'Could not resolve streaming sources' });
  }
});

/** POST /api/stream/resolve { slug, episode, entryId } — resolve one manifest server on demand */
router.post('/resolve', async (req, res) => {
  const { slug, episode, entryId } = req.body || {};
  const ep = Number(episode);
  if (!slug || !Number.isInteger(ep) || ep < 1 || !entryId) {
    return res.status(400).json({ error: 'bad_request', message: 'slug, episode, entryId required' });
  }
  if (isAniProjectAnimeSlug(slug)) {
    if (!isAniProjectConfigured()) return res.status(503).json({ error: 'source_unavailable' });
    try {
      const source = await aniprojectService.resolveEntry(slug, ep, String(entryId));
      return source ? res.json({ source }) : res.status(404).json({ error: 'not_found' });
    } catch {
      return res.status(502).json({ error: 'upstream' });
    }
  }

  // If this is an Anime Witcher (Hearbor 1) entry, resolve via resolveWitcherEntry
  if (String(entryId).startsWith('aw-')) {
    try {
      const awSource = await resolveWitcherEntry(String(slug), ep, String(entryId));
      if (awSource) {
        return res.json({ source: awSource });
      }
    } catch (_) {}
  }

  // If this is an English Anime entry or slug, resolve via englishAnimeService / witaSlug
  if (String(entryId).startsWith('en-') || String(slug).startsWith('en-') || String(slug).startsWith('mal-')) {
    try {
      const enData = await englishAnimeService.getEpisode(String(slug), ep);
      const match = enData?.entries?.find((e) => e.id === entryId);
      if (match) {
        if (match.embedUrl || match.directUrl) {
          return res.json({
            source: {
              embedUrl: match.embedUrl || null,
              directUrl: match.directUrl || null
            }
          });
        }
        if (match.witaSlug) {
          const witaSource = await resolveEntry(match.witaSlug, ep, String(entryId));
          if (witaSource) return res.json({ source: witaSource });
        }
      }
    } catch (_) {}
  }

  // If this is an Anime3rb entry, resolve immediately
  if (String(entryId).startsWith('a3rb-')) {
    try {
      const a3rbData = await anime3rbService.getEpisode(String(slug).replace(/^a3rb-/, ''), ep);
      const match = a3rbData?.entries?.find((e) => e.id === entryId);
      if (match) {
        return res.json({
          source: {
            embedUrl: match.embedUrl,
            directUrl: match.directUrl || null
          }
        });
      }
    } catch (_) {}
  }

  try {
    const source = await resolveEntry(String(slug), ep, String(entryId));
    if (!source) return res.status(404).json({ error: 'not_found', message: 'Server not found' });
    res.json({ source });
  } catch (err) {
    console.error('[stream/resolve]', err.message);
    res.status(502).json({ error: err.code || 'upstream', message: 'Could not resolve this server' });
  }
});

/** POST /api/stream/resolve-download { slug, episode, entryId } — resolve one download server on demand */
router.post('/resolve-download', async (req, res) => {
  const { slug, episode, entryId } = req.body || {};
  const ep = Number(episode);
  if (!slug || !Number.isInteger(ep) || ep < 1 || !entryId) {
    return res.status(400).json({ error: 'bad_request', message: 'slug, episode, entryId required' });
  }
  if (isAniProjectAnimeSlug(slug)) {
    if (!isAniProjectConfigured()) return res.status(503).json({ error: 'source_unavailable' });
    try {
      const source = await aniprojectService.resolveDownload(slug, ep, String(entryId));
      return source ? res.json({ source }) : res.status(404).json({ error: 'not_found' });
    } catch {
      return res.status(502).json({ error: 'upstream' });
    }
  }

  // If this is an Anime Witcher (Hearbor 1) download entry
  if (String(entryId).startsWith('dl-aw-')) {
    try {
      const awDl = await resolveWitcherDownloadEntry(String(slug), ep, String(entryId));
      if (awDl) {
        return res.json({ source: awDl });
      }
    } catch (_) {}
  }

  // If this is an Anime3rb download entry
  if (String(entryId).startsWith('dl-a3rb-')) {
    try {
      const a3rbData = await anime3rbService.getEpisode(String(slug).replace(/^a3rb-/, ''), ep);
      const match = a3rbData?.downloads?.find((d) => d.id === entryId);
      if (match) {
        return res.json({
          source: {
            url: match.downloadUrl,
            directUrl: match.downloadUrl
          }
        });
      }
    } catch (_) {}
  }

  // If this is an OkAnime download entry
  if (String(entryId).startsWith('dl-ok-')) {
    try {
      const okData = await okanimeService.getEpisode(String(slug).replace(/^ok-/, ''), ep);
      const match = okData?.downloads?.find((d) => d.id === entryId);
      if (match) {
        return res.json({
          source: {
            url: match.downloadUrl,
            directUrl: match.downloadUrl
          }
        });
      }
    } catch (_) {}
  }

  // If this is an AnimeBlkom download entry
  if (String(entryId).startsWith('dl-blkom-')) {
    try {
      const blkomData = await animeblkomService.getEpisode(String(slug).replace(/^blkom-/, ''), ep);
      const match = blkomData?.downloads?.find((d) => d.id === entryId);
      if (match) {
        return res.json({
          source: {
            url: match.downloadUrl,
            directUrl: match.downloadUrl
          }
        });
      }
    } catch (_) {}
  }

  try {
    const source = await resolveDownloadEntry(String(slug), ep, String(entryId));
    if (!source) return res.status(404).json({ error: 'not_found', message: 'Download server not found' });
    res.json({ source });
  } catch (err) {
    console.error('[stream/resolve-download]', err.message);
    res.status(502).json({ error: err.code || 'upstream', message: 'Could not resolve this download server' });
  }
});

/**
 * GET /api/stream/download-sources/:slug/:ep — resolves multi-source official download servers
 * combined with 3v1ltw1n0x01/anime_scraper multi-quality base64 links (ul.quality-list).
 */
router.get('/download-sources/:slug/:ep', async (req, res) => {
  const { slug } = req.params;
  const ep = Number(req.params.ep);
  if (!slug || !Number.isInteger(ep) || ep < 1) {
    return res.status(400).json({ error: 'bad_request', message: 'Valid slug and episode required' });
  }
  if (isAniProjectAnimeSlug(slug)) {
    if (!isAniProjectConfigured()) return res.status(503).json({ error: 'source_unavailable' });
    try {
      const data = await aniprojectService.getEpisode(slug, ep);
      if (!data) return res.status(404).json({ error: 'not_found' });
      const cloudHosts = (data.downloads || []).map((dl) => ({
        id: dl.id, server: dl.server, quality: dl.quality,
        url: dl.downloadUrl, directUrl: dl.downloadUrl
      }));
      return res.json({ slug, episode: ep, cloudHosts, qualities: {}, count: cloudHosts.length });
    } catch {
      return res.status(502).json({ error: 'upstream', cloudHosts: [], qualities: {} });
    }
  }

  try {
    const cloudHosts = [];
    const seenUrls = new Set();

    // 0) Check Hearbor Server 1 (Anime Witcher 1080p/720p/480p Direct MP4 downloads) first
    try {
      const awData = await fetchWitcherEpisode(slug, ep);
      if (awData?.downloads?.length) {
        for (const dl of awData.downloads) {
          let resolved = awData.resolvedDownloads?.[dl.id] || null;
          if (!resolved && dl.id) {
            try {
              resolved = await resolveWitcherDownloadEntry(slug, ep, dl.id);
            } catch (_) {}
          }
          const finalUrl = resolved?.downloadUrl || dl.downloadUrl || dl.rawLink || null;
          if (finalUrl && !seenUrls.has(finalUrl)) {
            seenUrls.add(finalUrl);
            cloudHosts.push({
              id: dl.id,
              server: dl.server || '📥 سيرفر تحميل Hearbor 1 المباشر',
              quality: dl.quality || 'FHD 1080p',
              url: finalUrl,
              directUrl: finalUrl,
              type: 'blackx_direct_download'
            });
          }
        }
      }
    } catch (_) {}

    // 1) Check Hearbor Server 2 direct MP4 download sources
    try {
      const a3rbData = await anime3rbService.getEpisode(slug, ep);
      if (a3rbData?.downloads?.length) {
        for (const dl of a3rbData.downloads) {
          const downloadUrl = dl.downloadUrl || dl.directUrl || null;
          if (downloadUrl && seenUrls.has(downloadUrl)) continue;
          if (downloadUrl) seenUrls.add(downloadUrl);
          cloudHosts.push({
            id: dl.id,
            server: dl.server || '📥 سيرفر تحميل Hearbor المباشر',
            quality: dl.quality || 'FHD',
            url: downloadUrl,
            directUrl: downloadUrl,
            type: 'blackx_direct_download'
          });
        }
      }
    } catch (_) {}

    // 2) Check Hearbor Server 1 WitAnime downloads
    try {
      const payload = !slug.startsWith('aw-') ? await fetchEpisode(slug, ep).catch(() => null) : null;
      const rawDownloads = payload?.downloads || [];
      for (const dl of rawDownloads) {
        let resolved = payload.resolvedDownloads?.[dl.id] || null;
        if (!resolved) {
          try {
            resolved = await resolveDownloadEntry(slug, ep, dl.id);
          } catch (_) {}
        }
        const finalUrl = resolved?.downloadUrl || resolved?.directUrl || null;
        if (finalUrl && seenUrls.has(finalUrl)) continue;
        if (finalUrl) seenUrls.add(finalUrl);
        cloudHosts.push({
          id: dl.id,
          server: dl.server || '📥 سيرفر تحميل Hearbor',
          quality: dl.quality || 'FHD',
          url: resolved?.downloadUrl || null,
          directUrl: resolved?.directUrl || null,
          type: 'blackx_download'
        });
      }
    } catch (_) {}

    // 3) Merge multi-quality download links
    const scraperQualities = !slug.startsWith('aw-') ? await scraperGetEpisodeDl(slug, ep).catch(() => ({})) : {};
    for (const [qualityGroup, links] of Object.entries(scraperQualities || {})) {
      if (qualityGroup.endsWith('_servers') || !Array.isArray(links)) continue;
      const qCode =
        qualityGroup.includes('FHD') || qualityGroup.includes('1080')
          ? 'FHD'
          : qualityGroup.includes('HD') || qualityGroup.includes('720')
          ? 'HD'
          : 'SD';

      links.forEach((linkUrl, idx) => {
        if (!linkUrl || typeof linkUrl !== 'string' || seenUrls.has(linkUrl)) return;
        seenUrls.add(linkUrl);
        cloudHosts.push({
          id: `scraper-dl-${slug}-${ep}-${qCode}-${idx}`,
          server: `📥 سيرفر تحميل Hearbor ${idx + 1} (${qCode})`,
          quality: qCode,
          qualityLabel: qualityGroup,
          url: linkUrl,
          directUrl: null,
          type: 'blackx_scraper_dl'
        });
      });
    }

    res.json({
      slug,
      episode: ep,
      cloudHosts,
      qualities: scraperQualities || {},
      count: cloudHosts.length
    });
  } catch (err) {
    console.error('[stream/download-sources]', err.message);
    res.status(502).json({ error: 'upstream', message: 'Could not resolve download sources', cloudHosts: [], qualities: {} });
  }
});

/* ------------------------- video stream proxy ------------------------- */
const ALLOWED_HOSTS = [
  'pixeldrain.com',
  'pixeldrain.dev',
  'pixeldrain.net',
  'firestream.to',
  'streamtape.com',
  'tapecontent.net',
  'b-cdn.net',
  'vidtube.one',
  'upstreams.to',
  'mangatek.com',
  'firebasestorage.googleapis.com',
  'mp4upload.com',
  '4shared.com',
  'videa.hu',
  'videas.hu',
  'hgcloud.me',
  'hgcloud.to',
  'yonaplay.com',
  'yonaplay.net',
  'yonaplay.org',
  'soraplay.com',
  'mega.nz',
  'mega.co.nz',
  'wtsrv.xyz',
  'mediafire.com',
  'sendvid.com',
  'animeify.net',
  'drive.google.com',
  'google.com',
  'googleusercontent.com',
  'mail.ru',
  'yourupload.com',
  'ok.ru',
  'workupload.com',
  'gofile.io',
  'dropbox.com',
  'krakenfiles.com',
  '1fichier.com',
  'streamwish.to',
  'streamwish.com',
  'vidmoly.me',
  'vidmoly.to',
  'wahmi.org',
  'uptobox.com',
  'okanime.xyz',
  'animeblkom.com',
  'share4max.com',
  'uqload.is',
  'uqload.com',
  'streamruby.com',
  'rubyvidhub.com',
  'vkvideo.ru',
  'vk.com',
  'animeheaven.me',
  'premilkyway.com',
  'sunrisegroveproduction.cfd',
  'vibuxer.com',
  'huntrexus.com',
  'dramahot.top',
  'zokoanime.video',
  'hianime.at',
  'allanimenews.com',
  'fast4speed.rsvp',
  'wixmp.com',
  'vibuxer.com',
  'hgcloud.me',
  'hgcloud.to',
  'hlswish.com',
  'wishembed.com',
  'drama1.cfd'
];

function unwrapProxyUrl(raw) {
  let u = String(raw || '').trim();
  for (let i = 0; i < 3; i += 1) {
    if (u.startsWith('/api/stream/proxy?url=') || u.includes('/api/stream/proxy?url=')) {
      const idx = u.indexOf('url=');
      if (idx !== -1) {
        try {
          u = decodeURIComponent(u.slice(idx + 4).split('&')[0]);
        } catch {
          break;
        }
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return u;
}

function hostAllowed(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return ALLOWED_HOSTS.some((a) => h === a || h.endsWith(`.${a}`)) || isAniProjectMediaHost(h);
}

function safeAniProjectReferer(raw) {
  if (typeof raw !== 'string' || raw.length > 512) return null;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[|0\.)/i.test(url.hostname) ||
        url.hostname.endsWith('.local') || url.hostname.endsWith('.internal')) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isAllowedRemoteStreamUrl(target) {
  return target instanceof URL &&
    (target.protocol === 'https:' || target.protocol === 'http:') &&
    !target.username &&
    !target.password &&
    hostAllowed(target.hostname);
}

async function fetchAllowedHlsUrl(url, headers, maxRedirects = 4) {
  let current = new URL(url);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (!isAllowedRemoteStreamUrl(current)) {
      throw Object.assign(new Error('HLS host not allowed'), { code: 'hls_host_not_allowed' });
    }
    const response = await fetch(current.href, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(25000)
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: current.href };
    }

    const location = response.headers.get('location');
    if (!location) return { response, finalUrl: current.href };
    const next = new URL(location, current.href);
    if (response.body) await response.body.cancel().catch(() => {});
    if (!isAllowedRemoteStreamUrl(next)) {
      throw Object.assign(new Error('HLS redirect host not allowed'), { code: 'hls_host_not_allowed' });
    }
    current = next;
  }
  throw Object.assign(new Error('Too many HLS redirects'), { code: 'hls_redirect_limit' });
}

/**
 * GET /api/stream/download?url=…&filename=… — pipes remote video with attachment header to download file to device.
 * Handles hotlink bypass (Referer/Origin) and Range headers for resume/full-file download.
 */
router.get('/download', optionalAuth, async (req, res) => {
  let target;
  try {
    target = new URL(unwrapProxyUrl(req.query.url));
  } catch {
    return res.status(400).json({ error: 'bad_url', message: 'Invalid url' });
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return res.status(400).json({ error: 'bad_url', message: 'Only http(s)' });
  }
  if (!hostAllowed(target.hostname)) {
    return res.status(403).json({ error: 'bad_host', message: 'Host not allowed' });
  }

  const rawFilename = String(req.query.filename || 'episode.mp4').trim();
  const safeFilename = rawFilename.replace(/[^a-zA-Z0-9_.\u0600-\u06FF-]/g, '_') || 'episode.mp4';
  const filename = safeFilename.endsWith('.mp4') ? safeFilename : `${safeFilename}.mp4`;

  try {
    const labels = target.hostname.split('.');
    const brand = labels.length >= 2 ? labels.slice(-2).join('.') : target.hostname;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: '*/*'
    };

    const apReferer = isAniProjectMediaHost(target.hostname) ? safeAniProjectReferer(req.query.ref) : null;
    if (apReferer) {
      headers.Referer = apReferer;
      headers.Origin = new URL(apReferer).origin;
    } else if (target.hostname.includes('mp4upload')) {
      headers.Referer = 'https://www.mp4upload.com/';
      headers.Origin = 'https://www.mp4upload.com';
    } else if (target.hostname.includes('mediafire')) {
      headers.Referer = 'https://www.mediafire.com/';
    } else if (target.hostname.includes('animeheaven.me')) {
      headers.Referer = 'https://animeheaven.me/';
      headers.Origin = 'https://animeheaven.me';
    } else {
      headers.Referer = `https://www.${brand}/`;
    }

    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    // Newly configured media hosts must not be able to redirect our proxy to
    // private/unapproved destinations. Existing provider behavior is unchanged.
    const upstream = isAniProjectMediaHost(target.hostname)
      ? (await fetchAllowedHlsUrl(target.href, headers)).response
      : await fetch(target.href, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(120000)
        });

    if (!upstream.ok && upstream.status !== 206) {
      console.warn(`[stream/download] upstream returned ${upstream.status} for ${target.href}`);
      // If upstream failed or returned an error status, redirect to original page instead of failing silently
      return res.redirect(target.href);
    }

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    // If upstream returns an HTML landing page instead of a video, redirect to the page
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      return res.redirect(target.href);
    }

    const statusCode = upstream.status === 206 ? 206 : 200;
    res.status(statusCode);

    const pass = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
    for (const h of pass) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }

    if (!res.getHeader('content-type')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
    res.setHeader('Accept-Ranges', 'bytes');

    const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_');
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader('Access-Control-Allow-Origin', '*');

    const { Readable } = await import('stream');
    const upstreamStream = Readable.fromWeb(upstream.body);
    const cleanup = () => {
      if (!upstreamStream.destroyed) upstreamStream.destroy();
    };
    upstreamStream.on('error', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
    upstreamStream.pipe(res);
  } catch (err) {
    if (res.headersSent || res.destroyed) return;
    console.error('[stream/download]', err.message);
    res.status(err.code === 'hls_host_not_allowed' ? 403 : 502)
      .json({ error: err.code || 'upstream', message: 'Download failed' });
  }
});

const mfInstanceCache = new Map();

async function resolveFreshMediafireDirectUrl(urlStr) {
  const mKey =
    String(urlStr).match(/\/file\/([a-z0-9]{14,16})/i)?.[1] ||
    String(urlStr).match(/\/([a-z0-9]{15})\//i)?.[1] ||
    String(urlStr).match(/[?&]qkey=([a-z0-9]{14,16})/i)?.[1];
  if (!mKey) return null;

  const cached = mfInstanceCache.get(mKey);
  if (cached && Date.now() - cached.ts < 8 * 60 * 1000) {
    return cached.url;
  }

  try {
    const pageRes = await fetch(`https://www.mediafire.com/file/${mKey}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000)
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const dlMatch = html.match(/(https:\/\/download[^"'\s<>]+)/i);
      if (dlMatch && dlMatch[1]) {
        mfInstanceCache.set(mKey, { url: dlMatch[1], ts: Date.now() });
        return dlMatch[1];
      }
    }
  } catch {}
  return null;
}

/**
 * Cap Range header to 4 MB chunks so Google Cloud Run / Google Frontend (*.ai.studio)
 * NEVER hits its 32 MB HTTP response limit (which otherwise kills open-ended Range: bytes=0- with HTTP 500).
 */
const MAX_PROXY_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB

function buildCappedRangeHeader(rawRange) {
  if (!rawRange || !String(rawRange).startsWith('bytes=')) {
    return `bytes=0-${MAX_PROXY_CHUNK_BYTES - 1}`;
  }
  const spec = String(rawRange).replace(/^bytes=/, '').split(',')[0].trim();
  const [startStr, endStr] = spec.split('-');
  const start = parseInt(startStr, 10);
  if (!Number.isFinite(start) || start < 0) {
    return `bytes=0-${MAX_PROXY_CHUNK_BYTES - 1}`;
  }
  if (!endStr) {
    return `bytes=${start}-${start + MAX_PROXY_CHUNK_BYTES - 1}`;
  }
  const end = parseInt(endStr, 10);
  if (!Number.isFinite(end) || end < start) {
    return `bytes=${start}-${start + MAX_PROXY_CHUNK_BYTES - 1}`;
  }
  if (end - start + 1 > MAX_PROXY_CHUNK_BYTES * 2) {
    return `bytes=${start}-${start + MAX_PROXY_CHUNK_BYTES - 1}`;
  }
  return `bytes=${start}-${end}`;
}

/**
 * GET /api/stream/proxy?url=… — pipes a remote video with 4 MB Range chunking.
 * Keeps hotlink-protected hosts playable inside our custom player and prevents
 * Cloud Run / Google Frontend 32 MB response-size HTTP 500 errors.
 */
router.get('/proxy', optionalAuth, async (req, res) => {
  let target;
  try {
    target = new URL(unwrapProxyUrl(req.query.url));
  } catch {
    return res.status(400).json({ error: 'bad_url', message: 'Invalid url' });
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return res.status(400).json({ error: 'bad_url', message: 'Only http(s)' });
  }
  if (!hostAllowed(target.hostname)) {
    return res.status(403).json({ error: 'bad_host', message: 'Host not allowed' });
  }

  try {
    const labels = target.hostname.split('.');
    const brand = labels.length >= 2 ? labels.slice(-2).join('.') : target.hostname;
    const isAh = target.hostname.includes('animeheaven.me');
    const isPd = target.hostname.includes('pixeldrain.');
    const isMf = target.hostname.includes('mediafire.');
    const isFs = target.hostname.includes('firestream.');

    // If a MediaFire page link was passed directly, resolve the IP-matched download URL first
    let fetchHref = target.href;
    if (isMf && target.hostname === 'www.mediafire.com') {
      const fresh = await resolveFreshMediafireDirectUrl(fetchHref);
      if (fresh) fetchHref = fresh;
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: '*/*'
    };
    const apReferer = isAniProjectMediaHost(target.hostname) ? safeAniProjectReferer(req.query.ref) : null;
    if (apReferer) {
      headers.Referer = apReferer;
      headers.Origin = new URL(apReferer).origin;
    } else if (isAh) {
      headers.Referer = 'https://animeheaven.me/';
      headers.Origin = 'https://animeheaven.me';
    } else if (isMf) {
      headers.Referer = 'https://www.mediafire.com/';
    } else if (isFs) {
      headers.Referer = 'https://firestream.to/';
    } else if (!isPd) {
      headers.Referer = `https://www.${brand}/`;
      headers.Origin = `https://www.${brand}`;
    }

    // Always send a capped Range header (<= 4 MB) so Cloud Run / Google Frontend never returns HTTP 500
    headers.Range = buildCappedRangeHeader(req.headers.range);

    let upstream = isAniProjectMediaHost(target.hostname)
      ? (await fetchAllowedHlsUrl(fetchHref, headers)).response
      : await fetch(fetchHref, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(25000)
        });

    // Self-heal expired or IP-mismatched MediaFire downloadXXXX.mediafire.com URLs that redirect to download_repair.php (text/html)
    const initialCt = (upstream.headers.get('content-type') || '').toLowerCase();
    if (isMf && (!upstream.ok || initialCt.includes('text/html'))) {
      const mKey =
        fetchHref.match(/\/([a-z0-9]{15})\//i)?.[1] ||
        fetchHref.match(/\/file\/([a-z0-9]{14,16})/i)?.[1];
      if (mKey) {
        mfInstanceCache.delete(mKey);
        const refreshedUrl = await resolveFreshMediafireDirectUrl(fetchHref);
        if (refreshedUrl && refreshedUrl !== fetchHref) {
          upstream = await fetch(refreshedUrl, {
            headers,
            redirect: 'follow',
            signal: AbortSignal.timeout(25000)
          });
        }
      }
    }

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).end();
    }

    const finalCt = (upstream.headers.get('content-type') || '').toLowerCase();
    if (finalCt.includes('text/html') || finalCt.includes('application/json')) {
      return res.status(502).json({ error: 'upstream_not_video', message: 'Upstream returned non-video response' });
    }

    // Preserve the upstream status; claiming 206 without Content-Range breaks HTML5 seek/playback.
    res.status(upstream.status);
    const pass = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
    for (const h of pass) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const { Readable } = await import('stream');
    const upstreamStream = Readable.fromWeb(upstream.body);
    const cleanup = () => {
      if (!upstreamStream.destroyed) upstreamStream.destroy();
    };
    upstreamStream.on('error', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
    upstreamStream.pipe(res);
  } catch (err) {
    if (res.headersSent || res.destroyed) return;
    console.error('[stream/proxy]', err.message);
    res.status(err.code === 'hls_host_not_allowed' ? 403 : 502)
      .json({ error: err.code || 'upstream', message: 'Stream fetch failed' });
  }
});

/**
 * GET /api/stream/hls-lib.js — serves local hls.min.js so self-hosted HLS player needs zero external CDNs
 */
router.get('/hls-lib.js', async (_req, res) => {
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const hlsPath = path.resolve(process.cwd(), 'node_modules/hls.js/dist/hls.min.js');
    const js = await fs.readFile(hlsPath, 'utf8');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(js);
  } catch {
    res.status(404).end();
  }
});

/**
 * GET /api/stream/hls-proxy?url=… — proxies HLS .m3u8 playlists and .ts segments with Referer bypass
 */
router.get('/hls-proxy', async (req, res) => {
  let target;
  try {
    target = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).send('Invalid url');
  }
  if (!isAllowedRemoteStreamUrl(target)) {
    return res.status(403).send('HLS host not allowed');
  }
  try {
    const isZoko =
      target.hostname.includes('drama') ||
      target.hostname.includes('zokoanime') ||
      target.hostname.endsWith('.cfd') ||
      target.hostname.endsWith('.top');
    const apReferer = isAniProjectMediaHost(target.hostname) ? safeAniProjectReferer(req.query.ref) : null;
    const referer = apReferer || (isZoko ? 'https://zokoanime.video/' : 'https://vibuxer.com/');
    const origin = apReferer ? new URL(apReferer).origin : (isZoko ? 'https://zokoanime.video' : 'https://vibuxer.com');
    const refParam = apReferer ? `&ref=${encodeURIComponent(apReferer)}` : '';
    const { response: upstream, finalUrl } = await fetchAllowedHlsUrl(target.href, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: '*/*',
      Referer: referer,
      Origin: origin
    });
    if (!upstream.ok) return res.status(upstream.status).end();

    const ct = (upstream.headers.get('content-type') || '').toLowerCase();
    const isM3u8 =
      target.pathname.endsWith('.m3u8') ||
      target.pathname.endsWith('.txt') ||
      ct.includes('mpegurl') ||
      ct.includes('text/plain');

    res.setHeader('Access-Control-Allow-Origin', '*');

    if (isM3u8) {
      const text = await upstream.text();
      if (text.trimStart().startsWith('#EXTM3U')) {
        const rewritten = text
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/g, (_, uri) => {
                try {
                  const full = new URL(uri, finalUrl);
                  if (!isAllowedRemoteStreamUrl(full)) return 'URI=""';
                  return `URI="/api/stream/hls-proxy?url=${encodeURIComponent(full.href)}${refParam}"`;
                } catch {
                  return `URI="${uri}"`;
                }
              });
            }
            try {
              const full = new URL(trimmed, finalUrl);
              if (!isAllowedRemoteStreamUrl(full)) return '';
              return `/api/stream/hls-proxy?url=${encodeURIComponent(full.href)}${refParam}`;
            } catch {
              return line;
            }
          })
          .join('\n');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        return res.send(rewritten);
      }
    }

    if (ct) res.setHeader('Content-Type', ct);
    const { Readable } = await import('stream');
    const upstreamStream = Readable.fromWeb(upstream.body);
    const cleanup = () => {
      if (!upstreamStream.destroyed) upstreamStream.destroy();
    };
    upstreamStream.on('error', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
    upstreamStream.pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(err.code === 'hls_host_not_allowed' ? 403 : 502).end();
  }
});

/**
 * GET /api/stream/hls-player?url=…&sub=… — Self-hosted HTML5 + hls.js player
 */
router.get('/hls-player', (req, res) => {
  const rawUrl = String(req.query.url || '');
  const requestedSubUrl = String(req.query.sub || '');
  const subEnUrl = String(req.query.sub_en || '');
  if (!rawUrl) return res.status(400).send('Missing url');

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).send('Invalid url');
  }
  if (!isAllowedRemoteStreamUrl(target)) return res.status(403).send('HLS host not allowed');

  let subUrl = '';
  try {
    const localSub = new URL(requestedSubUrl, 'https://black-x.invalid');
    if (localSub.origin === 'https://black-x.invalid' && localSub.pathname.startsWith('/api/stream/subtitles/')) {
      subUrl = `${localSub.pathname}${localSub.search}`;
    }
  } catch {}

  let safeSubEnUrl = '';
  try {
    const parsedSubEn = new URL(subEnUrl);
    if (isAllowedRemoteStreamUrl(parsedSubEn)) safeSubEnUrl = parsedSubEn.href;
  } catch {}

  const proxiedM3u8 = `/api/stream/hls-proxy?url=${encodeURIComponent(target.href)}`;
  const proxiedSubEn = safeSubEnUrl ? `/api/stream/hls-proxy?url=${encodeURIComponent(safeSubEnUrl)}` : '';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Hearbor HLS Player</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
  video { width: 100%; height: 100%; object-fit: contain; background: #000; outline: none; }
  video::cue { background: rgba(0,0,0,0.78); color: #fff; font-family: 'Cairo', 'Tajawal', sans-serif; font-size: 1.15rem; }
</style>
<script src="/api/stream/hls-lib.js"></script>
</head>
<body>
<video id="v" controls autoplay playsinline crossorigin="anonymous">
  ${subUrl ? `<track kind="subtitles" srclang="ar" label="العربية (Hearbor AI)" src="${subUrl.replace(/"/g, '&quot;')}" default />` : ''}
  ${proxiedSubEn ? `<track kind="subtitles" srclang="en" label="English" src="${proxiedSubEn.replace(/"/g, '&quot;')}" />` : ''}
</video>
<script>
  const video = document.getElementById('v');
  const src = ${JSON.stringify(proxiedM3u8)};
  const enableArabicTrack = () => {
    if (video.textTracks && video.textTracks.length > 0) {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = i === 0 ? 'showing' : 'disabled';
      }
    }
  };
  video.addEventListener('loadedmetadata', enableArabicTrack);
  if (window.Hls && Hls.isSupported()) {
    const hls = new Hls({ maxBufferLength: 30 });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      enableArabicTrack();
      video.play().catch(() => {});
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.addEventListener('loadedmetadata', () => { video.play().catch(() => {}); });
  }
</script>
</body>
</html>`);
});

/**
 * GET /api/stream/mp4-player?url=…&sub=… — Self-hosted, 100% Sandbox-Safe HTML5 MP4 player with Arabic subtitles
 */
router.get('/mp4-player', (req, res) => {
  const rawUrl = String(req.query.url || '');
  const subUrl = String(req.query.sub || '');
  if (!rawUrl) return res.status(400).send('Missing url');
  const proxiedMp4 = `/api/stream/proxy?url=${encodeURIComponent(rawUrl)}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Hearbor Direct Player</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }
  video { width: 100%; height: 100%; object-fit: contain; background: #000; outline: none; }
  video::cue { background: rgba(0,0,0,0.78); color: #fff; font-family: 'Cairo', 'Tajawal', sans-serif; font-size: 1.15rem; }
  .bx-hud { position: fixed; top: 10px; left: 10px; right: 10px; z-index: 20; display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; pointer-events: none; }
  .bx-btn { pointer-events: auto; background: rgba(0,0,0,0.78); color: #fff; border: 1px solid rgba(255,255,255,0.32); border-radius: 999px; padding: 5px 11px; font-size: 12px; font-weight: 800; cursor: pointer; backdrop-filter: blur(8px); }
  .bx-btn--white { background: #fff; color: #000; border-color: #fff; }
</style>
</head>
<body>
<div class="bx-hud">
  <button class="bx-btn" onclick="seek(-600)">⏪ -10 د</button>
  <button class="bx-btn" onclick="seek(-10)">⏪ -10 ث</button>
  <button class="bx-btn" onclick="seek(10)">+10 ث ⏩</button>
  <button class="bx-btn" onclick="seek(600)">+10 د ⏩</button>
  <button class="bx-btn bx-btn--white" onclick="goFs()">⛶ شاشة كاملة</button>
</div>
<video id="v" src="${proxiedMp4.replace(/"/g, '&quot;')}" controls autoplay playsinline crossorigin="anonymous">
  ${subUrl ? `<track kind="subtitles" srclang="ar" label="العربية (AI)" src="${subUrl.replace(/"/g, '&quot;')}" default />` : ''}
</video>
<script>
  const v = document.getElementById('v');
  function seek(d) {
    if (!v) return;
    v.currentTime = Math.max(0, (v.currentTime || 0) + d);
  }
  function goFs() {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    else if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  }
  window.addEventListener('message', (e) => {
    const d = e && e.data;
    if (!d || !v) return;
    if (d.type === 'bx_seek') seek(Number(d.delta) || 0);
    if (d.type === 'bx_toggle_play') { if (v.paused) v.play(); else v.pause(); }
  });
</script>
</body>
</html>`);
});

/* ------------- English -> Arabic AI Subtitle Translation API ------------- */

function extractSubtitleQuery(slug, queryParam) {
  if (queryParam && String(queryParam).trim()) return String(queryParam).trim();
  return String(slug || '')
    .replace(/^(en|mal)-\d+-/i, '')
    .replace(/^(ok|blkom|a3rb|ani)-/i, '')
    .replace(/-/g, ' ')
    .trim();
}

/** GET /api/stream/subtitles/:slug/:ep.vtt — WebVTT Arabic translated subtitles */
router.get('/subtitles/:slug/:ep.vtt', async (req, res) => {
  const { slug } = req.params;
  const ep = Math.max(1, Number(req.params.ep) || 1);
  const query = extractSubtitleQuery(slug, req.query.title || req.query.q);
  const lang = (req.query.lang || 'ar').toLowerCase();

  try {
    const subData = await getTranslatedEpisodeSubtitles({
      query,
      episode: ep,
      directSubUrl: req.query.url || null
    });
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!subData) {
      return res.send('WEBVTT\n\n');
    }
    return res.send(lang === 'en' ? subData.vttEn : subData.vttAr);
  } catch (err) {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    return res.send('WEBVTT\n\n');
  }
});

/** GET /api/stream/subtitles/:slug/:ep.srt — Downloadable SubRip (.srt) Arabic subtitles */
router.get('/subtitles/:slug/:ep.srt', async (req, res) => {
  const { slug } = req.params;
  const ep = Math.max(1, Number(req.params.ep) || 1);
  const query = extractSubtitleQuery(slug, req.query.title || req.query.q);

  try {
    const subData = await getTranslatedEpisodeSubtitles({
      query,
      episode: ep,
      directSubUrl: req.query.url || null
    });
    const safeName = query.replace(/[^a-z0-9-_]/gi, '_') || 'Anime';
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_Ep${ep}_AR.srt"`);
    return res.send(subData ? subData.srtAr : '');
  } catch (err) {
    return res.status(502).send('');
  }
});

/** GET /api/stream/subtitles/:slug/:ep — JSON cues (startSec, endSec, textAr, textEn) + VTT/SRT links */
router.get('/subtitles/:slug/:ep', async (req, res) => {
  const { slug } = req.params;
  const ep = Math.max(1, Number(req.params.ep) || 1);
  const query = extractSubtitleQuery(slug, req.query.title || req.query.q);

  try {
    const subData = await getTranslatedEpisodeSubtitles({
      query,
      episode: ep,
      directSubUrl: req.query.url || null
    });
    if (!subData) {
      return res.json({
        ok: false,
        cueCount: 0,
        cues: [],
        message: 'No external subtitle file found for this episode'
      });
    }
    return res.json({
      ok: true,
      query: subData.query,
      episode: subData.episode,
      fileName: subData.fileName,
      cueCount: subData.cueCount,
      cues: subData.cues,
      vttUrl: `/api/stream/subtitles/${encodeURIComponent(slug)}/${ep}.vtt?title=${encodeURIComponent(query)}`,
      srtUrl: `/api/stream/subtitles/${encodeURIComponent(slug)}/${ep}.srt?title=${encodeURIComponent(query)}`
    });
  } catch (err) {
    return res.status(502).json({ ok: false, cueCount: 0, cues: [], error: err.message });
  }
});

/** POST /api/stream/translate-subtitle — Translate custom .srt/.vtt text or URL from English to Arabic */
router.post('/translate-subtitle', async (req, res) => {
  const { text, url, query, episode } = req.body || {};
  try {
    if (text && typeof text === 'string') {
      const cues = parseSubtitles(text);
      if (!cues.length) {
        return res.status(400).json({ ok: false, message: 'No valid subtitle cues found' });
      }
      const arLines = await translateLinesToArabic(cues.map((c) => c.textEn));
      cues.forEach((c, idx) => {
        c.textAr = arLines[idx] || c.textEn;
      });
      return res.json({
        ok: true,
        cueCount: cues.length,
        cues,
        vttAr: buildVttFromCues(cues, 'textAr'),
        srtAr: buildSrtFromCues(cues, 'textAr')
      });
    }

    const subData = await getTranslatedEpisodeSubtitles({
      query: query || 'anime',
      episode: Number(episode) || 1,
      directSubUrl: url || null
    });
    if (!subData) {
      return res.status(404).json({ ok: false, message: 'Subtitle not found' });
    }
    return res.json({
      ok: true,
      cueCount: subData.cueCount,
      cues: subData.cues,
      vttAr: subData.vttAr,
      srtAr: subData.srtAr
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
