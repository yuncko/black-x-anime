import React, { useRef } from 'react';
import BxIcon from './BxIcon.jsx';
import { coverForMode } from './dataSaver.js';
import { haptic } from './haptics.js';
import { hoverClose, hoverEnter, hoverLeave } from './hoverPreview.js';
import { openInNewTab, posterHref } from './posterLinks.js';

const LONG_PRESS_MS = 460;
const MOVE_TOLERANCE = 10;

function swallowReleaseClick() {
  if (typeof document === 'undefined') return;
  let timer = 0;
  const done = () => {
    clearTimeout(timer);
    document.removeEventListener('click', swallow, true);
    window.removeEventListener('pointerup', onRelease, true);
    window.removeEventListener('pointercancel', onRelease, true);
  };
  const swallow = (e) => { e.preventDefault(); e.stopPropagation(); done(); };
  const onRelease = () => { clearTimeout(timer); timer = setTimeout(done, 350); };
  document.addEventListener('click', swallow, true);
  window.addEventListener('pointerup', onRelease, true);
  window.addEventListener('pointercancel', onRelease, true);
  timer = setTimeout(done, 15000);
}

export function useLongPress(onLongPress) {
  const timer = useRef(null);
  const origin = useRef(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  if (typeof onLongPress !== 'function') return { handlers: {}, consumeClick: () => false };
  const handlers = {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => { timer.current = null; fired.current = true; haptic('select'); swallowReleaseClick(); onLongPress(); }, LONG_PRESS_MS);
    },
    onPointerMove: (e) => {
      if (!timer.current || !origin.current) return;
      if (Math.abs(e.clientX - origin.current.x) > MOVE_TOLERANCE || Math.abs(e.clientY - origin.current.y) > MOVE_TOLERANCE) clear();
    },
    onPointerUp: clear, onPointerCancel: clear, onPointerLeave: clear,
    onContextMenu: (e) => e.preventDefault()
  };
  const consumeClick = () => { if (!fired.current) return false; fired.current = false; return true; };
  return { handlers, consumeClick };
}

/**
 * Nuvio poster card: 12px radius, #1A1A1A bg, bottom scrim, title 14 + muted detailLine.
 * Keeps onOpen/onPeek/hover/dataSaver logic — only classes/visuals change.
 */
export default function PosterCard({ item, onOpen, onPeek, dataSaver = false, width, subtitle, progress, badge, overlay, className = '', style }) {
  const { handlers, consumeClick } = useLongPress(onPeek ? () => onPeek(item) : null);
  if (!item) return null;
  const title = item.titleEn || item.titleAr || item.name || '';
  const detailLine = subtitle || (item.year ? String(item.year) : '') || '';
  const pct = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null;
  const badgeNode = badge !== undefined ? badge : item.rating ? (<><BxIcon name="star" size="0.9em" filled />{item.rating}</>) : null;
  return (
    <div
      className={`nv-poster ${className}`.trim()}
      data-bx-oid={item.objectID}
      role="button" tabIndex={0} aria-label={title}
      style={width ? { ...style, '--w': typeof width === 'number' ? `${width}px` : width } : style}
      {...handlers}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') hoverEnter(item, e.currentTarget, onOpen); }}
      onPointerLeave={(e) => { handlers.onPointerLeave?.(e); hoverLeave(); }}
      onMouseDown={(e) => { if (e.button === 1 && posterHref(item)) e.preventDefault(); }}
      onAuxClick={(e) => { if (e.button !== 1) return; const href = posterHref(item); if (href) { e.preventDefault(); openInNewTab(href); } }}
      onClick={(e) => {
        if (consumeClick()) { e.preventDefault(); return; }
        if ((e.ctrlKey || e.metaKey) && posterHref(item)) { e.preventDefault(); openInNewTab(posterHref(item)); return; }
        hoverClose(); onOpen?.(item);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(item); }}
    >
      <div className="nv-poster-art">
        <img src={coverForMode(item.poster || item.poster_uri, dataSaver)} alt="" loading="lazy" decoding="async" draggable={false} />
        <span className="nv-poster-scrim" aria-hidden="true" />
        {overlay || null}
        {badgeNode ? <span className="nv-poster-badge">{badgeNode}</span> : null}
        {pct !== null && pct > 0 ? (<span className="nv-poster-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>) : null}
      </div>
      <div className="nv-poster-title" dir="auto">{title}</div>
      <div className="nv-poster-sub" dir="auto">{detailLine}&nbsp;</div>
    </div>
  );
}
