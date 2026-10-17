// Crash reports: POST /api/telemetry/error → settings/error_log_<day> (services/errorLog.js),
// GET /api/app/admin/errors for the developer panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-telemetry-0123456789abcdef';
delete process.env.FIREBASE_SERVICE_ACCOUNT;

const express = (await import('express')).default;
const store = await import('../src/services/settingsStore.js');
const errorLog = await import('../src/services/errorLog.js');
const telemetry = await import('../src/routes/telemetry.js');
const apkApp = await import('../src/routes/apkApp.js');
const { signApkToken } = await import('../src/services/apkAccounts.js');
const { DEVELOPER_EMAIL } = await import('../src/auth.js');

const docs = new Map();
let clock = 0;
const nextTime = () => `2026-10-17T00:00:00.${String(++clock).padStart(9, '0')}Z`;
async function fakeFetch(url, init = {}) {
  const u = new URL(url);
  const id = decodeURIComponent(u.pathname.split('/').pop());
  const respond = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  if ((init.method || 'GET') === 'GET') {
    const d = docs.get(id);
    return d ? respond(200, { name: id, fields: d.fields, updateTime: d.updateTime }) : respond(404, { error: { status: 'NOT_FOUND' } });
  }
  const d = docs.get(id);
  const exists = u.searchParams.get('currentDocument.exists');
  const updateTime = u.searchParams.get('currentDocument.updateTime');
  if (exists === 'false' && d) return respond(409, { error: { status: 'ALREADY_EXISTS' } });
  if (updateTime && (!d || d.updateTime !== updateTime)) return respond(400, { error: { status: 'FAILED_PRECONDITION' } });
  const rec = { fields: JSON.parse(init.body).fields, updateTime: nextTime() };
  docs.set(id, rec);
  return respond(200, { name: id, ...rec });
}
store.__setSettingsStoreTransportForTests(fakeFetch, async () => ({}));

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use('/api/telemetry', telemetry.default);
app.use('/api/app', apkApp.default);
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
  server.close();
  store.__setSettingsStoreTransportForTests();
});

const report = (over = {}) => ({
  message: "Cannot read properties of undefined (reading 'slug')",
  stack: 'TypeError: x\n    at openShow (https://black-x-anime.me/assets/index.js:1:2)',
  kind: 'error',
  path: '/watch/aw-x/3?party=BX123456',
  platform: 'web',
  build: 'abc1234',
  ua: 'Mozilla/5.0',
  fp: 'k3j9x',
  ...over
});
async function post(body, ip = '203.0.113.7') {
  const res = await fetch(`${BASE}/api/telemetry/error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(body)
  });
  return res.status;
}

test('sanitize: only well-formed reports, path without query, control characters removed', () => {
  assert.equal(errorLog.sanitizeErrorReport(null), null);
  assert.equal(errorLog.sanitizeErrorReport({ message: '', fp: 'abc' }), null);
  assert.equal(errorLog.sanitizeErrorReport({ message: 'x', fp: 'NOT VALID!' }), null);
  const r = errorLog.sanitizeErrorReport(report({ message: 'bad\u0000thing', platform: 'ios', kind: 'nope', path: 'watch?x=1' }));
  assert.equal(r.message, 'bad thing');
  assert.equal(r.platform, 'web');
  assert.equal(r.kind, 'error');
  assert.equal(r.path, '/watch');
  assert.equal(errorLog.errorLogDocId(new Date('2026-10-17T23:59:00Z')), 'error_log_20261017');
});

test('the same error counts up in one entry; different errors get their own entry', async () => {
  docs.clear();
  telemetry.__resetTelemetryLimitsForTests();
  assert.equal(await post(report()), 204);
  assert.equal(await post(report(), '203.0.113.8'), 204);
  assert.equal(await post(report({ fp: 'other1', message: 'x is not a function' }), '203.0.113.9'), 204);
  assert.equal(await post({ nope: true }), 400);
  const id = errorLog.errorLogDocId();
  const log = JSON.parse(docs.get(id).fields.json.stringValue);
  assert.equal(log.entries.k3j9x.count, 2);
  assert.equal(log.entries.other1.count, 1);
  assert.equal(log.entries.k3j9x.path, '/watch/aw-x/3');
  // nothing that identifies a person
  assert.ok(!JSON.stringify(log).includes('203.0.113'));
});

test('limits: 8 per address per 10 minutes, 100 different errors a day', async () => {
  docs.clear();
  telemetry.__resetTelemetryLimitsForTests();
  for (let i = 0; i < 12; i += 1) await post(report({ fp: `ip${i}` }), '198.51.100.1');
  let log = JSON.parse(docs.get(errorLog.errorLogDocId()).fields.json.stringValue);
  assert.equal(Object.keys(log.entries).length, 8);
  // the daily cap (directly through the service)
  docs.clear();
  for (let i = 0; i < errorLog.MAX_ERRORS_PER_DAY + 3; i += 1) {
    await errorLog.recordClientError(errorLog.sanitizeErrorReport(report({ fp: `d${i}` })));
  }
  log = JSON.parse(docs.get(errorLog.errorLogDocId()).fields.json.stringValue);
  assert.equal(Object.keys(log.entries).length, errorLog.MAX_ERRORS_PER_DAY);
  assert.equal(log.dropped, 3);
});

test('GET /api/app/admin/errors: developer only, newest first', async () => {
  docs.clear();
  telemetry.__resetTelemetryLimitsForTests();
  await errorLog.recordClientError(errorLog.sanitizeErrorReport(report({ fp: 'old1' })), new Date(Date.now() - 1000));
  await errorLog.recordClientError(errorLog.sanitizeErrorReport(report({ fp: 'new1' })));
  const member = signApkToken({ key: 'user_a', username: 'a', email: 'a@example.com' });
  const dev = signApkToken({ key: 'user_dev', username: 'dev', email: DEVELOPER_EMAIL, dev: true });
  let res = await fetch(`${BASE}/api/app/admin/errors`, { headers: { Authorization: `Bearer ${member}` } });
  assert.equal(res.status, 403);
  res = await fetch(`${BASE}/api/app/admin/errors?days=2`, { headers: { Authorization: `Bearer ${dev}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.days.length, 2);
  assert.deepEqual(body.days[0].entries.map((e) => e.fp), ['new1', 'old1']);
  assert.equal(body.days[1].entries.length, 0);
});
