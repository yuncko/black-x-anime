/**
 * Watch party (v18, 2026-10-17): real rooms shared through two Firestore documents in the
 * `settings` collection — the social documents both rule sets keep open (`wp_*`, see
 * firestore.rules.phase2 `isSocialDoc`):
 *
 *   wp_<code>        the room: title, episode, position, paused … written by the HOST ONLY
 *   wp_<code>_chat   chat messages and join / leave / reaction events, appended with an
 *                    `updateTime` precondition, so two people sending at once never erase
 *                    each other (a conflict re-reads and tries again)
 *
 * v17's party kept everything in one document that guests rewrote with their own position
 * (pulling the host back in time), never opened the host's episode for a guest, and synced
 * only every 2.6 s without counting the time since the host's update.
 *
 * Pure helpers + a transport built on an injected fetch, so Node tests can run all of it.
 */

/** Guests read the room this often while the host plays (seek / pause show up within it). */
export const PARTY_POLL_MS = 2500;
/** …while the host is paused (only a "play" can come next). */
export const PARTY_PAUSED_POLL_MS = 4000;
/** …in a background tab (room and chat). Was 8 s for both up to v18.0. */
export const PARTY_HIDDEN_POLL_MS = 15000;
/** The chat is read every 2.5 s for a minute after anything was said, else every 7.5 s. */
export const CHAT_ACTIVE_POLL_MS = 2500;
export const CHAT_QUIET_POLL_MS = 7500;
export const CHAT_HIDDEN_POLL_MS = 30000;
export const CHAT_ACTIVE_WINDOW_MS = 60000;
export const HOST_HEARTBEAT_MS = 10000;
export const HOST_PAUSED_HEARTBEAT_MS = 30000;
export const DRIFT_PLAYING_SEC = 2.5;
export const DRIFT_PAUSED_SEC = 1;
export const CHAT_MAX = 60;
export const TEXT_MAX = 300;
export const NAME_MAX = 40;
/** A room whose host has not written for this long is over (closed tab, lost connection). */
export const ROOM_STALE_MS = 6 * 3600 * 1000;
export const PARTY_REACTIONS = Object.freeze(['🔥', '😂', '😱', '😭', '👏', '❤️']);

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

export function newRoomCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 6; i += 1) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return `BX${s}`;
}

/** "bx-7k2 m9q" → "BX7K2M9Q"; '' when it cannot be a room code. */
export function normalizeRoomCode(input) {
  const s = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return s.length >= 4 && s.length <= 16 ? s : '';
}

export function roomDocId(code) {
  const c = normalizeRoomCode(code).toLowerCase();
  return c ? `wp_${c}` : '';
}

export function chatDocId(code) {
  const id = roomDocId(code);
  return id ? `${id}_chat` : '';
}

/** The invite link of the website: the player of the room's episode with ?party=CODE. */
export function partyLink(origin, room) {
  if (!room || !room.slug || !room.code) return '';
  const ep = Number(room.episode) > 0 ? Number(room.episode) : 1;
  const params = new URLSearchParams();
  if (room.source === 'aniproject') params.set('source', 'aniproject');
  params.set('party', room.code);
  return `${String(origin || '').replace(/\/$/, '')}/watch/${encodeURIComponent(room.slug)}/${ep}?${params.toString()}`;
}

export function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** A room document as stored, or null when it is not a v2 room. */
export function parseRoom(data) {
  if (!data || typeof data !== 'object' || data.v !== 2) return null;
  const code = normalizeRoomCode(data.code);
  const slug = String(data.slug || '');
  if (!code || !slug || !data.hostId) return null;
  return {
    v: 2,
    code,
    hostId: String(data.hostId),
    hostName: cleanText(data.hostName, NAME_MAX),
    slug,
    source: String(data.source || ''),
    objectID: String(data.objectID || ''),
    title: cleanText(data.title, 200),
    poster: String(data.poster || ''),
    episode: Number(data.episode) > 0 ? Math.floor(Number(data.episode)) : 1,
    epName: cleanText(data.epName, 120),
    position: Math.max(0, Number(data.position) || 0),
    paused: Boolean(data.paused),
    rate: Number(data.rate) > 0 && Number(data.rate) <= 4 ? Number(data.rate) : 1,
    updatedAt: Number(data.updatedAt) || 0,
    seq: Number(data.seq) || 0,
    endedAt: Number(data.endedAt) || 0
  };
}

export function roomIsOver(room, now = Date.now()) {
  if (!room) return true;
  if (room.endedAt) return true;
  return room.updatedAt > 0 && now - room.updatedAt > ROOM_STALE_MS;
}

/** Same title and episode as what is playing here. */
export function sameContent(room, current) {
  if (!room || !current) return false;
  return String(room.slug) === String(current.slug) && Number(room.episode) === Number(current.episode);
}

