import React, { useMemo, useState } from 'react';
import BxIcon from './BxIcon.jsx';
import { coverForMode } from './dataSaver.js';
import { POSITIONS_MAX, positionEntries } from './resumeStore.js';
import { MONTHS_AR, MONTHS_EN, hoursText, wrappedStats } from './wrappedStats.js';
import { PUBLIC_SITE_HOST } from '../../../shared/publicSite.js';

/** The share image (1080×1350, monochrome like the app). Returns a PNG Blob. */
async function drawCard({ stats, name, isRtl }) {
  try {
    await document.fonts?.ready;
  } catch {
    /* draw with what is loaded */
  }
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000000';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 4;
  g.strokeRect(40, 40, W - 80, H - 80);
  const font = (w, px) => `${w} ${px}px Cairo, "Space Grotesk", system-ui, sans-serif`;
  g.direction = isRtl ? 'rtl' : 'ltr';
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = font(900, 54);
  g.fillText('Hearbor', W / 2, 140);
  g.font = font(700, 40);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText(isRtl ? `سنتك على Hearbor ${stats.year}` : `Your ${stats.year} on Hearbor`, W / 2, 205);
  if (name) {
    g.fillStyle = '#ffffff';
    g.font = font(800, 46);
    g.fillText(name, W / 2, 285);
  }
  const tiles = [
    [hoursText(stats.seconds, isRtl), isRtl ? 'وقت المشاهدة' : 'Time watched'],
    [String(stats.finished), isRtl ? 'حلقة كمّلتها' : 'Episodes finished'],
    [String(stats.titlesCount), isRtl ? 'عمل اتفرجت عليه' : 'Titles watched'],
    [String(stats.mangaTitles), isRtl ? 'مانجا ومانهوا' : 'Manga & manhwa']
  ];
  tiles.forEach(([value, label], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 110 + col * 440;
    const y = 360 + row * 230;
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(x, y, 420, 200);
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 2;
    g.strokeRect(x, y, 420, 200);
    g.fillStyle = '#ffffff';
    g.font = font(900, 64);
    g.fillText(value, x + 210, y + 100);
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.font = font(700, 32);
    g.fillText(label, x + 210, y + 155);
  });
  let y = 880;
  const top = stats.topTitles[0];
  if (top && top.title) {
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.font = font(700, 32);
    g.fillText(isRtl ? 'أكتر عمل اتفرجت عليه' : 'Most watched', W / 2, y);
    g.fillStyle = '#ffffff';
    g.font = font(900, 48);
    g.fillText(top.title.length > 34 ? `${top.title.slice(0, 33)}…` : top.title, W / 2, y + 66);
    g.font = font(700, 30);
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.fillText(isRtl ? `${top.episodes} حلقة` : `${top.episodes} episodes`, W / 2, y + 112);
    y += 190;
  }
  if (stats.topGenres.length) {
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.font = font(700, 32);
    g.fillText(isRtl ? 'أكتر تصنيفات' : 'Top genres', W / 2, y);
    g.fillStyle = '#ffffff';
    g.font = font(800, 40);
    g.fillText(stats.topGenres.join(isRtl ? ' • ' : ' • '), W / 2, y + 58);
  }
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.font = font(700, 28);
  g.fillText(PUBLIC_SITE_HOST, W / 2, H - 80);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

/**
 * «ملخصك» (website, 2026-10-17): the year in numbers from this device's and the account's
 * real records (wrappedStats.js), and a monochrome image to download or share.
 */
export default function WrappedPage({ isRtl, user, watchHistory, mangaHistory, favorites, dataSaver, onOpenTitle, onToast }) {
  const year = new Date().getFullYear();
  const stats = useMemo(
    () => wrappedStats({ positions: positionEntries(), history: watchHistory, mangaHistory, favorites, year }),
    [watchHistory, mangaHistory, favorites, year]
  );
  const [busy, setBusy] = useState(false);
  const name = user?.displayName || user?.username || '';
  const months = isRtl ? MONTHS_AR : MONTHS_EN;

  const exportImage = async (mode) => {
    setBusy(true);
    try {
      const blob = await drawCard({ stats, name, isRtl });
      if (!blob) throw new Error('canvas');
      const file = new File([blob], `black-x-${year}.png`, { type: 'image/png' });
      if (mode === 'share' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Hearbor', text: isRtl ? `سنتي على Hearbor ${year}` : `My ${year} on Hearbor` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        onToast?.(isRtl ? 'اتحفظت الصورة' : 'Image saved', 'check');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') onToast?.(isRtl ? 'ماقدرناش نعمل الصورة' : 'Could not make the image', 'x-circle');
    } finally {
      setBusy(false);
    }
  };

  if (stats.empty) {
    return (
      <div className="bx-empty">
        <BxIcon name="sparkles" size="1.6rem" />
        <p>
          {isRtl
            ? `لسه مفيش مشاهدات أو قراءة متسجلة في ${year} على الجهاز ده أو حسابك. اتفرج على كام حلقة وارجع هنا.`
            : `Nothing recorded in ${year} on this device or your account yet. Watch a few episodes and come back.`}
        </p>
      </div>
    );
  }

  const tiles = [
    { v: hoursText(stats.seconds, isRtl), l: isRtl ? 'وقت المشاهدة' : 'Time watched' },
    { v: stats.finished, l: isRtl ? 'حلقة كمّلتها' : 'Episodes finished' },
    { v: stats.started, l: isRtl ? 'حلقة بدأتها' : 'Episodes started' },
    { v: stats.titlesCount, l: isRtl ? 'عمل اتفرجت عليه' : 'Titles watched' },
    { v: stats.mangaTitles, l: isRtl ? 'مانجا ومانهوا قريتها' : 'Manga & manhwa read' },
    { v: stats.favoritesAdded, l: isRtl ? 'اتضاف لقائمتك' : 'Added to my list' }
  ];

  return (
    <div className="bx-wrapped">
      <section className="bx-wrapped-hero">
        <span>Hearbor</span>
        <h2>{isRtl ? `سنتك على Hearbor ${year}` : `Your ${year} on Hearbor`}</h2>
        {name ? <p dir="auto">{name}</p> : null}
      </section>
      <div className="bx-wrapped-grid">
        {tiles.map((t) => (
          <div key={t.l} className="bx-wrapped-tile">
            <strong>{t.v}</strong>
            <span>{t.l}</span>
          </div>
        ))}
      </div>

      {stats.topTitles.some((t) => t.title) ? (
        <section className="bx-wrapped-section">
          <h3>{isRtl ? 'أكتر أعمال اتفرجت عليها' : 'Most watched'}</h3>
          <ol className="bx-wrapped-top">
            {stats.topTitles
              .filter((t) => t.title)
              .map((t) => (
                <li key={t.slug}>
                  <button type="button" onClick={() => onOpenTitle?.(t)} disabled={!t.objectID && !t.slug}>
                    {t.poster ? <img src={coverForMode(t.poster, dataSaver)} alt="" loading="lazy" decoding="async" /> : <span className="bx-wrapped-noimg" />}
                    <span>
                      <strong dir="auto">{t.title}</strong>
                      <small>{isRtl ? `${t.episodes} حلقة • ${hoursText(t.seconds, true)}` : `${t.episodes} episodes • ${hoursText(t.seconds, false)}`}</small>
                    </span>
                  </button>
                </li>
              ))}
          </ol>
        </section>
      ) : null}

      {stats.topGenres.length || stats.busiestMonth >= 0 ? (
        <section className="bx-wrapped-section">
          {stats.topGenres.length ? (
            <p className="bx-wrapped-line">
              <span>{isRtl ? 'أكتر تصنيفات:' : 'Top genres:'}</span>
              {stats.topGenres.map((gname) => (
                <span key={gname} className="bxp-pill">
                  {gname}
                </span>
              ))}
            </p>
          ) : null}
          {stats.busiestMonth >= 0 ? (
            <p className="bx-wrapped-line">
              <span>{isRtl ? 'أكتر شهر اتفرجت فيه:' : 'Busiest month:'}</span> {months[stats.busiestMonth]}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="bx-wrapped-actions">
        <button type="button" className="bx-btn" disabled={busy} onClick={() => exportImage('share')}>
          <BxIcon name="share" />
          {isRtl ? 'شارك الصورة' : 'Share the image'}
        </button>
        <button type="button" className="bx-btn bx-btn-outline" disabled={busy} onClick={() => exportImage('download')}>
          <BxIcon name="download" />
          {isRtl ? 'نزّل الصورة' : 'Download the image'}
        </button>
      </div>
      <p className="bxp-watchstats-note">
        {isRtl
          ? `محسوبة من اللي اتسجل على الجهاز ده وحسابك: مواضع التشغيل (آخر ${POSITIONS_MAX} حلقة)، وسجل المشاهدة والقراءة، وقائمتك. الحلقة بتتحسب "كمّلتها" لما توصل 90% منها.`
          : `Counted from what this device and your account recorded: playback positions (latest ${POSITIONS_MAX} episodes), watch and reading history, and your list. An episode counts as finished at 90 %.`}
      </p>
    </div>
  );
}
