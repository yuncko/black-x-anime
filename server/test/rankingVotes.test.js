// Rankings votes (server/src/services/rankingVotes.js + POST /api/anime/rankings/rate):
// one Firestore document written with preconditions, one vote per account, only ranked titles.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ranking-votes-0123456789abcdef';
delete process.env.FIREBASE_SERVICE_ACCOUNT;

const express = (await import('express')).default;
const store = await import('../src/services/settingsStore.js');
const votes = await import('../src/services/rankingVotes.js');
const { apiSet } = await import('../src/db.js');
const { signApkToken } = await import('../src/services/apkAccounts.js');
const { signToken } = await import('../src/auth.js');
const { default: animeRoutes } = await import('../src/routes/anime.js');

// ------------------------------------------------------------ fake Firestore
const docs = new Map();
let clock = 0;
let writeHook = null;
const nextTime = () => `2026-10-17T00:00:00.${String(++clock).padStart(9, '0')}Z`;
async function fakeFetch(url, init = {}) {
  const u = new URL(url);
  const id = decodeURIComponent(u.pathname.split('/').pop());
  const method = init.method || 'GET';
  const respond = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  if (method === 'GET') {
    const d = docs.get(id);
    return d ? respond(200, { name: id, fields: d.fields, updateTime: d.updateTime }) : respond(404, { error: { status: 'NOT_FOUND' } });
  }
  if (writeHook) await writeHook(id);
  const d = docs.get(id);
  const exists = u.searchParams.get('currentDocument.exists');
  const updateTime = u.searchParams.get('currentDocument.updateTime');
  if (exists === 'false' && d) return respond(409, { error: { status: 'ALREADY_EXISTS' } });
  if (updateTime && !d) return respond(404, { error: { status: 'NOT_FOUND' } });
  if (updateTime && d.updateTime !== updateTime) return respond(400, { error: { status: 'FAILED_PRECONDITION' } });
  const rec = { fields: JSON.parse(init.body).fields, updateTime: nextTime() };
  docs.set(id, rec);
  return respond(200, { name: id, ...rec });
}
store.__setSettingsStoreTransportForTests(fakeFetch, async () => ({}));
const stored = () => JSON.parse(docs.get(votes.RANKING_VOTES_DOC)?.fields?.json?.stringValue || 'null');
function reset() {
  docs.clear();
  writeHook = null;
  votes.__resetRankingVotesCacheForTests();
}

// The AniList top list comes from the API cache (no network in tests).
const TOP = [
  { id: 5114, titleEnglish: 'Fullmetal Alchemist: Brotherhood', score: 90 },
  { id: 9253, titleEnglish: 'Steins;Gate', score: 91 }
];
apiSet('anilist:rankings:top:v4:15', TOP, 60 * 60 * 1000);

