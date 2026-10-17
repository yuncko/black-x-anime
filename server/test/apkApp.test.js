// Tests for the APK server API (/api/app/*) against an in-memory Firestore.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-apk-api-0123456789abcdef';
delete process.env.FIREBASE_SERVICE_ACCOUNT;

const express = (await import('express')).default;
const jwt = (await import('jsonwebtoken')).default;
const store = await import('../src/services/settingsStore.js');
const accounts = await import('../src/services/apkAccounts.js');
const aniskip = await import('../src/services/aniskip.js');
const apkApp = await import('../src/routes/apkApp.js');
const rankingVotes = await import('../src/services/rankingVotes.js');
const { APK_RELEASE } = await import('../../shared/apkRelease.js');

// ------------------------------------------------------------ fake Firestore
const docs = new Map(); // id -> { fields, updateTime }
let clock = 0;
const nextTime = () => `2026-10-16T00:00:00.${String(++clock).padStart(9, '0')}Z`;
let writeHook = null; // (id) => void, runs before a PATCH is applied
let deletesAllowed = false; // phase-1 rules refuse deletes made with the public key

function enc(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'boolean' ? { booleanValue: v } : { stringValue: typeof v === 'string' ? v : JSON.stringify(v) };
  }
  return out;
}
function putDoc(id, json, extra = {}) {
  docs.set(id, { fields: enc({ json: JSON.stringify(json), ...extra }), updateTime: nextTime() });
}
function getJson(id) {
  const d = docs.get(id);
  return d ? JSON.parse(d.fields.json.stringValue) : null;
}

async function fakeFetch(url, init = {}) {
  const u = new URL(url);
  const id = decodeURIComponent(u.pathname.split('/').pop());
  const method = init.method || 'GET';
  const respond = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  if (method === 'GET') {
    const d = docs.get(id);
    if (!d) return respond(404, { error: { code: 404, status: 'NOT_FOUND' } });
    return respond(200, { name: id, fields: d.fields, updateTime: d.updateTime });
  }
  if (method === 'PATCH') {
    if (writeHook) await writeHook(id);
    const d = docs.get(id);
    const exists = u.searchParams.get('currentDocument.exists');
    const updateTime = u.searchParams.get('currentDocument.updateTime');
    if (exists === 'false' && d) return respond(409, { error: { status: 'ALREADY_EXISTS' } });
    if (updateTime && !d) return respond(404, { error: { status: 'NOT_FOUND' } });
    if (updateTime && d.updateTime !== updateTime) return respond(400, { error: { status: 'FAILED_PRECONDITION' } });
    const body = JSON.parse(init.body);
    const rec = { fields: body.fields, updateTime: nextTime() };
    docs.set(id, rec);
    return respond(200, { name: id, fields: rec.fields, updateTime: rec.updateTime });
  }
  if (method === 'DELETE') {
    if (!deletesAllowed) return respond(403, { error: { code: 403, status: 'PERMISSION_DENIED' } });
    const d = docs.get(id);
    const updateTime = u.searchParams.get('currentDocument.updateTime');
    if (updateTime && d && d.updateTime !== updateTime) return respond(400, { error: { status: 'FAILED_PRECONDITION' } });
    docs.delete(id);
    return respond(200, {});
  }
  return respond(405, {});
}
store.__setSettingsStoreTransportForTests(fakeFetch, async () => ({}));

// ------------------------------------------------------------ Google ID tokens
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('securetoken@system.gserviceaccount.com')) {
    return new Response(JSON.stringify({ [KID]: publicKey.export({ type: 'spki', format: 'pem' }) }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' }
    });
  }
  return realFetch(url, init);
};
function googleToken(email, uid = `uid_${email}`) {
  return jwt.sign(
    { email, email_verified: true, name: email.split('@')[0], firebase: { sign_in_provider: 'google.com' } },
    privateKey,
    { algorithm: 'RS256', keyid: KID, audience: 'spry-oxide-1h7sp', issuer: 'https://securetoken.google.com/spry-oxide-1h7sp', subject: uid, expiresIn: '1h' }
  );
}

