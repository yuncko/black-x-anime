import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { useAsync, pushToast } from '../hooks/hooks.js';
import ShowCard, { EpisodeTile, ContinueCard } from '../components/ShowCard.jsx';
import { SkeletonGrid, EmptyState } from '../components/Loading.jsx';
import { resolveUserVipTier } from '../components/VipPlansAndDevCodes.jsx';
import AnimeDiscover from '../components/AnimeDiscover.jsx';
import BxIcon from '../components/BxIcon.jsx';
import { sendNativeDeviceNotification } from '../utils/deviceNotifications.js';
import { visibleGenres } from '../../../shared/contentFilter.js';

const WEEK_DAYS = [
  { id: 6, ar: 'السبت', en: 'Saturday' },
  { id: 0, ar: 'الأحد', en: 'Sunday' },
  { id: 1, ar: 'الإثنين', en: 'Monday' },
  { id: 2, ar: 'الثلاثاء', en: 'Tuesday' },
  { id: 3, ar: 'الأربعاء', en: 'Wednesday' },
  { id: 4, ar: 'الخميس', en: 'Thursday' },
  { id: 5, ar: 'الجمعة', en: 'Friday' }
];

/* --------------------------- Official slothUI Pro 2.0 Section Header --------------------------- */
function WitSectionHeader({ icon, title, sub, linkTo, linkLabel }) {
  return (
    <div
      className="wit-sec-header sloth-sec-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
        marginBottom: '1.15rem',
        padding: '0.85rem 1.15rem',
        borderRadius: '22px',
        background: 'rgba(10, 10, 15, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        backdropFilter: 'blur(20px)'
      }}
    >
      <div className="wit-sec-header__right" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <img
          src="/blackx-logo.png"
          alt="Hearbor"
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            objectFit: 'cover',
            border: '1px solid rgba(255,255,255,0.32)',
            flexShrink: 0
          }}
        />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '2px' }}>
            <span style={{ fontSize: '0.64rem', fontWeight: 900, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.68)' }}>
              Hearbor ORIGINAL • SLOTHUI PRO
            </span>
          </div>
          <h2 className="wit-sec-header__title" style={{ margin: 0, fontSize: '1.22rem', fontWeight: 900 }}>
            {icon && <span>{icon}</span>} {title}
          </h2>
          {sub && (
            <p className="wit-sec-header__sub" style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.62)' }}>
              {sub}
            </p>
          )}
        </div>
      </div>
      {linkTo && (
        <Link
          className="wit-sec-header__more sloth-pill-cta"
          to={linkTo}
          style={{
            padding: '0.48rem 1.05rem',
            borderRadius: '999px',
            background: '#ffffff',
            color: '#000000',
            fontWeight: 900,
            fontSize: '0.8rem',
            border: '1.5px solid #ffffff',
            boxShadow: '0 6px 20px rgba(255,255,255,0.18)'
          }}
        >
          {linkLabel || 'المزيد ←'}
        </Link>
      )}
    </div>
  );
}

/** Genre pills of one hero title in the page language, without the hidden genres. */
function heroGenreLabels(item, isRtl) {
  const all = Array.isArray(item?.genres) ? item.genres : [];
  const ar = Array.isArray(item?.tagsAr) && item.tagsAr.length ? item.tagsAr : all.filter((g) => /[\u0600-\u06FF]/.test(String(g)));
  const en = all.filter((g) => !/[\u0600-\u06FF]/.test(String(g)));
  const pick = isRtl ? (ar.length ? ar : en) : en.length ? en : ar;
  return visibleGenres(pick).slice(0, 3);
}

