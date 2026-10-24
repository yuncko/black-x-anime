import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { showStatusLabel } from '../utils/showStatus.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import {
  isAnimeEpisodeAlertEnabled,
  toggleAnimeEpisodeAlert
} from '../utils/deviceNotifications.js';

/** Poster image with automatic AniList HD cover healing + /blackx-logo.png fallback */
function Poster({ src, alt, cls = '' }) {
  const effectiveSrc =
    src && !String(src).includes('api.mangatek.com')
      ? src
      : `https://invalid-cover.blackx.local/${encodeURIComponent(alt || 'anime')}.jpg`;
  return (
    <img
      className={cls}
      src={effectiveSrc}
      alt={alt || 'Hearbor'}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

/**
 * Shared 3D perspective tilt + holographic glass glare controller
 */
function useLuxury3DTilt() {
  const ref = useRef(null);

  const handleMove = (clientX, clientY) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / (rect.height || 1)));
    const ry = (x - 0.5) * 20; // -10deg to +10deg
    const rx = (0.5 - y) * 20; // -10deg to +10deg
    el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
    el.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
    el.style.setProperty('--glare', '1');
  };

  const handleMouseMove = (e) => handleMove(e.clientX, e.clientY);

  const handleTouchMove = (e) => {
    if (e.touches && e.touches[0]) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleReset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--gx', '50%');
    el.style.setProperty('--gy', '50%');
    el.style.setProperty('--glare', '0');
  };

  return {
    ref,
    onMouseMove: handleMouseMove,
    onMouseLeave: handleReset,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleReset
  };
}

/**
 * Pitch-Black Glassy 3D Anime Card (`bx-3d-card`)
 */
