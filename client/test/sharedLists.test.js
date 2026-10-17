// Shared lists (client/src/mobile/sharedLists.js): community feed, timed comments and reviews are
// one Firestore document each, written by many people. Checked against an in-memory Firestore that
// enforces the same preconditions as the real one (currentDocument.updateTime / exists=false).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEED_DOC,
  FEED_MAX,
  addPostReply,
  createSharedListStore,
  hasItem,
  likedByMe,
  parseSharedList,
  prependItem,
  setPostLike,
  sharedItemId
} from '../src/mobile/sharedLists.js';

function fakeFirestore() {
  const docs = new Map();
  const writes = [];
  let clock = 0;
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    const id = decodeURIComponent(u.pathname.split('/').pop());
    const method = opts.method || 'GET';
    const cur = docs.get(id);
    if (method === 'GET') return cur ? reply(200, { name: id, fields: cur.fields, updateTime: cur.updateTime }) : reply(404, { error: { status: 'NOT_FOUND' } });
    const exists = u.searchParams.get('currentDocument.exists');
    const ut = u.searchParams.get('currentDocument.updateTime');
    if (exists === 'false' && cur) return reply(409, { error: { status: 'ALREADY_EXISTS' } });
    if (ut && !cur) return reply(404, { error: { status: 'NOT_FOUND' } });
    if (ut && cur.updateTime !== ut) return reply(400, { error: { status: 'FAILED_PRECONDITION' } });
    const body = JSON.parse(opts.body);
    writes.push({ id, precondition: exists ? `exists=${exists}` : ut ? 'updateTime' : 'none', fields: Object.keys(body.fields) });
    clock += 1;
    const doc = { fields: body.fields, updateTime: `2026-10-17T00:00:00.${String(clock).padStart(6, '0')}Z` };
    docs.set(id, doc);
    return reply(200, { name: id, ...doc });
  };
  const list = (id) => parseSharedList(docs.get(id)?.fields?.json?.stringValue || '');
  return { docs, writes, fetchImpl, list };
}

const makeStore = (fs) =>
  createSharedListStore({ base: 'https://fs.test/v1/documents/settings', key: 'k', fetchImpl: fs.fetchImpl, sleep: async () => {} });

const post = (id, extra = {}) => ({ id, author: id.toUpperCase(), text: `text ${id}`, likes: 0, likedBy: [], replies: [], ...extra });

test('parseSharedList keeps the objects of any stored list, never throws', () => {
  assert.deepEqual(parseSharedList(''), []);
  assert.deepEqual(parseSharedList('not json'), []);
  assert.deepEqual(parseSharedList('{"a":1}'), []);
  assert.deepEqual(parseSharedList('[{"id":"a"},null,3,"x",[1]]'), [{ id: 'a' }]);
  assert.deepEqual(parseSharedList([{ id: 'b' }]), [{ id: 'b' }]);
  assert.match(sharedItemId('post'), /^post_\d+_[a-z0-9]{3}$/);
});

test('changes are idempotent and return the same list when there is nothing to change', () => {
  const list = [post('a'), post('b')];
  // a post is added once and the list keeps its cap
  const added = prependItem(list, post('c'), 2);
  assert.deepEqual(added.map((p) => p.id), ['c', 'a']);
  assert.equal(prependItem(added, post('c'), 2), added, 'adding the same id again changes nothing');

  // a like SETS "liked by me": doing it twice counts once, the counter only moves on a change
  const liked = setPostLike(list, 'a', 'u1', true);
  assert.equal(liked[0].likes, 1);
  assert.deepEqual(liked[0].likedBy, ['u1']);
  assert.equal(setPostLike(liked, 'a', 'u1', true), liked);
  const unliked = setPostLike(liked, 'a', 'u1', false);
  assert.equal(unliked[0].likes, 0);
  assert.deepEqual(unliked[0].likedBy, []);
  assert.equal(setPostLike(unliked, 'a', 'u1', false), unliked);
  assert.equal(setPostLike(list, 'gone', 'u1', true), list, 'a post that fell off the list is left alone');
  assert.equal(likedByMe(liked, 'a', 'u1'), true);
  assert.equal(likedByMe(unliked, 'a', 'u1'), false);
  // older posts without likedBy / with a broken counter
  const old = setPostLike([{ id: 'o', likes: '3' }], 'o', 'u2', true);
  assert.equal(old[0].likes, 4);
  assert.deepEqual(old[0].likedBy, ['u2']);

  // a reply is added once, by id; replies of a missing post change nothing
  const r1 = { id: 'r1', text: 'hi' };
  const replied = addPostReply(list, 'b', r1);
  assert.deepEqual(replied[1].replies, [r1]);
  assert.equal(addPostReply(replied, 'b', r1), replied);
  assert.equal(addPostReply(list, 'gone', r1), list);
  assert.equal(hasItem(replied, 'b'), true);
  assert.equal(hasItem(replied, 'zz'), false);
});

