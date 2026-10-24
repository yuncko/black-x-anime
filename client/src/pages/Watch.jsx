import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { useAsync, applyLiveColor, useDominantColor, pushToast } from '../hooks/hooks.js';
import VideoPlayer from '../components/VideoPlayer.jsx';
import LiveArabicSubtitlesPanel from '../components/LiveArabicSubtitlesPanel.jsx';
import WatchPartyPanel from '../components/WatchPartyPanel.jsx';
import { resolveUserVipTier } from '../components/VipPlansAndDevCodes.jsx';
import { isAnimeEpisodeAlertEnabled, toggleAnimeEpisodeAlert } from '../utils/deviceNotifications.js';
import { DownloadModal } from '../components/DownloadModal.jsx';
import { downloadQualityTier, unknownQualityLabel } from '../utils/downloadQuality.js';
import { LiquidLoader, EmptyState } from '../components/Loading.jsx';
import { isHiddenAnime } from '../../../shared/contentFilter.js';
import { auth, syncProgressToFirestore, syncFavoriteToFirestore, removeFavoriteFromFirestore } from '../firebase.js';

export default function Watch({ onOpenAuth }) {
  const { slug, ep } = useParams();
  const [searchParams] = useSearchParams();
  const sourceParam = (searchParams.get('source') || '').toLowerCase();
  const isAniProject = sourceParam === 'aniproject' || String(slug).startsWith('ap-');
  const srcSuffix = sourceParam ? `?source=${sourceParam}` : '';
  const episode = Number(ep) > 0 ? Number(ep) : 1;
  const navigate = useNavigate();
  const { t, lang, formatNumber } = useI18n();
  const { user } = useAuth();

  useEffect(() => {
    if (!ep || ep === 'undefined' || ep === 'NaN' || !(Number(ep) > 0)) {
      navigate(`/watch/${slug}/${episode}${srcSuffix}`, { replace: true });
    }
  }, [ep, slug, episode, srcSuffix, navigate]);

  const showQuery = useAsync(() => api.get(`/api/stream/show/${slug}${srcSuffix}`), [slug, srcSuffix]);
  const [episodeData, setEpisodeData] = useState(null); // { entries, downloads, resolved, resolvedDownloads }
  const [scraperDownloads, setScraperDownloads] = useState(null); // { cloudHosts, qualities }
  const [resolvingDlId, setResolvingDlId] = useState(null);
  const [sourcesError, setSourcesError] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [resumeAt, setResumeAt] = useState(0);
  const [fav, setFav] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const saveRef = useRef(null);
  const lastPos = useRef({ pos: 0, dur: 0 });
  const sourceLoadIdRef = useRef(0);

  const show = showQuery.data?.show;
  const color = useDominantColor(show?.poster, '#22d3ee');

  useEffect(() => {
    if (color) applyLiveColor(color);
    return () => applyLiveColor('#8b5cf6');
  }, [color]);

  /* ------------------------------ sources ------------------------------ */
  const loadSources = useCallback(() => {
    const requestId = ++sourceLoadIdRef.current;
    setSourcesLoading(true);
    setSourcesError(false);
    setEpisodeData(null);
    setScraperDownloads(null);
    setResolvingDlId(null);

    api.get(`/api/stream/episode/${slug}/${episode}${srcSuffix}`)
      .then((d) => {
        if (requestId !== sourceLoadIdRef.current) return;
        if (!d?.entries?.length && !d?.downloads?.length) throw new Error('empty');
        setEpisodeData({
          entries: d.entries || [],
          downloads: d.downloads || [],
          resolved: d.resolved || {},
          resolvedDownloads: d.resolvedDownloads || {}
        });
      })
      .catch(() => {
        if (requestId === sourceLoadIdRef.current) setSourcesError(true);
      })
      .finally(() => {
        if (requestId === sourceLoadIdRef.current) setSourcesLoading(false);
      });

    // Hearbor 4 already includes upstream-supplied download links in the
    // episode response; do not fetch the same provider episode a second time.
    if (!isAniProject) {
      api.get(`/api/stream/download-sources/${slug}/${episode}`)
        .then((dlRes) => {
          if (requestId === sourceLoadIdRef.current) setScraperDownloads(dlRes);
        })
        .catch(() => {});
    }
  }, [slug, episode, srcSuffix, isAniProject]);

  useEffect(() => {
    loadSources();
    return () => { sourceLoadIdRef.current += 1; };
  }, [loadSources]);

  /** Resolve one manifest server on demand (stream gate → embed/direct). */
  const resolveEntry = useCallback(async (entry) => {
    const entryId = typeof entry === 'string' ? entry : entry?.id;
    if (!entryId) return null;
    const requestId = sourceLoadIdRef.current;
    try {
      const d = await api.post('/api/stream/resolve', { slug, episode, entryId });
      if (requestId === sourceLoadIdRef.current) {
        setEpisodeData((prev) => (prev
          ? { ...prev, resolved: { ...prev.resolved, [entryId]: d.source } }
          : prev));
      }
      return d.source;
    } catch {
      pushToast(t('watch.sourceError'), 'error');
      return null;
    }
  }, [slug, episode, t]);

  /** Resolve one download server on demand (download gate → direct/link). */
  const resolveDownload = useCallback(async (entry) => {
    const entryId = typeof entry === 'string' ? entry : entry?.id;
    if (!entryId) return null;
    const requestId = sourceLoadIdRef.current;
    try {
      const d = await api.post('/api/stream/resolve-download', { slug, episode, entryId });
      if (requestId === sourceLoadIdRef.current) {
        setEpisodeData((prev) => (prev
          ? {
              ...prev,
              resolvedDownloads: { ...(prev.resolvedDownloads || {}), [entryId]: d.source }
            }
          : prev));
      }
      return d.source;
    } catch {
      pushToast(t('watch.sourceError'), 'error');
      return null;
    }
  }, [slug, episode, t]);

  /* --------------------------- library state --------------------------- */
  useEffect(() => {
    if (!user) { setFav(false); setResumeAt(0); return undefined; }
    let alive = true;
    api.get(`/api/library/favorites/${slug}`).then((d) => alive && setFav(d.favorite)).catch(() => {});
    api.get(`/api/library/progress/${slug}/${episode}`)
      .then((d) => {
        if (!alive) return;
        const p = d.progress;
        if (p && !p.completed && p.position > 25 && p.duration && p.position / p.duration < 0.95) {
          setResumeAt(p.position);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [user, slug, episode]);

  const saveProgress = useCallback(
    (position, duration, completed) => {
      if (!user) return;
      const pos = Math.max(0, Math.min(Number(position) || 0, 24 * 3600));
      const dur = Math.max(0, Math.min(Number(duration) || 0, 24 * 3600));
      if (!completed && dur > 0 && pos < 1) return; // don't spam t=0 rows
      const payload = {
        position: Math.floor(pos),
        duration: Math.floor(dur),
        completed: completed === true,
        titleEn: show?.titleEn || slug,
        titleAr: show?.titleAr || null,
        poster: show?.poster || null
      };
      api.put(`/api/library/progress/${slug}/${episode}`, payload).catch(() => {});
      if (auth.currentUser) {
        syncProgressToFirestore(auth.currentUser.uid, { slug, episode, ...payload }).catch(() => {});
      }
    },
    [user, slug, episode, show]
  );

  const markWatched = useCallback(() => {
    saveProgress(lastPos.current.pos || 0, lastPos.current.dur || 0, true);
    pushToast(t('toast.saved'), 'success');
  }, [saveProgress, t]);

  // debounce-ish save wrapper
  saveRef.current = saveProgress;

  const toggleFav = async () => {
    if (!user) { onOpenAuth('login'); return; }
    const prev = fav;
    setFav(!prev);
    try {
      if (prev) {
        await api.del(`/api/library/favorites/${slug}`);
        if (auth.currentUser) {
          removeFavoriteFromFirestore(auth.currentUser.uid, slug).catch(() => {});
        }
        pushToast(t('toast.favoriteRemoved'), 'success');
      } else {
        const favPayload = {
          titleEn: show?.titleEn || slug,
          titleAr: show?.titleAr,
          poster: show?.poster,
          banner: show?.banner,
          episodes: show?.episodeCount
        };
        await api.put(`/api/library/favorites/${slug}`, favPayload);
        if (auth.currentUser) {
          syncFavoriteToFirestore(auth.currentUser.uid, { slug, ...favPayload }).catch(() => {});
        }
        pushToast(t('toast.favoriteAdded'), 'success');
      }
    } catch {
      setFav(prev);
    }
  };

  /* ------------------------------ nav ------------------------------ */
  const episodes = (show?.episodes || []).map((e, i) => ({
    ...e,
    episode: Number(e.episode ?? e.number) > 0 ? Number(e.episode ?? e.number) : i + 1,
    number: Number(e.number ?? e.episode) > 0 ? Number(e.number ?? e.episode) : i + 1
  }));
  const idx = episodes.findIndex((e) => e.episode === episode);
  const prevEp = idx > 0 ? episodes[idx - 1] : null;
  const nextEp = idx >= 0 && idx < episodes.length - 1 ? episodes[idx + 1] : null;

  const title = show ? ((lang === 'ar' ? show.titleAr : show.titleEn) || show.titleEn) : slug;
  const vipTier = resolveUserVipTier(user);
  const isVipMember = vipTier === 'vip_basic' || vipTier === 'vip_monarch';

  // Broadcast active stream session to the Website Mini Floating Player
  useEffect(() => {
    if (!episodeData?.resolved) return;
    const resolvedList = Object.values(episodeData.resolved).filter((s) => s && s.url);
    const activeSrc = resolvedList[0];
    if (activeSrc?.url && typeof window !== 'undefined') {
      const detail = {
        slug,
        episode,
        title: show?.titleEn || title || slug,
        poster: show?.poster || '/blackx-logo.png',
        url: activeSrc.url,
        kind: activeSrc.kind || 'embed'
      };
      window.__bxMiniPlayer = detail;
      window.dispatchEvent(new CustomEvent('bx_mini_player_update', { detail }));
    }
  }, [episodeData, slug, episode, show, title]);
  const [alertEnabled, setAlertEnabled] = useState(() => isAnimeEpisodeAlertEnabled(slug));

  useEffect(() => {
    setAlertEnabled(isAnimeEpisodeAlertEnabled(slug));
  }, [slug]);

  const maxEpisodeNum = episodes.length ? Math.max(...episodes.map((e) => Number(e.episode || 0))) : 0;

  if (showQuery.loading && sourcesLoading) return <LiquidLoader />;
  if (showQuery.error && !show) {
    return (
      <div className="glass" style={{ padding: '2.5rem' }}>
        <EmptyState icon="🔍" title={t('show.notFound')}>
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/browse')}>{t('common.back')}</button>
        </EmptyState>
      </div>
    );
  }
  // Ecchi / Harem / Isekai are hidden from Hearbor (shared/contentFilter.js; the API marks them).
  if (show && isHiddenAnime(show)) {
    return (
      <div className="glass" style={{ padding: '2.5rem' }}>
        <EmptyState icon="✕" title={lang === 'ar' ? 'العمل ده مش متاح على Hearbor' : 'This title is not available on Hearbor'}>
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/')}>{t('common.back')}</button>
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <div className="watch-layout">
        <div className="watch-main">
          {/* ---------- the player ---------- */}
          {sourcesLoading ? (
            <div className="player-shell glass">
              <div className="player-stage" style={{ display: 'grid', placeItems: 'center', minHeight: '320px' }}>
                <div className="liquid-loader">
                  <div className="liquid-loader__blobs">
                    <div className="liquid-loader__blob" />
                    <div className="liquid-loader__blob" />
                    <div className="liquid-loader__blob" />
                  </div>
                  <div>{t('watch.loadingSources')}</div>
                </div>
              </div>
            </div>
          ) : sourcesError || !episodeData ? (
            <div className="player-shell glass">
              <div className="player-stage" style={{ display: 'grid', placeItems: 'center', minHeight: '320px' }}>
                <EmptyState icon="📡" title={t('watch.noSources')} sub={t('dashboard.sourceDown')}>
                  <button type="button" className="btn btn--primary" onClick={loadSources}>
                    <span className="btn__shine" />
                    {t('common.retry')}
                  </button>
                </EmptyState>
              </div>
            </div>
          ) : (
            <div>
              <VideoPlayer
                key={`${slug}-${episode}-${sourceParam || 'auto'}`}
                entries={episodeData.entries}
                resolved={episodeData.resolved}
                onResolve={resolveEntry}
                onOpenDownload={isAniProject ? null : () => setDownloadModalOpen(true)}
                title={title}
                episodeLabel={t('watch.episodePicker', { n: formatNumber(episode) })}
                startTime={resumeAt}
                resumePrompt={resumeAt > 0}
                onProgress={(pos, dur) => {
                  lastPos.current = { pos, dur };
                  saveRef.current?.(pos, dur);
                }}
                onEnded={() => saveRef.current?.(lastPos.current.pos, lastPos.current.dur || lastPos.current.pos, true)}
                onPrev={prevEp ? () => navigate(`/watch/${slug}/${prevEp.episode}${srcSuffix}`) : null}
                onNext={nextEp ? () => navigate(`/watch/${slug}/${nextEp.episode}${srcSuffix}`) : null}
                nextLabel={nextEp ? t('watch.episodePicker', { n: formatNumber(nextEp.episode) }) : null}
              />

              {/* ---------- Live English -> Arabic AI Subtitle Translator Bar ---------- */}
              <LiveArabicSubtitlesPanel
                slug={slug}
                episode={episode}
                titleEn={show?.titleEn || title}
                lang={lang}
                autoEnable={sourceParam === 'english' || String(slug).startsWith('en-') || String(slug).startsWith('mal-')}
                currentPosRef={lastPos}
              />
            </div>
          )}

          {/* Nothing here advertises VIP streaming modes. There is no 4K / HDR / 60 fps mode, no
              uncompressed «VIP Fast CDN» switch and no early access: the old Monarch 4K toggle only tinted
              the video, the Fast CDN toggle changed nothing (the API already lists direct servers first for
              VIP) and free users were never delayed. All removed with the owner's OK (2026-10-16); do not
              bring them back. The upgrade button lives with the actions under the player. */}
          {isAniProject && (
            <div className="glass" style={{ marginTop: '0.85rem', padding: '0.8rem 1rem', color: 'rgba(255,255,255,0.8)' }}>
              {lang === 'ar'
                ? '🔎 سيرفر Hearbor 4 — جودة البث والترجمة حسب الخادم المصدر؛ إذا تعذر التشغيل، تحقق من إعدادات CORS أو ANIPROJECT_MEDIA_HOSTS.'
                : '🔎 Hearbor 4 — quality and subtitles depend on the upstream server. If playback fails, check CORS or ANIPROJECT_MEDIA_HOSTS.'}
            </div>
          )}

          {/* ---------- meta under player ---------- */}
          <div className="watch-meta glass reveal" style={{ borderRadius: '26px', background: '#050508', border: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <div className="watch-meta__kicker" style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <Link to={`/show/${slug}${srcSuffix}`} style={{ color: '#ffffff', fontWeight: 800 }}>{title}</Link>
                {show?.titleAr && lang !== 'ar' && <span> · {show.titleAr}</span>}
                <span style={{ fontSize: '0.72rem', padding: '0.16rem 0.65rem', borderRadius: '999px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.28)', color: '#ffffff', fontWeight: 900 }}>
                  {show?.sourceName || (sourceParam === 'aniproject' ? 'سيرفر Hearbor 4' : sourceParam === 'english' ? '🌐 سيرفر Hearbor 3' : sourceParam === 'anime3rb' ? '⚡ سيرفر Hearbor 2' : '👑 سيرفر Hearbor 1')}
                </span>
              </div>
              <h1 className="watch-meta__title">
                {t('watch.episodePicker', { n: formatNumber(episode) })}
              </h1>
              <div className="watch-meta__shortcuts">{t('watch.shortcuts')}</div>
            </div>
            <div className="watch-meta__actions">
              <button
                type="button"
                className={`btn btn--sm ${alertEnabled ? 'btn--primary' : 'btn--ghost'}`}
                onClick={async () => {
                  const nextState = await toggleAnimeEpisodeAlert(
                    {
                      slug,
                      titleAr: show?.titleAr || title,
                      titleEn: show?.titleEn || title,
                      poster: show?.poster || '/blackx-logo.png',
                      latestEpisode: maxEpisodeNum || episode
                    },
                    lang
                  );
                  setAlertEnabled(nextState);
                }}
              >
                {alertEnabled
                  ? (lang === 'ar' ? '🔔 إشعارات الجهاز مفعّلة ✓' : '🔔 Device Alerts On ✓')
                  : (lang === 'ar' ? '📲 تفعيل إشعارات الحلقات' : '📲 Enable Episode Alerts')}
              </button>
              {!isAniProject && (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => setDownloadModalOpen(true)}
                >
                  📥 {t('watch.downloadEpisode')}
                </button>
              )}
              <button type="button" className={`btn btn--sm ${fav ? 'btn--primary' : 'btn--ghost'}`} onClick={toggleFav}>
                {fav ? '♥' : '♡'} {fav ? t('show.unfavorite') : t('show.favorite')}
              </button>
              {user && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={markWatched}
                >
                  ✓ {t('watch.markWatched')}
                </button>
              )}
              {!isAniProject && vipTier === 'free' && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('/profile?tab=referrals')}>
                  👑 {lang === 'ar' ? 'ترقية إلى VIP / تفعيل كود اشتراك' : 'Upgrade to VIP / Redeem Code'}
                </button>
              )}
              {nextEp && (
                <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate(`/watch/${slug}/${nextEp.episode}${srcSuffix}`)}>
                  {t('watch.nextEpisode')} →
                </button>
              )}
            </div>
          </div>

          {/* Show only links actually returned by the new provider; no inferred resolutions/VIP tiers. */}
          {isAniProject && episodeData?.downloads?.length > 0 && (
            <div className="glass" style={{ marginTop: '0.85rem', padding: '0.9rem 1rem' }}>
              <strong>{lang === 'ar' ? 'روابط التحميل المتاحة' : 'Available download links'}</strong>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                {episodeData.downloads.filter((dl) => dl.downloadUrl).map((dl) => (
                  <a key={dl.id} className="btn btn--ghost btn--sm" href={dl.downloadUrl}
                    target="_blank" rel="noopener noreferrer">
                    📥 {dl.server || 'Hearbor 4'}{dl.quality && dl.quality !== 'Download' ? ` · ${dl.quality}` : ''}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ---------- Existing-source Direct Multi-Quality Download Table ---------- */}
          {!isAniProject && (episodeData?.entries?.length > 0 || episodeData?.downloads?.length > 0 || scraperDownloads?.cloudHosts?.length > 0) && (() => {
            const downloadCandidates = [...(scraperDownloads?.cloudHosts || []), ...(episodeData?.downloads || [])];
            const downloadById = new Map();
            downloadCandidates.forEach((d, idx) => {
              const key = d.id || d.url || d.downloadUrl || d.directUrl || `dl-${idx}`;
              const previous = downloadById.get(key) || {};
              downloadById.set(key, {
                ...previous,
                ...d,
                url: d.url || d.downloadUrl || previous.url || previous.downloadUrl || null,
                directUrl: d.directUrl || previous.directUrl || previous.downloadUrl || null
              });
            });
            const seenDownloadUrls = new Set();
            const allDownloads = [...downloadById.values()]
              .filter((d) => {
                const url = d.directUrl || d.url || d.downloadUrl;
                if (!url) return true;
                if (seenDownloadUrls.has(url)) return false;
                seenDownloadUrls.add(url);
                return true;
              })
              .map((d, idx) => {
                const res = episodeData?.resolvedDownloads?.[d.id] || {};
                return {
                  id: d.id || `dl-${idx}`,
                  server: d.server || d.label || `Server ${idx + 1}`,
                  // Only the quality the server reported: nothing = «جودة غير معروفة» (free), never a guessed FHD.
                  quality: String(d.quality || '').trim().toUpperCase(),
                  url: d.url || d.downloadUrl || res.downloadUrl || res.url || res.directUrl || null,
                  directUrl: d.directUrl || res.directUrl || res.downloadUrl || res.url || null
                };
              });

            const fhdLinks = allDownloads.filter((d) => downloadQualityTier(d.quality) === 'fhd');
            const hdLinks = allDownloads.filter((d) => downloadQualityTier(d.quality) === 'hd');
            const sdLinks = allDownloads.filter((d) => downloadQualityTier(d.quality) === 'sd');
            const unknownLinks = allDownloads.filter((d) => downloadQualityTier(d.quality) === 'unknown');

            const handleDirectTableClick = async (dlItem, requireVip = false) => {
              if (requireVip && !isVipMember) {
                pushToast(
                  lang === 'ar'
                    ? '👑 تحميل جودة FHD 1080p متاح لمشتركي VIP فقط! يمكنك التحميل بجودة HD أو SD مجاناً.'
                    : '👑 FHD 1080p download is exclusive to VIP members! Download HD/SD for free.',
                  'info'
                );
                navigate('/profile?tab=referrals');
                return;
              }
              let targetUrl = dlItem.directUrl || dlItem.url;
              let pendingWindow = null;
              if (!targetUrl && dlItem.id) {
                pendingWindow = window.open('about:blank', '_blank');
                if (pendingWindow) pendingWindow.opener = null;
                setResolvingDlId(dlItem.id);
                const resolved = await resolveDownload(dlItem);
                setResolvingDlId(null);
                targetUrl = resolved?.directUrl || resolved?.downloadUrl || resolved?.url || null;
              }
              if (targetUrl) {
                if (pendingWindow && !pendingWindow.closed) pendingWindow.location.replace(new URL(targetUrl, window.location.origin).href);
                else if (!pendingWindow) window.open(targetUrl, '_blank', 'noopener,noreferrer');
                pushToast(lang === 'ar' ? `جاري فتح رابط التحميل (${dlItem.server})...` : `Opening download (${dlItem.server})...`, 'success');
              } else {
                pendingWindow?.close();
                setDownloadModalOpen(true);
              }
            };

            return (
              <div className="wit-section" style={{ marginTop: '0.85rem' }}>
                <div className="wit-sec-header" style={{ marginBottom: '0.75rem', paddingBottom: '0.65rem' }}>
                  <div className="wit-sec-header__right">
                    <span className="wit-sec-header__bar" />
                    <h3 className="wit-sec-header__title" style={{ fontSize: '1rem' }}>
                      <span>📥</span> {lang === 'ar' ? 'جدول تحميل الحلقة المباشر (Hearbor)' : 'Direct Episode Download Table (Hearbor)'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="wit-sec-header__more"
                    onClick={() => setDownloadModalOpen(true)}
                    style={{ cursor: 'pointer' }}
                  >
                    {lang === 'ar' ? 'كل روابط التحميل ←' : 'All Download Links →'}
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {/* Row 1: الجودة الخارقة FHD (1080p) — only links the server reported as FHD */}
                  {fhdLinks.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.6rem',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '10px',
                      background: 'rgba(6, 6, 6, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.22)'
                    }}
                  >
                    <span style={{ fontWeight: 900, fontSize: '0.84rem', color: '#ffffff' }}>
                      👑 {lang === 'ar' ? 'الجودة الخارقة FHD (1080p)' : 'Full HD (1080p)'}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {fhdLinks.map((dl) => (
                        <button
                          key={`dl-fhd-${dl.id}`}
                          type="button"
                          className="wit-server-tab wit-server-tab--vip"
                          disabled={resolvingDlId === dl.id}
                          onClick={() => handleDirectTableClick(dl, true)}
                        >
                          <span>📥 {resolvingDlId === dl.id ? '...' : dl.server}</span>
                          <small>{isVipMember ? dl.quality : '🔒 VIP'}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  )}

                  {/* Row 2: الجودة العالية HD (720p • مجاناً) — only links reported as HD */}
                  {hdLinks.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.6rem',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '10px',
                      background: 'rgba(6, 6, 6, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.14)'
                    }}
                  >
                    <span style={{ fontWeight: 900, fontSize: '0.84rem', color: '#d4d4d8' }}>
                      🖥️ {lang === 'ar' ? 'الجودة العالية HD (720p • مجاناً)' : 'High Definition HD (720p • Free)'}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {hdLinks.map((dl) => (
                        <button
                          key={`dl-hd-${dl.id}`}
                          type="button"
                          className="wit-server-tab"
                          disabled={resolvingDlId === dl.id}
                          onClick={() => handleDirectTableClick(dl, false)}
                        >
                          <span>📥 {resolvingDlId === dl.id ? '...' : dl.server}</span>
                          <small>{dl.quality}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  )}

                  {/* Row 3: الجودة المتوسطة SD (480p • مجاناً) */}
                  {sdLinks.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.6rem',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '10px',
                        background: 'rgba(6, 6, 6, 0.9)',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      <span style={{ fontWeight: 900, fontSize: '0.84rem', color: '#a1a1aa' }}>
                        📱 {lang === 'ar' ? 'الجودة المتوسطة SD (480p • مجاناً)' : 'Standard Definition SD (480p • Free)'}
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {sdLinks.map((dl) => (
                          <button
                            key={`dl-sd-${dl.id}`}
                            type="button"
                            className="wit-server-tab"
                            disabled={resolvingDlId === dl.id}
                            onClick={() => handleDirectTableClick(dl, false)}
                          >
                            <span>📥 {resolvingDlId === dl.id ? '...' : dl.server}</span>
                            <small>{dl.quality}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Row 4: links whose server did not say the quality — labelled as such, free */}
                  {unknownLinks.length > 0 && (
                    <div
                      className="wit-dl-unknown"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.6rem',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '10px',
                        background: 'rgba(6, 6, 6, 0.9)',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      <span style={{ fontWeight: 900, fontSize: '0.84rem', color: '#a1a1aa' }}>
                        ❔ {lang === 'ar' ? `${unknownQualityLabel(lang)} (مجاناً)` : `${unknownQualityLabel(lang)} (free)`}
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {unknownLinks.map((dl) => (
                          <button
                            key={`dl-unknown-${dl.id}`}
                            type="button"
                            className="wit-server-tab"
                            disabled={resolvingDlId === dl.id}
                            onClick={() => handleDirectTableClick(dl, false)}
                          >
                            <span>📥 {resolvingDlId === dl.id ? '...' : dl.server}</span>
                            {dl.quality ? <small>{dl.quality}</small> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ---------- Watch Party Rooms & Timestamped / Voice Comments ---------- */}
          <WatchPartyPanel
            slug={slug}
            episode={episode}
            title={title}
            currentPosRef={lastPos}
          />
        </div>

        {/* ---------- episode sidebar ---------- */}
        <aside className={`watch-side glass ${sidebarOpen ? '' : 'collapsed'}`}>
          <div className="watch-side__head">
            <h2>🎬 {t('show.episodesList')}</h2>
            <button type="button" className="icon-btn" onClick={() => setSidebarOpen((v) => !v)}>
              {sidebarOpen ? '»' : '«'}
            </button>
          </div>
          {sidebarOpen && (
            <div className="watch-side__list">
              {(show?.episodes || []).map((e) => {
                const isLatest = !isAniProject && episodes.length > 1 && Number(e.episode) === maxEpisodeNum;
                return (
                  <button
                    key={e.episode}
                    type="button"
                    className={`watch-ep ${e.episode === episode ? 'active' : ''}`}
                    onClick={() => navigate(`/watch/${slug}/${e.episode}${srcSuffix}`)}
                  >
                    <span className="watch-ep__num">{formatNumber(e.episode)}</span>
                    <span className="watch-ep__label">
                      {t('watch.episodePicker', { n: formatNumber(e.episode) })}
                    </span>
                    {isLatest && (
                      <span
                        className="watch-ep__latest"
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 900,
                          padding: '0.12rem 0.45rem',
                          borderRadius: '99px',
                          background: 'rgba(255,255,255,0.12)',
                          color: '#ffffff',
                          border: '1px solid rgba(255,255,255,0.35)'
                        }}
                      >
                        {lang === 'ar' ? 'الأحدث' : 'Latest'}
                      </span>
                    )}
                    {e.episode === episode && <span className="watch-ep__now">{t('show.playing')}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      <DownloadModal
        isOpen={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
        slug={slug}
        episode={episode}
        title={title}
        showPoster={show?.poster}
        entries={episodeData?.entries || []}
        resolved={episodeData?.resolved || {}}
        downloads={episodeData?.downloads || []}
        resolvedDownloads={episodeData?.resolvedDownloads || {}}
        onResolveDownload={resolveDownload}
        onResolveStreaming={resolveEntry}
      />
    </>
  );
}
