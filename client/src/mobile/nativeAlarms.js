/**
 * Air-time reminders that reach the phone while the APK is closed (APK v18, 2026-10-17).
 *
 * The web code cannot run in the background, so the APK's native side keeps the list:
 * `BlackXNativeAuth.scheduleEpisodeAlarms(json)` (android-native/smali/.../EpisodeAlarms.smali)
 * replaces every alarm with `json` = [{ id, title, body, at }] (at = epoch ms) and puts them
 * back after a reboot. Each alarm is the real next air time AniList reports for a followed
 * title (airingSchedule.js) — the Japanese broadcast. The episode reaches Hearbor once it is
 * subtitled, which the in-app episode alerts (episodeAlerts.js) keep checking when the app
 * is open; the reminder text says exactly that.
 *
 * Older APKs (≤ 17.1) and the website have no such method: nothing is scheduled there.
 */

export const MAX_ALARMS = 40;
const HORIZON_MS = 8 * 24 * 3600 * 1000;

export function nativeAlarmsSupported() {
  return typeof window !== 'undefined' && typeof window.BlackXNativeAuth?.scheduleEpisodeAlarms === 'function';
}

/** A stable positive 31-bit id per title + episode (FNV-1a), so a reschedule replaces it. */
export function alarmIdFor(key) {
  let h = 0x811c9dc5;
  const s = String(key || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 2147483000) + 1;
}

/**
 * The reminders for the followed titles: one per title with a known next air time in the
 * next 8 days, soonest first, at most MAX_ALARMS.
 */
export function buildAlarmList({ followed = [], airingMap, now = Date.now(), isRtl = true } = {}) {
  if (!airingMap || typeof airingMap.get !== 'function') return [];
  const seen = new Set();
  const out = [];
  for (const t of Array.isArray(followed) ? followed : []) {
    const mal = Number(t?.malId);
    if (!(mal > 0) || seen.has(mal)) continue;
    const airing = airingMap.get(mal);
    const at = Number(airing?.airingAt) * 1000;
    if (!Number.isFinite(at) || at <= now || at - now > HORIZON_MS) continue;
    seen.add(mal);
    const name = String(t.titleEn || t.titleAr || t.titleRomaji || '').trim() || 'Hearbor';
    const ep = Number(airing.episode) > 0 ? Number(airing.episode) : null;
    out.push({
      id: alarmIdFor(`${mal}:${ep || at}`),
      title: isRtl ? `ميعاد ${name}` : `${name} is airing`,
      body: isRtl
        ? `${ep ? `الحلقة ${ep}` : 'الحلقة الجديدة'} بتتعرض دلوقتي في اليابان. هتنزل على Hearbor لما تتترجم.`
        : `${ep ? `Episode ${ep}` : 'The new episode'} is airing in Japan now. It reaches Hearbor once it is subtitled.`,
      at
    });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_ALARMS);
}

/** Hands the list to the APK. Returns how many it armed, or -1 when unsupported / failed. */
export function scheduleNativeAlarms(list) {
  if (!nativeAlarmsSupported()) return -1;
  try {
    const n = window.BlackXNativeAuth.scheduleEpisodeAlarms(JSON.stringify(Array.isArray(list) ? list : []));
    return Number.isFinite(Number(n)) ? Number(n) : -1;
  } catch {
    return -1;
  }
}