/**
 * Where the host's video is now: the stored position plus the time since this device received
 * that state (receipt time, not the host's clock, so clock differences between devices do not
 * matter; the network delay is well inside the tolerance).
 */
export function expectedPosition(room, receivedAt, now) {
  if (!room) return 0;
  const base = Math.max(0, Number(room.position) || 0);
  if (room.paused) return base;
  const rate = Number(room.rate) > 0 ? Number(room.rate) : 1;
  return base + (Math.max(0, now - receivedAt) / 1000) * rate;
}

/** What a guest's video must do to follow the host: { seekTo|null, play, pause, drift }. */
export function syncAction({ room, receivedAt, now, current, paused, duration }) {
  if (!room) return null;
  let target = expectedPosition(room, receivedAt, now);
  if (Number(duration) > 0) target = Math.min(target, Math.max(0, Number(duration) - 0.5));
  const drift = Math.abs((Number(current) || 0) - target);
  const tolerance = room.paused ? DRIFT_PAUSED_SEC : DRIFT_PLAYING_SEC;
  return {
    seekTo: drift > tolerance ? target : null,
    play: !room.paused && Boolean(paused),
    pause: room.paused && !paused,
    drift
  };
}

let msgCounter = 0;
export function makeMessage({ uid, name, text, kind = 'msg', pos = null, now = Date.now(), rand = Math.random }) {
  msgCounter = (msgCounter + 1) % 1e6;
  const body = kind === 'react' ? (PARTY_REACTIONS.includes(text) ? text : '') : cleanText(text, TEXT_MAX);
  return {
    id: `${now.toString(36)}-${Math.floor(rand() * 1e9).toString(36)}-${msgCounter.toString(36)}`,
    uid: String(uid || ''),
    name: cleanText(name, NAME_MAX),
    kind: ['msg', 'join', 'leave', 'react'].includes(kind) ? kind : 'msg',
    text: body,
    at: now,
    ...(Number.isFinite(pos) && pos >= 0 ? { pos: Math.floor(pos) } : {})
  };
}

function validMessage(m) {
  return m && typeof m === 'object' && typeof m.id === 'string' && m.id && typeof m.uid === 'string' && Number.isFinite(Number(m.at));
}

/** Existing + new messages, without duplicates, oldest first, at most CHAT_MAX. */
export function appendMessages(existing, incoming) {
  const byId = new Map();
  for (const m of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    if (validMessage(m) && !byId.has(m.id)) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => Number(a.at) - Number(b.at) || (a.id < b.id ? -1 : 1)).slice(-CHAT_MAX);
}

/** Who joined the room, from the real join / leave events of the chat (latest event wins). */
export function membersFromChat(messages) {
  const map = new Map();
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!validMessage(m) || (m.kind !== 'join' && m.kind !== 'leave' && m.kind !== 'msg' && m.kind !== 'react')) continue;
    const prev = map.get(m.uid);
    const present = m.kind === 'leave' ? false : m.kind === 'join' ? true : prev ? prev.present : true;
    map.set(m.uid, { uid: m.uid, name: m.name || (prev && prev.name) || '', present });
  }
  return [...map.values()];
}

/**
 * What to read on this tick and when to come back (Firestore bills every document read, and the
 * free quota is 50k reads a day: v18.0 read 2 documents every 2.5 s per guest, ~2,900 an hour).
 * Guests read the room on its own interval (playing 2.5 s, paused 4 s, background 15 s); everyone
 * reads the chat every 2.5 s while people talk and every 7.5 s when it is quiet (30 s background).
 * `lastRoomAt` / `lastChatAt` = when each was last read, `chatActiveAt` = when something was last
 * said / sent / joined.
 */
export function partyPollPlan({ role, hidden = false, roomPaused = false, chatActiveAt = 0, lastRoomAt = 0, lastChatAt = 0, now = Date.now() } = {}) {
  const slack = 200;
  const guest = role === 'guest';
  const roomMs = hidden ? PARTY_HIDDEN_POLL_MS : roomPaused ? PARTY_PAUSED_POLL_MS : PARTY_POLL_MS;
  const chatMs = hidden ? CHAT_HIDDEN_POLL_MS : now - chatActiveAt < CHAT_ACTIVE_WINDOW_MS ? CHAT_ACTIVE_POLL_MS : CHAT_QUIET_POLL_MS;
  const room = guest && now - lastRoomAt >= roomMs - slack;
  const chat = now - lastChatAt >= chatMs - slack;
  const nextRoom = guest ? (room ? now : lastRoomAt) + roomMs : Infinity;
  const nextChat = (chat ? now : lastChatAt) + chatMs;
  return { room, chat, delay: Math.max(500, Math.min(nextRoom, nextChat) - now) };
}

export function relativeTime(at, now, isRtl = true) {
  const sec = Math.max(0, Math.round((now - Number(at)) / 1000));
  if (sec < 60) return isRtl ? 'دلوقتي' : 'now';
  const min = Math.round(sec / 60);
  if (min < 60) return isRtl ? `من ${min} د` : `${min}m ago`;
  const h = Math.round(min / 60);
  return isRtl ? `من ${h} س` : `${h}h ago`;
}