// ------------------------------------------------------------ server
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api/app', apkApp.default);
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
  server.close();
  globalThis.fetch = realFetch;
});

async function call(method, path, { body, token } = {}) {
  const res = await realFetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function reset() {
  docs.clear();
  writeHook = null;
  deletesAllowed = false;
  rankingVotes.__resetRankingVotesCacheForTests();
  apkApp.__resetRateLimitsForTests();
  apkApp.__resetConfigCacheForTests();
}

test('config exposes enforcement, broadcast, pin and release — never codes or e-mails', async () => {
  reset();
  putDoc('global_vip_system', {
    enforced: false,
    codes: [{ code: 'SECRET-1', tier: 'vip_monarch' }],
    broadcastMsg: 'hello',
    pinnedRec: { objectID: 'One Piece', titleEn: 'One Piece', poster: 'https://x/p.jpg' },
    userRequests: [{ id: 'r1', text: 'add x', email: 'victim@example.com' }]
  }, { enforced: false });
  const { status, body } = await call('GET', '/api/app/config');
  assert.equal(status, 200);
  assert.equal(body.enforced, false);
  assert.equal(body.broadcastMsg, 'hello');
  assert.equal(body.pinnedRec.titleEn, 'One Piece');
  assert.equal(body.apk.version, APK_RELEASE.version);
  assert.match(body.apk.version, /^\d+\.\d+$/);
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes('SECRET-1'));
  assert.ok(!raw.includes('victim@example.com'));
  assert.ok(!('codes' in body) && !('userRequests' in body));
});

test('register creates a bcrypt account; duplicates and reserved names are refused', async () => {
  reset();
  const ok = await call('POST', '/api/app/auth/register', { body: { username: 'Sara_99', password: 'secret12', email: 'sara@example.com', state: { favorites: [{ objectID: 'Naruto', titleEn: 'Naruto' }] } } });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.token);
  assert.equal(ok.body.user.username, 'sara_99');
  assert.equal(ok.body.user.vipTier, 'free');
  assert.equal(ok.body.state.favorites.length, 1);
  const stored = getJson('user_sara_99');
  assert.match(stored.passBcrypt, /^\$2[aby]\$10\$/);
  assert.equal(stored.passSha256, accounts.PASS_SENTINEL_BCRYPT);
  assert.ok(getJson('email_sara_example_com'), 'e-mail mirror written');
  assert.ok(!JSON.stringify(ok.body).includes('$2'), 'no hash in the response');

  const dup = await call('POST', '/api/app/auth/register', { body: { username: 'sara_99', password: 'other123' } });
  assert.equal(dup.status, 409);
  const reserved = await call('POST', '/api/app/auth/register', { body: { username: 'developer', password: 'secret12' } });
  assert.equal(reserved.status, 403);
  const me = await call('GET', '/api/app/me', { token: ok.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'sara_99');
});

test('legacy SHA-256 accounts sign in once and are upgraded to bcrypt with a sentinel', async () => {
  reset();
  const legacy = { id: 'u1', username: 'omar', email: 'omar@example.com', passSha256: accounts.sha256Hex('pass1234'), favorites: [] };
  putDoc('user_omar', legacy);
  putDoc('email_omar_example_com', legacy);
  const bad = await call('POST', '/api/app/auth/login', { body: { identifier: 'omar', password: 'wrong' } });
  assert.equal(bad.status, 401);
  const good = await call('POST', '/api/app/auth/login', { body: { identifier: 'omar', password: 'pass1234' } });
  assert.equal(good.status, 200);
  const upgraded = getJson('user_omar');
  assert.match(upgraded.passBcrypt, /^\$2/);
  assert.equal(upgraded.passSha256, accounts.PASS_SENTINEL_BCRYPT);
  assert.equal(getJson('email_omar_example_com').passSha256, accounts.PASS_SENTINEL_BCRYPT, 'mirror upgraded too');
  // An old APK compares sha256(password) with passSha256 and accepted an empty value: the sentinel blocks both.
  assert.notEqual(upgraded.passSha256, accounts.sha256Hex('pass1234'));
  assert.ok(upgraded.passSha256.length > 0);
  const again = await call('POST', '/api/app/auth/login', { body: { identifier: 'omar@example.com', password: 'pass1234' } });
  assert.equal(again.status, 200);
  const dev = await call('POST', '/api/app/auth/login', { body: { identifier: 'developer', password: 'x' } });
  assert.equal(dev.status, 403);
});

