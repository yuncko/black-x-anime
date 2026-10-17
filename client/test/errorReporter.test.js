// Crash reports (client/src/errorReporter.js): what is sent, what is ignored, how often.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetErrorReporterForTests,
  buildErrorReport,
  errorFingerprint,
  installErrorReporter,
  reportClientError,
  shortStack,
  shouldIgnoreError
} from '../src/errorReporter.js';

const STACK = `TypeError: Cannot read properties of undefined (reading 'slug')
    at openShow (https://black-x-anime.me/assets/index-abc123.js?v=9:1:2345)
    at onClick (https://black-x-anime.me/assets/index-abc123.js:1:999)`;

test('reports carry no query string, no account, short fields', () => {
  const r = buildErrorReport({
    message: "Cannot read properties of undefined (reading 'slug')",
    stack: STACK,
    kind: 'react',
    path: '/watch/aw-x/3?party=BX123456&token=secret#t=5',
    platform: 'apk',
    build: 'v18.1',
    ua: 'Mozilla/5.0 (Linux; Android 14)'
  });
  assert.equal(r.path, '/watch/aw-x/3');
  assert.equal(r.kind, 'react');
  assert.equal(r.platform, 'apk');
  assert.ok(!JSON.stringify(r).includes('secret'));
  assert.ok(!r.stack.includes('?v=9'));
  assert.match(r.fp, /^[a-z0-9]+$/);
  assert.deepEqual(Object.keys(r).sort(), ['build', 'fp', 'kind', 'message', 'path', 'platform', 'stack', 'ua']);
  assert.equal(buildErrorReport({ message: 'x'.repeat(900) }).message.length, 300);
  assert.equal(buildErrorReport({ message: 'x', kind: 'weird', platform: 'ios' }).kind, 'error');
  assert.equal(buildErrorReport({ message: 'x', platform: 'ios' }).platform, 'web');
  assert.equal(shortStack('a\n\n b \nc', 2), 'a\nb');
});

test('noise is ignored: network drops, extensions, autoplay, cross-origin script errors', () => {
  assert.equal(shouldIgnoreError('Failed to fetch'), true);
  assert.equal(shouldIgnoreError('TypeError: Load failed'), true);
  assert.equal(shouldIgnoreError('Script error.'), true);
  assert.equal(shouldIgnoreError('ResizeObserver loop completed with undelivered notifications.'), true);
  assert.equal(shouldIgnoreError("NotAllowedError: play() failed because the user didn't interact with the document first."), true);
  assert.equal(shouldIgnoreError('The operation was aborted.'), true);
  assert.equal(shouldIgnoreError('x is not a function', 'at y (chrome-extension://abc/content.js:1:1)'), true);
  assert.equal(shouldIgnoreError('x is not a function', '', 'moz-extension://abc/x.js'), true);
  assert.equal(shouldIgnoreError(''), true);
  assert.equal(shouldIgnoreError("Cannot read properties of undefined (reading 'slug')", STACK), false);
});

test('same error = same fingerprint even with other numbers; other place = other fingerprint', () => {
  const a = errorFingerprint('Episode 12 not found', STACK);
  const b = errorFingerprint('Episode 7 not found', STACK.replace(':1:2345', ':1:2399'));
  assert.equal(a, b);
  assert.notEqual(a, errorFingerprint('Episode 12 not found', 'at other (https://x/assets/a.js:1:1)'));
  assert.notEqual(a, errorFingerprint('Something else', STACK));
});

test('each error once, at most 5 per page, sent with keepalive to the endpoint', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url, init });
    return { ok: true };
  };
  try {
    __resetErrorReporterForTests();
    installErrorReporter({ endpoint: 'https://black-x-anime.me/api/telemetry/error', platform: 'apk', build: 'v18.1' });
    const err = new Error('boom 1');
    err.stack = STACK;
    assert.equal(reportClientError(err), true);
    assert.equal(reportClientError(err), false, 'the same error is not sent twice');
    assert.equal(reportClientError(new Error('Failed to fetch')), false);
    for (let i = 0; i < 10; i += 1) {
      const e = new Error(`distinct ${String.fromCharCode(97 + i)}`);
      e.stack = `Error\n    at f${i} (https://x/assets/a.js:1:${i})`;
      reportClientError(e);
    }
    assert.equal(sent.length, 5);
    assert.equal(sent[0].url, 'https://black-x-anime.me/api/telemetry/error');
    assert.equal(sent[0].init.keepalive, true);
    const body = JSON.parse(sent[0].init.body);
    assert.equal(body.platform, 'apk');
    assert.equal(body.build, 'v18.1');
  } finally {
    globalThis.fetch = realFetch;
  }
});
