/**
 * Real air times for the app: the schedule tab, the "airing now" cards on home and the
 * timing of new-episode alerts.
 *
 * Source: `/api/anime/schedule` — AniList's next airing episode for the ~100 most popular
 * Japanese shows on air (server/src/anilist.js), matched to catalogue records by their
 * MyAnimeList id (`malId`, the only id the catalogue knows). A record without a match
 * simply has no time: nothing is guessed or derived from the catalogue's weekday tag.
 *
 * The time is the Japanese broadcast, shown in the phone's own time zone; the subtitled
 * episode reaches the Hearbor servers some time after it (the schedule says so).
 */
import { bxRequestJson } from './bxServers.js';
import { dayIdOf } from './scheduleDays.js';

const TTL_MS = 10 * 60 * 1000;
let cache = null; // { at, map }
let inflight = null;

/** Map<malId, { airingAt (unix s), episode }>, cached for 10 minutes. Never throws. */
export function fetchAiringTimes({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.map);
  if (inflight) return inflight;
  inflight = bxRequestJson('/api/anime/schedule', { timeoutMs: 15000 })
    .then((data) => {
      const map = new Map();
      for (const list of Object.values(data?.days || {})) {
        for (const slot of Array.isArray(list) ? list : []) {
          const mal = Number(slot?.media?.malId);
          const at = Number(slot?.airingAt);
          if (!(mal > 0) || !(at > 0)) continue;
          const prev = map.get(mal);
          if (!prev || at < prev.airingAt) map.set(mal, { airingAt: at, episode: Number(slot.episode) || null });
        }
      }
      cache = { at: Date.now(), map };
      return map;
    })
    .catch(() => cache?.map || new Map())
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The real next airing of a catalogue item, or null. */
export function airingFor(item, map) {
  const mal = Number(item?.malId);
  if (!(mal > 0) || !map || typeof map.get !== 'function') return null;
  return map.get(mal) || null;
}

/** Schedule day id (the Arabic weekday of scheduleDays.js) of an air time, in local time. */
export function airingDayId(airingAt) {
  return dayIdOf(new Date(airingAt * 1000));
}

const LOCALE_AR = 'ar-EG-u-nu-latn';

/** "9:30 م" / "9:30 PM" in the phone's time zone. */
export function formatAirClock(airingAt, isRtl) {
  try {
    return new Date(airingAt * 1000).toLocaleTimeString(isRtl ? LOCALE_AR : 'fr-FR', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** "الجمعة" / "Friday" of an air time (local). */
export function formatAirWeekday(airingAt, isRtl) {
  try {
    return new Date(airingAt * 1000).toLocaleDateString(isRtl ? LOCALE_AR : 'fr-FR', { weekday: 'long' });
  } catch {
    return '';
  }
}

function arCount(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  return n <= 10 ? `${n} ${few}` : `${n} ${many}`;
}

/** "بعد ساعتين و 10 دقايق" / "in 2 h 10 min"; '' once the time has passed. */
export function countdownText(airingAt, nowMs, isRtl) {
  const diffMin = Math.ceil((airingAt * 1000 - nowMs) / 60000);
  if (!(diffMin > 0)) return '';
  if (diffMin < 60) {
    return isRtl ? `بعد ${arCount(diffMin, 'دقيقة', 'دقيقتين', 'دقايق', 'دقيقة')}` : `dans ${diffMin} min`;
  }
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h < 24) {
    if (!isRtl) return m && h < 6 ? `dans ${h} h ${m} min` : `dans ${h} h`;
    const hours = arCount(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    return m && h < 6 ? `بعد ${hours} و ${arCount(m, 'دقيقة', 'دقيقتين', 'دقايق', 'دقيقة')}` : `بعد ${hours}`;
  }
  const d = Math.floor(h / 24);
  return isRtl ? `بعد ${arCount(d, 'يوم', 'يومين', 'أيام', 'يوم')}` : `dans ${d} ${d === 1 ? 'jour' : 'jours'}`;
}

/**
 * What a schedule row says about an air time.
 * - `aired`: the time has passed («اتعرضت»);
 * - `soon`: within 24 hours (a live countdown);
 * - `nextWeek`: on today's weekday but about a week away — today's episode already aired;
 * - `later`: any other day this week.
 */
export function airingState(airingAt, nowMs = Date.now()) {
  const diff = airingAt * 1000 - nowMs;
  if (diff <= 0) return 'aired';
  if (diff < 24 * 3600 * 1000) return 'soon';
  if (diff > 6 * 24 * 3600 * 1000 && airingDayId(airingAt) === dayIdOf(new Date(nowMs))) return 'nextWeek';
  return 'later';
}

/** One short line for cards: "الحلقة 8 • الجمعة 9:30 م" (or "• بعد 3 ساعات" when close). */
export function airingLine(airing, nowMs, isRtl) {
  if (!airing?.airingAt) return '';
  const ep = airing.episode ? (isRtl ? `الحلقة ${airing.episode}` : `Ép. ${airing.episode}`) : '';
  const state = airingState(airing.airingAt, nowMs);
  let when;
  if (state === 'aired') when = isRtl ? 'اتعرضت' : 'diffusé';
  else if (state === 'soon') when = countdownText(airing.airingAt, nowMs, isRtl);
  else if (state === 'nextWeek') when = `${isRtl ? 'الأسبوع الجاي' : 'la semaine prochaine'} ${formatAirClock(airing.airingAt, isRtl)}`;
  else when = `${formatAirWeekday(airing.airingAt, isRtl)} ${formatAirClock(airing.airingAt, isRtl)}`;
  return [ep, when].filter(Boolean).join(' • ');
}

function minuteOfDay(airingAt) {
  const d = new Date(airingAt * 1000);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * The list of one schedule day.
 * - weekdays: every show (on air now, or tagged with that weekday by the catalogue) whose real
 *   air time falls on that day, ordered by time; then the catalogue's shows for that weekday
 *   that have no real time, in the catalogue's popularity order. A show whose real time falls
 *   on another day is listed on that other day only.
 * - `all_airing`: every show on air, soonest first, then the ones without a time.
 * Each returned item carries `airing` ({ airingAt, episode }) or null.
 */
export function buildScheduleDay({ dayId, airingItems = [], dayItems = [], map }) {
  const seen = new Set();
  const pool = [];
  for (const item of [...airingItems, ...dayItems]) {
    if (!item?.objectID || seen.has(item.objectID)) continue;
    seen.add(item.objectID);
    pool.push(item);
  }
  const withTime = (item) => ({ ...item, airing: airingFor(item, map) });
  if (dayId === 'all_airing') {
    const list = airingItems.map(withTime);
    const timed = list.filter((x) => x.airing).sort((a, b) => a.airing.airingAt - b.airing.airingAt);
    return [...timed, ...list.filter((x) => !x.airing)];
  }
  const timed = pool
    .map(withTime)
    .filter((x) => x.airing && airingDayId(x.airing.airingAt) === dayId)
    .sort((a, b) => minuteOfDay(a.airing.airingAt) - minuteOfDay(b.airing.airingAt) || a.airing.airingAt - b.airing.airingAt);
  const untimed = dayItems.filter((item) => item?.objectID && !airingFor(item, map)).map((item) => ({ ...item, airing: null }));
  const timedIds = new Set(timed.map((x) => x.objectID));
  return [...timed, ...untimed.filter((x) => !timedIds.has(x.objectID))];
}
