import { imgFallback } from '../hooks/hooks.js';
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { useAsync, useDominantColor, applyLiveColor, pushToast } from '../hooks/hooks.js';
import { LiquidLoader, EmptyState } from '../components/Loading.jsx';
import { RatingPanel } from '../components/Features.jsx';
import {
  isAnimeEpisodeAlertEnabled,
  toggleAnimeEpisodeAlert
} from '../utils/deviceNotifications.js';
import { auth, syncFavoriteToFirestore, removeFavoriteFromFirestore } from '../firebase.js';
import { isHiddenAnime } from '../../../shared/contentFilter.js';

export default function ShowDetail({ onOpenAuth }) {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const sourceParam = (searchParams.get('source') || '').toLowerCase();
  const isAniProject = sourceParam === 'aniproject' || String(slug).startsWith('ap-');
  const srcSuffix = sourceParam ? `?source=${sourceParam}` : '';
  const navigate = useNavigate();
  const { t, lang, formatNumber } = useI18n();
  const { user } = useAuth();

  const { data, loading, error } = useAsync(() => api.get(`/api/stream/show/${slug}${srcSuffix}`), [slug, srcSuffix]);
  const [fav, setFav] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [progress, setProgress] = useState({});
  const [epFilter, setEpFilter] = useState('');
  const [alertEnabled, setAlertEnabled] = useState(() => isAnimeEpisodeAlertEnabled(slug));

  useEffect(() => {
    setAlertEnabled(isAnimeEpisodeAlertEnabled(slug));
  }, [slug]);

  const show = data?.show;
  const color = useDominantColor(show?.poster, '#22d3ee');

  useEffect(() => {
    if (color) applyLiveColor(color);
    return () => applyLiveColor('#8b5cf6');
  }, [color]);

  useEffect(() => {
    if (!user || !slug) { setFav(false); return undefined; }
    let alive = true;
    api.get(`/api/library/favorites/${slug}`)
      .then((d) => alive && setFav(d.favorite))
      .catch(() => alive && setFav(false));
    api.get('/api/library/continue')
      .then((d) => {
        if (!alive) return;
        const map = {};
        (d.history || []).forEach((h) => { if (h.slug === slug) map[h.episode] = h; });
        setProgress(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [user, slug]);

  const toggleFav = async () => {
    if (!user) { onOpenAuth('login'); return; }
    setFavBusy(true);
    const prev = fav;
    setFav(!prev); // optimistic
    try {
      if (prev) {
        await api.del(`/api/library/favorites/${slug}`);
        if (auth.currentUser) {
          removeFavoriteFromFirestore(auth.currentUser.uid, slug).catch(() => {});
        }
        pushToast(t('toast.favoriteRemoved'), 'success');
      } else {
        const favPayload = {
          titleEn: show.titleEn,
          titleAr: show.titleAr,
          poster: show.poster,
          banner: show.banner,
          episodes: show.episodeCount
        };
        await api.put(`/api/library/favorites/${slug}`, favPayload);
        if (auth.currentUser) {
          syncFavoriteToFirestore(auth.currentUser.uid, { slug, ...favPayload }).catch(() => {});
        }
        pushToast(t('toast.favoriteAdded'), 'success');
      }
    } catch {
      setFav(prev);
    } finally {
      setFavBusy(false);
    }
  };

  if (loading) return <LiquidLoader />;
  if (error || !show) {
    return (
      <div className="glass" style={{ padding: '2.5rem' }}>
        <EmptyState icon="🔍" title={t('show.notFound')}>
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/browse')}>{t('common.back')}</button>
        </EmptyState>
      </div>
    );
  }

  // Ecchi / Harem / Isekai are hidden from Hearbor (shared/contentFilter.js; the API marks them).
  if (isHiddenAnime(show)) {
    return (
      <div className="glass" style={{ padding: '2.5rem' }}>
        <EmptyState icon="✕" title={lang === 'ar' ? 'العمل ده مش متاح على Hearbor' : 'This title is not available on Hearbor'}>
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/')}>{t('common.back')}</button>
        </EmptyState>
      </div>
    );
  }

  const title = (lang === 'ar' ? show.titleAr : show.titleEn) || show.titleEn;
  const otherTitle = lang === 'ar' ? show.titleEn : show.titleAr;
  const eps = (show.episodes || []).map((e, idx) => ({
    ...e,
    episode: Number(e.episode ?? e.number) > 0 ? Number(e.episode ?? e.number) : idx + 1,
    number: Number(e.number ?? e.episode) > 0 ? Number(e.number ?? e.episode) : idx + 1
  }));
  const continueEp = eps.find((e) => progress[e.episode] && !progress[e.episode].completed) || eps[0];
  // Once per render (it used to be recomputed for every episode: ~1M comparisons for a 1,000-episode show).
  const latestEpNum = eps.reduce((max, e) => Math.max(max, Number(e.episode) || 0), 0);
  // Facts the API really has (no invented likes, views, match %, quality or duration).
  const episodeTotal = Number(show.episodeCount) > 0 ? Number(show.episodeCount) : eps.length;
  const ratingRaw = Number(show.rating) || (Number(show.score) > 0 ? Number(show.score) : 0);
  const ratingTen = ratingRaw > 0 ? (ratingRaw > 10 ? ratingRaw / 10 : ratingRaw).toFixed(1) : '';
  const serverLabel = isAniProject ? 'Hearbor 4' : String(show.sourceName || show.sourceLabel || '').replace(/^سيرفر\s+/, '') || 'Hearbor';
  const facts = [
    { label: lang === 'ar' ? 'النوع' : 'Type', value: show.type || '' },
    { label: lang === 'ar' ? 'الحالة' : 'Status', value: show.status || '' },
    { label: lang === 'ar' ? 'عدد الحلقات' : 'Episodes', value: episodeTotal ? formatNumber(episodeTotal) : '' },
    { label: lang === 'ar' ? 'السنة' : 'Year', value: show.year ? String(show.year) : '' },
    { label: lang === 'ar' ? 'الموسم' : 'Season', value: show.season || '' },
    { label: lang === 'ar' ? 'الاستوديو' : 'Studio', value: show.studio || '' },
    { label: lang === 'ar' ? 'السيرفر' : 'Server', value: serverLabel }
  ].filter((f) => f.value);

  return (
    <>
      <button
        type="button"
        className="btn btn--ghost btn--sm reveal"
        style={{
          marginBlockEnd: '1.15rem',
          borderRadius: '999px',
          padding: '0.48rem 1.05rem',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.22)'
        }}
        onClick={() => navigate(-1)}
      >
        <span style={{ transform: 'scaleX(var(--flip))', display: 'inline-block' }}>←</span> {t('common.back')}
      </button>

      <section
        className="detail-hero glass reveal sloth-show-hub"
        style={{
          borderRadius: '28px',
          background: '#050508',
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 28px 70px rgba(0,0,0,0.95)',
          overflow: 'hidden'
        }}
      >
        <div className="detail-hero__banner" style={{ backgroundImage: `url(${show.banner || show.poster || ''})` }} />
        <div className="detail-hero__veil" />
        <div className="detail-hero__content">
          <div className="detail-poster" style={{ borderRadius: '22px', overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.28)' }}>
            {show.poster ? (
              <img onError={imgFallback} src={show.poster} alt={title} referrerPolicy="no-referrer" />
            ) : (
              <img src="/blackx-logo.png" alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>

          <div>
            {/* Official slothUI Pro [Hearbor] original Seal */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.28rem 0.78rem 0.28rem 0.38rem',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.26)'
                }}
              >
                <img
                  src="/blackx-logo.png"
                  alt="Hearbor"
                  style={{ width: '22px', height: '22px', borderRadius: '6px', objectFit: 'cover' }}
                />
                <span style={{ fontSize: '0.74rem', fontWeight: 900, color: '#ffffff', letterSpacing: '0.02em' }}>
                  Hearbor <span style={{ fontWeight: 500, opacity: 0.78 }}>original</span>
                </span>
              </div>
              <span
                style={{
                  padding: '0.24rem 0.68rem',
                  borderRadius: '999px',
                  background: '#ffffff',
                  color: '#000000',
                  fontSize: '0.68rem',
                  fontWeight: 900
                }}
              >
                {serverLabel}
              </span>
            </div>

            <h1 style={{ fontSize: 'clamp(1.75rem, 3.6vw, 2.65rem)', margin: '0.25rem 0 0', fontWeight: 900 }}>{title}</h1>
            {otherTitle && <p className="detail-title-ar" style={{ color: 'rgba(255,255,255,0.68)' }}>{otherTitle}</p>}

            <div className="detail-meta" style={{ marginTop: '0.6rem' }}>
              <span className="badge badge--cat" style={{ borderRadius: '999px', background: '#ffffff', color: '#000000', fontWeight: 900 }}>
                {show.episodeCount ? t('show.episodeCount', { n: formatNumber(show.episodeCount) }) : `${eps.length} EP`}
              </span>
              {!isAniProject && (
                <span className="badge badge--open" style={{ borderRadius: '999px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.22)' }}>
                  {t('watch.sub')}
                </span>
              )}
              {ratingTen ? (
                <span className="badge" style={{ borderRadius: '999px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.22)', fontWeight: 900 }}>
                  ★ {ratingTen}
                </span>
              ) : null}
            </div>

            {isAniProject ? (
              <p style={{ margin: '0.95rem 0', color: 'rgba(255,255,255,0.72)', fontSize: '0.85rem' }}>
                {lang === 'ar'
                  ? 'الحلقات المتاحة من Hearbor 4 مدرجة أدناه. جودة البث والترجمة تعتمد على الخادم المصدر.'
                  : 'Available Hearbor 4 episodes are listed below. Playback quality and subtitles depend on the upstream source.'}
              </p>
            ) : null}

            {show.description && (
              <p className="detail-synopsis" style={{ color: 'rgba(255,255,255,0.82)' }}>{show.description}</p>
            )}

            {/* What the API knows about the title; unknown facts are left out. */}
            {facts.length > 0 && (
              <div className="wit-meta-grid">
                {facts.map((f) => (
                  <div key={f.label} className="wit-meta-item">
                    <span className="wit-meta-label">{f.label}:</span>
                    <span className="wit-meta-val" dir="auto">{f.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Official slothUI Pro Capsule CTA + Circular Orbs Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', marginBlockStart: '1.15rem' }}>
              {continueEp && (
                <button
                  type="button"
                  onClick={() => navigate(`/watch/${slug}/${continueEp.episode}${srcSuffix}`)}
                  style={{
                    padding: '0.78rem 1.65rem',
                    borderRadius: '999px',
                    background: '#ffffff',
                    color: '#000000',
                    border: '1.5px solid #ffffff',
                    fontWeight: 900,
                    fontSize: '0.9rem',
                    boxShadow: '0 10px 28px rgba(255,255,255,0.24)',
                    cursor: 'pointer'
                  }}
                >
                  ▶ {progress[continueEp.episode] ? t('common.continue') : t('common.watchNow')} · {t('common.ep')} {continueEp.episode}
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  const maxEp = eps.length ? Math.max(...eps.map((e) => Number(e.episode || 0))) : 1;
                  const nextState = await toggleAnimeEpisodeAlert(
                    {
                      slug,
                      titleAr: show.titleAr || title,
                      titleEn: show.titleEn || title,
                      poster: show.poster || '',
                      latestEpisode: maxEp
                    },
                    lang
                  );
                  setAlertEnabled(nextState);
                }}
                style={{
                  padding: '0.76rem 1.25rem',
                  borderRadius: '999px',
                  background: alertEnabled ? '#ffffff' : 'rgba(255,255,255,0.08)',
                  color: alertEnabled ? '#000000' : '#ffffff',
                  border: '1.5px solid rgba(255,255,255,0.3)',
                  fontWeight: 900,
                  fontSize: '0.84rem',
                  cursor: 'pointer'
                }}
              >
                {alertEnabled
                  ? (lang === 'ar' ? '🔔 إشعارات الحلقات مفعّلة ✓' : '🔔 Episode Alerts On ✓')
                  : (lang === 'ar' ? '🔔 تفعيل إشعارات الحلقات' : '🔔 Notify on New Episodes')}
              </button>
              <button
                type="button"
                onClick={toggleFav}
                disabled={favBusy}
                style={{
                  padding: '0.76rem 1.25rem',
                  borderRadius: '999px',
                  background: fav ? '#ffffff' : 'rgba(255,255,255,0.08)',
                  color: fav ? '#000000' : '#ffffff',
                  border: '1.5px solid rgba(255,255,255,0.3)',
                  fontWeight: 900,
                  fontSize: '0.84rem',
                  cursor: 'pointer'
                }}
              >
                {fav ? '♥ ' : '＋ '}{fav ? t('show.unfavorite') : t('show.favorite')}
              </button>
              {eps.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate(`/watch/${slug}/${continueEp?.episode || 1}${srcSuffix}`)}
                  title={t('watch.downloadEpisode')}
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.28)',
                    fontWeight: 900,
                    cursor: 'pointer'
                  }}
                >
                  ⬇
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <RatingPanel slug={slug} title={title} />

      <section className="section">
        <div className="section__head" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
          <h2 className="section__title">🎬 {t('show.episodesList')}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={epFilter}
              onChange={(e) => setEpFilter(e.target.value)}
              placeholder={lang === 'ar' ? '🔍 ابحث برقم الحلقة...' : '🔍 Filter episode #...'}
              style={{
                padding: '0.42rem 0.9rem',
                borderRadius: '999px',
                background: '#08080c',
                border: '1px solid rgba(255,255,255,0.22)',
                color: '#fff',
                fontSize: '0.8rem',
                width: '185px'
              }}
            />
            {isAniProject && (
            <span
              style={{
                fontSize: '0.76rem',
                fontWeight: 800,
                padding: '0.32rem 0.85rem',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.24)',
                color: '#ffffff'
              }}
            >
              {lang === 'ar' ? '🔎 الحلقات المتاحة من سيرفر Hearbor 4' : '🔎 Episodes available on Hearbor 4'}
            </span>
            )}
            <span className="chip" style={{ cursor: 'default' }}>{formatNumber(eps.length)} {t('common.episodes')}</span>
          </div>
        </div>

        {eps.length === 0 ? (
          <div className="glass">
            <EmptyState icon="📼" title={t('browse.empty')} />
          </div>
        ) : (
          <div className="ep-grid reveal">
            {eps
              .filter((e) => !epFilter.trim() || String(e.episode).includes(epFilter.trim()))
              .map((e) => {
                const p = progress[e.episode];
                const pct = p && p.duration ? Math.min(1, p.position / p.duration) : p?.completed ? 1 : 0;
                const isLatest = !isAniProject && eps.length > 1 && Number(e.episode) === latestEpNum;
                return (
                  <button
                    key={e.episode}
                    type="button"
                    className={`ep-chip ${p?.completed ? 'watched' : ''}`}
                    onClick={() => navigate(`/watch/${slug}/${e.episode}${srcSuffix}`)}
                    style={isLatest ? { borderColor: 'rgba(255,255,255,0.6)', position: 'relative' } : undefined}
                  >
                    <span>{lang === 'ar' ? `الحلقة ${formatNumber(e.episode)}` : `EP ${formatNumber(e.episode)}`}</span>
                    {isLatest && (
                      <span
                        className="ep-chip__latest"
                        style={{
                          fontSize: '0.62rem',
                          fontWeight: 900,
                          color: '#ffffff',
                          display: 'block',
                          marginTop: '2px'
                        }}
                      >
                        {lang === 'ar' ? 'الأحدث' : 'Latest'}
                      </span>
                    )}
                    {p && (
                      <span className="ep-chip__bar">
                        <span style={{ width: `${Math.max(6, pct * 100)}%` }} />
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        )}
      </section>
    </>
  );
}