test('Google sign-in verifies the Firebase token, sets the sentinel and marks only the real developer', async () => {
  reset();
  // A Google mirror doc with an EMPTY password field (old builds let anyone in with any password).
  putDoc('email_mona_gmail_com', { id: 'g1', username: 'mona', email: 'mona@gmail.com', isGoogleAccount: true, passSha256: '' });
  const fake = await call('POST', '/api/app/auth/google', { body: { idToken: 'android_system_google_account' } });
  assert.equal(fake.status, 401, 'unverified picker e-mails are refused');
  const res = await call('POST', '/api/app/auth/google', { body: { idToken: googleToken('mona@gmail.com') } });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.isDeveloper, false);
  assert.equal(getJson('email_mona_gmail_com').passSha256, accounts.PASS_SENTINEL_GOOGLE);
  assert.ok(getJson('user_mona'), 'username mirror created');

  const devRes = await call('POST', '/api/app/auth/google', { body: { idToken: googleToken('mz0970mmz@gmail.com') } });
  assert.equal(devRes.status, 200);
  assert.equal(devRes.body.user.isDeveloper, true);
  assert.equal(devRes.body.user.vipTier, 'vip_monarch');
  const claims = accounts.verifyApkToken(devRes.body.token);
  assert.equal(claims.dev, true);
  const userClaims = accounts.verifyApkToken(res.body.token);
  assert.equal(userClaims.dev, false);
});

