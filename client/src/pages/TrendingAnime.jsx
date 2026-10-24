import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { imgFallback, pushToast } from '../hooks/hooks.js';
import { useAnimeCatalogTotal, formatCount } from '../hooks/useCatalogStats.js';
import { SkeletonGrid, EmptyState } from '../components/Loading.jsx';
import { resolveUserVipTier } from '../components/VipPlansAndDevCodes.jsx';
import {
  getSubscribedAnimeList,
  isAnimeEpisodeAlertEnabled,
  toggleAnimeEpisodeAlert,
  sendNativeDeviceNotification
} from '../utils/deviceNotifications.js';

const ANIME_GENRES = [
  { id: 'all', ar: '🌟 جميع التصنيفات', en: '🌟 All Genres' },
  { id: 'Action', ar: '⚔️ أكشن وقتال', en: '⚔️ Action' },
  { id: 'Fantasy', ar: '🔮 خيال وسحر', en: '🔮 Fantasy' },
  { id: 'Adventure', ar: '🧭 مغامرات', en: '🧭 Adventure' },
  { id: 'Comedy', ar: '😂 كوميديا', en: '😂 Comedy' },
  { id: 'Romance', ar: '❤️ رومانسي', en: '❤️ Romance' },
  { id: 'Supernatural', ar: '👁️ خارق للطبيعة', en: '👁️ Supernatural' },
  { id: 'Drama', ar: '🎭 دراما وغموض', en: '🎭 Drama' },
  { id: 'Sci-Fi', ar: '🚀 خيال علمي', en: '🚀 Sci-Fi' },
  { id: 'Mystery', ar: '🕵️ تحقيق وغموض', en: '🕵️ Mystery' },
  { id: 'Sports', ar: '⚽ رياضي', en: '⚽ Sports' }
];

/** Score on a 0–100 scale from a 0–10 or 0–100 value; null when unknown (never a made-up 9.2). */
function score100(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n > 10 ? n : n * 10);
}

