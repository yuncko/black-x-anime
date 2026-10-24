import React, { useCallback, useEffect, useRef, useState } from 'react';
import BxIcon from './BxIcon.jsx';
import { formatClock } from './resumeStore.js';
import { haptic } from './haptics.js';

const HIDE_MS = 3000;
const DOUBLE_TAP_MS = 260;
const TAP_MAX_MS = 280;
const TAP_SLOP = 12;

/** Stops a touch on a control from reaching the video's swipe / long-press gestures. */
const stop = (e) => e.stopPropagation();

/**
 * Hearbor player controls (replaces the native <video controls>):
 * centre play/pause with visible -10 s / +10 s, a seek bar with the real intro/outro
 * marks, time, next episode and full screen. One tap shows/hides the controls (they hide
 * ~3 s into playback and stay while paused); a double tap on the left/right third seeks
 * ±10 s. Touches on the empty video area still reach the brightness/volume swipes and the
 * long-press 2x speed handled by the video container.
 *
 * Computers (mouse + keyboard, the website shows this player there too): moving the mouse
 * shows the controls, a click on the picture plays / pauses, a double click toggles full
 * screen, and the keyboard works like on the big video sites — Space / K play-pause,
 * ← / J and → / L ±10 s, ↑ / ↓ volume, M mute, F full screen, T cinema mode (website, wide
 * screens), Shift+N next episode.
 */