/* --------------------------- 0. Exact 1:1 Reference Cinema Hero + All Episodes + Anime/Manga Portals + Stories --------------------------- */
function Hero3DStage({ items = [], trending = [], onOpenAuth }) {
  const { lang, setLang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeIdx, setActiveIdx] = useState(0);
  const [favSlugs, setFavSlugs] = useState({}); // slug -> saved in the list (real /api/library/favorites)
  const [storyModalIdx, setStoryModalIdx] = useState(null);
  const isRtl = lang === 'ar';

  const heroPool = useMemo(() => {
    const merged = [];
    const seen = new Set();
    for (const item of [...(items || []), ...(trending || [])]) {
      const key = item.slug || item.id || item.titleEn || item.titleEnglish || item.titleRomaji;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= 12) break;
    }
    return merged; // nothing invented while the catalogue loads or when it fails
  }, [items, trending]);

  useEffect(() => {
    if (heroPool.length <= 1 || storyModalIdx !== null) return undefined;
    const id = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % Math.min(6, heroPool.length));
    }, 6500);
    return () => clearInterval(id);
  }, [heroPool.length, storyModalIdx]);

  // Auto-advance Interactive Full-Screen Stories Viewer every 6 seconds
  useEffect(() => {
    if (storyModalIdx === null) return undefined;
    const maxStories = Math.min(12, heroPool.length);
    const id = setTimeout(() => {
      setStoryModalIdx((prev) => (prev === null ? null : prev + 1 < maxStories ? prev + 1 : null));
    }, 6000);
    return () => clearTimeout(id);
  }, [storyModalIdx, heroPool.length]);

  const current = heroPool[activeIdx] || heroPool[0] || null;
  const displayTitle = current
    ? current.titleEn ||
      current.titleEnglish ||
      current.title_english ||
      current.titleRomaji ||
      current.title_romaji ||
      current.titleAr ||
      current.titleArabic ||
      current.slug ||
      ''
    : '';
  // Real values only: unknown score / year / type / episode are simply not shown.
  const rawScore = Number(current?.rating) || Number(current?.score) || 0;
  const score = rawScore > 0 ? (rawScore > 10 ? rawScore / 10 : rawScore).toFixed(1) : '';
  const artwork =
    current?.poster ||
    current?.coverUrl ||
    current?.cover_url ||
    current?.banner ||
    current?.bannerUrl ||
    current?.banner_url ||
    '/blackx-logo.png';
  const heroGenres = current ? heroGenreLabels(current, isRtl) : [];
  const heroBadge = current ? [current.type || current.format || '', current.year || current.season_year || current.seasonYear || ''].filter(Boolean).join(' • ') : '';
  const heroEpisode = Number(current?.episode) || 0;
  const heroLine = [heroEpisode ? (isRtl ? `الحلقة ${heroEpisode}` : `Episode ${heroEpisode}`) : '', score ? `★ ${score}` : ''].filter(Boolean).join(' • ');
  const playLabel = current?.slug
    ? isRtl
      ? `شغّل الحلقة ${heroEpisode || 1}`
      : `Play episode ${heroEpisode || 1}`
    : isRtl
    ? 'ابحث عنه'
    : 'Find it';

  // «أضف إلى قائمتي» saves to the real list (website favorites); guests are asked to sign in.
  const currentSlug = current?.slug || '';
  const inPlaylist = Boolean(currentSlug && favSlugs[currentSlug]);
  useEffect(() => {
    if (!user || !currentSlug || favSlugs[currentSlug] !== undefined) return undefined;
    let alive = true;
    api
      .get(`/api/library/favorites/${currentSlug}`)
      .then((d) => alive && setFavSlugs((m) => ({ ...m, [currentSlug]: Boolean(d?.favorite) })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, currentSlug, favSlugs]);
  const toggleList = async () => {
    if (!currentSlug) return;
    if (!user) {
      onOpenAuth?.('login');
      return;
    }
    const next = !inPlaylist;
    setFavSlugs((m) => ({ ...m, [currentSlug]: next }));
    try {
      if (next) {
        await api.put(`/api/library/favorites/${currentSlug}`, {
          titleEn: current.titleEn || displayTitle,
          titleAr: current.titleAr || null,
          poster: current.poster || null,
          banner: current.banner || null
        });
      } else {
        await api.del(`/api/library/favorites/${currentSlug}`);
      }
      pushToast(next ? (isRtl ? 'اتضاف لقائمتك' : 'Added to your list') : isRtl ? 'اتشال من قائمتك' : 'Removed from your list', 'success');
    } catch {
      setFavSlugs((m) => ({ ...m, [currentSlug]: !next }));
      pushToast(isRtl ? 'ماقدرناش نحفظ — جرّب تاني' : 'Could not save — try again', 'error');
    }
  };

  const handleWatchCurrent = (item = current, ep = 1) => {
    if (!item) return;
    if (item?.slug) {
      navigate(`/watch/${item.slug}/${item.episode || ep}`);
    } else {
      navigate(`/trending?q=${encodeURIComponent(item?.titleEn || displayTitle)}`);
    }
  };

  const handleOpenDetails = (item = current) => {
    if (!item) return;
    if (item?.slug) {
      navigate(`/show/${item.slug}`);
    } else {
      navigate(`/trending?q=${encodeURIComponent(item?.titleEn || displayTitle)}`);
    }
  };

  const activeStoryItem = storyModalIdx !== null ? heroPool[storyModalIdx] || current : null;

  return (
    <div style={{ marginBottom: '1.75rem' }}>
      {/* 1. Full-Bleed Cinema Hero Showcase (Matches Reference Screenshot 1:1) */}
      <section
        style={{
          position: 'relative',
          width: '100%',
          minHeight: '515px',
          borderRadius: '26px',
          overflow: 'hidden',
          background: '#000000',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.95)'
        }}
      >
        <img
          src={artwork}
          alt={displayTitle}
          referrerPolicy="no-referrer"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 18%',
            filter: 'brightness(0.7) contrast(1.12)'
          }}
        />
        {/* Multi-Stop Pitch-Black Vignette */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.06) 24%, rgba(0,0,0,0.82) 64%, #000000 100%)'
          }}
        />

        {/* Top-Left Official "[Hearbor original | X]" Seal */}
        <div
          onClick={() => window.openBlackXSpotlight?.()}
          style={{
            position: 'absolute',
            top: '16px',
            left: '18px',
            zIndex: 4,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.28rem 0.7rem 0.28rem 0.38rem',
            borderRadius: '999px',
            background: 'rgba(0,0,0,0.68)',
            border: '1px solid rgba(255,255,255,0.2)',
            cursor: 'pointer'
          }}
        >
          <img
            src="/blackx-logo.png"
            alt="Hearbor"
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '6px',
              objectFit: 'cover',
              border: '1px solid rgba(255,255,255,0.35)'
            }}
          />
          <span style={{ fontSize: '0.74rem', fontWeight: 900, color: '#ffffff', letterSpacing: '0.02em' }}>
            Hearbor <span style={{ fontWeight: 500, opacity: 0.78 }}>original</span>
          </span>
        </div>

        {/* Top-Right Slide Indicator Dots ([━━] • • • • •) + Liquid Glass Mini-Orbs (Search, AR/EN, Bell) */}
        <div
          style={{
            position: 'absolute',
            top: '14px',
            right: '16px',
            zIndex: 4,
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              type="button"
              className="ios-lg-orb"
              title={isRtl ? 'بحث فوري (Ctrl+K)' : 'Spotlight Search (Ctrl+K)'}
              onClick={() => window.openBlackXSpotlight?.()}
              style={{ width: '32px', height: '32px' }}
            >
              <BxIcon name="search" size={14} />
            </button>
            <button
              type="button"
              className="ios-lg-orb"
              title={isRtl ? 'Switch to English' : 'التبديل للعربية'}
              onClick={() => setLang?.(isRtl ? 'en' : 'ar')}
              style={{ width: '32px', height: '32px', fontSize: '0.62rem', fontWeight: 900 }}
            >
              {isRtl ? 'EN' : 'AR'}
            </button>
            <button
              type="button"
              className="ios-lg-orb"
              title={isRtl ? 'تنبيهات الحلقات الجديدة' : 'Episode Notifications'}
              onClick={async () => {
                const ok = await sendNativeDeviceNotification({
                  title: `Hearbor 120Hz: ${displayTitle}`,
                  body: isRtl
                    ? 'تم تفعيل تنبيهات الحلقات والفصول الجديدة على جهازك!'
                    : 'Live episode & chapter notifications enabled!',
                  icon: artwork,
                  url: current?.slug ? `/show/${current.slug}` : '/'
                });
                pushToast(
                  ok
                    ? isRtl
                      ? 'تم إرسال إشعار فوري إلى جهازك!'
                      : 'Sent instant device notification!'
                    : isRtl
                    ? 'مركز الإشعارات الذكي نشط!'
                    : 'Smart notification center active!',
                  'success'
                );
              }}
              style={{ width: '32px', height: '32px' }}
            >
              <span className="ios-lg-orb-dot" style={{ width: '6px', height: '6px' }} />
              <BxIcon name="bell" size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {heroPool.slice(0, 6).map((_, idx) => (
              <span
                key={idx}
                onClick={() => setActiveIdx(idx)}
                style={{
                  width: activeIdx === idx ? '18px' : '6px',
                  height: '6px',
                  borderRadius: '99px',
                  background: activeIdx === idx ? '#ffffff' : 'rgba(255,255,255,0.3)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>
        </div>

        {/* Centered Hero Content at Bottom (only with a real title: no invented placeholder show) */}
        {current ? (
        <div
          style={{
            position: 'absolute',
            bottom: '18px',
            left: '16px',
            right: '16px',
            zIndex: 3,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          {/* Genre pills + type / year of the title (real values only) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.42rem',
              flexWrap: 'wrap',
              marginBottom: '0.58rem'
            }}
          >
            {heroGenres.map((g, gIdx) => (
              <span
                key={gIdx}
                style={{
                  padding: '0.22rem 0.72rem',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.28)',
                  color: '#ffffff',
                  fontSize: '0.7rem',
                  fontWeight: 800
                }}
              >
                {g}
              </span>
            ))}
            {heroBadge ? (
              <span
                style={{
                  padding: '0.22rem 0.62rem',
                  borderRadius: '999px',
                  background: '#ffffff',
                  color: '#000000',
                  fontSize: '0.68rem',
                  fontWeight: 900
                }}
              >
                {heroBadge}
              </span>
            ) : null}
          </div>

          {/* Giant Bold Uppercase Title */}
          <h1
            style={{
              margin: '0 0 0.38rem',
              maxWidth: '720px',
              fontSize: 'clamp(1.55rem, 3.2vw, 2.35rem)',
              fontWeight: 900,
              lineHeight: 1.12,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              color: '#ffffff',
              textShadow: '0 6px 24px rgba(0,0,0,0.95)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {displayTitle}
          </h1>

          {/* Episode + score line (only what is known) */}
          {heroLine ? (
            <div
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'rgba(255,255,255,0.82)',
                marginBottom: '0.9rem'
              }}
            >
              {heroLine}
            </div>
          ) : (
            <div style={{ height: '0.6rem' }} />
          )}

          {/* Play + details */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.15fr 0.85fr',
              gap: '0.65rem',
              width: '100%',
              maxWidth: '410px',
              marginBottom: '0.55rem'
            }}
          >
            <button
              type="button"
              onClick={() => handleWatchCurrent(current, 1)}
              style={{
                minHeight: '62px',
                padding: '0.88rem 1rem',
                borderRadius: '999px',
                border: 'none',
                background: '#ffffff',
                color: '#000000',
                fontWeight: 900,
                fontSize: '0.86rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                boxShadow: '0 8px 24px rgba(255,255,255,0.22)',
                cursor: 'pointer'
              }}
            >
              <BxIcon name="play" size={15} active />
              <span>{playLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenDetails(current)}
              style={{
                minHeight: '62px',
                padding: '0.88rem 1rem',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.24)',
                background: 'rgba(20, 20, 26, 0.88)',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '0.84rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                cursor: 'pointer'
              }}
            >
              <BxIcon name="info" size={16} />
              <span>{isRtl ? 'التفاصيل' : 'Details'}</span>
            </button>
          </div>

          {/* «أضف إلى قائمتي»: the real list (needs a title page, so only for playable titles) */}
          {currentSlug ? (
          <button
            type="button"
            onClick={toggleList}
            aria-pressed={inPlaylist}
            style={{
              width: '100%',
              maxWidth: '410px',
              minHeight: '46px',
              padding: '0.68rem 1rem',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.22)',
              background: inPlaylist ? 'rgba(255,255,255,0.2)' : 'rgba(18, 18, 22, 0.85)',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              cursor: 'pointer'
            }}
          >
            <BxIcon name={inPlaylist ? 'check' : 'plus'} size={15} />
            <span>
              {inPlaylist
                ? isRtl
                  ? 'في قائمتي'
                  : 'In my list'
                : isRtl
                ? 'أضف إلى قائمتي'
                : 'Add to my list'}
            </span>
          </button>
          ) : null}
        </div>
        ) : (
          <div
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'grid', placeItems: 'center' }}
          >
            <img src="/blackx-logo.png" alt="" style={{ width: '72px', height: '72px', borderRadius: '20px', opacity: 0.55 }} />
          </div>
        )}
      </section>

      {/* 2. Featured episodes strip (the hero's titles) */}
      <section style={{ padding: '1rem 0.15rem 0.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.65rem'
          }}
        >
          <span style={{ fontWeight: 900, fontSize: '0.98rem', letterSpacing: '0.01em', color: '#ffffff' }}>
            {isRtl ? 'حلقات مختارة' : 'Featured episodes'}
          </span>
          <button
            type="button"
            onClick={() => setActiveIdx((s) => (s + 1) % Math.max(1, Math.min(6, heroPool.length)))}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.75)',
              fontSize: '0.78rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '0.32rem',
              cursor: 'pointer'
            }}
          >
            <span>{isRtl ? 'اللي بعده' : 'Next'}</span>
            <span aria-hidden="true">{isRtl ? '←' : '→'}</span>
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            overflowX: 'auto',
            paddingBottom: '0.35rem',
            scrollbarWidth: 'none'
          }}
        >
          {heroPool.slice(0, 8).map((epItem, epIdx) => {
            const epTitle = epItem.titleEn || epItem.titleEnglish || epItem.titleRomaji || epItem.titleAr || epItem.slug;
            const epArt = epItem.banner || epItem.bannerUrl || epItem.poster || epItem.coverUrl || artwork;
            return (
              <div
                key={`web-ep-${epItem.slug || epIdx}`}
                onClick={() => handleWatchCurrent(epItem, 1)}
                style={{
                  position: 'relative',
                  width: '215px',
                  height: '120px',
                  borderRadius: '18px',
                  overflow: 'hidden',
                  flexShrink: 0,
                  background: '#0a0a0f',
                  border: '1px solid rgba(255,255,255,0.16)',
                  cursor: 'pointer'
                }}
              >
                <img
                  src={epArt}
                  alt={epTitle}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    filter: 'brightness(0.82) contrast(1.08)'
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 45%, rgba(0,0,0,0.88) 100%)'
                  }}
                />
                {/* Episode badge: only when the episode number is known (no invented E1 / 24:00) */}
                {epItem.episode ? (
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.18rem 0.52rem',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.75)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    fontSize: '0.65rem',
                    fontWeight: 900,
                    color: '#ffffff'
                  }}
                >
                  <span>{isRtl ? `الحلقة ${epItem.episode}` : `E${epItem.episode}`}</span>
                </div>
                ) : null}

                {/* Bottom Title + Circular [X] Seal */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '10px',
                    right: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.4rem'
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 900,
                      color: '#ffffff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {epTitle}
                  </div>
                  <span
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#ffffff',
                      color: '#000000',
                      fontSize: '0.62rem',
                      fontWeight: 900,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    X
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Anime list / manga list portals */}
      <section style={{ padding: '0.7rem 0.15rem 0.2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
          <div
            onClick={() => navigate('/trending')}
            style={{
              position: 'relative',
              height: '70px',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.22)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <img
              src={artwork}
              alt="Anime List"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'brightness(0.38)'
              }}
            />
            <span
              style={{
                position: 'relative',
                zIndex: 2,
                fontWeight: 900,
                fontSize: '0.82rem',
                letterSpacing: '0.03em',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <BxIcon name="anime" size={16} />
              <span>{isRtl ? 'قائمة الأنمي' : 'Anime list'}</span>
            </span>
            <span style={{ position: 'relative', zIndex: 2, marginTop: '4px', width: '42px', height: '2.5px', borderRadius: '99px', background: '#ffffff' }} />
          </div>

          <div
            onClick={() => navigate('/browse')}
            style={{
              position: 'relative',
              height: '70px',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.22)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <img
              src={heroPool[1]?.poster || heroPool[1]?.coverUrl || artwork}
              alt="Manga List"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'brightness(0.38)'
              }}
            />
            <span
              style={{
                position: 'relative',
                zIndex: 2,
                fontWeight: 900,
                fontSize: '0.82rem',
                letterSpacing: '0.03em',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <BxIcon name="manga" size={16} />
              <span>{isRtl ? 'قائمة المانجا' : 'Manga list'}</span>
            </span>
            <span style={{ position: 'relative', zIndex: 2, marginTop: '4px', width: '42px', height: '2.5px', borderRadius: '99px', background: '#ffffff' }} />
          </div>
        </div>
      </section>

      {/* 4. Quick previews */}
      <section style={{ padding: '0.75rem 0.15rem 0.15rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem' }}>
          <h2
            style={{
              margin: 0,
              fontSize: '0.92rem',
              fontWeight: 900,
              letterSpacing: '0.01em',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <BxIcon name="bolt" size={16} />
            <span>{isRtl ? 'معاينات سريعة' : 'Quick previews'}</span>
          </h2>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.52)', fontWeight: 800 }}>
            {isRtl ? 'اضغط للمعاينة والتشغيل الفوري' : 'Tap to preview'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.78rem', overflowX: 'auto', paddingBottom: '0.35rem', scrollbarWidth: 'none' }}>
          {heroPool.slice(0, 12).map((item, idx) => {
            const stTitle = item.titleEn || item.titleEnglish || item.titleRomaji || item.titleAr || item.slug;
            const stArt = item.poster || item.coverUrl || item.banner || artwork;
            return (
              <div
                key={`web-story-${item.slug || idx}`}
                onClick={() => setStoryModalIdx(idx)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: '70px',
                  maxWidth: '70px',
                  cursor: 'pointer'
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    padding: '2.5px',
                    background: idx < 3 ? '#ffffff' : 'rgba(255,255,255,0.45)',
                    boxShadow: idx < 3 ? '0 0 14px rgba(255,255,255,0.22)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <img
                    src={stArt}
                    alt={stTitle}
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #000000'
                    }}
                  />
                </div>
                <span
                  style={{
                    marginTop: '0.28rem',
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    color: 'rgba(255,255,255,0.88)',
                    maxWidth: '68px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textAlign: 'center'
                  }}
                >
                  {stTitle}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Interactive Full-Screen Stories Viewer Modal */}
      {activeStoryItem && (
        <div
          onClick={() => setStoryModalIdx(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9985,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '430px',
              height: 'min(82vh, 690px)',
              borderRadius: '28px',
              overflow: 'hidden',
              background: '#050508',
              border: '1.5px solid rgba(255,255,255,0.32)',
              boxShadow: '0 28px 80px rgba(0,0,0,0.95)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <img
              src={activeStoryItem.poster || activeStoryItem.coverUrl || activeStoryItem.banner || artwork}
              alt={activeStoryItem.titleEn || displayTitle}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'brightness(0.72) contrast(1.12)'
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(0,0,0,0.72) 0%, transparent 32%, rgba(0,0,0,0.88) 72%, #000000 100%)'
              }}
            />

            {/* Left / Right Invisible Tap Zones for Story Navigation */}
            <div
              onClick={() =>
                setStoryModalIdx((prev) =>
                  prev > 0 ? prev - 1 : Math.min(11, heroPool.length - 1)
                )
              }
              style={{ position: 'absolute', top: '64px', bottom: '120px', left: 0, width: '38%', zIndex: 3, cursor: 'pointer' }}
            />
            <div
              onClick={() =>
                setStoryModalIdx((prev) =>
                  prev + 1 < Math.min(12, heroPool.length) ? prev + 1 : null
                )
              }
              style={{ position: 'absolute', top: '64px', bottom: '120px', right: 0, width: '38%', zIndex: 3, cursor: 'pointer' }}
            />

            {/* Top Progress Segments + Story Header */}
            <div style={{ position: 'relative', zIndex: 4, padding: '0.85rem 1rem 0' }}>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '0.75rem' }}>
                {heroPool.slice(0, Math.min(12, heroPool.length)).map((_, sIdx) => (
                  <div
                    key={sIdx}
                    onClick={() => setStoryModalIdx(sIdx)}
                    style={{
                      flex: 1,
                      height: '3.5px',
                      borderRadius: '99px',
                      background: sIdx <= storyModalIdx ? '#ffffff' : 'rgba(255,255,255,0.26)',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <img
                    src="/blackx-logo.png"
                    alt="Hearbor"
                    style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.4)' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.76rem', fontWeight: 900, color: '#ffffff' }}>
                      Hearbor
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.68)', fontWeight: 700 }}>
                      {(() => {
                        const raw = Number(activeStoryItem.rating) || Number(activeStoryItem.score) || 0;
                        const ep = Number(activeStoryItem.episode) || 0;
                        return [raw > 0 ? `★ ${(raw > 10 ? raw / 10 : raw).toFixed(1)}` : '', ep ? (isRtl ? `الحلقة ${ep}` : `Episode ${ep}`) : ''].filter(Boolean).join(' • ');
                      })()}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStoryModalIdx(null)}
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.14)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <BxIcon name="close" size={16} />
                </button>
              </div>
            </div>

            {/* Bottom Story Details + Instant Play/Info Actions */}
            <div style={{ position: 'relative', zIndex: 4, padding: '1.25rem', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.35rem', fontWeight: 900, color: '#ffffff', textTransform: 'uppercase' }}>
                {activeStoryItem.titleEn || activeStoryItem.titleEnglish || activeStoryItem.titleAr || activeStoryItem.slug}
              </h3>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.76)', lineHeight: 1.55 }}>
                {activeStoryItem.titleAr && activeStoryItem.titleAr !== (activeStoryItem.titleEn || activeStoryItem.titleEnglish) ? activeStoryItem.titleAr : ''}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    const target = activeStoryItem;
                    setStoryModalIdx(null);
                    handleWatchCurrent(target, 1);
                  }}
                  style={{
                    minHeight: '52px',
                    borderRadius: '999px',
                    background: '#ffffff',
                    color: '#000000',
                    border: 'none',
                    fontWeight: 900,
                    fontSize: '0.84rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer'
                  }}
                >
                  <BxIcon name="play" size={14} active />
                  <span>
                    {isRtl ? `شغّل الحلقة ${Number(activeStoryItem?.episode) || 1}` : `Play episode ${Number(activeStoryItem?.episode) || 1}`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target = activeStoryItem;
                    setStoryModalIdx(null);
                    handleOpenDetails(target);
                  }}
                  style={{
                    minHeight: '52px',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.12)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.28)',
                    fontWeight: 900,
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer'
                  }}
                >
                  <BxIcon name="info" size={15} />
                  <span>{isRtl ? 'التفاصيل' : 'Details'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- 1. Split Row: الأكثر مشاهدة (1..6) + أشهر أنميات الموسم --------------------------- */
function MostWatchedAndSeasonSplit({ latestItems = [], seasonItems = [], loading }) {
  const { lang, formatNumber } = useI18n();
  const navigate = useNavigate();

  const rankedEpisodes = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const item of latestItems || []) {
      if (!seen.has(item.slug)) {
        seen.add(item.slug);
        list.push(item);
      }
      if (list.length >= 6) break;
    }
    return list;
  }, [latestItems]);

  const sideAnime = useMemo(() => {
    const source = seasonItems && seasonItems.length > 0 ? seasonItems : rankedEpisodes;
    return source.slice(0, 6);
  }, [seasonItems, rankedEpisodes]);

  return (
    <section className="wit-split-showcase" id="pinned-anime">
      {/* Right Column in RTL: الأكثر مشاهدة (حلقات) */}
      <div className="wit-split-showcase__main">
        <div className="wit-bar-head">
          <span className="wit-bar-head__line" />
          <h2 className="wit-bar-head__title">{lang === 'ar' ? 'الأكثر مشاهدة' : 'Most Watched'}</h2>
          <span className="wit-bar-head__tag">{lang === 'ar' ? 'حلقات' : 'Episodes'}</span>
        </div>

        {loading ? (
          <SkeletonGrid count={6} />
        ) : (
          <div className="wit-ranked-grid">
            {rankedEpisodes.map((item, idx) => {
              const title = item.titleEn || item.titleAr || item.slug;
              return (
                <div key={item.slug || idx} className="bx-3d-stage">
                  <article
                    className="wit-ranked-card bx-3d-card"
                    onClick={() => navigate(`/watch/${item.slug}/${item.episode || 1}`)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="wit-ranked-card__poster">
                      <img src={item.poster} alt={title} loading="lazy" referrerPolicy="no-referrer" />
                      <div className="wit-ranked-card__shade" />

                      {/* Top-Right White Rank Square (1, 2, 3, 4, 5, 6) */}
                      <span className="wit-rank-num">{idx + 1}</span>

                      {/* Top-Left Dark Episode Pill (only a known episode number) */}
                      {Number(item.episode) > 0 ? (
                        <span className="wit-rank-ep">
                          {lang === 'ar' ? `الحلقة ${formatNumber(item.episode)}` : `EP ${formatNumber(item.episode)}`}
                        </span>
                      ) : null}
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Left Sidebar in RTL: أشهر أنميات الموسم */}
      <aside className="wit-split-showcase__side">
        <div className="wit-bar-head">
          <span className="wit-bar-head__line" />
          <h2 className="wit-bar-head__title">{lang === 'ar' ? 'أشهر أنميات الموسم' : 'Popular This Season'}</h2>
        </div>

        <div className="wit-season-side-box">
          {sideAnime.map((item, idx) => {
            const name = item.titleEn || item.titleAr || item.slug;
            const poster = item.poster || item.coverUrl || '';
            return (
              <div
                key={item.slug || item.id || idx}
                className="wit-season-side-item"
                onClick={() =>
                  navigate(
                    item.slug
                      ? `/show/${item.slug}`
                      : `/trending?q=${encodeURIComponent(name)}`
                  )
                }
                role="button"
                tabIndex={0}
              >
                <div className="wit-season-side-item__thumb">
                  <img src={poster} alt={name} loading="lazy" referrerPolicy="no-referrer" />
                </div>
                <div className="wit-season-side-item__info">
                  <div className="wit-season-side-item__title">{name}</div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </section>
  );
}

/* --------------------------- 2. Latest Added Episodes (أحدث الحلقات المضافة) --------------------------- */
function LatestSection({ items, loading, error, onRetry }) {
  const { t, lang } = useI18n();
  return (
    <section className="wit-section" id="latest-episodes">
      <WitSectionHeader
        icon={<BxIcon name="flame" size={18} />}
        title={lang === 'ar' ? 'أحدث الحلقات المضافة' : t('dashboard.latest')}
        sub={t('dashboard.latestSub')}
        linkTo="/trending"
        linkLabel={lang === 'ar' ? 'عرض كل الحلقات ←' : 'All Episodes →'}
      />

      {loading ? (
        <SkeletonGrid count={12} height={240} />
      ) : error || items.length === 0 ? (
        <div className="wit-panel" style={{ padding: '1.5rem' }}>
          <EmptyState icon="📡" title={t('dashboard.sourceDown')}>
            <button type="button" className="btn btn--ghost" onClick={onRetry}>{t('common.retry')}</button>
          </EmptyState>
        </div>
      ) : (
        <div className="wit-grid-episodes grid-episodes">
          {items.slice(0, 18).map((it, i) => (
            <EpisodeTile key={`${it.slug}-${it.episode}-${i}`} item={it} delay={i} />
          ))}
        </div>
      )}
    </section>
  );
}

/* --------------------------- 3. Weekly airing schedule (real AniList air times) --------------------------- */
// /api/anime/schedule lists the next air time of the most popular anime on air now (a weekly
// show airs again within 7 days, so every weekday is covered). Days are grouped here by the
// visitor's own clock; the API's UTC day buckets are only transport. This section used to show
// the first six "latest episodes" under every day tab: there was no schedule behind it.
function groupScheduleByLocalDay(days) {
  const byDay = {};
  for (const list of Object.values(days || {})) {
    for (const slot of Array.isArray(list) ? list : []) {
      const at = Number(slot?.airingAt);
      if (!slot?.media || !(at > 0)) continue;
      const day = new Date(at * 1000).getDay();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(slot);
    }
  }
  const minuteOfDay = (slot) => {
    const d = new Date(slot.airingAt * 1000);
    return d.getHours() * 60 + d.getMinutes();
  };
  Object.values(byDay).forEach((list) => list.sort((a, b) => minuteOfDay(a) - minuteOfDay(b)));
  return byDay;
}

function WeeklyScheduleSection() {
  const { t, lang, formatNumber } = useI18n();
  const navigate = useNavigate();
  const todayJs = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(todayJs);
  const { data, loading, error, reload } = useAsync(() => api.get('/api/anime/schedule'), []);
  const byDay = useMemo(() => groupScheduleByLocalDay(data?.days), [data]);
  const dayItems = byDay[selectedDay] || [];
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' }),
    [lang]
  );

  return (
    <section className="wit-section" id="schedule-section">
      <WitSectionHeader
        icon={<BxIcon name="calendar" size={18} />}
        title={lang === 'ar' ? 'مواعيد عرض الحلقات الأسبوعية' : 'Weekly Episode Airing Schedule'}
        sub={lang === 'ar' ? 'اختر اليوم لمعرفة الأنميات التي تعرض فيه' : 'Select a day of the week to view airing anime'}
      />

      <div className="wit-days-bar">
        {WEEK_DAYS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`wit-day-tab ${selectedDay === d.id ? 'active' : ''}`}
            onClick={() => setSelectedDay(d.id)}
          >
            {lang === 'ar' ? d.ar : d.en}
            {d.id === todayJs && (
              <span className="wit-day-tab__today">{lang === 'ar' ? 'اليوم' : 'Today'}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonGrid count={6} />
      ) : error ? (
        <EmptyState icon="📡" title={t('error.upstream')}>
          <button type="button" className="btn btn--ghost" onClick={reload}>{t('common.retry')}</button>
        </EmptyState>
      ) : dayItems.length === 0 ? (
        <EmptyState icon="🗓️" title={lang === 'ar' ? 'لا توجد حلقات مسجلة لهذا اليوم' : 'No episodes listed for this day'} />
      ) : (
        <div className="wit-grid-anime grid-anime">
          {dayItems.map((slot, i) => {
            const m = slot.media;
            const name = m.titleEnglish || m.titleRomaji || '';
            const at = new Date(slot.airingAt * 1000);
            // On today's tab, a show whose episode already aired today is listed with its NEXT
            // episode, a week from now: say so, so «Ep. 4 • 10:00» is not read as airing today.
            const nextWeek = at.getDay() === todayJs && at.toDateString() !== new Date().toDateString();
            const time = timeFormat.format(at) + (nextWeek ? (lang === 'ar' ? ' • الأسبوع القادم' : ' • next week') : '');
            const ep = Number(slot.episode) > 0 ? formatNumber(slot.episode) : '';
            return (
              <ShowCard
                key={`sched-${m.id}`}
                show={{
                  slug: `find-${m.id}`,
                  titleEn: name,
                  titleAr: m.titleArabic,
                  poster: m.coverUrl,
                  color: m.color,
                  episodes: m.episodes,
                  status: m.status
                }}
                meta={ep ? `${lang === 'ar' ? `الحلقة ${ep}` : `Ep. ${ep}`} • ${time}` : time}
                delay={i}
                onClick={() => navigate(`/trending?q=${encodeURIComponent(name)}`)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

/* --------------------------- 4. Continue Watching --------------------------- */
function ContinueSection({ onOpenAuth }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user) { setData({ continueWatching: [] }); return undefined; }
    let alive = true;
    api.get('/api/library/continue')
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ continueWatching: [] }));
    return () => { alive = false; };
  }, [user]);

  const items = data?.continueWatching || [];
  if (!user || items.length === 0) return null;

  return (
    <section className="wit-section">
      <WitSectionHeader
        icon={<BxIcon name="play" size={16} />}
        title={t('dashboard.continue')}
        sub={t('dashboard.continueSub')}
        linkTo="/mylist"
        linkLabel={lang === 'ar' ? 'قائمتي ←' : 'My List →'}
      />
      <div className="cont-row">
        {items.slice(0, 6).map((e, i) => (
          <ContinueCard key={`${e.slug}-${e.episode}`} entry={e} delay={i} />
        ))}
      </div>
    </section>
  );
}

/* --------------------------- 5. Season Trending Anime (أنميات الموسم) --------------------------- */
function TrendingSection() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => api.get('/api/anime/trending'), []);
  const items = data?.anime || [];

  return (
    <section className="wit-section">
      <WitSectionHeader
        icon={<BxIcon name="spark" size={18} />}
        title={lang === 'ar' ? 'أنميات الموسم الأكثر شعبية' : t('dashboard.trending')}
        sub={lang === 'ar' ? 'الأعمال الأعلى مشاهدة وتقييماً هذا الموسم' : t('dashboard.trendingSub')}
        linkTo="/trending"
        linkLabel={lang === 'ar' ? 'كل الأعمال الرائجة ←' : 'Explore All →'}
      />

      {loading ? (
        <SkeletonGrid count={6} />
      ) : error || items.length === 0 ? (
        <div className="wit-panel" style={{ padding: '1.5rem' }}>
          <EmptyState icon="📡" title={t('error.upstream')}>
            <button type="button" className="btn btn--ghost" onClick={reload}>{t('common.retry')}</button>
          </EmptyState>
        </div>
      ) : (
        <div className="wit-grid-anime grid-anime">
          {items.slice(0, 12).map((a, i) => (
            <ShowCard
              key={a.id}
              show={{
                slug: `find-${a.id}`,
                titleEn: a.titleEnglish || a.titleRomaji,
                titleAr: a.titleArabic,
                poster: a.coverUrl,
                color: a.color,
                episodes: a.episodes,
                status: a.status
              }}
              delay={i}
              onClick={() => navigate(`/trending?q=${encodeURIComponent(a.titleEnglish || a.titleRomaji || '')}`)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* --------------------------- 6. Manga & Manhwa Section --------------------------- */
function LibraryShowcaseSection() {
  const { lang } = useI18n();
  // Real titles from the library API (Ecchi / Harem / Isekai already removed by the server).
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    api
      .get('/api/content/library?type=ALL&server=all&page=1')
      .then((d) => {
        if (!alive) return;
        const list = (Array.isArray(d?.items) ? d.items : []).filter((m) => m && m.id && (m.poster || m.coverImage || m.coverUrl));
        setItems(list.slice(0, 8));
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);

  if (Array.isArray(items) && items.length === 0) return null; // nothing real to show

  const typeLabel = (type) => {
    const t = String(type || '').toUpperCase();
    if (t.includes('MANHWA')) return lang === 'ar' ? 'مانهوا' : 'Manhwa';
    if (t.includes('MANHUA')) return lang === 'ar' ? 'مانها' : 'Manhua';
    if (t.includes('MANGA')) return lang === 'ar' ? 'مانجا' : 'Manga';
    return '';
  };

  return (
    <section className="wit-section">
      <WitSectionHeader
        icon={<BxIcon name="manga" size={18} />}
        title={lang === 'ar' ? 'من مكتبة المانجا' : 'From the manga library'}
        sub={lang === 'ar' ? 'مانجا ومانهوا للقراءة على سيرفرات Hearbor' : 'Manga & manhwa to read on Hearbor servers'}
        linkTo="/browse"
        linkLabel={lang === 'ar' ? 'دخول المكتبة ←' : 'Full Library →'}
      />

      {!items ? (
        <SkeletonGrid count={4} />
      ) : (
        <div className="wit-grid-anime grid-anime">
          {items.map((m, i) => (
            <ShowCard
              key={m.id}
              show={{
                slug: m.id,
                titleAr: m.title_ar || m.title || m.title_en,
                titleEn: m.title_en || m.title || m.title_ar,
                poster: m.poster || m.coverImage || m.coverUrl
              }}
              meta={Number(m.chapters_count) > 0 ? (lang === 'ar' ? `${m.chapters_count} فصل` : `${m.chapters_count} ch.`) : typeLabel(m.type)}
              delay={i}
              onClick={() => {
                window.location.href = '/browse';
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* --------------------------- 7. Favorites --------------------------- */
function FavoritesSection() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [favs, setFavs] = useState([]);

  useEffect(() => {
    if (!user) { setFavs([]); return undefined; }
    let alive = true;
    api.get('/api/library/favorites')
      .then((d) => alive && setFavs(d.favorites || []))
      .catch(() => alive && setFavs([]));
    return () => { alive = false; };
  }, [user]);

  if (!user || favs.length === 0) return null;

  return (
    <section className="wit-section">
      <WitSectionHeader
        icon={<BxIcon name="crown" size={18} />}
        title={t('dashboard.favorites')}
        linkTo="/mylist"
        linkLabel={lang === 'ar' ? 'عرض الكل ←' : 'View All →'}
      />
      <div className="wit-grid-anime grid-anime">
        {favs.slice(0, 6).map((s, i) => (
          <ShowCard key={s.slug} show={s} delay={i} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Main WitAnime Home Page ------------------------------ */
export default function Dashboard({ onOpenAuth }) {
  const [latest, setLatest] = useState(null);
  const [trending, setTrending] = useState(null);
  const [error, setError] = useState(false);

  const { lang } = useI18n();
  const { user } = useAuth();
  const vipTier = resolveUserVipTier(user);
  const isVip = vipTier === 'vip_basic' || vipTier === 'vip_monarch';

  const loadLatest = useCallback(() => {
    setLatest(null);
    setError(false);
    api.get('/api/stream/latest')
      .then((d) => setLatest(d.items || []))
      .catch(() => { setLatest([]); setError(true); });
  }, []);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  useEffect(() => {
    api.get('/api/anime/trending')
      .then((d) => setTrending(d.anime || []))
      .catch(() => setTrending([]));
  }, []);

  const pinnedItems = useMemo(() => {
    if (!latest || latest.length === 0) return [];
    const seen = new Set();
    const unique = [];
    for (const item of latest) {
      if (!seen.has(item.slug)) {
        seen.add(item.slug);
        unique.push(item);
      }
      if (unique.length >= 6) break;
    }
    return unique;
  }, [latest]);

  return (
    <div className="wit-home-wrap">
      {/* 0. Exact 1:1 Cinema Hero + All Episodes + Anime/Manga Portals + Stories */}
      <Hero3DStage items={pinnedItems} trending={trending || []} onOpenAuth={onOpenAuth} />

      {/* 1. Continue Watching (if logged in) */}
      <ContinueSection onOpenAuth={onOpenAuth} />

      {/* 2. Latest Added Episodes (أحدث الحلقات المضافة) */}
      <LatestSection items={latest || []} loading={!latest} error={error} onRetry={loadLatest} />

      {/* 2.5. Luxury Liquid Glass Anime Discovery Oracle */}
      <AnimeDiscover compact />

      {/* 3. Weekly Airing Schedule (مواعيد الحلقات) */}
      <WeeklyScheduleSection />

      {/* 4. Manga & Manhwa Library */}
      <LibraryShowcaseSection />

      {/* 5. User Favorites */}
      <FavoritesSection onOpenAuth={onOpenAuth} />
    </div>
  );
}