export default function TrendingAnime() {
  const { lang, formatNumber } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const animeTotal = useAnimeCatalogTotal();
  const [searchParams, setSearchParams] = useSearchParams();

  const vipTier = resolveUserVipTier(user);
  const isVip = vipTier === 'vip_basic' || vipTier === 'vip_monarch';

  const initialQ = searchParams.get('q') || '';
  const initialSource = searchParams.get('source') || 'all';
  const initialFilter = searchParams.get('filter') || 'trending';
  const initialGenre = searchParams.get('genre') || 'all';
  const [query, setQuery] = useState(initialQ);
  const [selectedSource, setSelectedSource] = useState(initialSource); // 'all' | 'witanime' | 'anime3rb' | 'english' | 'aniproject'
  const [serverFourEnabled, setServerFourEnabled] = useState(false);
  const [activeFilter, setActiveFilter] = useState(initialFilter); // 'trending' | 'latest' | 'top' | 'alerts' | 'random'
  const [selectedGenre, setSelectedGenre] = useState(initialGenre);

  useEffect(() => {
    const qParam = searchParams.get('q') || '';
    const srcParam = searchParams.get('source') || 'all';
    const fltParam = searchParams.get('filter') || 'trending';
    const gnrParam = searchParams.get('genre') || 'all';
    setQuery(qParam);
    setSelectedSource(srcParam);
    setActiveFilter(fltParam);
    setSelectedGenre(gnrParam);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    api.get('/api/stream/sources')
      .then((data) => { if (active) setServerFourEnabled(data?.sources?.some((s) => s.id === 'aniproject') || false); })
      .catch(() => { if (active) setServerFourEnabled(false); });
    return () => { active = false; };
  }, []);

  const [trendingList, setTrendingList] = useState([]);
  const [latestStreamList, setLatestStreamList] = useState([]);
  const [catalogList, setCatalogList] = useState([]);
  const [catalogPage, setCatalogPage] = useState(1);
  // Real catalog size reported by the API; null until known (never a guess).
  const [totalCatalogCount, setTotalCatalogCount] = useState(null);
  const [hasNextCatalogPage, setHasNextCatalogPage] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [randomScraperList, setRandomScraperList] = useState([]);
  const [shufflingRandom, setShufflingRandom] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [resolvingSlugId, setResolvingSlugId] = useState(null);
  const [unmatchedMalIds, setUnmatchedMalIds] = useState(() => new Set());
  const [subscribedSlugs, setSubscribedSlugs] = useState(() =>
    new Set(getSubscribedAnimeList().map((a) => a.slug))
  );

  // Helper to verify that a streaming search candidate actually matches the requested anime title
  const isMatchingAnimeTitle = useCallback((targetTitle, candidate) => {
    if (!targetTitle || !candidate) return false;
    const norm = (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const tNorm = norm(targetTitle);
    const cEn = norm(candidate.titleEn || '');
    const cAr = norm(candidate.titleAr || '');
    const cSlug = norm((candidate.slug || '').replace(/-/g, ' '));
    if (!tNorm) return false;
    if (cEn === tNorm || cAr === tNorm || cSlug === tNorm) return true;
    if (cEn.includes(tNorm) || tNorm.includes(cEn)) return cEn.length >= 3;
    if (cSlug.includes(tNorm) || tNorm.includes(cSlug)) return cSlug.length >= 3;
    const words = tNorm.split(' ').filter((w) => w.length > 2);
    if (!words.length) return false;
    const matchedWords = words.filter((w) => cEn.includes(w) || cSlug.includes(w) || cAr.includes(w));
    return matchedWords.length >= Math.ceil(words.length * 0.6);
  }, []);

  const refreshSubs = useCallback(() => {
    setSubscribedSlugs(new Set(getSubscribedAnimeList().map((a) => a.slug)));
  }, []);

  const refreshRandomAnime = useCallback(async () => {
    setShufflingRandom(true);
    try {
      const res = await api.get('/api/anime-scraper/random-anime?count=24');
      if (Array.isArray(res?.items) && res.items.length) {
        setRandomScraperList(res.items);
      }
    } catch {
      // ignore
    } finally {
      setShufflingRandom(false);
    }
  }, []);

  // Load initial trending + streaming + random scraper anime for the selected source, sort & genre
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setCatalogPage(1);

    const sortMode = activeFilter === 'top' ? 'top' : activeFilter === 'latest' ? 'latest' : 'popular';
    const genreParam = selectedGenre && selectedGenre !== 'all' ? `&genre=${encodeURIComponent(selectedGenre)}` : '';

    const promises = [
      api.get(`/api/stream/latest?source=${selectedSource}`).catch(() => ({ items: [] })),
      api.get(`/api/stream/catalog?source=${selectedSource}&page=1&sort=${sortMode}${genreParam}`).catch(() => ({ items: [] })),
      api.get('/api/anime-scraper/random-anime?count=24').catch(() => ({ items: [] }))
    ];

    if ((selectedSource === 'all' || selectedSource === 'witanime') && (!selectedGenre || selectedGenre === 'all')) {
      promises.push(api.get('/api/anime/trending').catch(() => ({ anime: [] })));
    } else {
      promises.push(Promise.resolve({ anime: [] }));
    }

    Promise.all(promises).then(([latestData, catalogData, randomData, trendData]) => {
      if (!alive) return;
      setLatestStreamList(latestData?.items || []);
      setCatalogList(catalogData?.items || []);
      // The API sends null when the source reports no total; Number(null) would be 0.
      const reportedTotal = Number(catalogData?.totalCount);
      setTotalCatalogCount(Number.isFinite(reportedTotal) && reportedTotal > 0 ? reportedTotal : null);
      setHasNextCatalogPage(catalogData?.hasNext !== false);
      setRandomScraperList(randomData?.items || []);
      setTrendingList(trendData?.anime || []);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [selectedSource, selectedGenre, activeFilter]);

  const handleLoadMoreCatalog = useCallback(async () => {
    if (loadingMore || !hasNextCatalogPage) return;
    setLoadingMore(true);
    try {
      const nextPage = catalogPage + 1;
      const sortMode = activeFilter === 'top' ? 'top' : activeFilter === 'latest' ? 'latest' : 'popular';
      const genreParam = selectedGenre && selectedGenre !== 'all' ? `&genre=${encodeURIComponent(selectedGenre)}` : '';
      const data = await api.get(
        `/api/stream/catalog?source=${selectedSource}&page=${nextPage}&sort=${sortMode}${genreParam}`
      );
      const newItems = Array.isArray(data?.items) ? data.items : [];
      if (newItems.length > 0) {
        setCatalogList((prev) => [...prev, ...newItems]);
        setCatalogPage(nextPage);
        setHasNextCatalogPage(Boolean(data?.hasNext));
      } else {
        setHasNextCatalogPage(false);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasNextCatalogPage, catalogPage, activeFilter, selectedGenre, selectedSource]);

  // Live Anime Search Engine handler across selected source(s)
  const runSearch = useCallback(
    async (qText) => {
      const clean = String(qText || '').trim();
      if (!clean) {
        setSearchResults(null);
        return;
      }
      setSearching(true);
      try {
        const streamPromise = api.get(`/api/stream/search?q=${encodeURIComponent(clean)}&source=${selectedSource}`).catch(() => ({ items: [] }));
        const aniPromise = (selectedSource === 'all' || selectedSource === 'witanime')
          ? api.get(`/api/anime/search?q=${encodeURIComponent(clean)}`).catch(() => ({ anime: [] }))
          : Promise.resolve({ anime: [] });

        const [streamRes, aniRes] = await Promise.all([streamPromise, aniPromise]);
        const streamItems = streamRes?.items || streamRes?.results || [];

        const combined = [];
        const seen = new Set();

        for (const s of streamItems) {
          const key = `${s.source || 'src'}:${s.slug}`;
          if (seen.has(key)) continue;
          seen.add(key);
          combined.push({
            id: `st-${s.source || 'src'}-${s.slug}`,
            slug: s.slug,
            titleEn: s.titleEn || s.slug,
            titleAr: s.titleAr || s.titleEn || s.slug,
            poster: s.poster,
            episodes: s.episode ?? s.episodes ?? null,
            score: score100(s.rating || s.score),
            genres: Array.isArray(s.genres) ? s.genres : [],
            isDirectStream: true,
            isMalOnly: false,
            source: s.source || (String(s.slug).startsWith('a3rb-') ? 'anime3rb' : 'witanime'),
            sourceLabel: s.sourceLabel || (s.source === 'aniproject' ? 'سيرفر Hearbor 4' : s.source === 'anime3rb' ? 'سيرفر Hearbor 2' : s.source === 'english' ? 'سيرفر Hearbor 3' : 'سيرفر Hearbor 1')
          });
        }

        for (const a of aniRes?.anime || []) {
          const titleEnOrRom = a.titleEnglish || a.titleRomaji || '';
          const matchedStream = streamItems.find(
            (st) => isMatchingAnimeTitle(a.titleEnglish, st) || isMatchingAnimeTitle(a.titleRomaji, st)
          );
          if (matchedStream) continue;

          const key = `ani:${titleEnOrRom.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          combined.push({
            id: `ani-${a.id}`,
            aniId: a.id,
            slug: null,
            searchTitle: a.titleRomaji || a.titleEnglish,
            titleEn: a.titleEnglish || a.titleRomaji,
            titleAr: a.titleArabic || a.titleEnglish || a.titleRomaji,
            poster: a.coverUrl,
            banner: a.bannerUrl,
            episodes: a.episodes,
            score: a.score || 89,
            genres: a.genres || ['Action'],
            isDirectStream: false,
            isMalOnly: true,
            source: 'blackx-index',
            sourceLabel: '📋 فهرس Hearbor'
          });
        }

        setSearchResults(combined);
      } finally {
        setSearching(false);
      }
    },
    [selectedSource, isMatchingAnimeTitle]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim()) {
        runSearch(query);
      } else {
        setSearchResults(null);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  // Merge catalog, trending & stream lists into unified Anime cards
  const unifiedAnime = useMemo(() => {
    if (searchResults !== null) {
      return searchResults;
    }

    if (activeFilter === 'alerts') {
      if (selectedSource === 'aniproject') return []; // No provider latest-feed/alert catalog.
      return getSubscribedAnimeList().map((sub) => ({
        id: `sub-${sub.slug}`,
        slug: sub.slug,
        titleEn: sub.titleEn,
        titleAr: sub.titleAr,
        poster: sub.poster,
        // Saved alerts keep no score or genres: unknown values are not invented.
        episodes: sub.latestEpisode || null,
        score: null,
        genres: [],
        isDirectStream: true,
        source: 'witanime',
        sourceLabel: 'سيرفر Hearbor 1'
      }));
    }

    const list = [];
    const seen = new Set();

    // 1. Add catalog items for all Hearbor servers
    for (const cat of catalogList) {
      const catSource = cat.source || (cat.anime3rbId ? 'anime3rb' : 'witanime');
      if (selectedSource !== 'all' && selectedSource !== catSource) continue;
      const key = `${catSource}:${cat.slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        const sourceLabel = cat.sourceLabel || (
          catSource === 'english' ? 'سيرفر Hearbor 3' :
          catSource === 'anime3rb' ? 'سيرفر Hearbor 2' :
          'سيرفر Hearbor 1'
        );
        list.push({
          id: `cat-${catSource}-${cat.slug}`,
          slug: cat.slug,
          titleEn: cat.titleEn || cat.title || cat.slug,
          titleAr: cat.titleAr || cat.title || cat.titleEn || cat.slug,
          poster: cat.poster,
          banner: cat.banner,
          episodes: cat.episodeCount || cat.episodes || null,
          score: score100(cat.rating || cat.score),
          genres: Array.isArray(cat.genres) ? cat.genres : [],
          isDirectStream: true,
          source: catSource,
          sourceLabel
        });
      }
    }

    // 2. Add latest streaming episodes
    for (const item of latestStreamList) {
      const itemSrc = item.source || 'witanime';
      if (selectedSource !== 'all' && selectedSource !== itemSrc) continue;
      const key = `${itemSrc}:${item.slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        const sourceLabel = item.sourceLabel || (
          itemSrc === 'english' ? 'سيرفر Hearbor 3' :
          itemSrc === 'anime3rb' ? 'سيرفر Hearbor 2' :
          'سيرفر Hearbor 1'
        );
        list.push({
          id: `lat-${itemSrc}-${item.slug}`,
          slug: item.slug,
          titleEn: item.titleEn || item.slug,
          titleAr: item.titleAr || item.titleEn || item.slug,
          poster: item.poster,
          episodes: item.episode || item.episodes || null,
          score: score100(item.rating || item.score),
          genres: Array.isArray(item.genres) ? item.genres : [],
          isDirectStream: true,
          source: itemSrc,
          sourceLabel
        });
      }
    }

    // 3. Add trending items
    if (selectedSource === 'all' || selectedSource === 'witanime') {
      for (const a of trendingList) {
        const titleRom = (a.titleRomaji || '').toLowerCase();
        const titleEng = (a.titleEnglish || '').toLowerCase();
        const matchedStream = latestStreamList.find((st) => {
          const stL = (st.titleEn || '').toLowerCase();
          return stL && (titleRom.includes(stL) || stL.includes(titleRom) || titleEng.includes(stL));
        });

        const slugKey = `wita:${matchedStream?.slug || a.id}`;
        if (seen.has(slugKey)) continue;
        seen.add(slugKey);

        list.push({
          id: `tr-${a.id}`,
          aniId: a.id,
          slug: matchedStream?.slug || null,
          searchTitle: a.titleRomaji || a.titleEnglish,
          titleEn: a.titleEnglish || a.titleRomaji,
          titleAr: a.titleArabic || matchedStream?.titleAr || a.titleEnglish || a.titleRomaji,
          poster: a.coverUrl || matchedStream?.poster,
          banner: a.bannerUrl,
          episodes: a.episodes || matchedStream?.episode || null,
          score: score100(a.score),
          genres: Array.isArray(a.genres) ? a.genres : [],
          isDirectStream: Boolean(matchedStream?.slug),
          isMalOnly: !matchedStream?.slug,
          source: matchedStream?.slug ? 'witanime' : 'blackx-index',
          sourceLabel: matchedStream?.slug ? 'سيرفر Hearbor 1' : '📋 فهرس Hearbor'
        });
      }

      // 4. Add random & seasonal anime
      for (const rnd of randomScraperList) {
        const slugKey = `wita:${rnd.slug || rnd.name}`;
        if (seen.has(slugKey)) continue;
        seen.add(slugKey);
        list.push({
          id: `rnd-${rnd.slug || rnd.name}`,
          slug: rnd.slug || null,
          searchTitle: rnd.titleEn || rnd.name,
          titleEn: rnd.titleEn || rnd.name || rnd.slug,
          titleAr: rnd.titleAr || rnd.name || rnd.titleEn || rnd.slug,
          poster: rnd.poster || rnd.img || rnd.src,
          episodes: rnd.episodes || null,
          score: score100(rnd.rating || rnd.score),
          genres: Array.isArray(rnd.genres) ? rnd.genres : [],
          isDirectStream: Boolean(rnd.slug),
          isMalOnly: false,
          isRandomPick: true,
          source: 'witanime',
          sourceLabel: '🎲 أنمي مقترح Hearbor'
        });
      }
    }

    let filtered = list;
    if (selectedGenre !== 'all') {
      filtered = list.filter((it) =>
        (it.genres || []).some((g) => String(g).toLowerCase() === selectedGenre.toLowerCase())
      );
    }

    if (activeFilter === 'top') {
      filtered = [...filtered].sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (activeFilter === 'random') {
      const randomOnly = filtered.filter((it) => it.isRandomPick);
      filtered = randomOnly.length ? randomOnly : [...filtered].sort(() => Math.random() - 0.5);
    }

    return filtered;
  }, [searchResults, activeFilter, selectedSource, catalogList, latestStreamList, trendingList, randomScraperList, selectedGenre, subscribedSlugs]);

  const handleOpenAnime = async (item) => {
    const srcQuery =
      item.source && item.source !== 'all' && item.source !== 'blackx-index' && item.source !== 'myanimelist'
        ? `?source=${item.source}`
        : '';
    if (item.slug && !String(item.slug).startsWith('ani-')) {
      navigate(`/show/${item.slug}${srcQuery}`);
      return;
    }

    // Resolve streaming slug via /api/stream/search (checking both items and results)
    setResolvingSlugId(item.id);
    try {
      const q = item.searchTitle || item.titleEn || '';
      const res = await api.get(`/api/stream/search?q=${encodeURIComponent(q)}`);
      const candidates = res?.items || res?.results || [];
      const matched =
        candidates.find(
          (c) =>
            isMatchingAnimeTitle(item.titleEn, c) ||
            isMatchingAnimeTitle(item.searchTitle, c)
        ) || null;

      if (matched?.slug) {
        if (matched.source === 'english') {
          pushToast(
            lang === 'ar'
              ? `🌐 جاري فتح "${item.titleAr || item.titleEn}" عبر سيرفر Hearbor 3 مع الترجمة العربية الفورية AI!`
              : `🌐 Opening "${item.titleEn}" via Hearbor Server 3 with Instant Arabic AI Subtitles!`,
            'success'
          );
        }
        const matchedSrc =
          matched.source && matched.source !== 'witanime' && matched.source !== 'all'
            ? `?source=${matched.source}`
            : '';
        navigate(`/show/${matched.slug}${matchedSrc}`);
        return;
      }

      setUnmatchedMalIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      pushToast(
        lang === 'ar'
          ? `📋 الأنمي "${item.titleAr || item.titleEn}" غير متوفر له حلقات بث مباشر حالياً على سيرفرات Hearbor.`
          : `📋 "${item.titleEn}" is not currently available on Hearbor streaming servers.`,
        'info'
      );
    } catch {
      setUnmatchedMalIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      pushToast(
        lang === 'ar'
          ? `📋 الأنمي "${item.titleAr || item.titleEn}" غير متوفر حالياً في سيرفرات المشاهدة.`
          : `📋 "${item.titleEn}" is not currently available on streaming servers.`,
        'info'
      );
    } finally {
      setResolvingSlugId(null);
    }
  };

  const handleToggleAlert = async (e, item) => {
    e.stopPropagation();
    const targetSlug = item.slug || String(item.titleEn || 'anime').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await toggleAnimeEpisodeAlert(
      {
        slug: targetSlug,
        titleAr: item.titleAr || item.titleEn,
        titleEn: item.titleEn,
        poster: item.poster,
        latestEpisode: item.episodes || 1
      },
      lang
    );
    refreshSubs();
  };

  return (
    <div className="bx-trending-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
      {/* Official slothUI Pro 2.0 Hero Banner & Dedicated Anime Search Engine */}
      <section
        className="glass bx-trending-hero sloth-pro-hero"
        style={{
          padding: '2.2rem 2rem',
          borderRadius: '28px',
          background: '#050508',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 28px 70px rgba(0, 0, 0, 0.94)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.3rem 0.85rem 0.3rem 0.42rem',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.24)',
                color: '#ffffff',
                fontSize: '0.76rem',
                fontWeight: 900,
                marginBottom: '0.65rem'
              }}
            >
              <img
                src="/blackx-logo.png"
                alt="Hearbor"
                style={{ width: '22px', height: '22px', borderRadius: '6px', objectFit: 'cover' }}
              />
              <span>
                Hearbor{' '}
                <span style={{ fontWeight: 500, opacity: 0.78 }}>
                  {animeTotal ? `original • ${formatCount(animeTotal)} ANIME` : 'original'}
                </span>
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 'clamp(1.75rem, 3.2vw, 2.45rem)', fontWeight: 900 }}>
              🔥 {lang === 'ar' ? 'الأعمال الرائجة ومكتبة الأنمي الشاملة' : 'Trending & Complete Anime Hub'}
            </h1>
            <p style={{ margin: '0.45rem 0 0', color: 'rgba(255,255,255,0.72)', fontSize: '0.94rem', maxWidth: '680px', lineHeight: 1.6 }}>
              {lang === 'ar'
                ? 'استكشف أقوى أعمال الأنمي الرائجة عالمياً مع محرك بحث فوري، وفعل إشعارات الحلقات الجديدة لتصلك مباشرة على هاتفك أو جهاز الكمبيوتر فور نزولها!'
                : 'Explore top trending anime with an instant search engine, and enable real-time Phone/PC episode notifications!'}
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              const sample = unifiedAnime[0] || {
                titleAr: 'سولو ليفلينج (Solo Leveling)',
                titleEn: 'Solo Leveling',
                poster: '/blackx-logo.png',
                slug: 'solo-leveling'
              };
              const ok = await sendNativeDeviceNotification({
                title: lang === 'ar' ? `🎬 حلقة جديدة متوفرة الآن: ${sample.titleAr}` : `🎬 New Episode Live: ${sample.titleEn}`,
                body:
                  lang === 'ar'
                    ? 'الحلقة الجديدة متاحة الآن للمشاهدة الفورية لمشتركي VIP بجودة FHD 1080p على Hearbor!'
                    : 'The new episode is now streaming in FHD 1080p on Hearbor!',
                icon: sample.poster || '/blackx-logo.png',
                url: sample.slug ? `/show/${sample.slug}` : '/trending'
              });
              if (ok) {
                pushToast(
                  lang === 'ar'
                    ? '📲 تم إرسال إشعار حقيقي إلى شاشة هاتفك / جهاز الكمبيوتر بنجاح!'
                    : '📲 Sent a real native notification to your Phone/PC!',
                  'success'
                );
              } else {
                pushToast(
                  lang === 'ar'
                    ? '🔔 يرجى السماح بإشعارات المتصفح من شريط العنوان لتظهر الإشعارات على شاشة هاتفك/جهازك!'
                    : '🔔 Please allow browser notifications in the address bar!',
                  'info'
                );
              }
            }}
            style={{
              background: '#ffffff',
              color: '#000000',
              border: '1.5px solid #ffffff',
              fontWeight: 900,
              padding: '0.72rem 1.35rem',
              borderRadius: '999px',
              boxShadow: '0 8px 24px rgba(255,255,255,0.22)',
              cursor: 'pointer'
            }}
          >
            🔔 {lang === 'ar' ? 'تجربة إشعار حلقة على جهازك الآن' : 'Test Device Notification Now'}
          </button>
        </div>

        {/* Release Policy & VIP FHD Banner (Pure Monochrome slothUI Pro) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            padding: '0.75rem 1.15rem',
            borderRadius: '20px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.18)'
          }}
        >
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff' }}>
            {isVip
              ? (lang === 'ar'
                  ? '👑 امتيازات VIP مفعّلة لك: الحلقات الرسمية تنزل لك فور صدورها في نفس اليوم + مشاهدة وتحميل بجودة FHD 1080p!'
                  : '👑 VIP Active: Same-day official episodes + FHD 1080p streaming & downloads unlocked!')
              : (lang === 'ar'
                  ? '⏳ نظام العرض الرسمي: الحلقات الجديدة تنزل لمشتركي VIP في يوم صدورها • سيرفرات FHD 1080p متاحة عبر Hearbor.'
                  : '⏳ Official Release Policy: New episodes drop on release day for VIP • FHD 1080p on Hearbor.')}
          </span>
          {!isVip && (
            <button
              type="button"
              onClick={() => navigate('/profile?tab=referrals')}
              style={{
                background: '#ffffff',
                color: '#000000',
                border: 'none',
                borderRadius: '999px',
                padding: '0.45rem 1.05rem',
                fontWeight: 900,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              👑 {lang === 'ar' ? 'اشترك في VIP الآن (99 ج.م)' : 'Get VIP Now (99 EGP)'}
            </button>
          )}
        </div>
      </section>

      <div className="glass" style={{ padding: '0.85rem', borderRadius: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.7rem' }}>
          {[
            { id: 'all', ar: 'جميع سيرفرات Hearbor', en: 'All Hearbor Servers' },
            { id: 'witanime', ar: 'Hearbor 1', en: 'Hearbor 1' },
            { id: 'anime3rb', ar: 'Hearbor 2', en: 'Hearbor 2' },
            { id: 'english', ar: 'Hearbor 3', en: 'Hearbor 3' },
            { id: 'aniproject', ar: 'Hearbor 4 (بحث فقط)', en: 'Hearbor 4 (Search only)', disabled: !serverFourEnabled }
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={option.disabled}
              title={option.disabled ? (lang === 'ar' ? 'يتطلب إعداد ANIPROJECT_API_URL' : 'Set ANIPROJECT_API_URL to enable') : undefined}
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                if (option.id === 'all') next.delete('source');
                else next.set('source', option.id);
                setSearchParams(next);
              }}
              style={{
                background: selectedSource === option.id ? '#fff' : 'rgba(255,255,255,0.07)',
                color: selectedSource === option.id ? '#000' : '#fff',
                border: '1px solid rgba(255,255,255,0.26)', borderRadius: '99px',
                padding: '0.4rem 0.75rem', fontSize: '0.76rem', fontWeight: 800,
                opacity: option.disabled ? 0.48 : 1, cursor: option.disabled ? 'not-allowed' : 'pointer'
              }}
            >
              {lang === 'ar' ? option.ar : option.en}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
          const next = new URLSearchParams(searchParams);
          if (query.trim()) next.set('q', query.trim());
          else next.delete('q');
          setSearchParams(next);
        }} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={lang === 'ar' ? 'بحث في الأنمي' : 'Search anime'}
            placeholder={lang === 'ar' ? 'ابحث عن أنمي بالعنوان...' : 'Search anime by title...'}
            style={{ flex: 1, minWidth: 0, background: '#090909', color: '#fff', border: '1px solid #555', borderRadius: '10px', padding: '0.55rem 0.7rem' }}
          />
          <button type="submit" className="btn btn--primary btn--sm">
            {lang === 'ar' ? 'بحث' : 'Search'}
          </button>
        </form>
        {selectedSource === 'aniproject' && (
          <p style={{ margin: '0.6rem 0 0', color: 'var(--ink-dim)', fontSize: '0.8rem' }}>
            {!serverFourEnabled
              ? (lang === 'ar' ? 'مصدر Hearbor 4 غير مفعّل؛ أضف ANIPROJECT_API_URL إلى إعدادات الخادم.' : 'Hearbor 4 is not configured; set ANIPROJECT_API_URL on the server.')
              : (lang === 'ar' ? 'هذا المصدر يدعم البحث بالعنوان، ولا يقدّم أحدث الحلقات أو فهرساً كاملاً.' : 'This source supports title search, not a latest-episode or full-catalog feed.')}
          </p>
        )}
      </div>

      {/* Active Unified Search / Filter Status Pill (only shown when filtered via Unified Search Window) */}
      {(query || selectedSource !== 'all' || selectedGenre !== 'all' || activeFilter !== 'trending') && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.6rem',
            padding: '0.65rem 1rem',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.18)'
          }}
        >
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff' }}>
            {lang === 'ar'
              ? `نتائج مفلترة من نافذة البحث الشاملة ${query ? `• "${query}"` : ''}`
              : `Filtered via Unified Search ${query ? `• "${query}"` : ''}`}
          </span>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSearchResults(null);
              setSelectedSource('all');
              setSelectedGenre('all');
              setActiveFilter('trending');
              setSearchParams({}, { replace: true });
            }}
            style={{
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              borderRadius: '999px',
              padding: '0.32rem 0.9rem',
              fontSize: '0.75rem',
              fontWeight: 900,
              cursor: 'pointer'
            }}
          >
            {lang === 'ar' ? 'إلغاء الفلتر ✕' : 'Reset Filter ✕'}
          </button>
        </div>
      )}

      {/* Anime Cards Grid */}
      {loading || searching ? (
        <SkeletonGrid count={12} />
      ) : unifiedAnime.length === 0 ? (
        <div className="glass" style={{ padding: '2.5rem' }}>
          <EmptyState
            icon="🎬"
            title={selectedSource === 'aniproject' && !query
              ? (lang === 'ar' ? 'ابحث عن عنوان أنمي في سيرفر Hearbor 4' : 'Search for an anime title on Hearbor 4')
              : (lang === 'ar' ? 'لا توجد أنميات مطابقة لبحثك حالياً' : 'No matching anime found')}
            sub={selectedSource === 'aniproject'
              ? (lang === 'ar' ? 'هذا المصدر لا يوفّر قائمة تصفح؛ استخدم مربع البحث بالأعلى.' : 'This source has no browse feed; use the search box above.')
              : (lang === 'ar' ? 'جرب البحث بكلمة أخرى أو تصفح قائمة الأكثر رواجاً' : 'Try another keyword or browse Trending Now')}
          />
        </div>
      ) : (
        <div
          className="bx-anime-cards-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '1.35rem'
          }}
        >
          {unifiedAnime.map((item) => {
            const targetSlug = item.slug || String(item.titleEn || 'anime').toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const isSub = subscribedSlugs.has(targetSlug) || isAnimeEpisodeAlertEnabled(targetSlug);
            const isResolving = resolvingSlugId === item.id;
            const isMalOnly = Boolean(item.isMalOnly);
            const isVerifiedUnavailable = unmatchedMalIds.has(item.id);

            return (
              <article
                key={item.id}
                onClick={() => handleOpenAnime(item)}
                className="glass glass-hover bx-anime-card"
                style={{
                  borderRadius: '18px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  border: isVerifiedUnavailable
                    ? '1px solid rgba(239, 68, 68, 0.45)'
                    : isMalOnly
                    ? '1px solid rgba(168, 85, 247, 0.4)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  transition: 'transform 0.22s ease, border-color 0.22s ease'
                }}
              >
                <div style={{ position: 'relative', aspectRatio: '2 / 2.85', width: '100%', background: '#090d18', overflow: 'hidden' }}>
                  {item.poster && (
                    <img
                      onError={imgFallback}
                      src={item.poster}
                      alt={item.titleEn}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}

                  {/* Top Badges */}
                  <div style={{ position: 'absolute', top: '8px', insetInlineStart: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {isVerifiedUnavailable ? (
                      <span
                        style={{
                          padding: '0.22rem 0.58rem',
                          borderRadius: '8px',
                          background: 'rgba(127, 29, 29, 0.92)',
                          border: '1px solid rgba(248, 113, 113, 0.7)',
                          color: '#fecaca',
                          fontSize: '0.68rem',
                          fontWeight: 900
                        }}
                      >
                        🚫 {lang === 'ar' ? 'غير متوفر • Hearbor' : 'Unavailable • Hearbor'}
                      </span>
                    ) : isMalOnly ? (
                      <span
                        style={{
                          padding: '0.22rem 0.58rem',
                          borderRadius: '8px',
                          background: 'rgba(46, 16, 101, 0.92)',
                          border: '1px solid rgba(192, 132, 252, 0.7)',
                          color: '#e9d5ff',
                          fontSize: '0.68rem',
                          fontWeight: 900
                        }}
                      >
                        📋 {lang === 'ar' ? 'فهرس Hearbor' : 'Hearbor Index'}
                      </span>
                    ) : item.source === 'aniproject' ? (
                      <span style={{ padding: '0.2rem 0.55rem', borderRadius: '8px', background: '#111', border: '1px solid #aaa', color: '#fff', fontSize: '0.68rem', fontWeight: 900 }}>
                        Hearbor 4
                      </span>
                    ) : (
                      // The real server name. (It said «👑 FHD 1080p VIP» on every title: the card does
                      // not know the qualities, and streaming is the same for VIP and free accounts.)
                      <span style={{ padding: '0.2rem 0.55rem', borderRadius: '8px', background: '#111', border: '1px solid #aaa', color: '#fff', fontSize: '0.68rem', fontWeight: 900 }}>
                        {String(item.sourceLabel || '').replace(/^سيرفر\s+/, '') || 'Hearbor'}
                      </span>
                    )}
                    <span
                      style={{
                        padding: '0.18rem 0.5rem',
                        borderRadius: '8px',
                        background: isMalOnly
                          ? 'rgba(15, 23, 42, 0.9)'
                          : isVip
                          ? 'rgba(16, 185, 129, 0.88)'
                          : 'rgba(15, 23, 42, 0.88)',
                        color: '#fff',
                        fontSize: '0.65rem',
                        fontWeight: 800
                      }}
                    >
                      {isVerifiedUnavailable
                        ? (lang === 'ar' ? '📋 غير مدرج بالسيرفرات' : '📋 Not on Servers')
                        : isMalOnly
                        ? (lang === 'ar' ? '🔍 اضغط لفحص توفره' : '🔍 Tap to Check Stream')
                        : item.source === 'aniproject'
                        ? (lang === 'ar' ? '▶ عرض الحلقات المتاحة' : '▶ View available episodes')
                        : isVip
                        ? (lang === 'ar' ? '⚡ يعرض فور نزوله' : '⚡ Same-Day VIP')
                        : (lang === 'ar' ? '⏳ +24س للمجاني' : '⏳ 24h Free Delay')}
                    </span>
                  </div>

                  {item.score != null && (
                    <span style={{
                      position: 'absolute', top: '8px', insetInlineEnd: '8px',
                      padding: '0.2rem 0.5rem', borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.82)', color: '#fbbf24',
                      fontSize: '0.74rem', fontWeight: 900
                    }}>
                      ★ {(item.score / 10).toFixed(1)}
                    </span>
                  )}

                  {/* Bell Alert Quick Toggle Button on Card */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleAlert(e, item)}
                    title={lang === 'ar' ? 'تفعيل إشعارات الحلقات الجديدة على هاتفك/جهازك' : 'Enable Device Episode Notifications'}
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      insetInlineEnd: '8px',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '99px',
                      border: isSub ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.25)',
                      background: isSub ? 'rgba(16, 185, 129, 0.92)' : 'rgba(8, 11, 22, 0.85)',
                      color: '#fff',
                      fontSize: '0.72rem',
                      fontWeight: 900,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.5)'
                    }}
                  >
                    {isSub ? (lang === 'ar' ? '🔔 مفعّل ✓' : '🔔 On ✓') : (lang === 'ar' ? '📲 إشعارني' : '📲 Notify')}
                  </button>
                </div>

                <div style={{ padding: '0.9rem', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', gap: '0.55rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginBottom: '0.35rem' }}>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 900,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '6px',
                          background: isVerifiedUnavailable
                            ? 'rgba(239, 68, 68, 0.22)'
                            : isMalOnly
                            ? 'rgba(168, 85, 247, 0.22)'
                            : item.source === 'anime3rb'
                            ? 'rgba(245, 158, 11, 0.22)'
                            : item.source === 'english'
                            ? 'rgba(16, 185, 129, 0.22)'
                            : 'rgba(34, 211, 238, 0.22)',
                          color: isVerifiedUnavailable
                            ? '#fca5a5'
                            : isMalOnly
                            ? '#d8b4fe'
                            : item.source === 'anime3rb'
                            ? '#fde047'
                            : item.source === 'english'
                            ? '#6ee7b7'
                            : '#38bdf8',
                          border: isVerifiedUnavailable
                            ? '1px solid rgba(239, 68, 68, 0.5)'
                            : isMalOnly
                            ? '1px solid rgba(168, 85, 247, 0.5)'
                            : item.source === 'anime3rb'
                            ? '1px solid rgba(245, 158, 11, 0.5)'
                            : item.source === 'english'
                            ? '1px solid rgba(16, 185, 129, 0.5)'
                            : '1px solid rgba(34, 211, 238, 0.5)'
                        }}
                      >
                        {isVerifiedUnavailable
                          ? (lang === 'ar' ? '🚫 غير متوفر (Hearbor)' : '🚫 Unavailable (Hearbor)')
                          : isMalOnly
                          ? (lang === 'ar' ? '📋 فهرس Hearbor' : '📋 Hearbor Index')
                          : item.source === 'anime3rb'
                          ? '⚡ سيرفر Hearbor 2'
                          : item.source === 'english'
                          ? '🌐 سيرفر Hearbor 3'
                          : item.source === 'aniproject'
                          ? 'سيرفر Hearbor 4'
                          : '👑 سيرفر Hearbor 1'}
                      </span>
                      {item.episodes && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--ink-dim)', fontWeight: 800 }}>
                          🎬 {formatNumber(item.episodes)} {lang === 'ar' ? 'حلقة' : 'EP'}
                        </span>
                      )}
                    </div>

                    <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#fff', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {lang === 'ar' ? (item.titleAr || item.titleEn) : item.titleEn}
                    </h3>
                  </div>

                  <button
                    type="button"
                    className={`btn ${isVerifiedUnavailable ? 'btn--ghost' : 'btn--primary'} btn--sm`}
                    style={{ width: '100%', justifyContent: 'center', fontWeight: 800, fontSize: '0.78rem' }}
                  >
                    {isResolving
                      ? (lang === 'ar' ? '⏳ جارٍ فحص السيرفرات...' : '⏳ Checking Servers...')
                      : isVerifiedUnavailable
                      ? (lang === 'ar' ? '🚫 غير متوفر • فهرس Hearbor' : '🚫 Unavailable • Hearbor')
                      : isMalOnly
                      ? (lang === 'ar' ? '🔍 فحص التوفر (Hearbor)' : '🔍 Check Stream (Hearbor)')
                      : (lang === 'ar' ? '▶ مشاهدة الحلقات' : '▶ Watch Episodes')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination for sources that actually expose a catalog. */}
      {!loading && !searching && searchResults === null && activeFilter !== 'alerts' && hasNextCatalogPage && (
        <div
          className="glass"
          style={{
            marginTop: '1.5rem',
            padding: '1.25rem',
            borderRadius: '18px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            background: '#000000'
          }}
        >
          <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'rgba(255, 255, 255, 0.78)' }}>
            {totalCatalogCount
              ? lang === 'ar'
                ? `📚 تم تحميل ${formatNumber(unifiedAnime.length)} عمل • إجمالي الفهرس الذي يعلنه المصدر: ${formatNumber(totalCatalogCount)}`
                : `📚 ${formatNumber(unifiedAnime.length)} loaded • source-reported catalog total: ${formatNumber(totalCatalogCount)}`
              : lang === 'ar'
                ? `📚 تم تحميل ${formatNumber(unifiedAnime.length)} عمل`
                : `📚 ${formatNumber(unifiedAnime.length)} loaded`}
          </div>
          <button
            type="button"
            className="btn btn--primary"
            disabled={loadingMore}
            onClick={handleLoadMoreCatalog}
            style={{
              padding: '0.75rem 2.2rem',
              borderRadius: '14px',
              fontWeight: 900,
              fontSize: '0.92rem'
            }}
          >
            {loadingMore
              ? (lang === 'ar' ? '⏳ جاري تحميل المزيد من الأنميات...' : '⏳ Loading More Anime...')
              : (lang === 'ar' ? '➕ عرض المزيد من الأنميات' : '➕ Load More Anime')}
          </button>
        </div>
      )}
    </div>
  );
}
