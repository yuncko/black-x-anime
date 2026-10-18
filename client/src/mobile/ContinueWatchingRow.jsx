import React, { useEffect, useState } from 'react';
import { episodeKey, getPosition, subscribePositions } from './resumeStore.js';
import { coverForMode } from './dataSaver.js';
import SectionHead from './SectionHead.jsx';
import ScrollRow from './ScrollRow.jsx';
import { useLongPress } from './PosterCard.jsx';

function badgeFor(pos, ep) {
  const nb = '\u00a0';
  if (!pos) return ep ? `Ép.${nb}${ep}` : 'À suivre';
  const pct = pos.dur > 0 ? pos.sec / pos.dur : 0;
  if (pct > 0 && !pos.done) {
    const remainingSec = Math.max(0, pos.dur - pos.sec);
    const remainingMin = Math.max(1, Math.ceil(remainingSec / 60));
    const hours = Math.floor(remainingMin / 60);
    const mins = remainingMin % 60;
    if (hours > 0) return `${hours}${nb}h${nb}${mins}${nb}min restantes`;
    return `${remainingMin}${nb}min restantes`;
  }
  if (pos.done) return 'Terminé';
  if (pct > 0) return `${Math.round(pct * 100)}% regardé`;
  return ep ? `Ép.${nb}${ep}` : 'À suivre';
}

export default function ContinueWatchingRow({ history, isRtl, dataSaver = false, onResume, onInfo }) {
  const [, setTick] = useState(0);
  useEffect(() => subscribePositions(() => setTick((t) => t + 1)), []);
  const items = [];
  const seen = new Set();
  for (const h of Array.isArray(history) ? history : []) {
    const id = h?.objectID || h?.slug;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push(h);
    if (items.length >= 12) break;
  }
  if (!items.length) return null;
  return (
    <section className="bx-section">
      <SectionHead title="Continuer à regarder" isRtl={isRtl} />
      <ScrollRow>
        {items.map((h, i) => {
          const ep = Number(h.episode) || 0;
          const pos = ep ? getPosition(episodeKey(h, ep)) : null;
          const pct = pos && pos.dur > 0 ? Math.min(1, Math.max(0.02, pos.sec / pos.dur)) : 0;
          const badge = badgeFor(pos, ep);
          const isNew = !pos || pct === 0;
          const title = h.titleEn || h.titleAr || h.name || '';
          const epTitle = h.episodeTitle || '';
          const art = h.banner || h.poster || h.poster_uri || '';
          const { handlers, consumeClick } = useLongPress(onInfo ? () => onInfo(h) : null);
          return (
            <div
              key={`${h.objectID || h.slug}-${i}`}
              className="nv-cw-card"
              role="button"
              tabIndex={0}
              aria-label={title}
              {...handlers}
              onClick={(e) => {
                if (consumeClick()) { e.preventDefault(); return; }
                onResume?.(h, pos?.done ? ep + 1 : ep || 1);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') onResume?.(h, pos?.done ? ep + 1 : ep || 1); }}
            >
              <div className="nv-cw-art">
                {art ? <img src={coverForMode(art, dataSaver)} alt="" loading="lazy" decoding="async" draggable={false} /> : null}
                <span className="nv-cw-scrim" aria-hidden="true" />
              </div>
              <span className={`nv-cw-badge${isNew ? ' is-new' : ''}`}>{badge}</span>
              <div className="nv-cw-copy">
                {ep ? <span className="nv-cw-epcode">Ép. {ep}</span> : null}
                <span className="nv-cw-title" dir="auto">{title}</span>
                {epTitle ? <span className="nv-cw-ep" dir="auto">{epTitle}</span> : null}
              </div>
              {pct > 0 ? (
                <span className="nv-cw-progress" aria-hidden="true"><span style={{ width: `${pct * 100}%` }} /></span>
              ) : null}
            </div>
          );
        })}
      </ScrollRow>
    </section>
  );
}
