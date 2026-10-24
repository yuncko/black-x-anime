import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { api, resolveApiUrl } from '../api.js';
import { pushToast } from '../hooks/hooks.js';
import { isFhdQuality } from '../utils/downloadQuality.js';

// The quality tiers live in utils/downloadQuality.js (plain JS, unit-tested).
export { isFhdQuality };

const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
};

const isDirectCdnPlayable = (url) => {
  if (!url) return false;
  const s = String(url).toLowerCase();
  return s.includes('pixeldrain.com/api/file/');
};

// Keep upstream host/provider names out of the player UI. Preserve only the
// Hearbor server tier when it is already part of the branded label.
const brandedServerName = (entry) => {
  const match = String(entry?.server || '').match(/\bBLACK\s*X\s*(?:SERVER\s*)?([1-4])\b/i);
  return match?.[1] ? `Hearbor ${match[1]}` : 'Hearbor';
};

const hasCustomPlayerSource = (entry, resolved = {}) => {
  const source = resolved?.[entry?.id] || entry || {};
  return Boolean(
    source.directUrl ||
    String(source.embedUrl || '').includes('/api/stream/mp4-player')
  );
};

const proxied = (url, forceProxy = false) => {
  if (!url) return url;
  const s = String(url);
  if (!forceProxy && isDirectCdnPlayable(s)) {
    return s;
  }
  if (s.startsWith('/api/stream/proxy') || s.includes('/api/stream/proxy?url=')) {
    return resolveApiUrl(s);
  }
  return resolveApiUrl(`/api/stream/proxy?url=${encodeURIComponent(s)}`);
};

/**
 * Hearbor custom player — liquid glass chrome over an HTML5 <video>,
 * with an embed fallback frame for servers without direct files.
 *
 * `entries`   — manifest servers (id, token, server, quality, version, lang)
 * `resolved`  — { [entryId]: { embedUrl, directUrl } }
 * `onResolve(entry)` — resolves one entry on demand (returns the source)
 */