export default function ShowCard({ show, progress, onClick, delay = 0, meta }) {
  const { lang, formatNumber } = useI18n();
  const navigate = useNavigate();
  const tilt = useLuxury3DTilt();

  const title = (lang === 'ar' ? show.titleAr : show.titleEn) || show.titleEn || show.slug;
  const posterSrc = show.poster || show.coverUrl || show.banner || '';
  // Only the status the API sent; unknown hides the badge (never a guessed "Airing").
  const statusLabel = showStatusLabel(show.status, lang);
  const targetSlug = show.slug || String(show.titleEn || 'anime').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const [subbed, setSubbed] = useState(() => isAnimeEpisodeAlertEnabled(targetSlug));

  const handleClick = () => {
    if (onClick) return onClick(show);
    navigate(`/show/${show.slug}`);
  };

  const handleBellClick = async (e) => {
    e.stopPropagation();
    const nextState = await toggleAnimeEpisodeAlert(
      {
        slug: targetSlug,
        titleAr: show.titleAr || title,
        titleEn: show.titleEn || title,
        poster: posterSrc,
        latestEpisode: show.episodes || 1
      },
      lang
    );
    setSubbed(nextState);
  };

  return (
    <div className="bx-3d-stage" data-delay={delay % 5}>
      <article
        ref={tilt.ref}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        onTouchMove={tilt.onTouchMove}
        onTouchEnd={tilt.onTouchEnd}
        className="wit-anime-card bx-3d-card anime-card reveal"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        aria-label={title}
      >
        <div className="bx-3d-card__glare" aria-hidden="true" />
        <div className="bx-3d-card__rim" aria-hidden="true" />

        <div className="wit-anime-card__poster bx-3d-card__poster anime-card__poster">
          <Poster src={posterSrc} alt={title} cls="bx-3d-card__img" />
          <div className="bx-3d-card__vignette" aria-hidden="true" />

          {/* Floating 3D Status Badge (real status only) */}
          {statusLabel && (
            <span className="wit-badge wit-badge--status bx-3d-float-z2">{statusLabel}</span>
          )}

          {/* Floating 3D Type Badge: movies only. No quality badge: a card does not know
              which qualities a title's servers offer (the old one said «👑 FHD» on every card). */}
          {show.kind === 'movie' && (
            <span className="wit-badge wit-badge--type bx-3d-float-z2">{lang === 'ar' ? 'فيلم' : 'Movie'}</span>
          )}

          {/* Floating 3D Episode Count Pill */}
          {show.episodes && (
            <span className="wit-badge wit-badge--ep bx-3d-float-z2">
              {lang === 'ar' ? `${formatNumber(show.episodes)} حلقة` : `${formatNumber(show.episodes)} EP`}
            </span>
          )}

          {/* Floating 3D Quick Notification Bell */}
          <button
            type="button"
            className={`wit-bell-btn bx-3d-float-z2 ${subbed ? 'active' : ''}`}
            onClick={handleBellClick}
            title={lang === 'ar' ? 'تفعيل إشعارات الحلقات الجديدة على هاتفك/الكمبيوتر' : 'Enable Episode Alerts'}
          >
            {subbed ? '🔔' : '📲'}
          </button>

          {/* 3D Pop-Out Glass Play Orb */}
          <div className="wit-anime-card__hover bx-3d-float-z3">
            <span className="wit-play-circle bx-3d-orb">▶</span>
          </div>
        </div>

        <div className="wit-anime-card__body bx-3d-card__body anime-card__body">
          <h3 className="wit-anime-card__title anime-card__title" title={title}>
            {title}
          </h3>
          {meta && (
            <div className="wit-anime-card__meta anime-card__meta">
              <span>{meta}</span>
            </div>
          )}
          {progress != null && progress > 0 && (
            <div className="anime-card__progress" title={`${Math.round(progress * 100)}%`}>
              <div className="anime-card__progress-bar" style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

/**
 * Pitch-Black Glassy 3D Episode Card (`bx-3d-card`)
 */
export function EpisodeTile({ item, onClick, delay = 0, progress }) {
  const { t, lang, formatNumber } = useI18n();
  const navigate = useNavigate();
  const tilt = useLuxury3DTilt();
  const title = (lang === 'ar' ? item.titleAr : item.titleEn) || item.titleEn || item.slug;
  const [subbed, setSubbed] = useState(() => isAnimeEpisodeAlertEnabled(item.slug));
  // Some feeds (Hearbor 1 and 2) do not say which episode is new. Then the card shows no
  // number (it used to say «الحلقة ٠») and opens the title page: /watch/<slug>/null broke.
  const epNum = Number(item.episode) > 0 ? Number(item.episode) : 0;
  const target = epNum
    ? `/watch/${item.slug}/${epNum}`
    : (typeof item.url === 'string' && item.url.startsWith('/show/') ? item.url : `/show/${item.slug}`);

  const handleBellClick = async (e) => {
    e.stopPropagation();
    const nextState = await toggleAnimeEpisodeAlert(
      {
        slug: item.slug,
        titleAr: item.titleAr || title,
        titleEn: item.titleEn || title,
        poster: item.poster,
        latestEpisode: item.episode || 1
      },
      lang
    );
    setSubbed(nextState);
  };

  return (
    <div className="bx-3d-stage" data-delay={delay % 5}>
      <article
        ref={tilt.ref}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        onTouchMove={tilt.onTouchMove}
        onTouchEnd={tilt.onTouchEnd}
        className="wit-ep-card bx-3d-card ep-tile reveal"
        onClick={() => (onClick ? onClick(item) : navigate(target))}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && navigate(target)}
      >
        <div className="bx-3d-card__glare" aria-hidden="true" />
        <div className="bx-3d-card__rim" aria-hidden="true" />

        <div className="wit-ep-card__thumb bx-3d-card__poster ep-tile__thumb">
          <Poster src={item.poster} alt={title} cls="bx-3d-card__img" />
          <div className="bx-3d-card__vignette" aria-hidden="true" />

          {/* Floating 3D Episode Number Badge (only when the feed says which episode) */}
          {(epNum > 0 || item.kind === 'movie') && (
            <div className="wit-ep-card__num ep-tile__num bx-3d-float-z2">
              {epNum > 0
                ? (lang === 'ar' ? `الحلقة ${formatNumber(epNum)}` : `${t('common.ep')} ${formatNumber(epNum)}`)
                : (lang === 'ar' ? 'فيلم' : 'Movie')}
            </div>
          )}

          {/* Floating 3D Quick Alert Bell */}
          <button
            type="button"
            className={`wit-bell-btn bx-3d-float-z2 ${subbed ? 'active' : ''}`}
            onClick={handleBellClick}
            title={lang === 'ar' ? 'تفعيل إشعارات الحلقات الجديدة على هاتفك/الكمبيوتر' : 'Enable Episode Alerts'}
          >
            {subbed ? '🔔' : '📲'}
          </button>

          {/* 3D Pop-Out Glass Play Orb */}
          <div className="wit-anime-card__hover bx-3d-float-z3">
            <span className="wit-play-circle bx-3d-orb">▶</span>
          </div>

          {progress != null && progress > 0 && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: '3px',
                background: 'rgba(255,255,255,0.14)',
                zIndex: 5
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, progress * 100)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #f59e0b, #22d3ee)'
                }}
              />
            </div>
          )}
        </div>

        <div className="wit-ep-card__body bx-3d-card__body ep-tile__body">
          <h3 className="wit-ep-card__title ep-tile__title" title={title}>
            {title}
          </h3>
        </div>
      </article>
    </div>
  );
}

