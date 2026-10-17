/**
 * Resume positions per episode, keyed "<slug>:<episode>".
 *
 * Up to v15.1 the position was stored under `bx_ep_sec_<docId>`, and docId is
 * just the zero-padded episode number ("001"), so episode 1 of every show shared
 * one slot. Positions are also synced with the account (/api/app/state), so the
 * same second resumes on another phone.
 */
const KEY = 'bx_mob_positions_v16';
const MAX = 120;
let cache = null;
let writeTimer = null;
const listeners = new Set();

function load() {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist(immediate = false) {
  const write = () => {
    writeTimer = null;
    try {
      const entries = Object.entries(load()).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, MAX);
      cache = Object.fromEntries(entries);
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* storage full */
    }
  };
  if (immediate) {
    clearTimeout(writeTimer);
    write();
  } else if (!writeTimer) {
    writeTimer = setTimeout(write, 1500);
  }
}

export function animeSlugOf(anime) {
  if (!anime) return '';
  if (anime.slug) return String(anime.slug);
  const id = String(anime.objectID || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return id ? `aw-${id}` : '';
}

export function episodeKey(anime, episode) {
  const slug = animeSlugOf(anime);
  const n = Number(typeof episode === 'object' && episode ? episode.number ?? episode.episode : episode);
  return slug && Number.isFinite(n) && n > 0 ? `${slug}:${n}` : '';
}

export function getPosition(key) {
  if (!key) return null;
  return load()[key] || null;
}

export function savePosition(key, sec, dur, { done = false, immediate = false } = {}) {
  if (!key) return;
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const d = Math.max(0, Math.round(Number(dur) || 0));
  load()[key] = { sec: s, dur: d, at: Date.now(), ...(done ? { done: true } : {}) };
  persist(immediate);
  listeners.forEach((fn) => fn(key));
}

/** Merge positions from the account: the newest entry per episode wins. */
export function mergePositions(serverMap) {
  if (!serverMap || typeof serverMap !== 'object') return false;
  const local = load();
  let changed = false;
  for (const [key, value] of Object.entries(serverMap)) {
    if (!value || typeof value !== 'object') continue;
    if (!local[key] || (Number(value.at) || 0) > (Number(local[key].at) || 0)) {
      local[key] = { sec: Number(value.sec) || 0, dur: Number(value.dur) || 0, at: Number(value.at) || Date.now() };
      changed = true;
    }
  }
  if (changed) {
    persist(true);
    listeners.forEach((fn) => fn(null));
  }
  return changed;
}

/** The newest 80 positions, for /api/app/state. */
export function positionsForSync() {
  return Object.fromEntries(
    Object.entries(load())
      .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
      .slice(0, 80)
      .map(([k, v]) => [k, { sec: v.sec, dur: v.dur, at: v.at }])
  );
}

/** Every stored position ([key, { sec, dur, at, done? }]) — at most the newest 120 episodes. */
export function positionEntries() {
  return Object.entries(load());
}

export const POSITIONS_MAX = MAX;

export function subscribePositions(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function flushPositions() {
  persist(true);
}

/** Forget every position on this device (account deletion with "clear this device"). */
export function clearPositions() {
  clearTimeout(writeTimer);
  writeTimer = null;
  cache = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((fn) => fn(null));
}

export function formatClock(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
