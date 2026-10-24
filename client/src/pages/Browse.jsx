import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api, resolveApiUrl } from '../api.js';
import { Modal } from '../components/Modals.jsx';
import { SkeletonGrid, EmptyState, LiquidLoader } from '../components/Loading.jsx';
import { pushToast, imgFallback } from '../hooks/hooks.js';
import MangaNovelReader from '../components/MangaNovelReader.jsx';
import { ANILIST_EXCLUSION_ARGS, hasBlockedGenre } from '../../../shared/contentFilter.js';

export default function Browse() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const initialFilter = searchParams.get('filter') || 'ALL';
  const initialServer = searchParams.get('server') || 'all';

  const [filter, setFilter] = useState(initialFilter); // ALL | MANHWA | MANGA | MANHUA | TOP_RATED | ONGOING | COMPLETED
  const [serverFilter, setServerFilter] = useState(initialServer); // all | bx1 | bx2 | bx3 | bx4
  const [serverFourEnabled, setServerFourEnabled] = useState(false);
  const [query, setQuery] = useState(initialQ);
  const [libraryItems, setLibraryItems] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchingLive, setSearchingLive] = useState(false);
  const [liveSearchResults, setLiveSearchResults] = useState(null);

  useEffect(() => {
    const qParam = searchParams.get('q') || '';
    const fltParam = searchParams.get('filter') || 'ALL';
    const srvParam = searchParams.get('server') || 'all';
    setQuery(qParam);
    setFilter(fltParam);
    setServerFilter(srvParam);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    api.get('/api/stream/sources')
      .then((data) => { if (active) setServerFourEnabled(data?.sources?.some((s) => s.id === 'aniproject') || false); })
      .catch(() => { if (active) setServerFourEnabled(false); });
    return () => { active = false; };
  }, []);

  const safeCover = useCallback((url) => {
    if (!url) return '/blackx-logo.png';
    if (/(lekmanga|azorafly|azoramoon|appswat|meshmanga|dilar\.tube|mangamello)/i.test(url)) {
      return resolveApiUrl(`/api/proxy/image?url=${encodeURIComponent(url)}`);
    }
    return url;
  }, []);

  // Selected item for chapter modal
  const [selectedItem, setSelectedItem] = useState(null);
  const [loadingItemDetails, setLoadingItemDetails] = useState(false);
  const [itemChapters, setItemChapters] = useState([]);
  const [itemServers, setItemServers] = useState([]);
  const [modalServer, setModalServer] = useState('bx1');
  const [loggingRead, setLoggingRead] = useState(false);

  // Active item and chapter for reading in MangaNovelReader
  const [readerItem, setReaderItem] = useState(null);

  // Server tabs configuration (Exclusive Hearbor Branding)
  const serverTabs = [
    { id: 'all', labelAr: '🌐 جميع سيرفرات Hearbor', labelEn: '🌐 All Hearbor Servers' },
    { id: 'bx1', labelAr: '⚡ سيرفر Hearbor 1 (مانهوا عربية)', labelEn: '⚡ Hearbor 1 (AR Manhwa)' },
    { id: 'bx2', labelAr: '📖 سيرفر Hearbor 2 (مانجا عربية)', labelEn: '📖 Hearbor 2 (AR Manga)' },
    { id: 'bx3', labelAr: '👑 سيرفر Hearbor 3 (الفهرس العالمي)', labelEn: '👑 Hearbor 3 (Global Index)' },
    { id: 'bx4', labelAr: '🔎 سيرفر Hearbor 4 (بحث فقط)', labelEn: '🔎 Hearbor 4 (Search only)', disabled: !serverFourEnabled }
  ];

  // Filter chips configuration (including Korean Manhwa, Japanese Manga, Chinese Manhua)
  const filterChips = [
    { id: 'ALL', labelAr: '🌟 الكل', labelEn: '🌟 All' },
    { id: 'MANHWA', labelAr: '🇰🇷 مانهوا كورية (Manhwa)', labelEn: '🇰🇷 Korean Manhwa' },
    { id: 'MANGA', labelAr: '🇯🇵 مانجا يابانية (Manga)', labelEn: '🇯🇵 Japanese Manga' },
    { id: 'MANHUA', labelAr: '🇨🇳 مانهاوا صينية (Manhua)', labelEn: '🇨🇳 Chinese Manhua' },
    { id: 'TOP_RATED', labelAr: '⭐ الأعلى تقييماً', labelEn: '⭐ Top Rated' },
    { id: 'ONGOING', labelAr: '⌛ مستمرة', labelEn: '⌛ Ongoing' },
    { id: 'COMPLETED', labelAr: '✔ مكتملة', labelEn: '✔ Completed' }
  ];

  // Direct AniList Master Global Index helper (+100,000 Manga/Manhwa/Manhua works with synonym support)
  const fetchAniListMasterClient = useCallback(async (pageNum = 1, country = null, searchQ = '') => {
    try {
      const gql = `
        query ($page: Int, $perPage: Int, $countryOfOrigin: CountryCode, $search: String, $sort: [MediaSort]) {
          Page(page: $page, perPage: $perPage) {
            media(type: MANGA, countryOfOrigin: $countryOfOrigin, search: $search, sort: $sort, isAdult: false, ${ANILIST_EXCLUSION_ARGS}) {
              id
              title { romaji english native }
              synonyms
              countryOfOrigin
              status
              chapters
              averageScore
              genres
              tags { name }
              description(asHtml: false)
              coverImage { extraLarge large }
              bannerImage
            }
          }
        }
      `;
      const variables = {
        page: pageNum,
        perPage: 24,
        sort: searchQ ? ['SEARCH_MATCH', 'POPULARITY_DESC'] : ['POPULARITY_DESC', 'TRENDING_DESC']
      };
      if (country) variables.countryOfOrigin = country;
      if (searchQ) variables.search = searchQ;
      const resp = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: gql, variables })
      });
      if (!resp.ok) return [];
      const json = await resp.json();
      // Ecchi / Harem / Isekai are hidden from Hearbor (shared/contentFilter.js).
      const media = (json?.data?.Page?.media || []).filter((m) => !hasBlockedGenre(m.genres, m.tags));
      return media.map((m) => {
        const titleEn = m.title?.english || m.title?.romaji || m.title?.native || `Manga #${m.id}`;
        const c = String(m.countryOfOrigin || 'JP').toUpperCase();
        const typeLabel = c === 'KR' ? 'MANHWA' : c === 'CN' || c === 'TW' ? 'MANHUA' : 'MANGA';
        const poster = m.coverImage?.extraLarge || m.coverImage?.large || '/blackx-logo.png';
        const desc = String(m.description || '').replace(/<[^>]+>/g, '').trim();
        return {
          id: `al:${m.id}`,
          mangalikSlug: `al:${m.id}`,
          title_ar: titleEn,
          title_en: titleEn,
          synonyms: [m.title?.english, m.title?.romaji, ...(m.synonyms || [])].filter(Boolean),
          type: typeLabel,
          poster,
          banner: m.bannerImage || poster,
          // Unknown stays unknown: no invented author, rating, chapter count or genre.
          author: '',
          rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : null,
          description_ar: desc,
          description_en: desc,
          chapters_count: m.chapters || null,
          status: m.status === 'FINISHED' ? 'COMPLETED' : 'ONGOING',
          genres: Array.isArray(m.genres) ? m.genres : [],
          source: 'Hearbor 3',
          server: 'bx3'
        };
      });
    } catch {
      return [];
    }
  }, []);

  // Fetch trending items from server + Master Global Index
  const loadLibrary = useCallback(async (srv = serverFilter) => {
    setLoading(true);
    setPage(1);
    try {
      const tasks = [api.get(`/api/content/library?type=ALL&server=${encodeURIComponent(srv)}&page=1`).catch(() => ({ items: [] }))];
      if (srv === 'all' || srv === 'bx3') {
        tasks.push(fetchAniListMasterClient(1, 'KR'));
        tasks.push(fetchAniListMasterClient(1, 'JP'));
        tasks.push(fetchAniListMasterClient(1, 'CN'));
      }
      const [res, krList = [], jpList = [], cnList = []] = await Promise.all(tasks);
      const baseItems = res?.items || [];
      const seenTitles = new Set(baseItems.map((x) => String(x.title_en || x.title_ar || '').toLowerCase().trim()));
      const merged = [...baseItems];
      for (const extra of [...krList, ...jpList, ...cnList]) {
        const key = String(extra.title_en || '').toLowerCase().trim();
        if (key && !seenTitles.has(key)) {
          seenTitles.add(key);
          merged.push(extra);
        }
      }
      setLibraryItems(merged);
    } catch {
      setLibraryItems([]);
    } finally {
      setLoading(false);
    }
  }, [serverFilter, fetchAniListMasterClient]);

  const loadMoreLibrary = useCallback(async () => {
    if (loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const tasks = [
        api.get(`/api/content/library?type=ALL&server=${encodeURIComponent(serverFilter)}&page=${nextPage}`).catch(() => ({ items: [] }))
      ];
      if (serverFilter === 'all' || serverFilter === 'bx3') {
        tasks.push(fetchAniListMasterClient(nextPage, 'KR'));
        tasks.push(fetchAniListMasterClient(nextPage, 'JP'));
        tasks.push(fetchAniListMasterClient(nextPage, 'CN'));
      }
      const [res, krList = [], jpList = [], cnList = []] = await Promise.all(tasks);
      const nextItems = [...(res?.items || []), ...krList, ...jpList, ...cnList];
      if (nextItems.length > 0) {
        setPage(nextPage);
        setLibraryItems((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...nextItems.filter((x) => !seen.has(x.id))];
        });
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, page, serverFilter, fetchAniListMasterClient]);

  useEffect(() => {
    loadLibrary(serverFilter);
  }, [loadLibrary, serverFilter]);

  // Live search against all 8 Hearbor engines + AniList Master Global Index
  const handleSearch = useCallback(async (e, srvOverride, customQuery) => {
    e?.preventDefault?.();
    const q = (customQuery !== undefined ? customQuery : query).trim();
    const activeSrv = srvOverride || serverFilter;
    if (!q) {
      setLiveSearchResults(null);
      return;
    }

    setSearchingLive(true);
    try {
      const [res, alHits] = await Promise.all([
        api.get(`/api/search?query=${encodeURIComponent(q)}&type=manga&server=${encodeURIComponent(activeSrv)}`).catch(() => ({})),
        activeSrv === 'all' || activeSrv === 'bx3'
          ? fetchAniListMasterClient(1, null, q) : Promise.resolve([])
      ]);
      const rawList = res?.manga || res?.results || [];
      const mappedServer = rawList.map((r, i) => ({
        id: r.id || r.mangalikSlug || r.slug || `res_${i}`,
        mangalikSlug: r.mangalikSlug || r.id || r.slug,
        title_ar: r.title_ar || r.arabicTitle || r.title || r.romajiTitle,
        title_en: r.title_en || r.englishTitle || r.romajiTitle || r.title || 'Manga',
        type: (r.type || 'MANHWA').toUpperCase(),
        poster:
          r.poster ||
          r.coverImage ||
          r.coverUrl ||
          '/blackx-logo.png',
        banner: r.banner || r.poster || r.coverImage || r.coverUrl,
        author: r.author || '',
        rating: r.rating ?? (r.averageScore ? (r.averageScore / 10).toFixed(1) : null),
        description_ar: r.description_ar || r.description || '',
        description_en: r.description_en || r.description || '',
        chapters_count: r.chapters_count ?? r.chaptersCount ?? null,
        status: r.status || '',
        genres: r.genres || [],
        source: r.source || 'Hearbor',
        server: r.server || 'bx1'
      }));

      const seenIds = new Set(mappedServer.map((m) => m.id));
      const combined = [...mappedServer];
      for (const al of alHits) {
        if (!seenIds.has(al.id)) {
          seenIds.add(al.id);
          combined.push(al);
        }
      }
      setLiveSearchResults(combined);
    } catch {
      setLiveSearchResults([]);
    } finally {
      setSearchingLive(false);
    }
  }, [query, serverFilter, fetchAniListMasterClient]);

  // Automatic debounced live search (380ms) while typing
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setLiveSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      handleSearch(null, serverFilter, q);
    }, 380);
    return () => clearTimeout(timer);
  }, [query, serverFilter, handleSearch]);

  // Filtered display items
  const displayedItems = useMemo(() => {
    let items = liveSearchResults !== null ? [...liveSearchResults] : [...libraryItems];

    switch (filter) {
      case 'MANHWA':
        return items.filter((it) => it.type === 'MANHWA');
      case 'MANGA':
        return items.filter((it) => it.type === 'MANGA');
      case 'MANHUA':
        return items.filter((it) => it.type === 'MANHUA');
      case 'TOP_RATED':
        return [...items].sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
      case 'ONGOING':
        return items.filter((it) => String(it.status).toUpperCase().includes('ONGOING') || String(it.status).includes('مستمر'));
      case 'COMPLETED':
        return items.filter((it) => String(it.status).toUpperCase().includes('COMPLETED') || String(it.status).includes('مكتمل'));
      case 'ALL':
      default:
        return items;
    }
  }, [libraryItems, liveSearchResults, filter]);

  // Featured Spotlight item (Solo Leveling or first manhwa in list)
  const spotlightItem = useMemo(() => {
    return (
      libraryItems.find((it) => it.id === 'solo-leveling') ||
      libraryItems.find((it) => it.type === 'MANHWA') ||
      libraryItems[0] ||
      null
    );
  }, [libraryItems]);

  // Open chapter list details modal (supports switching servers)
  const openItemDetails = async (item, preferredSrv = '') => {
    setSelectedItem(item);
    setLoadingItemDetails(true);
    setItemChapters([]);

    const itemId = item.id || item.mangalikSlug;
    const srvParam = preferredSrv || (serverFilter !== 'all' ? serverFilter : item.server || '');

    try {
      const qStr = srvParam ? `?server=${encodeURIComponent(srvParam)}` : '';
      const res = await api.get(`/api/content/library/${encodeURIComponent(itemId)}${qStr}`);
      if (res?.item) {
        setItemChapters(res.item.chapters || []);
        setItemServers(res.item.availableServers || []);
        setModalServer(res.item.activeServer || srvParam || 'bx1');
      } else {
        const chRes = await api.get(`/api/manga/${encodeURIComponent(itemId)}/chapters${qStr}`);
        setItemChapters(chRes.chapters || []);
        setItemServers(chRes.availableServers || []);
        setModalServer(chRes.activeServer || srvParam || 'bx1');
      }
    } catch {
      setItemChapters([]);
    } finally {
      setLoadingItemDetails(false);
    }
  };

  // Launch reader directly
  const launchReader = (item, chapterNum = null, chapterId = null, srv = null) => {
    setReaderItem({
      ...item,
      mangalikSlug: item.mangalikSlug || item.id,
      slug: item.mangalikSlug || item.id,
      title: item.title_ar || item.title_en,
      initialChapterNumber: chapterNum,
      initialChapterId: chapterId,
      initialServer: srv || modalServer || item.server || (serverFilter !== 'all' ? serverFilter : '')
    });
    setSelectedItem(null);
  };

  // Log reading time
  const handleRecordReading = async () => {
    if (!selectedItem) return;
    setLoggingRead(true);
    try {
      const res = await api.post(`/api/content/library/${selectedItem.id}/read`, { minutes: 20 });
      pushToast(
        lang === 'ar'
          ? `✓ تم تسجيل 20 دقيقة قراءة! ارتفع مستواك إلى المستوى ${res.currentLevel} (+200 XP)`
          : `✓ 20 mins read recorded! Current Level ${res.currentLevel} (+200 XP)`,
        'success'
      );
    } catch (err) {
      pushToast(err.message || 'يرجى تسجيل الدخول لحفظ نقاط القراءة', 'error');
    } finally {
      setLoggingRead(false);
    }
  };

  return (
    <div className="library-container" style={{ paddingBlock: '1.25rem' }}>
      {/* Page Header */}
      <div className="page-head reveal" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.3rem)', fontWeight: 900, margin: 0 }}>
            📖 {lang === 'ar' ? 'المكتبة (مانهوا ومانجا)' : 'The Library (Manhwa & Manga)'}
          </h1>
          <span
            style={{
              background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.2), rgba(139, 92, 246, 0.2))',
              border: '1px solid rgba(34, 211, 238, 0.4)',
              color: '#38bdf8',
              fontSize: '0.78rem',
              fontWeight: 800,
              padding: '0.25rem 0.65rem',
              borderRadius: '99px'
            }}
          >
            ⚡ {lang === 'ar' ? 'المصدر الحصري: سيرفرات Hearbor' : 'Source: Hearbor'}
          </span>
        </div>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--ink-dim)', fontSize: '0.94rem' }}>
          {lang === 'ar'
            ? 'تصفح مباشرة أفضل المانهوا الكورية والمانجا اليابانية الرائجة، أو اختر عملك المفضل وابدأ القراءة فوراً بدون الحاجة للبحث!'
            : 'Browse top trending Korean Manhwa and Japanese Manga, and start reading in high resolution with one tap!'}
        </p>
      </div>

      {/* Featured Hero Banner for Top Trending Hit (slothUI Pro 2.0 Monochrome) */}
      {spotlightItem && !query && (
        <div
          className="library-spotlight reveal glass sloth-pro-hero"
          style={{
            position: 'relative',
            borderRadius: '28px',
            overflow: 'hidden',
            marginBottom: '2rem',
            border: '1px solid rgba(255, 255, 255, 0.22)',
            background: '#050508',
            boxShadow: '0 28px 70px rgba(0, 0, 0, 0.94)'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1.5rem',
              padding: 'clamp(1.2rem, 3vw, 2rem)',
              alignItems: 'center'
            }}
          >
            {/* Poster & Badges */}
            <div style={{ position: 'relative', maxWidth: '300px', margin: '0 auto', width: '100%' }}>
              <div
                style={{
                  borderRadius: '24px',
                  overflow: 'hidden',
                  border: '1.5px solid rgba(255, 255, 255, 0.24)',
                  boxShadow: '0 24px 48px rgba(0, 0, 0, 0.92)',
                  aspectRatio: '3/4',
                  position: 'relative'
                }}
              >
                <img
                  onError={imgFallback}
                  src={spotlightItem.poster}
                  alt={spotlightItem.title_en}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: '12px',
                    insetInlineStart: '12px',
                    background: '#ffffff',
                    color: '#000000',
                    fontWeight: 900,
                    fontSize: '0.76rem',
                    padding: '0.26rem 0.72rem',
                    borderRadius: '999px'
                  }}
                >
                  ✦ {lang === 'ar' ? 'مميز' : 'Featured'}
                </span>
                {spotlightItem.rating != null && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '12px',
                      insetInlineEnd: '12px',
                      background: 'rgba(0, 0, 0, 0.85)',
                      border: '1px solid rgba(255,255,255,0.28)',
                      color: '#ffffff',
                      fontWeight: 900,
                      fontSize: '0.82rem',
                      padding: '0.26rem 0.72rem',
                      borderRadius: '999px'
                    }}
                  >
                    ★ {spotlightItem.rating}
                  </span>
                )}
              </div>
            </div>

            {/* Information & Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    padding: '0.2rem 0.65rem 0.2rem 0.35rem',
                    borderRadius: '999px',
                    fontSize: '0.76rem',
                    fontWeight: 900
                  }}
                >
                  <img src="/blackx-logo.png" alt="Hearbor" style={{ width: '18px', height: '18px', borderRadius: '5px', objectFit: 'cover' }} />
                  <span>Hearbor original</span>
                </span>
                <span
                  style={{
                    background: '#ffffff',
                    color: '#000000',
                    border: '1px solid #ffffff',
                    padding: '0.2rem 0.72rem',
                    borderRadius: '999px',
                    fontSize: '0.78rem',
                    fontWeight: 900
                  }}
                >
                  {spotlightItem.type === 'MANHWA' ? '⚡ مانهوا كورية' : '📖 مانجا يابانية'}
                </span>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    padding: '0.2rem 0.72rem',
                    borderRadius: '999px',
                    fontSize: '0.78rem',
                    fontWeight: 800
                  }}
                >
                  {spotlightItem.status}
                </span>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    padding: '0.2rem 0.72rem',
                    borderRadius: '999px',
                    fontSize: '0.78rem',
                    fontWeight: 800
                  }}
                >
                  {spotlightItem.chapters_count != null
                    ? `${spotlightItem.chapters_count} ${lang === 'ar' ? 'فصلاً مترجماً' : 'Chapters'}`
                    : lang === 'ar'
                    ? 'عرض الفصول'
                    : 'View chapters'}
                </span>
              </div>

              <h2 style={{ fontSize: 'clamp(1.4rem, 3.5vw, 2rem)', fontWeight: 900, margin: 0, lineHeight: 1.25 }}>
                {lang === 'ar' ? spotlightItem.title_ar : spotlightItem.title_en}
              </h2>
              <div style={{ color: 'rgba(255,255,255,0.68)', fontSize: '0.9rem', fontWeight: 600 }}>
                {spotlightItem.title_en}
                {spotlightItem.author ? ` · ✍️ ${spotlightItem.author}` : ''}
              </div>

              <p
                style={{
                  color: 'rgba(255,255,255,0.82)',
                  fontSize: '0.9rem',
                  lineHeight: 1.6,
                  margin: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {lang === 'ar' ? spotlightItem.description_ar : spotlightItem.description_en}
              </p>

              {/* Action Buttons (slothUI Pro 2.0 Capsules) */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => launchReader(spotlightItem)}
                  style={{
                    padding: '0.75rem 1.6rem',
                    fontSize: '0.96rem',
                    fontWeight: 900,
                    borderRadius: '999px',
                    background: '#ffffff',
                    color: '#000000',
                    border: '1.5px solid #ffffff',
                    boxShadow: '0 8px 24px rgba(255, 255, 255, 0.22)',
                    cursor: 'pointer'
                  }}
                >
                  📖 {lang === 'ar' ? 'اقرأ الآن (الفصل الأول)' : 'Read Chapter 1'}
                </button>

                <button
                  type="button"
                  onClick={() => openItemDetails(spotlightItem)}
                  style={{
                    padding: '0.75rem 1.35rem',
                    fontSize: '0.92rem',
                    fontWeight: 800,
                    borderRadius: '999px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    border: '1.5px solid rgba(255, 255, 255, 0.25)',
                    cursor: 'pointer'
                  }}
                >
                  📑 {lang === 'ar' ? 'فهرس الفصول والتفاصيل' : 'Chapters & Details'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Source 4 has no catalog feed: its search is available here as well as in the unified search. */}
      <div className="glass" style={{ padding: '0.85rem', marginBottom: '1rem', borderRadius: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.7rem' }}>
          {serverTabs.map((srv) => (
            <button
              key={srv.id}
              type="button"
              disabled={srv.disabled}
              title={srv.disabled ? (lang === 'ar' ? 'يتطلب إعداد ANIPROJECT_API_URL' : 'Set ANIPROJECT_API_URL to enable') : undefined}
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                if (srv.id === 'all') next.delete('server');
                else next.set('server', srv.id);
                setLiveSearchResults(null);
                setSearchParams(next);
              }}
              style={{
                background: serverFilter === srv.id ? '#fff' : 'rgba(255,255,255,0.07)',
                color: serverFilter === srv.id ? '#000' : '#fff',
                border: '1px solid rgba(255,255,255,0.26)', borderRadius: '99px',
                padding: '0.4rem 0.75rem', fontSize: '0.76rem', fontWeight: 800,
                opacity: srv.disabled ? 0.48 : 1, cursor: srv.disabled ? 'not-allowed' : 'pointer'
              }}
            >
              {lang === 'ar' ? srv.labelAr : srv.labelEn}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => {
          handleSearch(e);
          const next = new URLSearchParams(searchParams);
          if (query.trim()) next.set('q', query.trim());
          else next.delete('q');
          setSearchParams(next);
        }} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={lang === 'ar' ? 'بحث في المانجا' : 'Search manga'}
            placeholder={lang === 'ar' ? 'ابحث عن مانجا بالعنوان...' : 'Search manga by title...'}
            style={{ flex: 1, minWidth: 0, background: '#090909', color: '#fff', border: '1px solid #555', borderRadius: '10px', padding: '0.55rem 0.7rem' }}
          />
          <button type="submit" className="btn btn--primary btn--sm">
            {lang === 'ar' ? 'بحث' : 'Search'}
          </button>
        </form>
        {serverFilter === 'bx4' && (
          <p style={{ margin: '0.6rem 0 0', color: 'var(--ink-dim)', fontSize: '0.8rem' }}>
            {!serverFourEnabled
              ? (lang === 'ar' ? 'مصدر Hearbor 4 غير مفعّل؛ أضف ANIPROJECT_API_URL إلى إعدادات الخادم.' : 'Hearbor 4 is not configured; set ANIPROJECT_API_URL on the server.')
              : (lang === 'ar' ? 'Hearbor 4 مصدر للبحث والقراءة بالعنوان؛ لا يوفّر فهرس تصفح أو فصولاً عربية مضمونة.' : 'Hearbor 4 supports title search and reading; it has no browse feed or guaranteed Arabic chapters.')}
          </p>
        )}
      </div>

      {/* Active Unified Search / Filter Status Pill (only shown when filtered via Unified Search Window) */}
      {(query || serverFilter !== 'all' || filter !== 'ALL') && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.6rem',
            padding: '0.65rem 1rem',
            marginBottom: '1.25rem',
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
              setLiveSearchResults(null);
              setServerFilter('all');
              setFilter('ALL');
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

      {searchingLive && <LiquidLoader />}

      {/* Section Header */}
      <div
        className="section__head reveal"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}
      >
        <h2 className="section__title" style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
          {liveSearchResults !== null
            ? lang === 'ar'
              ? `نتائج البحث عن "${query}" (${displayedItems.length})`
              : `Search Results for "${query}" (${displayedItems.length})`
            : lang === 'ar'
            ? '🔥 الأعمال الرائجة والمتاحة للقراءة فوراً'
            : '🔥 Trending Manga & Manhwa Ready to Read'}
        </h2>
        <span style={{ color: 'var(--ink-dim)', fontSize: '0.88rem' }}>
          {displayedItems.length} {lang === 'ar' ? 'عملاً متاحاً' : 'titles'}
        </span>
      </div>

      {/* Grid of Trending Manga and Manhwa Cards */}
      {loading ? (
        <SkeletonGrid count={8} height={340} />
      ) : displayedItems.length === 0 ? (
        <div className="glass reveal" style={{ padding: '2.5rem', textAlign: 'center', borderRadius: '16px' }}>
          <EmptyState
            icon="📚"
            title={serverFilter === 'bx4' && !query
              ? (lang === 'ar' ? 'ابحث عن عنوان مانجا في سيرفر Hearbor 4' : 'Search for a manga title on Hearbor 4')
              : (lang === 'ar' ? 'لم يتم العثور على أعمال مطابقة' : 'No titles matched your search')}
          >
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setQuery('');
                setFilter('ALL');
                setLiveSearchResults(null);
                setServerFilter('all');
                setSearchParams({});
                loadLibrary('all');
              }}
              style={{ marginTop: '1rem' }}
            >
              {lang === 'ar' ? 'عرض كافة الأعمال الرائجة' : 'Reset & Show All'}
            </button>
          </EmptyState>
        </div>
      ) : (
        <div className="grid-anime">
          {displayedItems.map((item, idx) => (
            <div
              key={item.id || item.mangalikSlug || idx}
              className="glass show-card reveal"
              style={{
                borderRadius: '16px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                animationDelay: `${idx * 0.04}s`,
                border: '1px solid rgba(255, 255, 255, 0.09)',
                transition: 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.25s ease'
              }}
            >
              {/* Card Poster with Badges */}
              <div
                style={{ position: 'relative', width: '100%', height: '270px', overflow: 'hidden', cursor: 'pointer' }}
                onClick={() => openItemDetails(item)}
              >
                <img
                  onError={imgFallback}
                  src={safeCover(item.poster)}
                  alt={item.title_en}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                {/* Type Badge */}
                <div style={{ position: 'absolute', top: '10px', insetInlineStart: '10px' }}>
                  <span
                    style={{
                      background: item.type === 'MANHWA' ? 'rgba(139, 92, 246, 0.88)' : 'rgba(6, 182, 212, 0.88)',
                      color: '#fff',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '8px',
                      backdropFilter: 'blur(6px)'
                    }}
                  >
                    {item.type === 'MANHWA' ? '⚡ مانهوا' : '📖 مانجا'}
                  </span>
                </div>

                {/* Only display scores actually reported by a source. */}
                {item.rating != null && (
                  <div style={{
                    position: 'absolute', top: '10px', insetInlineEnd: '10px',
                    background: 'rgba(0, 0, 0, 0.78)', padding: '0.2rem 0.55rem',
                    borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, color: '#fbbf24'
                  }}>
                    ★ {item.rating}
                  </div>
                )}

                {item.status && (
                  <div style={{ bottom: '10px', insetInlineStart: '10px', position: 'absolute' }}>
                    <span style={{
                      background: 'rgba(0, 0, 0, 0.75)', color: '#e2e8f0',
                      fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '6px'
                    }}>
                      {item.status}
                    </span>
                  </div>
                )}
              </div>

              {/* Card Details */}
              <div style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <h3
                  onClick={() => openItemDetails(item)}
                  style={{
                    fontSize: '1.02rem',
                    fontWeight: 800,
                    margin: '0 0 0.35rem',
                    lineHeight: 1.35,
                    cursor: 'pointer'
                  }}
                  title={item.title_ar}
                >
                  {lang === 'ar' ? item.title_ar : item.title_en}
                </h3>

                {/* Real author / year only (no invented "Hearbor Manga · 2024"). */}
                {item.author || item.release_year ? (
                  <div style={{ fontSize: '0.78rem', color: 'var(--ink-dim)', marginBottom: '0.65rem' }}>
                    {[item.author ? `✍️ ${item.author}` : '', item.release_year || ''].filter(Boolean).join(' · ')}
                  </div>
                ) : null}

                {/* Genre chips */}
                {Array.isArray(item.genres) && item.genres.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                    {item.genres.slice(0, 3).map((g, gi) => (
                      <span
                        key={gi}
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--ink-dim)'
                        }}
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Synopsis */}
                <p
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--ink-dim)',
                    lineHeight: 1.45,
                    margin: '0 0 1rem',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {lang === 'ar' ? item.description_ar : item.description_en}
                </p>

                {/* Actions */}
                <div
                  style={{
                    marginTop: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem'
                  }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--cyan)' }}>
                    {item.chapters_count != null ? `${item.chapters_count} ${lang === 'ar' ? 'فصلاً' : 'Chs'}` : (lang === 'ar' ? 'عرض الفصول' : 'View chapters')}
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => openItemDetails(item)}
                      style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem' }}
                      title={lang === 'ar' ? 'قائمة الفصول' : 'Chapters'}
                    >
                      📑
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => launchReader(item)}
                      style={{ padding: '0.4rem 0.95rem', fontSize: '0.82rem', fontWeight: 700 }}
                    >
                      <span className="btn__shine" />
                      📖 {lang === 'ar' ? 'اقرأ الآن' : 'Read'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && serverFilter !== 'bx4' && liveSearchResults === null && displayedItems.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem', marginBottom: '1rem' }}>
          <button
            type="button"
            className="btn btn--primary"
            disabled={loadingMore}
            onClick={loadMoreLibrary}
            style={{ padding: '0.85rem 2.2rem', borderRadius: '99px', fontWeight: 900 }}
          >
            <span className="btn__shine" />
            {loadingMore
              ? lang === 'ar'
                ? 'جاري تحميل المزيد...'
                : 'Loading more...'
              : lang === 'ar'
              ? `🔥 عرض المزيد من المكتبة العربية الشاملة (+30,000 مانجا ومانهوا — صفحة ${page + 1})`
              : `🔥 Load More from 30,000+ Arabic Manga & Manhwa (Page ${page + 1})`}
          </button>
        </div>
      )}

      {/* ================= CHAPTERS & DETAILS MODAL ================= */}
      {selectedItem && (
        <Modal
          title={lang === 'ar' ? selectedItem.title_ar : selectedItem.title_en}
          sub={`${selectedItem.type === 'MANHWA' ? '⚡ مانهوا كورية' : '📖 مانجا يابانية'}${selectedItem.author ? ` · ${selectedItem.author}` : ''}`}
          onClose={() => setSelectedItem(null)}
          wide={true}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.5rem',
              marginBlockEnd: '1.5rem'
            }}
          >
            {/* Left Cover & Stats */}
            <div style={{ maxWidth: '240px', width: '100%', margin: '0 auto' }}>
              <img
                onError={imgFallback}
                src={selectedItem.poster}
                alt=""
                style={{
                  width: '100%',
                  borderRadius: '12px',
                  objectFit: 'cover',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
                }}
              />
              <div
                style={{
                  marginTop: '1rem',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '0.85rem',
                  borderRadius: '10px'
                }}
              >
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-dim)', marginBottom: '0.35rem' }}>
                  {lang === 'ar' ? 'الحالة:' : 'Status:'} <strong style={{ color: '#34d399' }}>{selectedItem.status}</strong>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-dim)', marginBottom: '0.35rem' }}>
                  {selectedItem.rating != null
                    ? <>{lang === 'ar' ? 'التقييم:' : 'Score:'} <strong style={{ color: '#fbbf24' }}>★ {selectedItem.rating} / 10</strong></>
                    : (lang === 'ar' ? 'لا يوجد تقييم متاح' : 'No rating available')}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-dim)' }}>
                  {lang === 'ar' ? 'المصدر:' : 'Source:'} <strong style={{ color: '#38bdf8' }}>سيرفرات Hearbor</strong>
                </div>
              </div>

              <button
                type="button"
                className="btn btn--primary"
                onClick={() => launchReader(selectedItem)}
                style={{ width: '100%', marginTop: '0.75rem', fontWeight: 800 }}
              >
                <span className="btn__shine" />
                📖 {lang === 'ar' ? 'بدء القراءة فوراً' : 'Start Reading'}
              </button>
            </div>

            {/* Right: Synopsis & Chapter list */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: '1.15rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800 }}>
                  {lang === 'ar' ? 'قصة العمل' : 'Synopsis'}
                </h4>
                <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: '#cbd5e1', margin: 0 }}>
                  {lang === 'ar' ? selectedItem.description_ar : selectedItem.description_en}
                </p>
              </div>

              {/* XP Leveling Tracker */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.1), rgba(139, 92, 246, 0.1))',
                  border: '1px solid rgba(34, 211, 238, 0.25)',
                  borderRadius: '12px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  marginBottom: '1.25rem'
                }}
              >
                <div>
                  <strong style={{ display: 'block', fontSize: '0.88rem', color: 'var(--cyan)' }}>
                    ⚡ {lang === 'ar' ? 'مكافآت القراءة والنشاط' : 'Reading XP & Otaku Rank'}
                  </strong>
                  <span style={{ fontSize: '0.76rem', color: 'var(--ink-dim)' }}>
                    {lang === 'ar'
                      ? 'قراءة فصول هذا العمل تزيد من دقائق القراءة وترفع مستواك في المنصة'
                      : 'Reading logs activity minutes and levels up your rank'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleRecordReading}
                  disabled={loggingRead}
                  style={{ fontSize: '0.8rem' }}
                >
                  {loggingRead ? (lang === 'ar' ? 'جارٍ التسجيل...' : 'Recording...') : (lang === 'ar' ? 'تسجيل 20 دقيقة (+200 XP)' : 'Log 20m (+200 XP)')}
                </button>
              </div>

              {/* Server Switcher inside Details Modal */}
              {itemServers.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: '0.45rem',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}
                >
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink-dim)' }}>
                    {lang === 'ar' ? 'اختر السيرفر:' : 'Select Server:'}
                  </span>
                  {itemServers.map((srv) => (
                    <button
                      key={srv.id}
                      type="button"
                      onClick={() => openItemDetails(selectedItem, srv.id)}
                      style={{
                        padding: '0.32rem 0.75rem',
                        borderRadius: '99px',
                        fontSize: '0.76rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        border: modalServer === srv.id ? '1px solid #fff' : '1px solid rgba(255,255,255,0.15)',
                        background: modalServer === srv.id ? '#fff' : 'rgba(255,255,255,0.06)',
                        color: modalServer === srv.id ? '#000' : '#f1f5f9'
                      }}
                    >
                      {lang === 'ar' ? srv.name : srv.labelEn}
                    </button>
                  ))}
                </div>
              )}

              {/* Chapters list */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>
                  📑 {lang === 'ar' ? 'الفصول المتاحة من سيرفرات Hearbor' : 'Chapters available on Hearbor'}
                </h4>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-dim)' }}>
                  {itemChapters.length} {lang === 'ar' ? 'فصل' : 'chapters'}
                </span>
              </div>

              {loadingItemDetails ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <LiquidLoader />
                  <p style={{ fontSize: '0.85rem', color: 'var(--ink-dim)', marginTop: '0.5rem' }}>
                    {lang === 'ar' ? 'جلب الفصول المباشرة من سيرفرات Hearbor...' : 'Fetching live chapters from Hearbor...'}
                  </p>
                </div>
              ) : itemChapters.length === 0 ? (
                <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 0.5rem', color: 'var(--ink-dim)', fontSize: '0.85rem' }}>
                    {lang === 'ar' ? 'الفصول جاهزة للقراءة في القارئ المباشر' : 'Chapters ready in reader'}
                  </p>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => launchReader(selectedItem)}
                  >
                    📖 {lang === 'ar' ? 'فتح القارئ فوراً' : 'Open Reader'}
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: '260px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                    paddingInlineEnd: '0.4rem'
                  }}
                >
                  {itemChapters.map((ch, idx) => {
                    const chNum = ch.number || ch.slug;
                    const chId = ch.chapterId || `${selectedItem.id}:${chNum}`;
                    const dlUrl = resolveApiUrl(
                      `/api/manga/chapter/${encodeURIComponent(chId)}/download?title=${encodeURIComponent(
                        selectedItem.title_ar || selectedItem.title_en || 'Manga'
                      )}&chapter=${encodeURIComponent(chNum)}&server=${encodeURIComponent(modalServer || '')}`
                    );
                    return (
                      <div
                        key={chId || idx}
                        onClick={() => launchReader(selectedItem, chNum, chId, modalServer)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.6rem 0.85rem',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          gap: '0.5rem'
                        }}
                      >
                        <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f8fafc' }}>
                          {ch.title || `الفصل ${chNum}`}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <a
                            href={dlUrl}
                            onClick={(e) => e.stopPropagation()}
                            download
                            style={{
                              fontSize: '0.74rem',
                              color: '#e2e8f0',
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.16)',
                              padding: '0.22rem 0.55rem',
                              borderRadius: '6px',
                              textDecoration: 'none',
                              fontWeight: 700
                            }}
                            title={lang === 'ar' ? 'تحميل الفصل للقراءة بدون إنترنت' : 'Download Chapter'}
                          >
                            ⬇ {lang === 'ar' ? 'تحميل' : 'DL'}
                          </a>
                          <span style={{ fontSize: '0.78rem', color: '#fff', fontWeight: 700 }}>
                            {lang === 'ar' ? 'اقرأ 📖' : 'Read 📖'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ================= MOBILE-READY READER MODAL ================= */}
      {readerItem && (
        <MangaNovelReader
          item={readerItem}
          type="manga"
          initialChapter={readerItem.initialChapterNumber}
          initialChapterId={readerItem.initialChapterId}
          initialServer={readerItem.initialServer}
          onClose={() => setReaderItem(null)}
        />
      )}
    </div>
  );
}
