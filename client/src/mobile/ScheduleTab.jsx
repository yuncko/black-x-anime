import React, { useEffect, useRef, useState } from 'react';
import BxIcon from './BxIcon.jsx';
import { SkeletonList } from './Skeleton.jsx';
import { coverForMode } from './dataSaver.js';
import { useLongPress } from './PosterCard.jsx';
import { SCHEDULE_DAYS, todayScheduleId } from './scheduleDays.js';
import { airingState, countdownText, formatAirClock, formatAirWeekday } from './airingSchedule.js';

/** Re-render every `ms` while mounted (live countdowns, «اتعرضت» once the time passes). */
function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') setNow(Date.now());
    };
    const t = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms]);
  return now;
}

function TimeCell({ airing, now, isRtl, showDay }) {
  if (!airing) return null;
  const state = airingState(airing.airingAt, now);
  const clock = formatAirClock(airing.airingAt, isRtl);
  let sub = '';
  if (state === 'aired') sub = isRtl ? 'اتعرضت' : 'Aired';
  else if (state === 'soon') sub = countdownText(airing.airingAt, now, isRtl);
  else if (state === 'nextWeek') sub = isRtl ? 'الأسبوع الجاي' : 'Next week';
  else if (showDay) sub = formatAirWeekday(airing.airingAt, isRtl);
  return (
    <span className={`bx-sched-time is-${state}`}>
      <strong>{clock}</strong>
      {sub ? <span>{sub}</span> : null}
    </span>
  );
}

function ScheduleRow({ item, isRtl, dataSaver, fav, now, showDay, onOpen, onPeek, onToggleFavorite }) {
  const { handlers, consumeClick } = useLongPress(onPeek ? () => onPeek(item) : null);
  const airing = item.airing || null;
  const meta = [];
  if (airing?.episode) meta.push(isRtl ? `الحلقة ${airing.episode}` : `Episode ${airing.episode}`);
  if (item.type) meta.push(item.type);
  if (!airing && item.state) meta.push(item.state);
  return (
    <div
      className={`bx-sched-row bx-mob-card${airing ? ' has-time' : ''}${airing && airingState(airing.airingAt, now) === 'aired' ? ' is-aired' : ''}`}
      data-bx-oid={item.objectID}
      role="button"
      tabIndex={0}
      {...handlers}
      onClick={() => {
        if (consumeClick()) return;
        onOpen(item);
      }}
    >
      <TimeCell airing={airing} now={now} isRtl={isRtl} showDay={showDay} />
      <img className="bx-sched-thumb" src={coverForMode(item.poster, dataSaver)} alt="" loading="lazy" decoding="async" draggable={false} />
      <div className="bx-sched-copy">
        <div className="bx-sched-title" dir="auto">
          {item.titleEn}
        </div>
        <div className="bx-sched-meta">
          {item.rating ? (
            <span className="bx-sched-rating">
              <BxIcon name="star" size="0.95em" filled />
              {item.rating}
            </span>
          ) : null}
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </div>
      <button
        type="button"
        className={`bx-icon-btn bx-icon-btn-sm${fav ? ' is-on' : ''}`}
        aria-label={fav ? (isRtl ? 'في قائمتي' : 'In my list') : isRtl ? 'أضف لقائمتي' : 'Add to my list'}
        aria-pressed={fav}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(item);
        }}
      >
        <BxIcon name={fav ? 'check' : 'plus'} />
      </button>
    </div>
  );
}

function countText(count, isRtl) {
  if (!isRtl) return `${count} ${count === 1 ? 'show' : 'shows'}`;
  if (count === 0) return '';
  if (count === 1) return 'عمل واحد';
  if (count === 2) return 'عملين';
  return count <= 10 ? `${count} أعمال` : `${count} عمل`;
}