export function formatClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
}

const CONFLICT_STATUSES = new Set(['FAILED_PRECONDITION', 'ALREADY_EXISTS', 'ABORTED', 'NOT_FOUND']);

/**
 * Firestore REST transport for the two documents. `base` is the documents URL of the
 * `settings` collection, `key` the web API key (the same the app already uses).
 */
export function createPartyTransport({ base, key, fetchImpl, sleep } = {}) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const url = (id, extra = '') => `${base}/${id}?key=${encodeURIComponent(key)}${extra}`;

  async function read(id) {
    const res = await doFetch(url(id), { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`party read ${res.status}`);
    const doc = await res.json();
    const raw = doc?.fields?.json?.stringValue;
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    return { data, updateTime: String(doc?.updateTime || '') };
  }

  /** { ok, conflict, updateTime } — conflict when a precondition failed. */
  async function write(id, data, { mustNotExist = false, updateTime = '' } = {}) {
    const pre = mustNotExist
      ? '&currentDocument.exists=false'
      : updateTime
      ? `&currentDocument.updateTime=${encodeURIComponent(updateTime)}`
      : '';
    const res = await doFetch(url(id, pre), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          json: { stringValue: JSON.stringify(data) },
          updatedAt: { stringValue: new Date().toISOString() }
        }
      })
    });
    if (res.ok) {
      let doc = null;
      try {
        doc = await res.json();
      } catch {
        doc = null;
      }
      return { ok: true, conflict: false, updateTime: String(doc?.updateTime || '') };
    }
    let status = '';
    try {
      status = String((await res.json())?.error?.status || '');
    } catch {
      status = '';
    }
    const conflict = CONFLICT_STATUSES.has(status) || res.status === 409 || res.status === 412;
    return { ok: false, conflict, status: res.status, updateTime: '' };
  }

  async function readRoom(code) {
    const id = roomDocId(code);
    if (!id) return null;
    const doc = await read(id);
    return doc ? parseRoom(doc.data) : null;
  }

  /** Create a room under a fresh code (a taken code is retried with another one). */
  async function createRoom(room, makeCode = newRoomCode) {
    for (let i = 0; i < 4; i += 1) {
      const code = i === 0 && room.code ? normalizeRoomCode(room.code) : makeCode();
      const data = { ...room, v: 2, code };
      const r = await write(roomDocId(code), data, { mustNotExist: true });
      if (r.ok) return parseRoom(data);
      if (!r.conflict) throw new Error('party create failed');
    }
    throw new Error('party create busy');
  }

  /** The host's state (the host is the only writer, so no precondition). */
  async function writeRoom(room) {
    const r = await write(roomDocId(room.code), { ...room, v: 2 });
    if (!r.ok) throw new Error('party state write failed');
    return r;
  }

  async function readChat(code) {
    const id = chatDocId(code);
    if (!id) return [];
    const doc = await read(id);
    return appendMessages(doc?.data?.messages || [], []);
  }

  /** Append messages to the chat document; retried when someone else wrote in between. */
  async function appendChat(code, messages, tries = 5) {
    const id = chatDocId(code);
    if (!id) throw new Error('party code');
    for (let i = 0; i < tries; i += 1) {
      const cur = await read(id);
      const list = appendMessages(cur?.data?.messages || [], messages);
      const r = await write(id, { v: 2, messages: list }, cur ? { updateTime: cur.updateTime } : { mustNotExist: true });
      if (r.ok) return list;
      if (!r.conflict) throw new Error('party chat write failed');
      await wait(120 + Math.floor(Math.random() * 220));
    }
    throw new Error('party chat busy');
  }

  return { read, write, readRoom, createRoom, writeRoom, readChat, appendChat };
}

const MEMBER_KEY = 'bx_party_member';

/** A random id for this browser / phone, kept so a host who reloads is still the host. */
export function partyMemberId() {
  try {
    const saved = localStorage.getItem(MEMBER_KEY);
    if (saved && /^[a-z0-9]{8,32}$/.test(saved)) return saved;
    const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e12).toString(36)}`.slice(0, 24);
    localStorage.setItem(MEMBER_KEY, id);
    return id;
  } catch {
    return `m${Math.floor(Math.random() * 1e12).toString(36)}`;
  }
}

/** The name shown in the chat: the account's name, else «ضيف» + 4 digits from the id. */
export function partyDisplayName(user, uid, isRtl = true) {
  const n = cleanText(user?.displayName || user?.username || '', NAME_MAX);
  if (n) return n;
  const digits = String(uid || '')
    .split('')
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 10000, 7);
  return `${isRtl ? 'ضيف' : 'Guest'} ${String(digits).padStart(4, '0')}`;
}