const app = express();
app.use(express.json());
app.use('/api/anime', animeRoutes);
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
  server.close();
  store.__setSettingsStoreTransportForTests();
});
async function call(method, path, { body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('helpers: hashed voters, clean scores, real stats only', () => {
  const a = votes.voterKey('u:Ahmed');
  assert.match(a, /^v[A-Za-z0-9_-]{16}$/);
  assert.equal(a, votes.voterKey(' u:ahmed '), 'case / spaces do not make a second voter');
  assert.notEqual(a, votes.voterKey('u:mona'));
  assert.ok(!a.includes('ahmed'));
  assert.equal(votes.voterKey(''), '');
  assert.equal(votes.cleanScore(7.25), 7.3);
  assert.ok(Number.isNaN(votes.cleanScore(11)));
  assert.ok(Number.isNaN(votes.cleanScore('8')));
  const doc = votes.cleanVotesDoc({ titles: { 5114: { [a]: 9, bad: 3, vxxxxxxxxxx: 42 }, nope: { [a]: 5 } } });
  assert.deepEqual(Object.keys(doc.titles), ['5114']);
  assert.deepEqual(votes.statsFor(doc, 5114), { votes: 1, avgScore: 9 });
  assert.deepEqual(votes.statsFor(doc, 9253), { votes: 0, avgScore: null });
});

test('two votes at the same moment both count; voting again replaces your vote', async () => {
  reset();
  const ka = votes.voterKey('u:a');
  const kb = votes.voterKey('u:b');
  await votes.castRankingVote(5114, ka, 8);
  // b's write lands between a's read and write: a's precondition fails and a retries
  let raced = false;
  writeHook = async () => {
    if (raced) return;
    raced = true;
    await votes.castRankingVote(5114, kb, 6);
  };
  const stats = await votes.castRankingVote(5114, ka, 10);
  writeHook = null;
  assert.deepEqual(stats, { votes: 2, avgScore: 8 });
  assert.deepEqual(stored().titles['5114'], { [ka]: 10, [kb]: 6 });
  // the same vote again writes nothing
  const before = docs.get(votes.RANKING_VOTES_DOC).updateTime;
  await votes.castRankingVote(5114, ka, 10);
  assert.equal(docs.get(votes.RANKING_VOTES_DOC).updateTime, before);
  // reads come from a one-minute cache, a fresh read sees the stored document
  assert.deepEqual(votes.statsFor(await votes.loadRankingVotes({ fresh: true }), 5114), { votes: 2, avgScore: 8 });
});

test('caps: titles that left the rankings make room; the document stays under 1 MiB', async () => {
  reset();
  const k = votes.voterKey('u:cap');
  for (let i = 1; i <= votes.MAX_TITLES; i += 1) await votes.castRankingVote(100000 + i, k, 7);
  await assert.rejects(votes.castRankingVote(5114, k, 9), /too_many_titles/);
  // with the current list known, old titles are dropped and the vote goes in
  const stats = await votes.castRankingVote(5114, k, 9, { keepIds: [5114, 9253, 100001] });
  assert.deepEqual(stats, { votes: 1, avgScore: 9 });
  assert.deepEqual(Object.keys(stored().titles).sort(), ['100001', '5114']);
  assert.ok(votes.MAX_TITLES * votes.MAX_VOTERS_PER_TITLE * 25 < 1024 * 1024);
});

test('POST /rankings/rate: an account is required and only ranked titles can be voted on', async () => {
  reset();
  // no account: refused (up to 2026-10-17 every anonymous vote was a new row)
  let r = await call('POST', '/api/anime/rankings/rate', { body: { animeId: 5114, score: 9 } });
  assert.equal(r.status, 401);
  assert.equal(docs.size, 0);
  // an app session (APK / app interface token)
  const appToken = signApkToken({ key: 'user_mona', username: 'mona', email: 'mona@example.com' });
  r = await call('POST', '/api/anime/rankings/rate', { body: { animeId: 5114, score: 9 }, token: appToken });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.stats, { votes: 1, avgScore: 9 });
  // the same person through a website session (same username) replaces the vote
  const siteToken = signToken({ id: 'no-such-row-on-this-instance', username: 'Mona', role: 'user' });
  r = await call('POST', '/api/anime/rankings/rate', { body: { animeId: 5114, score: 7 }, token: siteToken });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.stats, { votes: 1, avgScore: 7 });
  // a title that is not on the rankings, bad scores
  r = await call('POST', '/api/anime/rankings/rate', { body: { animeId: 1, score: 7 }, token: appToken });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'not_ranked');
  r = await call('POST', '/api/anime/rankings/rate', { body: { animeId: 5114, score: 0 }, token: appToken });
  assert.equal(r.status, 400);
  r = await call('POST', '/api/anime/rankings/rate', { body: { animeId: 5114, score: '9' }, token: appToken });
  assert.equal(r.status, 400);
  // the stored document has no names or e-mails
  const raw = docs.get(votes.RANKING_VOTES_DOC).fields.json.stringValue;
  assert.ok(!/mona/i.test(raw));
});

test('GET /rankings: member votes from the document, nothing invented, still answers when Firestore fails', async () => {
  reset();
  await votes.castRankingVote(9253, votes.voterKey('u:x'), 8);
  await votes.castRankingVote(9253, votes.voterKey('u:y'), 9);
  votes.__resetRankingVotesCacheForTests();
  let r = await call('GET', '/api/anime/rankings');
  assert.equal(r.status, 200);
  const sg = r.body.anime.find((a) => a.id === 9253);
  const fma = r.body.anime.find((a) => a.id === 5114);
  assert.equal(sg.votesCount, 2);
  assert.equal(sg.communityScore, 85);
  assert.equal(fma.votesCount, 0);
  assert.equal(fma.communityScore, null);
  // Firestore down: the AniList ranking still comes, without member votes
  votes.__resetRankingVotesCacheForTests();
  store.__setSettingsStoreTransportForTests(async () => {
    throw new Error('offline');
  }, async () => ({}));
  r = await call('GET', '/api/anime/rankings');
  store.__setSettingsStoreTransportForTests(fakeFetch, async () => ({}));
  assert.equal(r.status, 200);
  assert.equal(r.body.anime.length, 2);
  assert.ok(r.body.anime.every((a) => a.votesCount === 0 && a.communityScore === null));
});