/**
 * Airing schedule: day chips (today is marked and scrolled into view), then one row per show.
 * Shows with a real air time (AniList, matched by MAL id — airingSchedule.js) come first, in
 * time order, with the local time and a live countdown («اتعرضت» once it passed); the
 * catalogue's shows for that weekday without a known time follow, by popularity.
 */
export default function ScheduleTab({
  pageClassName = 'bx-page',
  isRtl,
  day,
  onDay,
  items,
  loading,
  favorites,
  dataSaver,
  onOpen,
  onPeek,
  onToggleFavorite,
  onAlerts
}) {
  const railRef = useRef(null);
  const today = todayScheduleId();
  const now = useNow(30000);

  useEffect(() => {
    const chip = railRef.current?.querySelector('[aria-pressed="true"]');
    if (!chip) return;
    try {
      chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    } catch (_) {
      /* old WebView */
    }
  }, [day]);

  const timed = items.filter((x) => x.airing);
  const untimed = items.filter((x) => !x.airing);
  const showDay = day === 'all_airing';
  const label = countText(items.length, isRtl);
  const order = timed.length ? (isRtl ? 'بالميعاد' : 'by air time') : isRtl ? 'حسب الشعبية' : 'by popularity';
  const isFav = (item) => favorites.some((f) => f.objectID === item.objectID);
  const row = (item) => (
    <ScheduleRow
      key={item.objectID}
      item={item}
      isRtl={isRtl}
      dataSaver={dataSaver}
      fav={isFav(item)}
      now={now}
      showDay={showDay}
      onOpen={onOpen}
      onPeek={onPeek}
      onToggleFavorite={onToggleFavorite}
    />
  );

  return (
    <main className={`${pageClassName} bx-schedule`} style={{ padding: '0.25rem 1rem 1rem' }}>
      <div className="bx-row bx-chip-row bx-day-rail" ref={railRef} role="tablist" aria-label={isRtl ? 'أيام الأسبوع' : 'Days'}>
        {SCHEDULE_DAYS.map((d) => {
          const active = d.id === day;
          const isToday = d.id === today;
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-pressed={active}
              className={`bx-chip bx-day-chip${active ? ' is-active' : ''}${isToday ? ' is-today' : ''}`}
              onClick={() => onDay(d.id)}
            >
              {isRtl ? d.ar : d.en}
              {isToday ? <span className="bx-today-tag">{isRtl ? 'النهارده' : 'Today'}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="bx-sched-bar">
        <span>{loading || !label ? '' : `${label} • ${order}`}</span>
        <button type="button" className="bx-chip" onClick={onAlerts}>
          <BxIcon name="bell" size="1em" />
          {isRtl ? 'التنبيهات' : 'Alerts'}
        </button>
      </div>

      {loading ? (
        <SkeletonList count={6} thumbWidth={56} thumbHeight={80} padding="0" />
      ) : items.length === 0 ? (
        <div className="bx-empty">
          <BxIcon name="calendar" size="2rem" />
          <p>{isRtl ? 'مفيش حلقات متسجلة لليوم ده.' : 'Nothing is scheduled for this day.'}</p>
        </div>
      ) : (
        <>
          {timed.length ? <div className="bx-sched-list bx-stagger">{timed.map(row)}</div> : null}
          {untimed.length ? (
            <>
              {timed.length ? (
                <h3 className="bx-sched-divider">{isRtl ? 'من غير ميعاد معروف' : 'No known air time'}</h3>
              ) : null}
              <div className="bx-sched-list bx-stagger">{untimed.map(row)}</div>
            </>
          ) : null}
          {timed.length ? (
            <p className="bx-sched-note">
              <BxIcon name="info" size="1em" className="bx-ico-lead" />
              {isRtl
                ? 'المواعيد هي ميعاد عرض الحلقة في اليابان بتوقيت جهازك (من AniList)، والحلقة المترجمة بتنزل على Hearbor بعدها.'
                : 'Times are the Japanese broadcast in your time zone (from AniList); the subtitled episode reaches Hearbor after that.'}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
