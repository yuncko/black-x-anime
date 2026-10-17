import React, { Suspense, useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import Backdrop, { Toasts } from './components/Backdrop.jsx';
import { AuthModal } from './components/Modals.jsx';
import { useI18n } from './i18n/I18nProvider.jsx';
const Dashboard = React.lazy(() => import('./pages/Dashboard.jsx'));
const Browse = React.lazy(() => import('./pages/Browse.jsx'));
const TrendingAnime = React.lazy(() => import('./pages/TrendingAnime.jsx'));
const ShowDetail = React.lazy(() => import('./pages/ShowDetail.jsx'));
const Watch = React.lazy(() => import('./pages/Watch.jsx'));
const MyList = React.lazy(() => import('./pages/MyList.jsx'));
const ProfileDashboard = React.lazy(() => import('./pages/ProfileDashboard.jsx'));
const Rankings = React.lazy(() => import('./pages/Rankings.jsx'));
const Community = React.lazy(() => import('./pages/Community.jsx'));
const LegalPage = React.lazy(() => import('./pages/LegalPage.jsx'));
const AnimeDiscover = React.lazy(() => import('./components/AnimeDiscover.jsx'));
const MobileApkApp = React.lazy(() => import('./mobile/MobileApkApp.jsx'));
import BlackXSplashVortex from './components/BlackXSplashVortex.jsx';
import { GlobalVipEnforcementGate } from './components/VipPlansAndDevCodes.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { api, isNativeApk } from './api.js';
import BxIcon from './components/BxIcon.jsx';
import { useAnimeCatalogTotal, formatCount } from './hooks/useCatalogStats.js';
import { switchWebUi } from './webUi.js';
import { reportClientError } from './errorReporter.js';
import { ANILIST_EXCLUSION_ARGS, hasBlockedGenre } from '../../shared/contentFilter.js';

function serverFourSearchItems(animeData, mangaData, query) {
  return [
    ...(animeData?.items || []).map((a) => ({
      id: a.slug, kind: 'ANIME', badgeAr: 'أنمي', badgeEn: 'ANIME',
      title: a.titleEn, poster: a.poster || '/blackx-logo.png', meta: 'BLACK X 4',
      to: `/show/${encodeURIComponent(a.slug)}?source=aniproject`
    })),
    ...(mangaData?.manga || []).map((m) => ({
      id: m.id, kind: 'MANGA', badgeAr: 'مانجا', badgeEn: 'MANGA',
      title: m.title_en, poster: m.poster || '/blackx-logo.png', meta: 'BLACK X 4',
      to: `/browse?q=${encodeURIComponent(query)}&server=bx4`
    }))
  ];
}

/**
 * Comprehensive Unified Monochrome Liquid Glass Search, Server & Category Hub (Anime + Manga/Manhwa)
 */
function SpotlightSearchModal({ open, onClose }) {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const isRtl = lang === 'ar';
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('ALL'); // 'ALL' | 'ANIME' | 'MANGA'
  const [server, setServer] = useState('all'); // 'all' | 'bx1' | 'bx2' | 'bx3' | 'bx4'
  const [serverFourEnabled, setServerFourEnabled] = useState(false);
  const [category, setCategory] = useState('ALL'); // 'ALL' | 'TRENDING' | 'TOP_RATED' | 'MANHWA' | 'MANGA_JP' | 'MANHUA' | 'Action' | 'Fantasy' | 'Adventure' | 'Romance' | 'Sci-Fi' | 'Mystery'
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  // Real catalog size (null until known); manga sources report no total, so no number.
  const animeTotal = useAnimeCatalogTotal();
  const animeCountSuffix = animeTotal ? ` (${formatCount(animeTotal)})` : '';

  const scopeTabs = [
    { id: 'ALL', ar: 'الكل (أنمي + مانجا)', en: 'All (Anime + Manga)', icon: 'sparkles' },
    { id: 'ANIME', ar: `الأنمي${animeCountSuffix}`, en: `Anime${animeCountSuffix}`, icon: 'tv' },
    { id: 'MANGA', ar: 'المانجا والمانهوا', en: 'Manga & Manhwa', icon: 'book' }
  ];

  const serverOptions = [
    { id: 'all', animeSrc: 'all', mangaSrv: 'all', ar: 'جميع سيرفرات BLACK X', en: 'All BLACK X Servers' },
    { id: 'bx1', animeSrc: 'witanime', mangaSrv: 'bx1', ar: 'سيرفر BLACK X 1', en: 'BLACK X Server 1' },
    { id: 'bx2', animeSrc: 'anime3rb', mangaSrv: 'bx2', ar: 'سيرفر BLACK X 2', en: 'BLACK X Server 2' },
    { id: 'bx3', animeSrc: 'english', mangaSrv: 'bx3', ar: 'سيرفر BLACK X 3', en: 'BLACK X Server 3' },
    { id: 'bx4', animeSrc: 'aniproject', mangaSrv: 'bx4', ar: 'سيرفر BLACK X 4 (بحث فقط)', en: 'BLACK X Server 4 (Search only)', disabled: !serverFourEnabled }
  ];

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    api.get('/api/stream/sources')
      .then((data) => { if (active) setServerFourEnabled(data?.sources?.some((source) => source.id === 'aniproject') || false); })
      .catch(() => { if (active) setServerFourEnabled(false); });
    return () => { active = false; };
  }, [open]);

  const categoryOptions = [
    { id: 'ALL', ar: 'الكل', en: 'All', genre: null },
    { id: 'TRENDING', ar: 'الأكثر رواجاً', en: 'Trending', genre: null },
    { id: 'TOP_RATED', ar: 'الأعلى تقييماً', en: 'Top Rated', genre: null },
    { id: 'MANHWA', ar: 'مانهوا كورية', en: 'Korean Manhwa', genre: null, country: 'KR' },
    { id: 'MANGA_JP', ar: 'مانجا يابانية', en: 'Japanese Manga', genre: null, country: 'JP' },
    { id: 'MANHUA', ar: 'مانهاوا صينية', en: 'Chinese Manhua', genre: null, country: 'CN' },
    { id: 'Action', ar: 'أكشن', en: 'Action', genre: 'Action' },
    { id: 'Fantasy', ar: 'خيال', en: 'Fantasy', genre: 'Fantasy' },
    { id: 'Adventure', ar: 'مغامرات', en: 'Adventure', genre: 'Adventure' },
    { id: 'Romance', ar: 'رومانسي', en: 'Romance', genre: 'Romance' },
    { id: 'Sci-Fi', ar: 'خيال علمي', en: 'Sci-Fi', genre: 'Sci-Fi' },
    { id: 'Mystery', ar: 'غموض', en: 'Mystery', genre: 'Mystery' }
  ];

  useEffect(() => {
    if (!open) return undefined;
    const trimmed = q.trim();
    const activeCat = categoryOptions.find((c) => c.id === category) || categoryOptions[0];
    const sortMode = category === 'TOP_RATED' ? ['SCORE_DESC', 'POPULARITY_DESC'] : ['POPULARITY_DESC', 'TRENDING_DESC'];
    let alive = true;

    const timer = setTimeout(async () => {
      if (!alive) return;
      setLoading(true);
      try {
        // Server 4 is a search-only provider: show its actual matches, not
        // unrelated AniList titles dressed up as playable/readable results.
        if (server === 'bx4') {
          if (!trimmed || !serverFourEnabled) { if (alive) setResults([]); return; }
          const [animeData, mangaData] = await Promise.all([
            scope === 'MANGA' ? Promise.resolve({ items: [] }) :
              api.get(`/api/stream/search?source=aniproject&q=${encodeURIComponent(trimmed)}`).catch(() => ({ items: [] })),
            scope === 'ANIME' ? Promise.resolve({ manga: [] }) :
              api.get(`/api/search?type=manga&server=bx4&query=${encodeURIComponent(trimmed)}`).catch(() => ({ manga: [] }))
          ]);
          if (alive) setResults(serverFourSearchItems(animeData, mangaData, trimmed));
          return;
        }
        const gql = `
          query ($s: String, $genre: String, $country: CountryCode, $sort: [MediaSort]) {
            anime: Page(page: 1, perPage: 10) {
              media(type: ANIME, search: $s, genre: $genre, sort: $sort, isAdult: false, ${ANILIST_EXCLUSION_ARGS}) {
                id
                title { english romaji native }
                averageScore
                episodes
                genres
                tags { name }
                coverImage { large }
              }
            }
            manga: Page(page: 1, perPage: 10) {
              media(type: MANGA, search: $s, genre: $genre, countryOfOrigin: $country, sort: $sort, isAdult: false, ${ANILIST_EXCLUSION_ARGS}) {
                id
                countryOfOrigin
                title { english romaji native }
                averageScore
                chapters
                genres
                tags { name }
                coverImage { large }
              }
            }
          }
        `;
        const variables = { sort: sortMode };
        if (trimmed) variables.s = trimmed;
        if (activeCat.genre) variables.genre = activeCat.genre;
        if (activeCat.country) variables.country = activeCat.country;

        // In the all-server search, surface real BLACK X 4 matches alongside
        // AniList discovery results; a failed metadata lookup must not hide
        // playable/readable source matches.
        const [json, bx4Anime, bx4Manga] = await Promise.all([
          fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: gql, variables })
          }).then((resp) => resp.json()).catch(() => ({})),
          server === 'all' && serverFourEnabled && trimmed && scope !== 'MANGA' && !activeCat.country
            ? api.get(`/api/stream/search?source=aniproject&q=${encodeURIComponent(trimmed)}`).catch(() => ({ items: [] }))
            : Promise.resolve({ items: [] }),
          server === 'all' && serverFourEnabled && trimmed && scope !== 'ANIME'
            ? api.get(`/api/search?type=manga&server=bx4&query=${encodeURIComponent(trimmed)}`).catch(() => ({ manga: [] }))
            : Promise.resolve({ manga: [] })
        ]);

        const srvObj = serverOptions.find((s) => s.id === server) || serverOptions[0];
        const animeGenreParam = activeCat.genre || 'all';
        const animeFilterParam = category === 'TOP_RATED' ? 'top' : 'trending';
        const mangaFilterParam =
          category === 'MANHWA'
            ? 'MANHWA'
            : category === 'MANGA_JP'
            ? 'MANGA'
            : category === 'MANHUA'
            ? 'MANHUA'
            : category === 'TOP_RATED'
            ? 'TOP_RATED'
            : 'ALL';

        const animeItems =
          scope === 'MANGA' || activeCat.country
            ? []
            : (json?.data?.anime?.media || []).filter((m) => !hasBlockedGenre(m.genres, m.tags)).map((m) => {
                const title = m.title?.english || m.title?.romaji || m.title?.native || 'Anime';
                return {
                  id: `anime-${m.id}`,
                  kind: 'ANIME',
                  badgeAr: 'أنمي',
                  badgeEn: 'ANIME',
                  title,
                  // Unknown score / episode count stay unknown (no invented numbers).
                  score: m.averageScore ? (m.averageScore / 10).toFixed(1) : null,
                  meta: `${m.episodes ? `${m.episodes} EP • ` : ''}${srvObj.id.toUpperCase()}`,
                  poster: m.coverImage?.large || '/blackx-logo.png',
                  to: `/trending?q=${encodeURIComponent(title)}&source=${encodeURIComponent(srvObj.animeSrc)}&genre=${encodeURIComponent(animeGenreParam)}&filter=${encodeURIComponent(animeFilterParam)}`
                };
              });

        const mangaItems =
          scope === 'ANIME'
            ? []
            : (json?.data?.manga?.media || []).filter((m) => !hasBlockedGenre(m.genres, m.tags)).map((m) => {
                const title = m.title?.english || m.title?.romaji || m.title?.native || 'Manga';
                const isManhwa = m.countryOfOrigin === 'KR';
                const isManhua = m.countryOfOrigin === 'CN';
                return {
                  id: `manga-${m.id}`,
                  kind: isManhwa ? 'MANHWA' : isManhua ? 'MANHUA' : 'MANGA',
                  badgeAr: isManhwa ? 'مانهوا' : isManhua ? 'مانهاوا' : 'مانجا',
                  badgeEn: isManhwa ? 'MANHWA' : isManhua ? 'MANHUA' : 'MANGA',
                  title,
                  score: m.averageScore ? (m.averageScore / 10).toFixed(1) : null,
                  meta: `${m.chapters ? `${m.chapters} CH • ` : ''}${srvObj.id.toUpperCase()}`,
                  poster: m.coverImage?.large || '/blackx-logo.png',
                  to: `/browse?q=${encodeURIComponent(title)}&server=${encodeURIComponent(srvObj.mangaSrv)}&filter=${encodeURIComponent(mangaFilterParam)}`
                };
              });

        if (alive) setResults([...serverFourSearchItems(bx4Anime, bx4Manga, trimmed), ...animeItems, ...mangaItems]);
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 220);
    return () => { alive = false; clearTimeout(timer); };
  }, [q, scope, server, category, open, serverFourEnabled]);

  if (!open) return null;

  const srvObj = serverOptions.find((s) => s.id === server) || serverOptions[0];
  const activeCat = categoryOptions.find((c) => c.id === category) || categoryOptions[0];

  const applyToAnimePage = () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (srvObj.animeSrc !== 'all') params.set('source', srvObj.animeSrc);
    if (activeCat.genre) params.set('genre', activeCat.genre);
    if (category === 'TOP_RATED') params.set('filter', 'top');
    onClose();
    navigate(`/trending${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const applyToMangaPage = () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (srvObj.mangaSrv !== 'all') params.set('server', srvObj.mangaSrv);
    if (category === 'MANHWA') params.set('filter', 'MANHWA');
    else if (category === 'MANGA_JP') params.set('filter', 'MANGA');
    else if (category === 'MANHUA') params.set('filter', 'MANHUA');
    else if (category === 'TOP_RATED') params.set('filter', 'TOP_RATED');
    onClose();
    navigate(`/browse${params.toString() ? `?${params.toString()}` : ''}`);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        background: 'rgba(0, 0, 0, 0.86)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '2.2rem 1rem 5.5rem'
      }}
    >
      <div
        className="ios-lg-surface"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '720px',
          borderRadius: '30px',
          padding: '1.15rem',
          maxHeight: '84vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8rem'
        }}
      >
        {/* Header Title Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0 0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BxIcon name="search" size={18} />
            <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#ffffff' }}>
              {isRtl ? 'نافذة البحث الشاملة والفلترة (الأنمي والمانجا)' : 'Unified Anime & Manga Search Hub'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.22)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <BxIcon name="close" size={15} />
          </button>
        </div>

        {/* Search Input Capsule */}
        <div
          className="ios-lg-capsule-track"
          style={{
            padding: '0.5rem 0.9rem',
            gap: '0.6rem'
          }}
        >
          <BxIcon name="search" size={18} />
          <input
            type="text"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              isRtl
                ? 'ابحث بالاسم في الأنمي والمانجا والمانهوا (مثال: Solo Leveling, One Piece, جوجوتسو)...'
                : 'Search Anime, Manga & Manhwa (e.g. Solo Leveling, One Piece, Bleach)...'
            }
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 700
            }}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              <BxIcon name="close" size={14} />
            </button>
          )}
        </div>

        {/* Unified Scope Switcher (All / Anime / Manga) */}
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {scopeTabs.map((tb) => {
            const active = scope === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setScope(tb.id)}
                style={{
                  flex: 1,
                  minWidth: '130px',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '999px',
                  fontSize: '0.78rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  background: active ? '#ffffff' : 'rgba(255,255,255,0.06)',
                  color: active ? '#000000' : '#ffffff',
                  border: active ? '1.5px solid #ffffff' : '1px solid rgba(255,255,255,0.16)'
                }}
              >
                <BxIcon name={tb.icon} size={14} active={active} />
                <span>{isRtl ? tb.ar : tb.en}</span>
              </button>
            );
          })}
        </div>

        {/* Unified Server Selector (BLACK X 1 / 2 / 3) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            paddingBottom: '0.1rem'
          }}
        >
          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'rgba(255,255,255,0.68)', whiteSpace: 'nowrap', marginInlineEnd: '0.25rem' }}>
            {isRtl ? 'السيرفر:' : 'Server:'}
          </span>
          {serverOptions.map((srv) => {
            const active = server === srv.id;
            return (
              <button
                key={srv.id}
                type="button"
                onClick={() => { setServer(srv.id); if (srv.id === 'bx4') setCategory('ALL'); }}
                disabled={srv.disabled}
                title={srv.disabled ? (isRtl ? 'يتطلب إعداد ANIPROJECT_API_URL' : 'Set ANIPROJECT_API_URL to enable') : undefined}
                style={{
                  padding: '0.36rem 0.78rem',
                  borderRadius: '999px',
                  fontSize: '0.73rem',
                  fontWeight: 900,
                  whiteSpace: 'nowrap',
                  cursor: srv.disabled ? 'not-allowed' : 'pointer',
                  opacity: srv.disabled ? 0.5 : 1,
                  background: active ? '#ffffff' : 'rgba(255,255,255,0.05)',
                  color: active ? '#000000' : '#ffffff',
                  border: active ? '1.5px solid #ffffff' : '1px solid rgba(255,255,255,0.15)'
                }}
              >
                {isRtl ? srv.ar : srv.en}
              </button>
            );
          })}
        </div>

        {/* Unified Category & Genre Pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.38rem',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            paddingBottom: '0.15rem'
          }}
        >
          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'rgba(255,255,255,0.68)', whiteSpace: 'nowrap', marginInlineEnd: '0.25rem' }}>
            {isRtl ? 'التصنيف:' : 'Category:'}
          </span>
          {categoryOptions.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                disabled={server === 'bx4' && cat.id !== 'ALL'}
                title={server === 'bx4' && cat.id !== 'ALL' ? (isRtl ? 'تصفية التصنيفات غير متاحة لهذا المصدر' : 'Category filters are unavailable for this source') : undefined}
                style={{
                  padding: '0.34rem 0.74rem',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  cursor: server === 'bx4' && cat.id !== 'ALL' ? 'not-allowed' : 'pointer',
                  opacity: server === 'bx4' && cat.id !== 'ALL' ? 0.45 : 1,
                  background: active ? '#ffffff' : 'rgba(255,255,255,0.05)',
                  color: active ? '#000000' : 'rgba(255,255,255,0.85)',
                  border: active ? '1.5px solid #ffffff' : '1px solid rgba(255,255,255,0.14)'
                }}
              >
                {isRtl ? cat.ar : cat.en}
              </button>
            );
          })}
        </div>

        {/* Unified Results Feed */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.45rem', paddingRight: '0.2rem', flex: 1, minHeight: '180px' }}>
          {loading ? (
            <div style={{ padding: '1.75rem', textAlign: 'center', color: 'rgba(255,255,255,0.68)', fontWeight: 700, fontSize: '0.85rem' }}>
              {isRtl ? 'جاري البحث الفوري في الأنمي والمانجا...' : 'Searching Anime & Manga...'}
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '1.75rem', textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: '0.84rem' }}>
              {isRtl ? 'لا توجد نتائج مطابقة' : 'No matching titles found'}
            </div>
          ) : (
            results.map((r) => (
              <div
                key={r.id}
                onClick={() => {
                  onClose();
                  navigate(r.to);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.52rem 0.75rem',
                  borderRadius: '18px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  <img
                    src={r.poster}
                    alt={r.title}
                    style={{ width: '42px', height: '56px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.86rem',
                        fontWeight: 900,
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {r.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.22rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.68)', fontWeight: 700 }}>
                      <span
                        style={{
                          padding: '0.1rem 0.48rem',
                          borderRadius: '999px',
                          background: r.kind === 'ANIME' ? '#ffffff' : 'rgba(255,255,255,0.14)',
                          color: r.kind === 'ANIME' ? '#000000' : '#ffffff',
                          fontSize: '0.64rem',
                          fontWeight: 900
                        }}
                      >
                        {isRtl ? r.badgeAr : r.badgeEn}
                      </span>
                      {r.score != null && <span>★ {r.score}</span>}
                      <span>• {r.meta}</span>
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    color: '#000000',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <BxIcon name={r.kind === 'ANIME' ? 'play' : 'book'} size={14} active />
                </span>
              </div>
            ))
          )}
        </div>

        {/* Bottom Direct Apply Buttons for Anime List & Manga Page */}
        <div
          style={{
            display: 'flex',
            gap: '0.55rem',
            flexWrap: 'wrap',
            paddingTop: '0.35rem',
            borderTop: '1px solid rgba(255,255,255,0.12)'
          }}
        >
          <button
            type="button"
            onClick={applyToAnimePage}
            style={{
              flex: 1,
              minWidth: '180px',
              padding: '0.58rem 0.9rem',
              borderRadius: '999px',
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              fontSize: '0.78rem',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem'
            }}
          >
            <BxIcon name="tv" size={14} active />
            <span>{isRtl ? 'عرض في قائمة الأنمي' : 'Open in Anime List'}</span>
          </button>

          <button
            type="button"
            onClick={applyToMangaPage}
            style={{
              flex: 1,
              minWidth: '180px',
              padding: '0.58rem 0.9rem',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.1)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.28)',
              fontSize: '0.78rem',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem'
            }}
          >
            <BxIcon name="book" size={14} />
            <span>{isRtl ? 'عرض في صفحة المانجا' : 'Open in Manga Page'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Persistent Monochrome Liquid Glass Mini Floating Player (Continues playback across pages)
 */
function WebsiteMiniFloatingPlayer() {
  const location = useLocation();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const isRtl = lang === 'ar';
  const [session, setSession] = useState(() => (typeof window !== 'undefined' ? window.__bxMiniPlayer || null : null));

  useEffect(() => {
    const onUpdate = (e) => {
      const next = e?.detail || null;
      window.__bxMiniPlayer = next;
      setSession(next);
    };
    window.addEventListener('bx_mini_player_update', onUpdate);
    return () => window.removeEventListener('bx_mini_player_update', onUpdate);
  }, []);

  if (!session || !session.url || location.pathname.startsWith('/watch/')) {
    return null;
  }

  return (
    <div
      className="ios-lg-surface"
      style={{
        position: 'fixed',
        bottom: '84px',
        insetInlineEnd: '18px',
        width: '315px',
        borderRadius: '22px',
        zIndex: 94,
        overflow: 'hidden',
        border: '1.5px solid rgba(255,255,255,0.42)',
        boxShadow: '0 22px 54px rgba(0,0,0,0.95)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.45rem',
          padding: '0.45rem 0.68rem',
          background: 'rgba(0,0,0,0.9)',
          borderBottom: '1px solid rgba(255,255,255,0.14)'
        }}
      >
        <div
          onClick={() => navigate(`/watch/${session.slug}/${session.episode || 1}`)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, cursor: 'pointer' }}
        >
          <span
            style={{
              padding: '0.12rem 0.45rem',
              borderRadius: '999px',
              background: '#ffffff',
              color: '#000000',
              fontSize: '0.64rem',
              fontWeight: 900,
              flexShrink: 0
            }}
          >
            E{session.episode || 1}
          </span>
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 800,
              color: '#ffffff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {session.title || session.slug}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.32rem', flexShrink: 0 }}>
          <button
            type="button"
            title={isRtl ? 'تكبير لصفحة المشاهدة' : 'Expand Player'}
            onClick={() => navigate(`/watch/${session.slug}/${session.episode || 1}`)}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <BxIcon name="expand" size={13} />
          </button>
          <button
            type="button"
            title={isRtl ? 'إغلاق المشغل المصغر' : 'Close Mini Player'}
            onClick={() => {
              window.__bxMiniPlayer = null;
              setSession(null);
            }}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.24)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <BxIcon name="close" size={13} />
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000000' }}>
        {session.kind === 'direct' ? (
          <video
            src={session.url}
            controls
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
          />
        ) : (
          <iframe
            src={session.url}
            title={session.title || 'BLACK X Mini Player'}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            style={{ width: '100%', height: '100%', border: 'none', background: '#000' }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Floating Bottom Navigation Dock (Website — Custom Monochrome Liquid Glass SVG Icon Pack)
 */
function IosLiquidGlassFloatingDock({ onOpenAuth }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const { user } = useAuth();
  const path = location.pathname;

  const dockItems = [
    {
      id: 'home',
      match: (p) => p === '/',
      to: '/',
      labelAr: 'الرئيسية',
      labelEn: 'Home',
      renderIcon: (active) => (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.3' : '1.9'} strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M3.5 10.2L12 3.2l8.5 7V19a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-8.8z"
            fill={active ? 'currentColor' : 'rgba(255,255,255,0.08)'}
          />
          <path
            d="M9.5 21v-6a2.5 2.5 0 0 1 5 0v6"
            stroke={active ? '#ffffff' : 'currentColor'}
            strokeWidth="2"
          />
        </svg>
      )
    },
    {
      id: 'search',
      match: () => false,
      to: '#search',
      labelAr: 'البحث',
      labelEn: 'Search',
      renderIcon: (active) => (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.4' : '2'} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" fill={active ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.07)'} />
          <path d="M8.5 8.8A3.5 3.5 0 0 1 11 7.5" strokeWidth="1.6" opacity="0.75" />
          <line x1="16.2" y1="16.2" x2="21" y2="21" strokeWidth="2.4" />
        </svg>
      )
    },
    {
      id: 'anime',
      match: (p) => p.startsWith('/trending'),
      to: '/trending',
      labelAr: 'الأنمي',
      labelEn: 'Anime',
      renderIcon: (active) => (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.3' : '1.9'} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6.5" width="18" height="13.5" rx="3" fill={active ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.07)'} />
          <polyline points="8.5 2.5 12 6.5 15.5 2.5" />
          <polygon points="10.2 10.5 15.2 13.25 10.2 16 10.2 10.5" fill="currentColor" stroke="none" />
        </svg>
      )
    },
    {
      id: 'schedule',
      match: (p) => p.startsWith('/discover') || p.startsWith('/rankings'),
      to: '/discover',
      labelAr: 'الجدول',
      labelEn: 'Radar',
      renderIcon: (active) => (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.2' : '1.9'} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="4.5" width="17" height="16" rx="3.5" fill={active ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.07)'} />
          <line x1="8" y1="2.8" x2="8" y2="6.2" strokeWidth="2.2" />
          <line x1="16" y1="2.8" x2="16" y2="6.2" strokeWidth="2.2" />
          <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
          <circle cx="8.5" cy="13.5" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="12" cy="13.5" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="13.5" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="8.5" cy="17" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="12" cy="17" r="1.15" fill="currentColor" stroke="none" />
        </svg>
      )
    },
    {
      id: 'manga',
      match: (p) => p.startsWith('/browse'),
      to: '/browse',
      labelAr: 'المانجا',
      labelEn: 'Manga',
      renderIcon: (active) => (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.2' : '1.9'} strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M2.5 5.5A3.5 3.5 0 0 1 6 4h4.5a2 2 0 0 1 1.5.7A2 2 0 0 1 13.5 4H18a3.5 3.5 0 0 1 3.5 1.5v13A2.5 2.5 0 0 0 18 17h-4.5a1.5 1.5 0 0 0-1.5 1.5A1.5 1.5 0 0 0 10.5 17H6a2.5 2.5 0 0 0-3.5 1.5v-13z"
            fill={active ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.07)'}
          />
          <line x1="12" y1="5" x2="12" y2="18.5" />
          <line x1="6" y1="8.5" x2="9.5" y2="8.5" strokeWidth="1.6" />
          <line x1="6" y1="11.5" x2="9.5" y2="11.5" strokeWidth="1.6" />
          <line x1="14.5" y1="8.5" x2="18" y2="8.5" strokeWidth="1.6" />
          <line x1="14.5" y1="11.5" x2="18" y2="11.5" strokeWidth="1.6" />
        </svg>
      )
    },
    {
      id: 'community',
      match: (p) => p.startsWith('/community'),
      to: '/community',
      labelAr: 'الساحة',
      labelEn: 'Arena',
      renderIcon: (active) => (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.2' : '1.9'} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="11.5" r="7.5" fill={active ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.07)'} />
          <path
            d="M12 6.8l1.45 3.25 3.25 1.45-3.25 1.45L12 16.2l-1.45-3.25-3.25-1.45 3.25-1.45L12 6.8z"
            fill="currentColor"
            stroke="none"
          />
          <path d="M7.5 20.5h9" strokeWidth="2.1" />
        </svg>
      )
    },
    {
      id: 'profile',
      match: (p) => p.startsWith('/profile') || p.startsWith('/mylist'),
      to: '/profile',
      labelAr: 'حسابي',
      labelEn: 'Profile',
      renderIcon: (active) => (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.2' : '1.9'} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8.2" r="3.6" fill={active ? 'currentColor' : 'rgba(255,255,255,0.12)'} />
          <path
            d="M5 19.5c0-3.4 3.1-5.8 7-5.8s7 2.4 7 5.8"
            fill={active ? 'currentColor' : 'rgba(255,255,255,0.08)'}
          />
        </svg>
      )
    }
  ];

  return (
    <div className="ios-lg-floating-dock-wrap">
      <nav
        className="ios-lg-capsule-track"
        aria-label="iOS Liquid Glass Dock"
        style={{
          padding: '0.45rem 0.6rem',
          gap: '0.45rem'
        }}
      >
        {dockItems.map((item) => {
          const isActive = item.match(path);
          if (isActive) {
            return (
              <button
                key={item.id}
                type="button"
                className="ios-lg-active-pill"
                onClick={() => navigate(item.to)}
                style={{
                  height: '44px',
                  minWidth: '96px',
                  padding: '0 1rem',
                  fontSize: '0.82rem',
                  fontWeight: 900,
                  justifyContent: 'center',
                  gap: '0.45rem'
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                  {item.renderIcon(true)}
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>{lang === 'ar' ? item.labelAr : item.labelEn}</span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              className="ios-lg-orb"
              title={lang === 'ar' ? item.labelAr : item.labelEn}
              onClick={() => {
                if (item.id === 'search') {
                  if (typeof window !== 'undefined' && typeof window.openBlackXSpotlight === 'function') {
                    window.openBlackXSpotlight();
                  }
                  return;
                }
                if (item.id === 'profile' && !user && typeof onOpenAuth === 'function') {
                  onOpenAuth('login');
                  return;
                }
                navigate(item.to);
              }}
              style={{ width: '42px', height: '42px' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                {item.renderIcon(false)}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [pathname]);
  return null;
}

function Footer() {
  const { t, lang } = useI18n();
  const [footerText, setFooterText] = useState(null);
  // Every device gets the BLACK X app interface by default (webUi.js, owner's decision of
  // 2026-10-17); whoever chose these classic pages can go back to it from here.

  useEffect(() => {
    let alive = true;
    const fetchFooter = () => {
      api.get('/api/settings/footer')
        .then((data) => {
          if (alive && data) setFooterText(data);
        })
        .catch(() => {});
    };
    fetchFooter();
    window.addEventListener('site_settings_updated', fetchFooter);
    return () => {
      alive = false;
      window.removeEventListener('site_settings_updated', fetchFooter);
    };
  }, []);

  return (
    <footer className="footer sloth-footer">
      <div className="container sloth-footer__inner">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.35rem 0.9rem 0.35rem 0.45rem',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.18)',
            marginBottom: '0.75rem'
          }}
        >
          <img
            src="/blackx-logo.png"
            alt="BLACK X"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              objectFit: 'cover',
              border: '1px solid rgba(255,255,255,0.32)'
            }}
          />
          <span style={{ fontWeight: 900, fontSize: '0.96rem', letterSpacing: '0.03em', color: '#ffffff' }}>
            BLACK X <span style={{ fontWeight: 500, opacity: 0.75 }}>original • slothUI Pro 2.0</span>
          </span>
        </div>
        <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#ffffff' }}>
          {footerText?.tagline || t('footer.tagline')}
        </div>
        <div style={{ marginTop: '0.35rem', opacity: 0.68, fontSize: '0.82rem' }}>
          © {new Date().getFullYear()} · {footerText?.notice || t('footer.rights')}
        </div>
        <nav aria-label={lang === 'ar' ? 'صفحات قانونية' : 'Legal pages'} style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.1rem', fontSize: '0.86rem' }}>
          <Link to="/privacy" style={{ color: '#ffffff', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
            {lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy policy'}
          </Link>
          <Link to="/terms" style={{ color: '#ffffff', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
            {lang === 'ar' ? 'شروط الاستخدام' : 'Terms of use'}
          </Link>
        </nav>
        <button
          type="button"
          onClick={() => switchWebUi('app')}
          style={{
            marginTop: '0.9rem',
            minHeight: '44px',
            padding: '0.6rem 1.2rem',
            borderRadius: '999px',
            border: '1px solid rgba(255,255,255,0.28)',
            background: 'transparent',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer'
          }}
        >
          {lang === 'ar' ? 'واجهة BLACK X الجديدة' : 'New BLACK X interface'}
        </button>
      </div>
    </footer>
  );
}

class MobileErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message || String(error) };
  }
  componentDidCatch(error, info) {
    console.error('[MobileApkApp ErrorBoundary]', error, info);
    reportClientError(error, { kind: 'react', componentStack: info?.componentStack || '' });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#000000',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif'
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: '#ffffff',
              color: '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '1.6rem',
              marginBottom: '1rem'
            }}
          >
            X
          </div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: 900 }}>BLACK X MOBILE 120Hz</h2>
          <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>
            تم اكتشاف خطأ مؤقت في الذاكرة المحلية — اضغط لإعادة تشغيل الواجهة فوراً
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, errorMsg: '' });
              window.location.reload();
            }}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '12px',
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              fontWeight: 900,
              fontSize: '0.86rem',
              cursor: 'pointer'
            }}
          >
            إعادة تحميل التطبيق
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [authModal, setAuthModal] = useState(null); // null | 'login' | 'register'
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const { user } = useAuth();
  const { lang } = useI18n();
  const { pathname } = useLocation();
  const openAuth = (mode = 'login') => setAuthModal(mode);

  useEffect(() => {
    window.openBlackXSpotlight = () => setSpotlightOpen(true);
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSpotlightOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setSpotlightOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const isApkRuntime =
    isNativeApk() ||
    import.meta.env.VITE_BUILD_TARGET === 'apk' ||
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('apk_ui') === '1');

  const [splashConfig, setSplashConfig] = useState(() => {
    try {
      const shouldShow = isApkRuntime || sessionStorage.getItem('bx_splash_played') !== '1';
      return {
        active: shouldShow,
        mode: undefined,
        durationMs: isApkRuntime ? 4000 : 2500,
        subtitleAr: '',
        subtitleEn: ''
      };
    } catch {
      return { active: true, mode: undefined, durationMs: isApkRuntime ? 4000 : 2500, subtitleAr: '', subtitleEn: '' };
    }
  });

  useEffect(() => {
    const handleReplay = (e) => {
      const detail = e?.detail || {};
      setSplashConfig({
        active: true,
        mode: detail.mode || undefined,
        durationMs: detail.durationMs || 4000,
        subtitleAr: detail.subtitleAr || '',
        subtitleEn: detail.subtitleEn || ''
      });
    };
    window.triggerBlackXMotion = (mode, durationMs = 1500, subtitleAr = '', subtitleEn = '') => {
      setSplashConfig({
        active: true,
        mode: mode || undefined,
        durationMs: Number(durationMs) || 1500,
        subtitleAr: subtitleAr || '',
        subtitleEn: subtitleEn || ''
      });
    };
    window.addEventListener('bx_replay_splash', handleReplay);
    window.addEventListener('bx_trigger_motion', handleReplay);
    return () => {
      window.removeEventListener('bx_replay_splash', handleReplay);
      window.removeEventListener('bx_trigger_motion', handleReplay);
    };
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref') || params.get('invite');
      if (ref) {
        localStorage.setItem('blackx_referral_code', ref.trim());
      }
    } catch {}
  }, []);

  // Global Capture-Phase Image Auto-Healer for Website (Fixes broken covers via AniList HD + /blackx-logo.png)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!window.__bxWebCoverCache) window.__bxWebCoverCache = {};

    const onImgError = (ev) => {
      const img = ev?.target;
      if (!img || img.tagName !== 'IMG') return;
      const curSrc = String(img.getAttribute('src') || '');
      if (curSrc.endsWith('/blackx-logo.png') || img.dataset.bxHealed === 'done') return;

      img.src = '/blackx-logo.png';
      img.dataset.bxHealed = 'pending';

      const rawTitle = String(img.getAttribute('alt') || '')
        .replace(/[^\w\s\u0621-\u064A]/g, ' ')
        .trim();
      if (!rawTitle || rawTitle.length < 2 || rawTitle.toLowerCase() === 'black x') {
        img.dataset.bxHealed = 'done';
        return;
      }

      if (window.__bxWebCoverCache[rawTitle]) {
        img.dataset.bxHealed = 'done';
        img.src = window.__bxWebCoverCache[rawTitle];
        return;
      }

      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          query: `query($s: String) { Media(search: $s) { coverImage { extraLarge large } } }`,
          variables: { s: rawTitle.split(/\s+/).slice(0, 4).join(' ') }
        })
      })
        .then((r) => r.json())
        .then((d) => {
          const hdUrl = d?.data?.Media?.coverImage?.extraLarge || d?.data?.Media?.coverImage?.large;
          img.dataset.bxHealed = 'done';
          if (hdUrl) {
            window.__bxWebCoverCache[rawTitle] = hdUrl;
            img.src = hdUrl;
          }
        })
        .catch(() => {
          img.dataset.bxHealed = 'done';
        });
    };

    window.addEventListener('error', onImgError, true);
    return () => window.removeEventListener('error', onImgError, true);
  }, []);

  const handleSplashDone = () => {
    try {
      sessionStorage.setItem('bx_splash_played', '1');
    } catch {}
    setSplashConfig((prev) => ({ ...prev, active: false }));
  };

  if (isApkRuntime) {
    return (
      <MobileErrorBoundary>
        {splashConfig.active && (
          <BlackXSplashVortex
            durationMs={splashConfig.durationMs}
            initialMode={splashConfig.mode}
            customSubtitleAr={splashConfig.subtitleAr}
            customSubtitleEn={splashConfig.subtitleEn}
            lang={lang || 'ar'}
            enableSound={true}
            onComplete={handleSplashDone}
          />
        )}
        <Suspense fallback={<div role="status" aria-live="polite" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#000000', color: '#ffffff', fontWeight: 800 }}>{lang === 'ar' ? 'جارٍ تحميل التطبيق…' : 'Loading app…'}</div>}>
          <MobileApkApp />
        </Suspense>
      </MobileErrorBoundary>
    );
  }

  return (
    <>
      {splashConfig.active && (
        <BlackXSplashVortex
          durationMs={splashConfig.durationMs}
          initialMode={splashConfig.mode}
          customSubtitleAr={splashConfig.subtitleAr}
          customSubtitleEn={splashConfig.subtitleEn}
          lang={lang || 'ar'}
          enableSound={false}
          performanceProfile="web"
          onComplete={handleSplashDone}
        />
      )}
      <Backdrop />
      <ScrollToTop />
      <div className="app-shell" style={{ position: 'relative', zIndex: 1, paddingBottom: '88px' }}>
        <main className="main" style={{ paddingTop: '0.85rem' }}>
          <div className="container page-route-enter" key={pathname}>
            <Suspense fallback={<div role="status" aria-live="polite" style={{ minHeight: '52vh', display: 'grid', placeItems: 'center', background: '#000000', color: '#ffffff', fontWeight: 800 }}>{lang === 'ar' ? 'جارٍ تحميل الصفحة…' : 'Loading page…'}</div>}>
              <Routes>
                <Route path="/" element={<Dashboard onOpenAuth={openAuth} />} />
                <Route path="/discover" element={<AnimeDiscover />} />
                <Route path="/trending" element={<TrendingAnime />} />
                <Route path="/browse" element={<Browse />} />
                <Route path="/community" element={<Community onOpenAuth={openAuth} />} />
                <Route path="/rankings" element={<Rankings onOpenAuth={openAuth} />} />
                <Route path="/privacy" element={<LegalPage id="policy" />} />
                <Route path="/terms" element={<LegalPage id="terms" />} />
                <Route path="/show/:slug" element={<ShowDetail onOpenAuth={openAuth} />} />
                <Route path="/watch/:slug/:ep" element={<Watch onOpenAuth={openAuth} />} />
                <Route path="/mylist" element={<MyList onOpenAuth={openAuth} />} />
                <Route path="/profile" element={<ProfileDashboard onOpenAuth={openAuth} />} />
                <Route path="/profile/*" element={<ProfileDashboard onOpenAuth={openAuth} />} />
                <Route path="/schedule" element={<Navigate to="/discover" replace />} />
                <Route path="/account" element={<Navigate to="/profile" replace />} />
                <Route path="/settings" element={<Navigate to="/profile" replace />} />
                {/* legacy prediction-engine routes → home */}
                <Route path="/arena" element={<Navigate to="/" replace />} />
                <Route path="/leaderboard" element={<Navigate to="/" replace />} />
                <Route path="/watchlist" element={<Navigate to="/mylist" replace />} />
                <Route path="/anime/:id" element={<Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>
        <Footer />
      </div>
      <WebsiteMiniFloatingPlayer />
      <SpotlightSearchModal open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
      <IosLiquidGlassFloatingDock onOpenAuth={openAuth} />
      <GlobalVipEnforcementGate user={user} onOpenAuth={openAuth} />
      <Toasts />
      {authModal && <AuthModal initialMode={authModal} onClose={() => setAuthModal(null)} />}
    </>
  );
}
