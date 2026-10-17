// The same-origin check that guards state-changing requests (server/src/lib/sameOrigin.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginRequest } from '../src/lib/sameOrigin.js';

test('same host and protocol pass; another site does not', () => {
  assert.equal(isSameOriginRequest('https://black-x-anime.ai.studio', { host: 'black-x-anime.ai.studio', forwardedProto: 'https' }), true);
  assert.equal(isSameOriginRequest('https://evil.example', { host: 'black-x-anime.ai.studio', forwardedProto: 'https' }), false);
  assert.equal(isSameOriginRequest('http://black-x-anime.ai.studio', { host: 'black-x-anime.ai.studio', forwardedProto: 'https' }), false, 'protocol must match');
  assert.equal(isSameOriginRequest('not a url', { host: 'x' }), false);
});

test('behind a proxy the public host may come as X-Forwarded-Host (AI Studio / Cloud Run)', () => {
  const headers = { host: 'black-x-anime-85476085134.europe-west2.run.app', forwardedHost: 'black-x-anime.ai.studio', forwardedProto: 'https, http' };
  assert.equal(isSameOriginRequest('https://black-x-anime.ai.studio', headers), true);
  assert.equal(isSameOriginRequest('https://black-x-anime-85476085134.europe-west2.run.app', headers), true);
  assert.equal(isSameOriginRequest('https://other.ai.studio', headers), false);
  assert.equal(isSameOriginRequest('http://localhost:3000', { host: 'localhost:3000', protocol: 'http' }), true);
});