export default function VideoPlayer({
  entries = [],
  resolved = {},
  onResolve,
  onOpenDownload,
  title,
  episodeLabel,
  startTime = 0,
  onProgress,
  onEnded,
  onNext,
  onPrev,
  nextLabel,
  resumePrompt = false
}) {
  const { t, lang } = useI18n();
  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const hideTimer = useRef(null);
  const lastSave = useRef(0);

  const [activeId, setActiveId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [playing, setPlaying] = useState(false);
  // watch-time tracking -> POST /api/gamification/sync-time (gamification)
  const lastTsRef = useRef(0);
  const playedRef = useRef(0);
  useEffect(() => () => {
    const rem = Math.floor(playedRef.current / 60) || (playedRef.current > 20 ? 1 : 0);
    if (rem > 0) api.post('/api/gamification/sync-time', { sessionMinutes: rem, type: 'watch' }).catch(() => {});
  }, []);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [buffering, setBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showResume, setShowResume] = useState(resumePrompt && startTime > 30);
  const [ended, setEnded] = useState(false);
  const [panel, setPanel] = useState(false);
  const [forceProxy, setForceProxy] = useState(false);
  const [forceEmbed, setForceEmbed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef(null);
  // Fullscreen UX: keep controls up while the pointer rests on them, and let the
  // first tap on hidden controls only reveal them (instead of pausing/clicking).
  const barHoverRef = useRef(false);
  const revealUntilRef = useRef(0);

  const active = useMemo(() => entries.find((e) => e.id === activeId) || entries[0] || null, [entries, activeId]);
  const activeSource = active
    ? resolved[active.id] || ((active.directUrl || active.embedUrl)
      ? { directUrl: active.directUrl || null, embedUrl: active.embedUrl || null }
      : null)
    : null;

  // Extract direct MP4 URL if embedUrl points to our internal /api/stream/mp4-player
  const effectiveDirectUrl = useMemo(() => {
    if (activeSource?.directUrl) return activeSource.directUrl;
    const emb = String(activeSource?.embedUrl || '');
    if (emb.startsWith('/api/stream/mp4-player')) {
      try {
        const u = new URL(emb, 'http://localhost'); // only the query is read
        return u.searchParams.get('url') || '';
      } catch {
        return '';
      }
    }
    return '';
  }, [activeSource]);

  const effectiveSubUrl = useMemo(() => {
    const emb = String(activeSource?.embedUrl || '');
    if (emb.startsWith('/api/stream/mp4-player')) {
      try {
        const u = new URL(emb, 'http://localhost'); // only the query is read
        return u.searchParams.get('sub') || '';
      } catch {
        return '';
      }
    }
    return '';
  }, [activeSource]);

  const hasExternalEmbed = Boolean(
    activeSource?.embedUrl &&
    !String(activeSource.embedUrl).startsWith('/api/stream/mp4-player')
  );
  const embedMode = Boolean(activeSource && (!effectiveDirectUrl || (forceEmbed && hasExternalEmbed)));
  const browserHls = Boolean(activeSource?.isHls && activeSource?.browserDirect && effectiveDirectUrl);

  // AniProject returns HLS manifests. Play public/CORS-enabled manifests in
  // this player; when ANIPROJECT_MEDIA_HOSTS is set, the source URL is instead
  // our same-origin allowlisted HLS proxy. Both retain the Hearbor seek/UI.
  useEffect(() => {
    const video = videoRef.current;
    if (!browserHls || !video || embedMode) return undefined;
    const url = resolveApiUrl(effectiveDirectUrl);
    let disposed = false;
    let hls;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.play().catch(() => {});
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (disposed) return;
        if (!Hls.isSupported()) {
          pushToast(lang === 'ar' ? 'تعذر تشغيل بث HLS في هذا المتصفح' : 'HLS playback is unsupported in this browser', 'error');
          return;
        }
        hls = new Hls({ maxBufferLength: 30 });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal && !disposed) video.dispatchEvent(new Event('error'));
        });
      }).catch(() => {
        if (!disposed) pushToast(lang === 'ar' ? 'تعذر تحميل مشغل HLS' : 'Could not load HLS player', 'error');
      });
    }
    return () => {
      disposed = true;
      hls?.destroy();
    };
  }, [browserHls, embedMode, effectiveDirectUrl, active?.id, lang]);

  // Prefer a direct file/custom player so the Hearbor controls work and the
  // upstream host's branded iframe is only used when no direct source exists.
  useEffect(() => {
    if (!activeId && entries.length) {
      const chosen = entries.find((entry) => hasCustomPlayerSource(entry, resolved)) || entries[0];
      setActiveId(chosen.id);
      setForceProxy(false);
      setForceEmbed(false);
      if (!resolved[chosen.id] && !chosen.directUrl && !chosen.embedUrl && onResolve) {
        onResolve(chosen).catch(() => {});
      }
    }
  }, [entries, activeId, resolved, onResolve]);

  /* ------------------------------ controls ------------------------------ */
  const wake = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused && !barHoverRef.current) setShowControls(false);
    }, 2800);
  }, []);

  const save = useCallback(
    (force = false) => {
      const v = videoRef.current;
      if (!v || embedMode || !onProgress) return;
      const now = Date.now();
      if (!force && now - lastSave.current < 5000) return;
      lastSave.current = now;
      onProgress(v.currentTime, v.duration || 0);
    },
    [embedMode, onProgress]
  );

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (embedMode) {
      try {
        iframeRef.current?.contentWindow?.postMessage({ type: 'bx_toggle_play' }, '*');
      } catch {}
      return;
    }
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    wake();
  }, [embedMode, wake]);

  const seekBy = useCallback(
    (delta) => {
      const v = videoRef.current;
      if (v && !embedMode) {
        const maxDur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : v.currentTime + Math.abs(delta) + 3600;
        const nextTime = Math.max(0, Math.min(maxDur, (v.currentTime || 0) + delta));
        v.currentTime = nextTime;
        setCurrent(nextTime);
        wake();
        return;
      }
      // If in embedMode, postMessage to our mp4-player or HTML5 embed
      try {
        iframeRef.current?.contentWindow?.postMessage({ type: 'bx_seek', delta }, '*');
      } catch {}
      pushToast(
        lang === 'ar'
          ? `${delta > 0 ? '⏩ تم التقديم' : '⏪ تم التأخير'} ${Math.abs(delta) >= 60 ? `${Math.round(Math.abs(delta) / 60)} دقائق` : `${Math.abs(delta)} ثانية`}`
          : `${delta > 0 ? '⏩ Forwarded' : '⏪ Rewound'} ${Math.abs(delta) >= 60 ? `${Math.round(Math.abs(delta) / 60)}m` : `${Math.abs(delta)}s`}`,
        'info'
      );
      wake();
    },
    [embedMode, lang, wake]
  );

  const pickSource = useCallback(
    async (entry) => {
      if (!entry) return;
      setEnded(false);
      setForceProxy(false);
      setForceEmbed(false);
      setActiveId(entry.id);
      if (!resolved[entry.id] && !entry.directUrl && !entry.embedUrl && onResolve) {
        setBusyId(entry.id);
        try {
          await onResolve(entry);
        } finally {
          setBusyId(null);
        }
      }
    },
    [resolved, onResolve]
  );

  useEffect(() => {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(Boolean(fsEl));
      // Phones: show fullscreen episodes in landscape (best effort — desktop
      // browsers reject the lock, which is harmless).
      try {
        if (fsEl && window.matchMedia?.('(pointer: coarse)').matches) {
          window.screen?.orientation?.lock?.('landscape')?.catch?.(() => {});
        } else if (!fsEl) {
          window.screen?.orientation?.unlock?.();
        }
      } catch {
        /* orientation API unsupported */
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = shellRef.current;
    const v = videoRef.current;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl || isFullscreen) {
      if (document.exitFullscreen && fsEl) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen && fsEl) document.webkitExitFullscreen();
      setIsFullscreen(false);
      return;
    }
    if (el?.requestFullscreen) {
      el.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => setIsFullscreen((prev) => !prev));
    } else if (el?.webkitRequestFullscreen) {
      try {
        el.webkitRequestFullscreen();
        setIsFullscreen(true);
      } catch {
        setIsFullscreen((prev) => !prev);
      }
    } else if (v?.webkitEnterFullscreen) {
      try {
        v.webkitEnterFullscreen();
      } catch {
        setIsFullscreen((prev) => !prev);
      }
    } else {
      setIsFullscreen((prev) => !prev);
    }
    wake();
  }, [isFullscreen, wake]);

  // keyboard shortcuts
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowright':
          e.preventDefault();
          seekBy(e.shiftKey ? 600 : 10);
          break;
        case 'arrowleft':
          e.preventDefault();
          seekBy(e.shiftKey ? -600 : -10);
          break;
        case 'j':
          e.preventDefault();
          seekBy(-600);
          break;
        case 'l':
          e.preventDefault();
          seekBy(600);
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume((v) => Math.min(1, v + 0.1));
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume((v) => Math.max(0, v - 0.1));
          break;
        case 'm':
          setMuted((m) => !m);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        default:
      }
    };
    shell.addEventListener('keydown', onKey);
    return () => shell.removeEventListener('keydown', onKey);
  }, [togglePlay, seekBy, toggleFullscreen]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = speed;
  }, [volume, muted, speed, active?.id, activeSource]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useEffect(() => {
    const onHide = () => save(true);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [save]);

  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch { /* unsupported */ }
  };

  const seekTo = (e) => {
    const v = videoRef.current;
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const rtl = document.documentElement.dir === 'rtl';
    const r = rtl ? 1 - ratio : ratio;
    if (v && duration) {
      v.currentTime = Math.max(0, Math.min(duration, r * duration));
      setCurrent(v.currentTime);
    }
    wake();
  };

  const percent = duration ? (current / duration) * 100 : 0;
  const resumingSource = active && !activeSource && busyId === active?.id;
  const controlsVisible = showControls || !playing;
  // In fullscreen the video fills the screen and the controls float over it
  // (auto-hiding). Embedded players keep their own controls visible, so their
  // Hearbor bar stays below the frame instead of covering them.
  const overlayControls = isFullscreen && !embedMode;

  const handleTouchStart = () => {
    revealUntilRef.current = overlayControls && !controlsVisible ? Date.now() + 700 : 0;
    wake();
  };
  const handleClickCapture = (e) => {
    if (revealUntilRef.current && Date.now() < revealUntilRef.current) {
      revealUntilRef.current = 0;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  /* ------------------------------- render ------------------------------- */
  return (
    <div
      className={`player-shell glass${isFullscreen ? ' is-fullscreen' : ''}${overlayControls ? ' is-overlay' : ''}`}
      ref={shellRef}
      tabIndex={0}
      onMouseMove={wake}
      onTouchStart={handleTouchStart}
      onClickCapture={handleClickCapture}
      data-controls={controlsVisible ? 'on' : 'off'}
    >
      <div className="player-frame">
        <div
          className="player-stage"
          onClick={
            embedMode
              ? undefined
              : (e) => {
                  // Buttons on the video (big ▶, resume/restart/next) run their own
                  // action; toggling here too would undo it (play → pause).
                  if (e.target.closest?.('button, a, input, select, textarea')) return;
                  togglePlay();
                }
          }
        >
          {resumingSource || (!activeSource && !ended) ? (
            <div className="player-stage" style={{ display: 'grid', placeItems: 'center', cursor: 'default' }}>
              <div className="liquid-loader">
                <div className="liquid-loader__blobs">
                  <div className="liquid-loader__blob" />
                  <div className="liquid-loader__blob" />
                  <div className="liquid-loader__blob" />
                </div>
                <div>{t('watch.loadingSources')}</div>
              </div>
            </div>
          ) : embedMode ? (
            <iframe
              ref={iframeRef}
              key={active.id}
              className="player-embed"
              src={resolveApiUrl(activeSource.embedUrl)}
              title={title}
              allow="autoplay *; encrypted-media *; picture-in-picture *; fullscreen *"
              allowFullScreen
              frameBorder="0"
              scrolling="no"
            />
          ) : (
            <video
              key={`${active?.id || 'none'}-${effectiveDirectUrl || ''}-${forceProxy ? 'proxy' : 'direct'}`}
              ref={videoRef}
              className="player-video"
              src={browserHls ? undefined : effectiveDirectUrl
                ? (activeSource?.browserDirect ? resolveApiUrl(effectiveDirectUrl) : proxied(effectiveDirectUrl, forceProxy))
                : undefined}
              referrerPolicy="no-referrer"
              playsInline
              autoPlay
              preload="auto"
              crossOrigin={activeSource?.browserDirect ? undefined : 'anonymous'}
              onPlay={() => { setPlaying(true); setEnded(false); setBuffering(false); wake(); }}
              onPause={() => { setPlaying(false); setShowControls(true); save(true); }}
              onTimeUpdate={(e) => {
                const v = e.target;
                if (!v.paused && v.currentTime > lastTsRef.current) playedRef.current += v.currentTime - lastTsRef.current;
                lastTsRef.current = v.currentTime;
                setCurrent(v.currentTime);
                save();
                if (playedRef.current >= 60) {
                  const mins = Math.floor(playedRef.current / 60);
                  playedRef.current -= mins * 60;
                  api.post('/api/gamification/sync-time', { sessionMinutes: mins, type: 'watch' }).catch(() => {});
                }
              }}
              onLoadedMetadata={(e) => {
                setBuffering(false);
                setDuration(e.target.duration || 0);
                if (startTime > 0 && e.target.currentTime < 1 && showResume) {
                  e.target.currentTime = startTime;
                } else {
                  e.target.play?.().catch(() => {});
                }
              }}
              onWaiting={() => setBuffering(true)}
              onPlaying={() => setBuffering(false)}
              onCanPlay={() => setBuffering(false)}
              onEnded={() => { setEnded(true); setPlaying(false); setShowControls(true); save(true); onEnded?.(); }}
              onError={() => {
                setBuffering(false);
                // 1) If direct CDN URL failed, retry via 4MB chunked /api/stream/proxy
                if (!forceProxy && isDirectCdnPlayable(effectiveDirectUrl)) {
                  setForceProxy(true);
                  return;
                }
                // 2) If this server also has an external embed URL (e.g. sendvid/ok.ru), switch to embed
                if (!forceEmbed && hasExternalEmbed) {
                  setForceEmbed(true);
                  return;
                }
                // 3) Advance to next available server
                if (entries.length > 1 && active) {
                  const curIdx = entries.findIndex((x) => x.id === active.id);
                  const nextEntry = entries[curIdx + 1];
                  if (nextEntry) {
                    pickSource(nextEntry);
                  }
                }
              }}
            >
              {effectiveSubUrl && (
                <track
                  kind="subtitles"
                  srcLang="ar"
                  label="العربية"
                  src={resolveApiUrl(effectiveSubUrl)}
                  default
                />
              )}
            </video>
          )}

          {/* center play overlay */}
          {effectiveDirectUrl && !embedMode && !playing && !ended && (
            <button type="button" className="player-bigplay" onClick={togglePlay} aria-label={t('common.play')}>
              <span className="player-bigplay__ring" />
              <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true">
                <path d="M8 5.5v13l11-6.5-11-6.5z" />
              </svg>
            </button>
          )}

          {buffering && effectiveDirectUrl && !embedMode && (
            <div className="player-buffer" role="status">
              <div className="liquid-loader__blobs">
                <div className="liquid-loader__blob" />
                <div className="liquid-loader__blob" />
                <div className="liquid-loader__blob" />
              </div>
              <span>{t('watch.buffering')}</span>
            </div>
          )}

          {showResume && effectiveDirectUrl && !embedMode && (
            <div className="player-resume glass glass--strong">
              <div className="player-resume__text">{t('watch.resumeAt', { time: fmt(startTime) })}</div>
              <div className="player-resume__row">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => {
                    const v = videoRef.current;
                    if (v) { v.currentTime = startTime; v.play().catch(() => {}); }
                    setShowResume(false);
                  }}
                >
                  <span className="btn__shine" />▶ {t('common.continue')}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    const v = videoRef.current;
                    if (v) { v.currentTime = 0; v.play().catch(() => {}); }
                    setShowResume(false);
                  }}
                >
                  ⟲ {t('watch.restart')}
                </button>
              </div>
            </div>
          )}

          {ended && (
            <div className="player-ended glass glass--strong">
              <div style={{ fontSize: '2.1rem' }}>🎉</div>
              <h3>{t('watch.ended')}</h3>
              <div className="player-ended__row">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    const v = videoRef.current;
                    if (v) { v.currentTime = 0; v.play().catch(() => {}); }
                    setEnded(false);
                  }}
                >
                  ⟲ {t('watch.restart')}
                </button>
                {onNext && (
                  <button type="button" className="btn btn--primary btn--sm" onClick={onNext}>
                    <span className="btn__shine" />▶ {nextLabel || t('watch.nextEpisode')}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="player-top" style={{ pointerEvents: 'none' }}>
            <div className="player-top__title">
              <strong>{title}</strong>
              {episodeLabel && <span className="player-top__ep">{episodeLabel}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', pointerEvents: 'auto' }}>
              {embedMode && active && (
                <div className="player-top__via">{t('watch.playingVia', { server: brandedServerName(active) })}</div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '999px',
                  background: '#ffffff',
                  color: '#000000',
                  border: '1.5px solid #ffffff',
                  fontWeight: 900,
                  fontSize: '0.76rem',
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.65)'
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>
                  {isFullscreen
                    ? lang === 'ar'
                      ? 'تصغير الشاشة'
                      : 'Exit Fullscreen'
                    : lang === 'ar'
                    ? 'شاشة كاملة'
                    : 'Fullscreen'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Control bar (time skip -10m / -10s / +10s / +10m + fullscreen): always visible under
            the video; floats over it and auto-hides in fullscreen */}
        <div
          className="player-bar"
          onMouseEnter={() => { barHoverRef.current = true; }}
          onMouseLeave={() => { barHoverRef.current = false; wake(); }}
        >
          {!embedMode && (
            <div className="player-scrub" onClick={seekTo} role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
              <div className="player-scrub__track">
                <div className="player-scrub__fill" style={{ width: `${percent}%` }} />
                <div className="player-scrub__thumb" style={{ insetInlineStart: `${percent}%` }} />
              </div>
            </div>
          )}

          <div className="player-bar__row" style={{ flexWrap: 'wrap', gap: '0.45rem' }}>
            {!embedMode && (
              <button type="button" className="player-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5z" /></svg>
                )}
              </button>
            )}
            {onPrev && (
              <button type="button" className="player-btn" onClick={onPrev} title={t('watch.prevEpisode')}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 6h2v12H7zM19 6v12l-9-6 9-6z" /></svg>
              </button>
            )}
            {onNext && (
              <button type="button" className="player-btn" onClick={onNext} title={t('watch.nextEpisode')}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15 6h2v12h-2zM5 6v12l9-6-9-6z" /></svg>
              </button>
            )}

            {/* Dedicated Skip Buttons: -10m, -10s, +10s, +10m, +85s Intro */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => seekBy(-600)}
                title={lang === 'ar' ? 'تأخير 10 دقائق (-10m)' : 'Rewind 10 minutes (-10m)'}
                style={{
                  padding: '0.34rem 0.68rem',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.24)',
                  fontSize: '0.74rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                ⏪ {lang === 'ar' ? '-10 د' : '-10m'}
              </button>

              <button
                type="button"
                onClick={() => seekBy(-10)}
                title={lang === 'ar' ? 'تأخير 10 ثوانٍ (-10s)' : 'Rewind 10 seconds (-10s)'}
                style={{
                  padding: '0.34rem 0.68rem',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.24)',
                  fontSize: '0.74rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                ⏪ {lang === 'ar' ? '-10 ث' : '-10s'}
              </button>

              <button
                type="button"
                onClick={() => seekBy(10)}
                title={lang === 'ar' ? 'تقديم 10 ثوانٍ (+10s)' : 'Forward 10 seconds (+10s)'}
                style={{
                  padding: '0.34rem 0.68rem',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.24)',
                  fontSize: '0.74rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {lang === 'ar' ? '+10 ث' : '+10s'} ⏩
              </button>

              <button
                type="button"
                onClick={() => seekBy(600)}
                title={lang === 'ar' ? 'تقديم 10 دقائق (+10m)' : 'Forward 10 minutes (+10m)'}
                style={{
                  padding: '0.34rem 0.68rem',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.24)',
                  fontSize: '0.74rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {lang === 'ar' ? '+10 د' : '+10m'} ⏩
              </button>

              <button
                type="button"
                onClick={() => seekBy(85)}
                title={lang === 'ar' ? 'تخطي المقدمة (+85 ثانية)' : 'Skip Intro (+85s)'}
                style={{
                  padding: '0.34rem 0.68rem',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.88)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                ⏭ {lang === 'ar' ? 'تخطي المقدمة' : 'Skip Intro'}
              </button>
            </div>

            {!embedMode && (
              <div className="player-time">
                <span>{fmt(current)}</span>
                <span className="player-time__sep">/</span>
                <span>{fmt(duration)}</span>
              </div>
            )}

            <div className="player-bar__spacer" />

            {!embedMode && (
              <>
                <div className="player-vol">
                  <button type="button" className="player-btn" onClick={() => setMuted((m) => !m)} aria-label={t('watch.mute')}>
                    {muted || volume === 0 ? '🔇' : '🔊'}
                  </button>
                  <input
                    className="player-vol__range"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={muted ? 0 : volume}
                    onChange={(e) => {
                      setVolume(Number(e.target.value));
                      setMuted(Number(e.target.value) === 0);
                    }}
                    aria-label={t('watch.volume')}
                  />
                </div>

                <select
                  className="player-speed"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  aria-label={t('watch.speed')}
                >
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                    <option key={s} value={s}>{s}×</option>
                  ))}
                </select>
              </>
            )}

            {/* Fullscreen hides the big server list; switch servers from here instead */}
            {isFullscreen && entries.length > 1 && (
              <select
                className="player-server-select"
                value={active?.id || ''}
                onChange={(e) => pickSource(entries.find((x) => x.id === e.target.value))}
                aria-label={lang === 'ar' ? 'اختر السيرفر' : 'Select server'}
                title={lang === 'ar' ? 'اختر السيرفر' : 'Select server'}
              >
                {entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {brandedServerName(e)} · {e.quality || 'HD'}
                  </option>
                ))}
              </select>
            )}

            {onOpenDownload && (
              <button
                type="button"
                className="player-btn"
                onClick={onOpenDownload}
                title={t('watch.downloadEpisode')}
                style={{ color: '#ffffff' }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            {!embedMode && (
              <button type="button" className="player-btn" onClick={togglePip} title={t('watch.pip')}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" />
                  <rect x="12" y="11" width="7" height="6" rx="1.5" fill="currentColor" stroke="none" />
                </svg>
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              title={t('watch.fullscreen')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.38rem 0.85rem',
                borderRadius: '999px',
                background: '#ffffff',
                color: '#000000',
                border: 'none',
                fontSize: '0.76rem',
                fontWeight: 900,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>
                {isFullscreen
                  ? lang === 'ar'
                    ? 'تصغير'
                    : 'Exit'
                  : lang === 'ar'
                  ? 'شاشة كاملة'
                  : 'Fullscreen'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Hearbor source selector — upstream provider names stay private.
          Hidden in fullscreen (the control bar has a compact server picker). */}
      {entries.length > 0 && !isFullscreen && (
        <div className="wit-servers-box">
          <div className="wit-servers-box__head">
            <span>🖥️ {lang === 'ar' ? 'سيرفرات المشاهدة المتاحة (اختر السيرفر):' : 'Streaming Servers (Select Server):'}</span>
            {active && (
              <span className="wit-servers-box__active">
                {brandedServerName(active)} {active.quality ? `· ${active.quality}` : ''}
              </span>
            )}
          </div>
          <div className="wit-servers-list">
            {entries.map((e) => {
              const isFhd = isFhdQuality(e.quality);
              const isSelected = active?.id === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  className={`wit-server-tab ${isSelected ? 'active' : ''} ${isFhd ? 'wit-server-tab--vip' : ''}`}
                  onClick={() => pickSource(e)}
                  aria-label={`${brandedServerName(e)} ${e.quality || 'HD'}`}
                >
                  <span>
                    {busyId === e.id ? '⏳ ' : isFhd ? '👑 ' : '▶ '}
                    {brandedServerName(e)}
                  </span>
                  <small>
                    {e.quality || 'HD'}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