export default function PlayerControls({
  videoRef,
  sourceKey,
  isRtl,
  fullscreen,
  locked,
  title,
  subtitle,
  segments = [],
  hasNext = false,
  onSeekBy,
  onToggleFullscreen,
  onNext,
  onMore,
  onLock,
  onUnlock,
  onToggleTheatre
}) {
  const [media, setMedia] = useState({ cur: 0, dur: 0, paused: true, waiting: false, buffered: 0 });
  const [visible, setVisible] = useState(true);
  const [scrub, setScrub] = useState(null);
  const hideTimer = useRef(0);
  const tap = useRef({ down: 0, x: 0, y: 0, last: 0, zone: '', timer: 0 });

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused && !v.ended) setVisible(false);
    }, HIDE_MS);
  }, [videoRef]);

  const reveal = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const read = (waiting) =>
      setMedia((m) => {
        let buffered = 0;
        try {
          if (v.buffered?.length) buffered = v.buffered.end(v.buffered.length - 1);
        } catch {
          buffered = 0;
        }
        return {
          cur: v.currentTime || 0,
          dur: Number.isFinite(v.duration) ? v.duration : 0,
          paused: v.paused,
          waiting: typeof waiting === 'boolean' ? waiting : m.waiting,
          buffered
        };
      });
    const onTime = () => read();
    const onPlay = () => {
      read(false);
      scheduleHide();
    };
    const onPause = () => {
      read(false);
      clearTimeout(hideTimer.current);
      setVisible(true);
    };
    const onWaiting = () => read(true);
    const onPlaying = () => read(false);
    const events = [
      ['timeupdate', onTime],
      ['durationchange', onTime],
      ['loadedmetadata', onTime],
      ['progress', onTime],
      ['seeked', onTime],
      ['play', onPlay],
      ['pause', onPause],
      ['ended', onPause],
      ['waiting', onWaiting],
      ['playing', onPlaying],
      ['canplay', onPlaying]
    ];
    events.forEach(([name, fn]) => v.addEventListener(name, fn));
    read(false);
    if (!v.paused) scheduleHide();
    return () => events.forEach(([name, fn]) => v.removeEventListener(name, fn));
  }, [videoRef, sourceKey, scheduleHide]);

  useEffect(() => () => {
    clearTimeout(hideTimer.current);
    clearTimeout(tap.current.timer);
  }, []);

  // Entering / leaving full screen shows the controls again.
  useEffect(() => {
    reveal();
  }, [fullscreen, reveal]);

  // Keyboard shortcuts (computers). Ignored while typing in a field or with Ctrl / Alt / Meta.
  const keyActions = useRef({});
  keyActions.current = { hasNext, onNext, onToggleFullscreen, onSeekBy, locked, onToggleTheatre };
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      // an open sheet / dialog above the player keeps its own keys
      if (typeof document !== 'undefined' && document.querySelector('.bx-sheet-layer:not(.is-closing), [role="dialog"][aria-modal="true"]')) return;
      const a = keyActions.current;
      if (a.locked) return;
      const v = videoRef.current;
      if (!v) return;
      const key = e.key;
      let handled = true;
      if (key === ' ' || key === 'k' || key === 'K') {
        if (v.paused || v.ended) {
          const p = v.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } else v.pause();
      } else if (key === 'ArrowLeft' || key === 'j' || key === 'J') a.onSeekBy?.('left');
      else if (key === 'ArrowRight' || key === 'l' || key === 'L') a.onSeekBy?.('right');
      else if (key === 'ArrowUp') {
        v.muted = false;
        v.volume = Math.min(1, Math.round((v.volume + 0.1) * 10) / 10);
      } else if (key === 'ArrowDown') v.volume = Math.max(0, Math.round((v.volume - 0.1) * 10) / 10);
      else if (key === 'm' || key === 'M') v.muted = !v.muted;
      else if (key === 'f' || key === 'F') a.onToggleFullscreen?.();
      else if ((key === 'N' || key === 'n') && e.shiftKey && a.hasNext) a.onNext?.();
      else if ((key === 't' || key === 'T') && a.onToggleTheatre) a.onToggleTheatre();
      else handled = false;
      if (handled) {
        e.preventDefault();
        reveal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [videoRef, reveal]);

  // Mouse: moving over the player shows the controls (throttled).
  const lastMove = useRef(0);
  const onMouseMove = (e) => {
    if (e.pointerType !== 'mouse') return;
    const now = Date.now();
    if (now - lastMove.current < 250) return;
    lastMove.current = now;
    reveal();
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    haptic('tap');
    if (v.paused || v.ended) {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      v.pause();
    }
    reveal();
  };

  const seekBy = (side) => {
    onSeekBy?.(side);
    reveal();
  };

  // Tap on the picture: show/hide; double tap left/right third: ±10 s.
  const onSurfaceDown = (e) => {
    tap.current.down = Date.now();
    tap.current.x = e.clientX;
    tap.current.y = e.clientY;
  };
  const onSurfaceUp = (e) => {
    const t = tap.current;
    if (Date.now() - t.down > TAP_MAX_MS) return; // long press (2x speed) — not a tap
    if (Math.abs(e.clientX - t.x) > TAP_SLOP || Math.abs(e.clientY - t.y) > TAP_SLOP) return; // a swipe
    if (e.pointerType === 'mouse') {
      // A click plays / pauses; a double click (second click soon after) toggles full screen.
      const now = Date.now();
      if (now - t.last < DOUBLE_TAP_MS + 60 && t.zone === 'mouse') {
        clearTimeout(t.timer);
        t.last = 0;
        onToggleFullscreen?.();
        return;
      }
      t.last = now;
      t.zone = 'mouse';
      clearTimeout(t.timer);
      t.timer = setTimeout(togglePlay, DOUBLE_TAP_MS + 60);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / Math.max(1, rect.width);
    const zone = rel < 0.35 ? 'left' : rel > 0.65 ? 'right' : 'center';
    const now = Date.now();
    if (zone !== 'center' && zone === t.zone && now - t.last < DOUBLE_TAP_MS) {
      clearTimeout(t.timer);
      t.last = 0;
      haptic('tap');
      onSeekBy?.(zone);
      return;
    }
    t.last = now;
    t.zone = zone;
    clearTimeout(t.timer);
    t.timer = setTimeout(
      () => {
        setVisible((wasVisible) => {
          if (!wasVisible) scheduleHide();
          else clearTimeout(hideTimer.current);
          const v = videoRef.current;
          // a paused video keeps its controls
          return v && v.paused ? true : !wasVisible;
        });
      },
      zone === 'center' ? 0 : DOUBLE_TAP_MS
    );
  };

  const commitScrub = () => {
    if (scrub === null) return;
    const v = videoRef.current;
    if (v && Number.isFinite(scrub)) {
      try {
        v.currentTime = scrub;
      } catch {
        /* not seekable yet */
      }
    }
    setScrub(null);
    reveal();
  };

  const { cur, dur, paused, waiting, buffered } = media;
  const shown = scrub ?? cur;
  const pct = dur > 0 ? Math.min(100, (shown / dur) * 100) : 0;
  const bufPct = dur > 0 ? Math.min(100, (buffered / dur) * 100) : 0;
  const show = visible || paused;

  if (locked) {
    return (
      <div className="bx-pc is-locked" dir="ltr">
        <button type="button" className="bx-pc-unlock" onClick={onUnlock} onTouchStart={stop}>
          <BxIcon name="unlock" />
          <span dir={isRtl ? 'rtl' : 'ltr'}>{isRtl ? 'اضغط لفتح القفل' : 'Tap to unlock'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`bx-pc${show ? ' is-visible' : ''}${fullscreen ? ' is-fs' : ''}`} dir="ltr" onPointerMove={onMouseMove}>
      <div className="bx-pc-surface" onPointerDown={onSurfaceDown} onPointerUp={onSurfaceUp} />
      <div className="bx-pc-shade" aria-hidden="true" />

      <div className="bx-pc-top" onTouchStart={stop}>
        {fullscreen ? (
          <button type="button" className="bx-pc-btn" onClick={onToggleFullscreen} aria-label={isRtl ? 'خروج من ملء الشاشة' : 'Exit full screen'}>
            <BxIcon name="minimize" />
          </button>
        ) : (
          <span />
        )}
        {fullscreen ? (
          <div className="bx-pc-title">
            <strong dir="auto">{title}</strong>
            {subtitle ? <span dir="auto">{subtitle}</span> : null}
          </div>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <div className="bx-pc-top-end">
          {fullscreen && onLock ? (
            <button type="button" className="bx-pc-btn" onClick={onLock} aria-label={isRtl ? 'قفل اللمس' : 'Lock touch'}>
              <BxIcon name="lock" />
            </button>
          ) : null}
          <button type="button" className="bx-pc-btn" onClick={onMore} aria-label={isRtl ? 'إعدادات التشغيل' : 'Playback settings'}>
            <BxIcon name="settings" />
          </button>
        </div>
      </div>

      <div className="bx-pc-center" onTouchStart={stop}>
        <button type="button" className="bx-pc-skip" onClick={() => seekBy('left')} aria-label={isRtl ? 'رجوع 10 ثواني' : 'Back 10 seconds'}>
          <BxIcon name="rewind" />
          <span>10</span>
        </button>
        <button type="button" className="bx-pc-play" onClick={togglePlay} aria-label={paused ? (isRtl ? 'تشغيل' : 'Play') : isRtl ? 'إيقاف مؤقت' : 'Pause'}>
          {waiting && !paused ? <BxIcon name="loader" spin /> : <BxIcon name={paused ? 'play' : 'pause'} filled />}
        </button>
        <button type="button" className="bx-pc-skip" onClick={() => seekBy('right')} aria-label={isRtl ? 'قدّم 10 ثواني' : 'Forward 10 seconds'}>
          <BxIcon name="fast-forward" />
          <span>10</span>
        </button>
      </div>

      <div className="bx-pc-bottom" onTouchStart={stop}>
        <div className="bx-pc-bar">
          <div className="bx-pc-track" aria-hidden="true">
            <span className="bx-pc-buffer" style={{ width: `${bufPct}%` }} />
            {dur > 0 &&
              segments
                .filter((s) => Number.isFinite(s?.start) && Number.isFinite(s?.end) && s.end > s.start)
                .map((s) => (
                  <span
                    key={`${s.type}-${s.start}`}
                    className="bx-pc-seg"
                    style={{ left: `${Math.min(100, (s.start / dur) * 100)}%`, width: `${Math.min(100, ((s.end - s.start) / dur) * 100)}%` }}
                  />
                ))}
            <span className="bx-pc-fill" style={{ width: `${pct}%` }} />
            <span className="bx-pc-thumb" style={{ left: `${pct}%` }} />
          </div>
          <input
            type="range"
            className="bx-pc-range"
            min={0}
            max={dur > 0 ? dur : 1}
            step={0.5}
            value={Math.min(shown, dur > 0 ? dur : 1)}
            disabled={!(dur > 0)}
            aria-label={isRtl ? 'مكان التشغيل' : 'Seek'}
            onChange={(e) => {
              setScrub(Number(e.target.value));
              clearTimeout(hideTimer.current);
            }}
            onPointerUp={commitScrub}
            onTouchEnd={commitScrub}
            onKeyUp={commitScrub}
            onBlur={commitScrub}
          />
        </div>
        <div className="bx-pc-row">
          <span className="bx-pc-time">
            {formatClock(shown)}
            <span> / {dur > 0 ? formatClock(dur) : '--:--'}</span>
          </span>
          <div className="bx-pc-row-end">
            {hasNext ? (
              <button type="button" className="bx-pc-btn" onClick={onNext} aria-label={isRtl ? 'الحلقة اللي بعدها' : 'Next episode'}>
                <BxIcon name="skip-forward" />
              </button>
            ) : null}
            <button
              type="button"
              className="bx-pc-btn"
              onClick={onToggleFullscreen}
              aria-label={fullscreen ? (isRtl ? 'خروج من ملء الشاشة' : 'Exit full screen') : isRtl ? 'ملء الشاشة' : 'Full screen'}
            >
              <BxIcon name={fullscreen ? 'minimize' : 'fullscreen'} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
