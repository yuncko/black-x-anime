// /api/stream/episode for every account type. VIP (Basic and Monarch) only changes the
// order of the real servers (direct / CDN first). There is no 4K / HDR / 60 fps server:
// the synthetic «👑 Hearbor Monarch 4K HDR (60fps Ultra)» entry, which replayed the first
// real server under a fake quality label, was removed with the owner's OK on 2026-10-16.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-stream-vip-0123456789abcdef';

const express = (await import('express')).default;
const { default: streamingRoutes } = await import('../src/routes/streaming.js');
const { englishAnimeService } = await import('../src/services/englishAnime.service.js');
const { signToken } = await import('../src/auth.js');
const { db } = await import('../src/db.js');

const SLUG = 'en-vip-order-test';
const FAKE_QUALITY = /4K|HDR|60\s*fps|2160/i;
const originalFetch = globalThis.fetch;
const originalGetEpisode = englishAnimeService.getEpisode;
const userIds = [];
const tokens = {};
let server;
let base;

// One embed-only server, then one direct MP4 (a "fast CDN" server).
function episodeFixture() {
  return {
    slug: SLUG,
    episode: 1,
    entries: [
      { id: 'en-embed', server: 'Hearbor 3', quality: 'HD', embedUrl: 'https://embed.example/e/1' },
      { id: 'en-direct', server: 'Hearbor 3', quality: '1080p', directUrl: 'https://cdn.example/1.mp4' }
    ],
    resolved: { 'en-embed': { embedUrl: 'https://embed.example/e/1' } },
    downloads: [],
    resolvedDownloads: {}
  };
}

function addUser(label, { role = 'user', vipStatus = null } = {}) {
  const tag = `${label}_${crypto.randomBytes(4).toString('hex')}`;
  const info = db
    .prepare('INSERT INTO users (username, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)')
    .run(`vipt_${tag}`, `vipt_${tag}@test.invalid`, 'x', `VIP test ${label}`, role);
  const id = Number(info.lastInsertRowid);
  if (vipStatus) db.prepare('UPDATE users SET vip_status = ? WHERE id = ?').run(vipStatus, id);
  userIds.push(id);
  tokens[label] = signToken({ id, username: `vipt_${tag}`, role });
}

async function episodeAs(label) {
  const headers = label ? { Authorization: `Bearer ${tokens[label]}` } : {};
  const response = await originalFetch(`${base}/api/stream/episode/${SLUG}/1`, { headers });
  return { status: response.status, body: await response.json() };
}

function assertOnlyRealServers(body, who) {
  assert.equal(body.entries.length, 2, `${who}: exactly the two real servers`);
  for (const entry of body.entries) {
    assert.doesNotMatch(String(entry.id), /^vip-monarch-4k-/, `${who}: no synthetic Monarch server`);
    assert.equal(entry.isMonarchExclusive, undefined, `${who}: no Monarch-only entry`);
    assert.doesNotMatch(`${entry.server} ${entry.quality} ${entry.badge || ''}`, FAKE_QUALITY, `${who}: no invented quality label`);
  }
  assert.deepEqual(Object.keys(body.resolved), ['en-embed'], `${who}: no extra resolved entry`);
}

before(async () => {
  // No network: every upstream call (Anime Witcher cross-enrichment etc.) gets a quick 404.
  globalThis.fetch = async () => new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  englishAnimeService.getEpisode = async () => episodeFixture();
  addUser('basic', { vipStatus: 'VIP Basic' });
  addUser('monarch', { vipStatus: 'VIP Monarch' });
  addUser('developer', { role: 'developer' });
  addUser('member');
  const app = express();
  app.use(express.json());
  app.use('/api/stream', streamingRoutes);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  globalThis.fetch = originalFetch;
  englishAnimeService.getEpisode = originalGetEpisode;
  for (const id of userIds) db.prepare('DELETE FROM users WHERE id = ?').run(id);
  await new Promise((resolve) => server.close(resolve));
});

test('guests and free members get the real servers in their original order', async () => {
  for (const who of [null, 'member']) {
    const { status, body } = await episodeAs(who);
    assert.equal(status, 200);
    assertOnlyRealServers(body, who || 'guest');
    assert.deepEqual(body.entries.map((e) => e.id), ['en-embed', 'en-direct']);
    assert.equal(body.isVipBasic, false);
    assert.equal(body.isVipMonarch, false);
  }
});

test('VIP Basic: same real servers, direct / CDN first', async () => {
  const { status, body } = await episodeAs('basic');
  assert.equal(status, 200);
  assertOnlyRealServers(body, 'basic');
  assert.deepEqual(body.entries.map((e) => e.id), ['en-direct', 'en-embed']);
  assert.equal(body.entries[0].isFastCdn, true);
  assert.equal(body.isVipBasic, true);
  assert.equal(body.isVipMonarch, false);
});

test('VIP Monarch and the developer: no «4K HDR (60fps Ultra)» server, same order as Basic', async () => {
  for (const who of ['monarch', 'developer']) {
    const { status, body } = await episodeAs(who);
    assert.equal(status, 200);
    assertOnlyRealServers(body, who);
    assert.deepEqual(body.entries.map((e) => e.id), ['en-direct', 'en-embed'], `${who}: direct / CDN first`);
    assert.equal(body.vipTier, 'VIP Monarch');
    assert.equal(body.isVipBasic, true);
    assert.equal(body.isVipMonarch, true);
  }
});
