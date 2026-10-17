// Watch party protocol (client/src/mobile/watchParty.js): codes, sync maths, chat merging and the
// Firestore REST transport against an in-memory Firestore that enforces the same preconditions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_ACTIVE_POLL_MS,
  CHAT_HIDDEN_POLL_MS,
  CHAT_QUIET_POLL_MS,
  CHAT_MAX,
  PARTY_HIDDEN_POLL_MS,
  PARTY_PAUSED_POLL_MS,
  PARTY_POLL_MS,
  DRIFT_PLAYING_SEC,
  ROOM_STALE_MS,
  appendMessages,
  chatDocId,
  createPartyTransport,
  expectedPosition,
  makeMessage,
  membersFromChat,
  newRoomCode,
  normalizeRoomCode,
  parseRoom,
  partyDisplayName,
  partyLink,
  partyPollPlan,
  roomDocId,
  roomIsOver,
  sameContent,
  syncAction
} from '../src/mobile/watchParty.js';

test('room codes: readable, normalised, stored under ids the phase-2 rules allow', () => {
  const seq = [0, 0.99, 0.5, 0.25, 0.75, 0.1];
  let i = 0;
  const code = newRoomCode(() => seq[i++ % seq.length]);
  assert.match(code, /^BX[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(normalizeRoomCode(' bx-7k2 m9q '), 'BX7K2M9Q');
  assert.equal(normalizeRoomCode('x'), '');
  assert.equal(normalizeRoomCode(''), '');
  // firestore.rules.phase2: isSocialDoc = ^(wp|danmaku|reviews)_[a-z0-9_-]+$
  const social = /^(wp|danmaku|reviews)_[a-z0-9_-]+$/;
  assert.equal(roomDocId('BX7K2M9Q'), 'wp_bx7k2m9q');
  assert.equal(chatDocId('BX7K2M9Q'), 'wp_bx7k2m9q_chat');
  assert.ok(social.test(roomDocId(code)) && social.test(chatDocId(code)));
  assert.equal(roomDocId('??'), '');
});

test('invite link: the website player of the room episode with ?party=', () => {
  const room = { code: 'BX7K2M9Q', slug: 'aw-one-piece', episode: 12, source: '' };
  assert.equal(partyLink('https://black-x-anime.me/', room), 'https://black-x-anime.me/watch/aw-one-piece/12?party=BX7K2M9Q');
  assert.equal(
    partyLink('https://black-x-anime.me', { ...room, source: 'aniproject' }),
    'https://black-x-anime.me/watch/aw-one-piece/12?source=aniproject&party=BX7K2M9Q'
  );
  assert.equal(partyLink('https://x', { code: 'BX7K2M9Q' }), '');
});

test('parseRoom keeps only v2 rooms and clamps values', () => {
  assert.equal(parseRoom(null), null);
  assert.equal(parseRoom({ v: 1, code: 'BX-1234', slug: 'a', hostId: 'h' }), null, 'v17 single-document rooms are ignored');
  const r = parseRoom({ v: 2, code: 'bx7k2m9q', slug: 'aw-x', hostId: 'h1', episode: '3', position: -4, rate: 9, paused: 1, seq: '5', updatedAt: 10 });
  assert.equal(r.code, 'BX7K2M9Q');
  assert.equal(r.episode, 3);
  assert.equal(r.position, 0);
  assert.equal(r.rate, 1, 'absurd speeds fall back to 1×');
  assert.equal(r.paused, true);
  assert.equal(r.seq, 5);
});

test('rooms end when the host ends them or stops writing for 6 hours', () => {
  const now = 1_800_000_000_000;
  assert.equal(roomIsOver({ endedAt: 5, updatedAt: now }, now), true);
  assert.equal(roomIsOver({ endedAt: 0, updatedAt: now - ROOM_STALE_MS - 1 }, now), true);
  assert.equal(roomIsOver({ endedAt: 0, updatedAt: now - 60_000 }, now), false);
  assert.equal(sameContent({ slug: 'a', episode: 2 }, { slug: 'a', episode: '2' }), true);
  assert.equal(sameContent({ slug: 'a', episode: 2 }, { slug: 'a', episode: 3 }), false);
  assert.equal(sameContent({ slug: 'a', episode: 2 }, null), false);
});

test('sync: the host position plus the time since this device received it', () => {
  const room = { position: 100, paused: false, rate: 1 };
  assert.equal(expectedPosition(room, 1000, 4000), 103);
  assert.equal(expectedPosition({ ...room, rate: 2 }, 1000, 4000), 106);
  assert.equal(expectedPosition({ ...room, paused: true }, 1000, 60_000), 100, 'paused rooms do not move');
  // within tolerance: nothing to do
  let a = syncAction({ room, receivedAt: 1000, now: 3000, current: 101, paused: false, duration: 1440 });
  assert.equal(a.seekTo, null);
  assert.equal(a.play, false);
  assert.equal(a.pause, false);
  // behind by more than the tolerance: seek to the host
  a = syncAction({ room, receivedAt: 1000, now: 3000, current: 102 - DRIFT_PLAYING_SEC - 1, paused: false, duration: 1440 });
  assert.equal(a.seekTo, 102);
  // host playing, guest paused: play
  a = syncAction({ room, receivedAt: 1000, now: 1000, current: 100, paused: true, duration: 1440 });
  assert.equal(a.play, true);
  // host paused, guest playing: pause (and a tighter tolerance)
  a = syncAction({ room: { ...room, paused: true }, receivedAt: 1000, now: 1000, current: 101.5, paused: false, duration: 1440 });
  assert.equal(a.pause, true);
  assert.equal(a.seekTo, 100);
  // never seek past the end
  a = syncAction({ room: { position: 1500, paused: false }, receivedAt: 0, now: 0, current: 10, paused: false, duration: 1440 });
  assert.equal(a.seekTo, 1439.5);
});

test('chat: messages are cleaned, merged without duplicates, oldest first, capped', () => {
  const m1 = makeMessage({ uid: 'u1', name: '  Ahmed\n', text: ' hi \u0007 there ', now: 1000, rand: () => 0.1 });
  assert.equal(m1.name, 'Ahmed');
  assert.equal(m1.text, 'hi there');
  assert.equal(m1.kind, 'msg');
  const r = makeMessage({ uid: 'u2', name: 'B', text: '🔥', kind: 'react', now: 900 });
  assert.equal(r.text, '🔥');
  assert.equal(makeMessage({ uid: 'u2', name: 'B', text: 'not an emoji', kind: 'react' }).text, '', 'reactions are only the offered emoji');
  const merged = appendMessages([m1], [m1, r, { bogus: true }]);
  assert.deepEqual(
    merged.map((m) => m.id),
    [r.id, m1.id]
  );
  const many = Array.from({ length: CHAT_MAX + 15 }, (_, i) => makeMessage({ uid: 'u', name: 'n', text: `m${i}`, now: i }));
  const capped = appendMessages([], many);
  assert.equal(capped.length, CHAT_MAX);
  assert.equal(capped[capped.length - 1].text, `m${CHAT_MAX + 14}`);
});

test('members: who joined, from their own join / leave events', () => {
  const msgs = [
    makeMessage({ uid: 'a', name: 'Ahmed', kind: 'join', now: 1 }),
    makeMessage({ uid: 'b', name: 'Sara', kind: 'join', now: 2 }),
    makeMessage({ uid: 'b', name: 'Sara', kind: 'leave', now: 3 }),
    makeMessage({ uid: 'c', name: 'Omar', text: 'hello', now: 4 })
  ];
  const m = membersFromChat(msgs);
  assert.deepEqual(
    m.map((x) => [x.name, x.present]),
    [
      ['Ahmed', true],
      ['Sara', false],
      ['Omar', true]
    ]
  );
  assert.equal(partyDisplayName({ displayName: 'Mona' }, 'abc'), 'Mona');
  assert.match(partyDisplayName(null, 'abc', true), /^ضيف \d{4}$/);
  assert.match(partyDisplayName(null, 'abc', false), /^Guest \d{4}$/);
});

/** In-memory Firestore REST: GET / PATCH with currentDocument.exists / updateTime preconditions. */
function fakeFirestore() {
  const docs = new Map();
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
    clock += 1;
    const doc = { fields: body.fields, updateTime: `2026-10-17T00:00:00.${String(clock).padStart(6, '0')}Z` };
    docs.set(id, doc);
    return reply(200, { name: id, ...doc });
  };
  return { docs, fetchImpl };
}

test('transport: create takes a free code, the host writes the room, guests read it', async () => {
  const fs = fakeFirestore();
  const t = createPartyTransport({ base: 'https://fs.test/v1/documents/settings', key: 'k', fetchImpl: fs.fetchImpl, sleep: async () => {} });
  // the first code is taken: create moves on to another one
  fs.docs.set('wp_bxaaaaaa', { fields: {}, updateTime: 'x' });
  const codes = ['BXAAAAAA', 'BXBBBBBB'];
  const room = await t.createRoom({ hostId: 'h', hostName: 'Host', slug: 'aw-x', episode: 2, position: 5, paused: false, updatedAt: 1, seq: 1 }, () => codes.shift());
  assert.equal(room.code, 'BXBBBBBB');
  assert.equal((await t.readRoom('bxbbbbbb')).episode, 2);
  await t.writeRoom({ ...room, position: 50, seq: 2 });
  const back = await t.readRoom('BXBBBBBB');
  assert.equal(back.position, 50);
  assert.equal(back.seq, 2);
  assert.equal(await t.readRoom('BXZZZZZZ'), null);
});

test('transport: two people sending at the same moment both land in the chat', async () => {
  const fs = fakeFirestore();
  const t = createPartyTransport({ base: 'https://fs.test/v1/documents/settings', key: 'k', fetchImpl: fs.fetchImpl, sleep: async () => {} });
  const code = 'BXCHAT12';
  await t.appendChat(code, [makeMessage({ uid: 'a', name: 'A', kind: 'join', now: 1 })]);
  // both read the same version, then both write: the second write fails its precondition,
  // re-reads and appends on top of the first one
  const a = makeMessage({ uid: 'a', name: 'A', text: 'first', now: 2 });
  const b = makeMessage({ uid: 'b', name: 'B', text: 'second', now: 3 });
  await Promise.all([t.appendChat(code, [a]), t.appendChat(code, [b])]);
  const list = await t.readChat(code);
  assert.deepEqual(
    list.filter((m) => m.kind === 'msg').map((m) => m.text).sort(),
    ['first', 'second']
  );
  // the request body only has the fields the rules accept
  const stored = fs.docs.get('wp_bxchat12_chat');
  assert.deepEqual(Object.keys(stored.fields).sort(), ['json', 'updatedAt']);
});

test('polling: fewer Firestore reads when nothing happens, same speed while the host plays', () => {
  const now = 10_000_000;
  // a guest right after joining: room + chat now, back in 2.5 s
  let p = partyPollPlan({ role: 'guest', chatActiveAt: now, lastRoomAt: 0, lastChatAt: 0, now });
  assert.deepEqual([p.room, p.chat, p.delay], [true, true, PARTY_POLL_MS]);
  // quiet chat (nothing said for over a minute): the chat is read every 7.5 s, the room still every 2.5 s
  p = partyPollPlan({ role: 'guest', chatActiveAt: now - 120_000, lastRoomAt: now - PARTY_POLL_MS, lastChatAt: now - PARTY_POLL_MS, now });
  assert.equal(p.room, true);
  assert.equal(p.chat, false);
  p = partyPollPlan({ role: 'guest', chatActiveAt: now - 120_000, lastRoomAt: now - PARTY_POLL_MS, lastChatAt: now - CHAT_QUIET_POLL_MS, now });
  assert.equal(p.chat, true);
  // host paused: the room is read every 4 s
  p = partyPollPlan({ role: 'guest', roomPaused: true, chatActiveAt: now - 120_000, lastRoomAt: now - PARTY_POLL_MS, lastChatAt: now, now });
  assert.equal(p.room, false);
  assert.equal(p.delay, PARTY_PAUSED_POLL_MS - PARTY_POLL_MS);
  // the host never reads the room (it writes it), only the chat
  p = partyPollPlan({ role: 'host', chatActiveAt: now - 120_000, lastChatAt: now - 1000, now });
  assert.equal(p.room, false);
  assert.equal(p.chat, false);
  assert.equal(p.delay, CHAT_QUIET_POLL_MS - 1000);
  // background tab: 15 s room / 30 s chat
  p = partyPollPlan({ role: 'guest', hidden: true, chatActiveAt: now, lastRoomAt: now - 5000, lastChatAt: now - 5000, now });
  assert.equal(p.room, false);
  assert.equal(p.chat, false);
  assert.equal(p.delay, PARTY_HIDDEN_POLL_MS - 5000);
  assert.ok(CHAT_HIDDEN_POLL_MS > PARTY_HIDDEN_POLL_MS && CHAT_ACTIVE_POLL_MS === PARTY_POLL_MS);
  // never a busy loop
  p = partyPollPlan({ role: 'guest', chatActiveAt: now, lastRoomAt: now, lastChatAt: now, now });
  assert.ok(p.delay >= 500);

  // reads per hour for a guest whose host plays, chat quiet: v18.0 = 2 docs / 2.5 s = 2,880
  let reads = 0;
  let lastRoomAt = 0;
  let lastChatAt = 0;
  for (let t = now; t < now + 3_600_000; ) {
    const plan = partyPollPlan({ role: 'guest', chatActiveAt: now - 120_000, lastRoomAt, lastChatAt, now: t });
    if (plan.room) {
      reads += 1;
      lastRoomAt = t;
    }
    if (plan.chat) {
      reads += 1;
      lastChatAt = t;
    }
    t += partyPollPlan({ role: 'guest', chatActiveAt: now - 120_000, lastRoomAt, lastChatAt, now: t }).delay;
  }
  assert.ok(reads <= 2000, `reads per hour ${reads}`);
});
