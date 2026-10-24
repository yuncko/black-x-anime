/**
 * «ملخصك» (website, 2026-10-17): your year on Hearbor, from what this device and your
 * account really recorded. Nothing is estimated and nothing has a minimum — the classic
 * page's «Wrapped» showed at least 12 hours, 48 episodes and level 75 to everybody.
 *
 *   positions     resume store entries: ["<slug>:<episode>", { sec, dur, at, done }]
 *                 (the newest 120 episodes — the page says so)
 *   history       watch history, one entry per title (slug, titleEn, poster, tags, updatedAt)
 *   mangaHistory  one entry per manga / manhwa (updatedAt)
 *   favorites     my list (createdAt)
 */

function slugOfEntry(e) {
  if (!e) return '';
  if (e.slug) return String(e.slug);
  const id = String(e.objectID || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id ? `aw-${id}` : '';
}

function yearOf(value) {
  const t = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(t) || t <= 0) return null;
  return new Date(t).getFullYear();
}

export function wrappedStats({ positions = [], history = [], mangaHistory = [], favorites = [], year = new Date().getFullYear() } = {}) {
  let seconds = 0;
  let started = 0;
  let finished = 0;
  const months = new Array(12).fill(0);
  const perTitle = new Map();

  for (const entry of Array.isArray(positions) ? positions : []) {
    const [key, v] = Array.isArray(entry) ? entry : [];
    const at = Number(v?.at) || 0;
    if (!key || yearOf(at) !== year) continue;
    const sec = Math.max(0, Number(v?.sec) || 0);
    const dur = Math.max(0, Number(v?.dur) || 0);
    if (!sec && !v?.done) continue;
    const watched = dur > 0 ? Math.min(sec, dur) : sec;
    started += 1;
    seconds += watched;
    if (v?.done || (dur > 0 && sec / dur >= 0.9)) finished += 1;
    months[new Date(at).getMonth()] += 1;
    const k = String(key);
    const slug = k.includes(':') ? k.slice(0, k.lastIndexOf(':')) : k;
    const t = perTitle.get(slug) || { slug, episodes: 0, seconds: 0 };
    t.episodes += 1;
    t.seconds += watched;
    perTitle.set(slug, t);
  }

  const bySlug = new Map();
  for (const h of Array.isArray(history) ? history : []) {
    const s = slugOfEntry(h);
    if (s && !bySlug.has(s)) bySlug.set(s, h);
  }
  const topTitles = [...perTitle.values()]
    .sort((a, b) => b.episodes - a.episodes || b.seconds - a.seconds)
    .slice(0, 5)
    .map((t) => {
      const h = bySlug.get(t.slug);
      return { ...t, title: h?.titleEn || h?.titleAr || '', poster: h?.poster || '', objectID: h?.objectID || '' };
    });

  const counts = new Map();
  for (const h of Array.isArray(history) ? history : []) {
    if (yearOf(h?.updatedAt) !== year) continue;
    for (const tag of Array.isArray(h?.tags) ? h.tags.slice(0, 6) : []) {
      const k = String(tag || '').trim();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  const topGenres = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([t]) => t);

  const mangaTitles = (Array.isArray(mangaHistory) ? mangaHistory : []).filter((m) => yearOf(m?.updatedAt) === year).length;
  const favoritesAdded = (Array.isArray(favorites) ? favorites : []).filter((f) => yearOf(f?.createdAt) === year).length;
  const peak = Math.max(...months);
  return {
    year,
    seconds,
    started,
    finished,
    titlesCount: perTitle.size,
    topTitles,
    topGenres,
    mangaTitles,
    favoritesAdded,
    months,
    busiestMonth: peak > 0 ? months.indexOf(peak) : -1,
    empty: started === 0 && mangaTitles === 0 && favoritesAdded === 0
  };
}

export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "12 س 5 د" / "12h 5m" from seconds (whole minutes, like the profile's watch stats). */
export function hoursText(totalSec, isRtl = true) {
  const min = Math.floor((Number(totalSec) || 0) / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (isRtl) return h ? `${h} س${m ? ` ${m} د` : ''}` : `${m} د`;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}
