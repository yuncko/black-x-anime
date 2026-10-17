/**
 * Lists that many people write to: the community feed (`settings/shared_community_feed`), the
 * timed comments of an episode (`settings/danmaku_*`) and the reviews of a title
 * (`settings/reviews_*`). Each one is a single Firestore document holding the whole list as JSON
 * (`fields.json`), which is what every shipped app version reads.
 *
 * Up to v18.0 a write sent the list this device had on screen, so two people posting around the
 * same time erased each other (and a page opened an hour ago erased an hour of posts). Now every
 * change is "read the latest list → apply one change → write it only if nobody wrote in between"
 * (`currentDocument.updateTime`, or `exists=false` for a new document), retried on conflict —
 * the same pattern as the watch-party chat (watchParty.js). The changes themselves are pure
 * functions below, so a retry applies the same intent to the newer list (a like sets "liked by
 * me" instead of toggling; a post or reply is added once, by id).
 *
 * Writes of one document from one device run one after another (a quick like + unlike lands in
 * the order it was tapped).
 */

export const FEED_DOC = 'shared_community_feed';
export const FEED_MAX = 60;
export const DANMAKU_MAX = 80;
export const REVIEWS_MAX = 50;
export const REPLIES_MAX = 100;

const CONFLICT_STATUSES = new Set(['FAILED_PRECONDITION', 'ALREADY_EXISTS', 'ABORTED', 'NOT_FOUND']);

/** A list as stored by any app version: an array of objects (anything else is dropped). */
export function parseSharedList(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

/** Arrays pass through untouched (so "no change" can be told by reference); anything else is parsed. */
function toList(list) {
  return Array.isArray(list) ? list : parseSharedList(list);
}

/** An id nobody else will pick in the same millisecond. */
export function sharedItemId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 46656)
    .toString(36)
    .padStart(3, '0')}`;
}

/* ---------------------------------------------------------------- changes (pure) */
// Each change returns the SAME array when there is nothing to change (already added, already
// liked, the post is gone), so the store knows not to write.

/** Put `item` first (once — a retry or a double tap does not add it twice), keep `max`. */
export function prependItem(list, item, max) {
  const cur = toList(list);
  if (!item || !item.id) return cur;
  if (cur.some((x) => x.id === item.id)) return cur;
  return [item, ...cur].slice(0, Math.max(1, max || cur.length + 1));
}

/** Set (not toggle) whether `userKey` likes `postId`; the counter moves only when that changes. */
export function setPostLike(list, postId, userKey, liked) {
  const cur = toList(list);
  if (!postId || !userKey) return cur;
  let changed = false;
  const next = cur.map((p) => {
    if (p.id !== postId) return p;
    const likedBy = Array.isArray(p.likedBy) ? p.likedBy.filter((k) => typeof k === 'string') : [];
    const has = likedBy.includes(userKey);
    if (has === Boolean(liked)) return p;
    changed = true;
    return {
      ...p,
      likedBy: liked ? [...likedBy, userKey] : likedBy.filter((k) => k !== userKey),
      likes: Math.max(0, (Number(p.likes) || 0) + (liked ? 1 : -1))
    };
  });
  return changed ? next : cur;
}

/** Add `reply` under `postId` (once, by id). The post may be gone (it fell off the list). */
export function addPostReply(list, postId, reply, maxReplies = REPLIES_MAX) {
  const cur = toList(list);
  if (!postId || !reply || !reply.id) return cur;
  let changed = false;
  const next = cur.map((p) => {
    if (p.id !== postId) return p;
    const replies = Array.isArray(p.replies) ? p.replies : [];
    if (replies.some((r) => r && r.id === reply.id)) return p;
    changed = true;
    return { ...p, replies: [...replies, reply].slice(-maxReplies) };
  });
  return changed ? next : cur;
}

export function hasItem(list, id) {
  return parseSharedList(list).some((x) => x.id === id);
}

/** Whether `userKey` likes `postId` in `list`. */
export function likedByMe(list, postId, userKey) {
  const post = parseSharedList(list).find((p) => p.id === postId);
  return Boolean(post && Array.isArray(post.likedBy) && post.likedBy.includes(userKey));
}

/* ---------------------------------------------------------------- Firestore REST */

/**
 * `base` = the documents URL of the `settings` collection, `key` = the web API key the app
 * already uses. `fetchImpl` / `sleep` are for tests.
 */
export function createSharedListStore({ base, key, fetchImpl, sleep } = {}) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const url = (id, extra = '') => `${base}/${id}?key=${encodeURIComponent(key)}${extra}`;
  const chains = new Map();

  /** { list, updateTime, exists } — a missing document is an empty list. */
  async function read(id) {
    const res = await doFetch(url(id), { cache: 'no-store' });
    if (res.status === 404) return { list: [], updateTime: '', exists: false };
    if (!res.ok) throw new Error(`shared list read ${res.status}`);
    const doc = await res.json();
    return {
      list: parseSharedList(doc?.fields?.json?.stringValue || ''),
      updateTime: String(doc?.updateTime || ''),
      exists: true
    };
  }

  /** { ok, conflict } — conflict when someone wrote since `updateTime` (or created it first). */
  async function write(id, list, { updateTime = '', mustNotExist = false } = {}) {
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
          json: { stringValue: JSON.stringify(list) },
          updatedAt: { stringValue: new Date().toISOString() }
        }
      })
    });
    if (res.ok) return { ok: true, conflict: false };
    let status = '';
    try {
      status = String((await res.json())?.error?.status || '');
    } catch {
      status = '';
    }
    return { ok: false, conflict: CONFLICT_STATUSES.has(status) || res.status === 409 || res.status === 412, status: res.status };
  }

  async function runUpdate(id, change, tries) {
    for (let i = 0; i < tries; i += 1) {
      const cur = await read(id);
      const next = change(cur.list);
      // Nothing to change (already there / the post is gone): no write, return the latest.
      if (!Array.isArray(next) || next === cur.list) return { list: cur.list, changed: false };
      const r = await write(id, next, cur.exists && cur.updateTime ? { updateTime: cur.updateTime } : { mustNotExist: true });
      if (r.ok) return { list: next, changed: true };
      if (!r.conflict) throw new Error(`shared list write ${r.status || ''}`.trim());
      await wait(120 + Math.floor(Math.random() * 260));
    }
    throw new Error('shared list busy');
  }

  /**
   * Apply `change(latestList) → newList` to document `id`. Resolves `{ list, changed }` with the
   * list now stored; rejects when offline / refused / still conflicting after `tries`.
   */
  function update(id, change, { tries = 6 } = {}) {
    const prev = chains.get(id) || Promise.resolve();
    const run = prev.catch(() => {}).then(() => runUpdate(id, change, tries));
    const tail = run.catch(() => {});
    chains.set(id, tail);
    tail.then(() => {
      if (chains.get(id) === tail) chains.delete(id);
    });
    return run;
  }

  return { read, write, update };
}