test('store: a missing document is created with exists=false, later writes carry updateTime', async () => {
  const fs = fakeFirestore();
  const store = makeStore(fs);
  assert.deepEqual(await store.read(FEED_DOC), { list: [], updateTime: '', exists: false });
  const r = await store.update(FEED_DOC, (cur) => prependItem(cur, post('a'), FEED_MAX));
  assert.equal(r.changed, true);
  assert.deepEqual(fs.list(FEED_DOC).map((p) => p.id), ['a']);
  await store.update(FEED_DOC, (cur) => prependItem(cur, post('b'), FEED_MAX));
  assert.deepEqual(fs.writes.map((w) => w.precondition), ['exists=false', 'updateTime']);
  // only the two fields the phase-2 rules accept
  assert.deepEqual(fs.writes[0].fields, ['json', 'updatedAt']);
  // nothing to change → no write at all
  const same = await store.update(FEED_DOC, (cur) => prependItem(cur, post('b'), FEED_MAX));
  assert.equal(same.changed, false);
  assert.deepEqual(same.list.map((p) => p.id), ['b', 'a']);
  assert.equal(fs.writes.length, 2);
});

test('store: two people posting at the same moment both keep their post (v18.0 lost one)', async () => {
  const fs = fakeFirestore();
  const alice = makeStore(fs);
  const bob = makeStore(fs);
  await alice.update(FEED_DOC, (cur) => prependItem(cur, post('old'), FEED_MAX));
  await Promise.all([
    alice.update(FEED_DOC, (cur) => prependItem(cur, post('alice'), FEED_MAX)),
    bob.update(FEED_DOC, (cur) => prependItem(cur, post('bob'), FEED_MAX))
  ]);
  assert.deepEqual(fs.list(FEED_DOC).map((p) => p.id).sort(), ['alice', 'bob', 'old']);
});

test('store: a stale screen never erases newer posts, and likes from two people both count', async () => {
  const fs = fakeFirestore();
  const a = makeStore(fs);
  const b = makeStore(fs);
  await a.update(FEED_DOC, (cur) => prependItem(cur, post('p1'), FEED_MAX));
  // B posts after A opened the page; A's like is applied to the latest list, not to A's screen
  await b.update(FEED_DOC, (cur) => prependItem(cur, post('p2'), FEED_MAX));
  await Promise.all([
    a.update(FEED_DOC, (cur) => setPostLike(cur, 'p1', 'ua', true)),
    b.update(FEED_DOC, (cur) => setPostLike(cur, 'p1', 'ub', true))
  ]);
  const list = fs.list(FEED_DOC);
  assert.deepEqual(list.map((p) => p.id), ['p2', 'p1']);
  const p1 = list.find((p) => p.id === 'p1');
  assert.equal(p1.likes, 2);
  assert.deepEqual([...p1.likedBy].sort(), ['ua', 'ub']);
  // replies from two people at once
  await Promise.all([
    a.update(FEED_DOC, (cur) => addPostReply(cur, 'p2', { id: 'ra', text: 'A' })),
    b.update(FEED_DOC, (cur) => addPostReply(cur, 'p2', { id: 'rb', text: 'B' }))
  ]);
  assert.deepEqual(fs.list(FEED_DOC)[0].replies.map((r) => r.id).sort(), ['ra', 'rb']);
});

test('store: one device runs its writes in order (like then unlike ends unliked)', async () => {
  const fs = fakeFirestore();
  const s = makeStore(fs);
  await s.update(FEED_DOC, (cur) => prependItem(cur, post('p'), FEED_MAX));
  const like = s.update(FEED_DOC, (cur) => setPostLike(cur, 'p', 'u', true));
  const unlike = s.update(FEED_DOC, (cur) => setPostLike(cur, 'p', 'u', false));
  await Promise.all([like, unlike]);
  const p = fs.list(FEED_DOC)[0];
  assert.equal(p.likes, 0);
  assert.deepEqual(p.likedBy, []);
});

test('store: offline / refused writes reject (the screen can undo), a failed write does not block the next', async () => {
  const fs = fakeFirestore();
  let refuse = true;
  const store = createSharedListStore({
    base: 'https://fs.test/v1/documents/settings',
    key: 'k',
    sleep: async () => {},
    fetchImpl: async (url, opts = {}) => {
      if ((opts.method || 'GET') !== 'GET' && refuse) return { ok: false, status: 403, json: async () => ({ error: { status: 'PERMISSION_DENIED' } }) };
      return fs.fetchImpl(url, opts);
    }
  });
  await assert.rejects(store.update('danmaku_x_1', (cur) => prependItem(cur, { id: 'c1', sec: 5 }, 80)));
  refuse = false;
  const ok = await store.update('danmaku_x_1', (cur) => prependItem(cur, { id: 'c2', sec: 9 }, 80));
  assert.deepEqual(ok.list.map((c) => c.id), ['c2']);
  // a read error rejects too
  const broken = createSharedListStore({ base: 'https://x', key: 'k', fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  await assert.rejects(broken.read('reviews_a'));
});

test('store: gives up after the retries when the document keeps changing', async () => {
  const fs = fakeFirestore();
  let n = 0;
  const store = createSharedListStore({
    base: 'https://fs.test/v1/documents/settings',
    key: 'k',
    sleep: async () => {},
    fetchImpl: async (url, opts = {}) => {
      // someone else writes between every read and write
      if ((opts.method || 'GET') !== 'GET') {
        n += 1;
        await fs.fetchImpl(url.split('?')[0] + '?key=k', { method: 'PATCH', body: JSON.stringify({ fields: { json: { stringValue: '[]' } } }) });
      }
      return fs.fetchImpl(url, opts);
    }
  });
  await store.update('reviews_t', (cur) => prependItem(cur, { id: 'seed' }, 50)).catch(() => {});
  n = 0;
  await assert.rejects(store.update('reviews_t', (cur) => prependItem(cur, { id: 'r' }, 50), { tries: 3 }), /busy/);
  assert.equal(n, 3);
});