/**
 * Continue Watching Card with 3D Glassy Tilt
 */
export function ContinueCard({ item: itemProp, entry, onRemove, delay = 0 }) {
  const { t, lang, formatNumber } = useI18n();
  const navigate = useNavigate();
  const tilt = useLuxury3DTilt();
  // Dashboard and MyList pass the progress row as `entry`; accept `item` too.
  // Without this, `item` was undefined and the whole page crashed (black
  // screen) for every signed-in user with an unfinished episode.
  const item = itemProp || entry;
  if (!item) return null;
  const title = (lang === 'ar' ? item.titleAr : item.titleEn) || item.titleEn || item.slug;
  const pct = item.duration > 0 ? Math.min(1, item.position / item.duration) : 0;

  return (
    <div className="bx-3d-stage" data-delay={delay % 5}>
      <article
        ref={tilt.ref}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        onTouchMove={tilt.onTouchMove}
        onTouchEnd={tilt.onTouchEnd}
        className="wit-ep-card bx-3d-card ep-tile reveal"
        onClick={() => navigate(`/watch/${item.slug}/${item.episode}`)}
        role="button"
        tabIndex={0}
      >
        <div className="bx-3d-card__glare" aria-hidden="true" />
        <div className="bx-3d-card__rim" aria-hidden="true" />
        <div className="wit-ep-card__thumb bx-3d-card__poster ep-tile__thumb">
          <Poster src={item.poster} alt={title} cls="bx-3d-card__img" />
          <div className="bx-3d-card__vignette" aria-hidden="true" />
          <div className="wit-ep-card__num ep-tile__num bx-3d-float-z2">
            {lang === 'ar' ? `الحلقة ${formatNumber(item.episode)}` : `${t('common.ep')} ${formatNumber(item.episode)}`}
          </div>
          {onRemove && (
            <button
              type="button"
              className="wit-bell-btn bx-3d-float-z2"
              onClick={(e) => { e.stopPropagation(); onRemove(item); }}
              title={t('common.close')}
            >
              ✕
            </button>
          )}
          <div className="wit-anime-card__hover bx-3d-float-z3">
            <span className="wit-play-circle bx-3d-orb">▶</span>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '4px', background: 'rgba(255,255,255,0.16)', zIndex: 5 }}>
            <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #22d3ee)' }} />
          </div>
        </div>
        <div className="wit-ep-card__body bx-3d-card__body ep-tile__body">
          <h3 className="wit-ep-card__title ep-tile__title" title={title}>{title}</h3>
        </div>
      </article>
    </div>
  );
}