test('state sync merges resume positions, keeps the highest XP and ignores VIP fields', async () => {
  reset();
  const reg = await call('POST', '/api/app/auth/register', { body: { username: 'lina', password: 'secret12' } });
  const token = reg.body.token;
  const first = await call('PUT', '/api/app/state', { token, body: { positions: { 'one-piece:5': { sec: 300, dur: 1440, at: 1000 } }, xp: 50 } });
  assert.equal(first.status, 200);
  const second = await call('PUT', '/api/app/state', {
    token,
    body: {
      positions: { 'one-piece:5': { sec: 100, dur: 1440, at: 500 }, 'naruto:1': { sec: 60, dur: 1400, at: 2000 } },
      xp: 10,
      vipTier: 'vip_monarch',
      favorites: [{ objectID: 'Naruto', titleEn: 'Naruto', storyAr: 'x'.repeat(5000) }]
    }
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.state.positions['one-piece:5'].sec, 300, 'newer position wins');
  assert.equal(second.body.state.positions['naruto:1'].sec, 60);
  assert.equal(second.body.state.xp, 50);
  assert.equal(second.body.state.favorites[0].storyAr.length, 500, 'long fields are clipped');
  assert.equal(getJson('user_lina').vipTier, 'free', 'client cannot grant itself VIP');
});

test('VIP redemption is atomic, per-user and respects max uses', async () => {
  reset();
  putDoc('global_vip_system', { enforced: true, codes: [{ code: 'BX-MON-AAAA-BBBB', tier: 'vip_monarch', durationDays: 30, maxUses: 2, usedCount: 0 }] }, { enforced: true });
  const a = (await call('POST', '/api/app/auth/register', { body: { username: 'user_a', password: 'secret12' } })).body.token;
  const b = (await call('POST', '/api/app/auth/register', { body: { username: 'user_b', password: 'secret12' } })).body.token;
  const c = (await call('POST', '/api/app/auth/register', { body: { username: 'user_c', password: 'secret12' } })).body.token;
  assert.equal((await call('POST', '/api/app/vip/redeem', { body: { code: 'BX-MON-AAAA-BBBB' } })).status, 401);
  // Force a concurrent writer: the first PATCH of the global doc sees a changed document once.
  let bumped = false;
  writeHook = async (id) => {
    if (id === 'global_vip_system' && !bumped) {
      bumped = true;
      const d = docs.get(id);
      docs.set(id, { ...d, updateTime: nextTime() });
    }
  };
  const [ra, rb] = await Promise.all([
    call('POST', '/api/app/vip/redeem', { token: a, body: { code: 'bx-mon-aaaa-bbbb' } }),
    call('POST', '/api/app/vip/redeem', { token: b, body: { code: 'BX-MON-AAAA-BBBB' } })
  ]);
  writeHook = null;
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
  assert.equal(ra.body.user.vipTier, 'vip_monarch');
  const code = getJson('global_vip_system').codes[0];
  assert.equal(code.usedCount, 2, 'no lost update');
  assert.equal((await call('POST', '/api/app/vip/redeem', { token: c, body: { code: 'BX-MON-AAAA-BBBB' } })).status, 410);
  assert.equal((await call('POST', '/api/app/vip/redeem', { token: a, body: { code: 'BX-MON-AAAA-BBBB' } })).status, 409);
  assert.equal((await call('POST', '/api/app/vip/redeem', { token: c, body: { code: 'NOPE' } })).status, 404);
  assert.ok(getJson('user_user_a').vipExpiresAt);
});

test('requests never store e-mails and old e-mails are stripped on the next write', async () => {
  reset();
  putDoc('global_vip_system', { enforced: true, codes: [{ code: 'KEEP-ME' }], pinnedRec: { objectID: 'x', titleEn: 'X' }, userRequests: [{ id: 'old', text: 'old one', email: 'leak@example.com' }] }, { enforced: true });
  const res = await call('POST', '/api/app/requests', { body: { type: 'anime', text: 'Please add Dandadan' } });
  assert.equal(res.status, 200);
  const g = getJson('global_vip_system');
  assert.equal(g.userRequests.length, 2);
  assert.ok(!JSON.stringify(g).includes('leak@example.com'));
  assert.equal(g.codes[0].code, 'KEEP-ME', 'other fields kept');
  assert.equal(g.pinnedRec.titleEn, 'X', 'pinned pick kept (old clients dropped it)');
  assert.equal(docs.get('global_vip_system').fields.enforced.booleanValue, true, 'website gate field kept');
});

test('developer tools need the verified developer', async () => {
  reset();
  putDoc('global_vip_system', { enforced: true, codes: [] }, { enforced: true });
  const user = (await call('POST', '/api/app/auth/register', { body: { username: 'normal', password: 'secret12' } })).body.token;
  assert.equal((await call('GET', '/api/app/admin/vip', { token: user })).status, 403);
  assert.equal((await call('GET', '/api/app/admin/vip')).status, 401);
  assert.equal((await call('GET', '/api/app/admin/vip', { token: googleToken('someone@gmail.com') })).status, 403);
  const dev = (await call('POST', '/api/app/auth/google', { body: { idToken: googleToken('mz0970mmz@gmail.com') } })).body.token;
  const gen = await call('POST', '/api/app/admin/vip/codes', { token: dev, body: { tier: 'vip_basic', days: 7, uses: 3, count: 2 } });
  assert.equal(gen.status, 201);
  assert.equal(gen.body.codes.length, 2);
  assert.match(gen.body.codes[0].code, /^BX-VIP-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await call('POST', '/api/app/admin/vip/enforced', { token: dev, body: { enforced: false } })).body.enforced, false);
  assert.equal(docs.get('global_vip_system').fields.enforced.booleanValue, false);
  // The website developer can use a Firebase ID token directly.
  const list = await call('GET', '/api/app/admin/vip', { token: googleToken('mz0970mmz@gmail.com') });
  assert.equal(list.status, 200);
  assert.equal(list.body.codes.length, 2);
  const del = await call('DELETE', `/api/app/admin/vip/codes/${gen.body.codes[0].code}`, { token: dev });
  assert.equal(del.status, 200);
  assert.equal(getJson('global_vip_system').codes.length, 1);
  const grant = await call('POST', '/api/app/admin/users/vip', { token: dev, body: { target: 'normal', tier: 'vip_monarch', days: 10 } });
  assert.equal(grant.status, 200);
  assert.equal(grant.body.user.vipTier, 'vip_monarch');
  const inspect = await call('GET', '/api/app/admin/users/inspect?q=normal', { token: dev });
  assert.equal(inspect.body.stats.passwordStorage, 'bcrypt');
  assert.ok(!JSON.stringify(inspect.body).includes('$2'));
  assert.equal((await call('POST', '/api/app/admin/broadcast', { token: dev, body: { message: 'Update to v16' } })).status, 200);
  apkApp.__resetConfigCacheForTests();
  assert.equal((await call('GET', '/api/app/config')).body.broadcastMsg, 'Update to v16');
});

test('expired VIP falls back to free', () => {
  assert.equal(accounts.effectiveVipTier({ vipTier: 'vip_basic', vipExpiresAt: '2000-01-01T00:00:00Z' }), 'free');
  assert.equal(accounts.effectiveVipTier({ vipTier: 'vip_basic', vipExpiresAt: '2999-01-01T00:00:00Z' }), 'vip_basic');
  assert.equal(accounts.effectiveVipTier({ email: 'mz0970mmz@gmail.com' }), 'vip_monarch');
});

test('skip-times resolves the MAL id from the title and returns OP/ED segments', async () => {
  const calls = [];
  aniskip.__setAniskipFetchForTests(async (url) => {
    calls.push(String(url));
    if (String(url).includes('api.jikan.moe')) {
      return { status: 200, ok: true, json: async () => ({ data: [{ mal_id: 52991, title: 'Sousou no Frieren', title_english: "Frieren: Beyond Journey's End" }] }) };
    }
    return {
      status: 200,
      ok: true,
      json: async () => ({ found: true, results: [
        { interval: { startTime: 1325.5, endTime: 1415.5 }, skipType: 'ed' },
        { interval: { startTime: 89.1, endTime: 179.2 }, skipType: 'op' }
      ] })
    };
  });
  const res = await call('GET', `/api/app/skip-times?title=${encodeURIComponent("Frieren: Beyond Journey's End")}&ep=3&len=1440`);
  assert.equal(res.status, 200);
  assert.equal(res.body.malId, 52991);
  assert.deepEqual(res.body.segments.map((s) => s.type), ['op', 'ed']);
  assert.ok(calls.some((u) => u.includes('/v2/skip-times/52991/3?') && u.includes('episodeLength=1440')));
  const none = await call('GET', '/api/app/skip-times?mal=1&ep=0');
  assert.equal(none.body.found, false);
  aniskip.__setAniskipFetchForTests(null);
});

test('website Google users can redeem with a Firebase ID token once their mirror exists', async () => {
  reset();
  putDoc('global_vip_system', { enforced: true, codes: [{ code: 'WEB-CODE-1', tier: 'vip_basic', durationDays: 7, maxUses: 1, usedCount: 0 }] }, { enforced: true });
  const missing = await call('POST', '/api/app/vip/redeem', { token: googleToken('web@gmail.com'), body: { code: 'WEB-CODE-1' } });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'account_not_synced');
  putDoc('email_web_gmail_com', { id: 'w1', username: 'web', email: 'web@gmail.com', isGoogleAccount: true, passSha256: 'google-oauth-only' });
  const ok = await call('POST', '/api/app/vip/redeem', { token: googleToken('web@gmail.com'), body: { code: 'WEB-CODE-1' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.tier, 'vip_basic');
  assert.equal(getJson('email_web_gmail_com').vipTier, 'vip_basic');
});

test('website account sync keeps APK fields and never writes SHA-256 or an empty password field', async () => {
  const { syncUserToCloud } = await import('../src/services/cloudSync.service.js');
  const written = {};
  const cloud = {
    id: 'u9', username: 'karim', email: 'karim@example.com', passSha256: 'a'.repeat(64),
    vipTier: 'vip_basic', vipExpiresAt: '2999-01-01T00:00:00Z', positions: { 'x:1': { sec: 10, dur: 20, at: 5 } }, xp: 42
  };
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const id = decodeURIComponent(new URL(url).pathname.split('/').pop());
    if ((init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify({ fields: { json: { stringValue: JSON.stringify(cloud) } } }), { status: 200 });
    }
    written[id] = JSON.parse(JSON.parse(init.body).fields.json.stringValue);
    return new Response('{}', { status: 200 });
  };
  try {
    await syncUserToCloud({ id: 999999, username: 'karim', email: 'karim@example.com', role: 'user' }, 'new-password');
    const doc = written.user_karim;
    assert.ok(doc, 'user doc written');
    assert.match(doc.passBcrypt, /^\$2/);
    assert.equal(doc.passSha256, accounts.PASS_SENTINEL_BCRYPT);
    assert.equal(doc.vipTier, 'vip_basic', 'APK VIP kept');
    assert.equal(doc.xp, 42);
    assert.deepEqual(doc.positions, cloud.positions);
    assert.notEqual(doc.vipStatus, 'VIP Monarch', 'no fake VIP label');
    await syncUserToCloud({ id: 999998, username: 'gmailer', email: 'gmailer@gmail.com', role: 'user' });
    assert.equal(written.user_gmailer.passSha256, 'a'.repeat(64), 'existing legacy hash is left for the APK upgrade path');
    cloud.passSha256 = '';
    await syncUserToCloud({ id: 999997, username: 'gonly', email: 'gonly@gmail.com', role: 'user' });
    assert.equal(written.user_gonly.passSha256, accounts.PASS_SENTINEL_GOOGLE, 'empty field replaced by the sentinel');
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('feedWithoutPerson drops the person\'s posts, replies and likes and keeps everything else', () => {
  const list = [
    { id: 'p1', username: 'Sara_99', author: 'Sara', text: 'mine', likedBy: [], likes: 0, replies: [] },
    {
      id: 'p2', username: 'ali', author: 'Ali', text: 'his', likedBy: ['bx_1', 'ali', 'sara_99'], likes: 3,
      replies: [{ id: 'r1', username: 'sara_99', author: 'Sara', text: 'hi' }, { id: 'r2', author: 'Old reply without a username', text: 'x' }]
    },
    { id: 'p3', username: 'mona', author: 'Mona', text: 'hers', likedBy: ['mona'], likes: 1 }
  ];
  const out = apkApp.feedWithoutPerson(list, { username: 'sara_99', keys: new Set(['bx_1', 'sara_99', 'sara@example.com']) });
  assert.deepEqual(out.list.map((p) => p.id), ['p2', 'p3']);
  assert.deepEqual(out.list[0].likedBy, ['ali']);
  assert.equal(out.list[0].likes, 1);
  assert.deepEqual(out.list[0].replies.map((r) => r.id), ['r2']);
  assert.deepEqual({ posts: out.posts, replies: out.replies, likes: out.likes }, { posts: 1, replies: 1, likes: 2 });
  assert.equal(out.list[1], list[2], 'untouched posts are the same objects');
  const none = apkApp.feedWithoutPerson(list, { username: 'nobody', keys: new Set(['nobody']) });
  assert.equal(none.list, list, 'nothing to remove: the same list (no write)');
});

test('account deletion: password check, then posts / likes / votes / requests and the account are erased', async () => {
  reset();
  const reg = await call('POST', '/api/app/auth/register', {
    body: { username: 'Sara_99', password: 'secret12', email: 'sara@example.com', state: { favorites: [{ objectID: 'Naruto', titleEn: 'Naruto' }] } }
  });
  assert.equal(reg.status, 201);
  const token = reg.body.token;
  const id = getJson('user_sara_99').id;
  putDoc('shared_community_feed', [
    { id: 'p1', username: 'sara_99', author: 'Sara', text: 'my post', likedBy: [], likes: 0, replies: [] },
    { id: 'p2', username: 'ali', author: 'Ali', text: 'his post', likedBy: [id, 'ali'], likes: 2, replies: [{ id: 'r1', username: 'sara_99', author: 'Sara', text: 'reply' }] }
  ], { updatedAt: 'x' });
  putDoc('ranking_votes', { v: 1, titles: { 5114: { [rankingVotes.voterKey('u:sara_99')]: 9, [rankingVotes.voterKey('u:ali')]: 7 } } });
  putDoc('global_vip_system', {
    enforced: true,
    codes: [{ code: 'BX-1', tier: 'vip_basic', usedCount: 1, maxUses: 5, redeemedBy: [{ username: 'sara_99', at: 'x' }, { username: 'ali', at: 'y' }] }],
    userRequests: [{ id: 'q1', type: 'anime', text: 'please add X', author: 'Sara', username: 'sara_99' }, { id: 'q2', type: 'anime', text: 'Y', author: 'Ali', username: 'ali' }]
  }, { enforced: true });

  assert.equal((await call('POST', '/api/app/account/delete', { body: { confirm: 'sara_99', password: 'secret12' } })).status, 401, 'needs a session');
  assert.equal((await call('POST', '/api/app/account/delete', { token, body: { confirm: 'someone', password: 'secret12' } })).body.error, 'confirm_mismatch');
  const wrong = await call('POST', '/api/app/account/delete', { token, body: { confirm: 'sara_99', password: 'wrong' } });
  assert.deepEqual([wrong.status, wrong.body.error], [403, 'bad_password'], 'not 401: the app signs out on 401');
  assert.ok(getJson('user_sara_99').passBcrypt, 'nothing deleted after a refused request');

  const del = await call('POST', '/api/app/account/delete', { token, body: { confirm: 'SARA_99', password: 'secret12' } });
  assert.equal(del.status, 200);
  assert.deepEqual(del.body, { ok: true, removed: false, posts: 1, replies: 1, likes: 1, votes: 1, requests: 1 });
  // Phase-1 rules refuse deletes: both account documents are emptied instead.
  for (const key of ['user_sara_99', 'email_sara_example_com']) {
    const doc = docs.get(key);
    const json = getJson(key);
    assert.equal(json.deleted, true);
    assert.equal(json.passSha256, accounts.PASS_SENTINEL_DELETED, 'old APKs cannot sign in with any password');
    for (const field of ['username', 'email', 'passBcrypt', 'favorites', 'displayName', 'vipTier']) assert.ok(!(field in json), `${key} keeps no ${field}`);
    assert.equal(doc.fields.username.stringValue, '');
    assert.equal(doc.fields.email.stringValue, '');
  }
  assert.deepEqual(getJson('shared_community_feed').map((p) => p.id), ['p2']);
  assert.deepEqual(getJson('shared_community_feed')[0].likedBy, ['ali']);
  assert.deepEqual(getJson('shared_community_feed')[0].replies, []);
  assert.deepEqual(Object.keys(getJson('ranking_votes').titles['5114']), [rankingVotes.voterKey('u:ali')]);
  const g = getJson('global_vip_system');
  assert.deepEqual(g.userRequests.map((r) => r.id), ['q2']);
  assert.deepEqual(g.codes[0].redeemedBy.map((r) => r.username), ['', 'ali']);
  assert.equal(g.codes[0].usedCount, 1, 'code use count kept');

  // The old session and the password are dead; the name and e-mail can be used again.
  assert.equal((await call('GET', '/api/app/me', { token })).status, 401);
  assert.equal((await call('POST', '/api/app/auth/login', { body: { identifier: 'sara_99', password: 'secret12' } })).status, 401);
  assert.equal((await call('POST', '/api/app/auth/login', { body: { identifier: 'sara@example.com', password: 'secret12' } })).status, 401);
  const again = await call('POST', '/api/app/auth/register', { body: { username: 'sara_99', password: 'newpass1', email: 'sara@example.com' } });
  assert.equal(again.status, 201);
  assert.equal(again.body.state.favorites.length, 0, 'a new account starts empty');
  assert.notEqual(getJson('user_sara_99').id, id);
  assert.ok(getJson('email_sara_example_com').email, 'e-mail document reused');
});

test('account deletion removes the documents when deletes are allowed (service account)', async () => {
  reset();
  deletesAllowed = true;
  const token = (await call('POST', '/api/app/auth/register', { body: { username: 'omar', password: 'secret12', email: 'omar@example.com' } })).body.token;
  const del = await call('POST', '/api/app/account/delete', { token, body: { confirm: 'omar', password: 'secret12' } });
  assert.equal(del.status, 200);
  assert.equal(del.body.removed, true);
  assert.ok(!docs.has('user_omar') && !docs.has('email_omar_example_com'));
});

test('account deletion: Google accounts confirm with the user name; the developer account is refused', async () => {
  reset();
  const g = await call('POST', '/api/app/auth/google', { body: { idToken: googleToken('mona@gmail.com'), state: { favorites: [{ objectID: 'Bleach', titleEn: 'Bleach' }] } } });
  assert.equal(g.status, 200);
  const del = await call('POST', '/api/app/account/delete', { token: g.body.token, body: { confirm: g.body.user.username } });
  assert.equal(del.status, 200);
  assert.equal(getJson('email_mona_gmail_com').deleted, true);
  // Signing in with Google again creates a new, empty account over the emptied document.
  const back = await call('POST', '/api/app/auth/google', { body: { idToken: googleToken('mona@gmail.com') } });
  assert.equal(back.status, 200);
  assert.equal(back.body.state.favorites.length, 0);
  assert.equal(getJson('email_mona_gmail_com').email, 'mona@gmail.com');
  assert.ok(getJson(`user_${back.body.user.username}`).email, 'user-name document written again');
  // The website deletes with a Firebase ID token too.
  const web = await call('POST', '/api/app/account/delete', { token: googleToken('mona@gmail.com'), body: { confirm: back.body.user.username } });
  assert.equal(web.status, 200);
  const dev = (await call('POST', '/api/app/auth/google', { body: { idToken: googleToken('mz0970mmz@gmail.com') } })).body;
  const refused = await call('POST', '/api/app/account/delete', { token: dev.token, body: { confirm: dev.user.username } });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, 'developer_account');
});

test('a website (SQLite) copy of a deleted account does not bring it back', async () => {
  const { isStaleAfterDeletion } = await import('../src/services/cloudSync.service.js');
  const tomb = accounts.accountTombstone('2026-10-17T12:00:00.000Z');
  assert.equal(isStaleAfterDeletion({ created_at: '2026-10-01 09:00:00' }, tomb), true, 'copied before the deletion');
  assert.equal(isStaleAfterDeletion({ created_at: '2026-10-17 12:30:00' }, tomb), false, 'a new sign-up after it');
  assert.equal(isStaleAfterDeletion({ created_at: '2026-10-01 09:00:00' }, { username: 'x' }), false, 'not deleted');
});
