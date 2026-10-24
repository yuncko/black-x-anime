// Which interface the website shows (client/src/webUi.js). Owner's decision of 2026-10-17:
// every device gets the Hearbor app interface; the classic pages are a remembered choice
// (`?ui=site`), and a "site" choice saved under the old phone/computer split is ignored.
import test from 'node:test';
import assert from 'node:assert/strict';

function setup({ search = '', saved = {} } = {}) {
  const store = new Map(Object.entries(saved));
  globalThis.window = {
    location: { search, pathname: '/' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0' },
    screen: { width: 1440, height: 900 },
    innerWidth: 1440
  };
  return store;
}

const { decideWebUi, WEB_UI_KEY } = await import('../src/webUi.js');

test('every device — computers included — gets the app interface by default', () => {
  setup();
  assert.equal(decideWebUi(), 'app');
});

test('?ui=site opens the classic pages and remembers it under the new key', () => {
  const store = setup({ search: '?ui=site' });
  assert.equal(decideWebUi(), 'site');
  assert.equal(WEB_UI_KEY, 'bx_web_ui_v2');
  assert.equal(store.get('bx_web_ui_v2'), 'site');
});

test('a remembered classic choice is honoured; ?ui=app switches back', () => {
  setup({ saved: { bx_web_ui_v2: 'site' } });
  assert.equal(decideWebUi(), 'site');
  const store = setup({ search: '?ui=app', saved: { bx_web_ui_v2: 'site' } });
  assert.equal(decideWebUi(), 'app');
  assert.equal(store.get('bx_web_ui_v2'), 'app');
});

test('a "site" choice saved under the old split (bx_web_ui) no longer applies', () => {
  setup({ saved: { bx_web_ui: 'site' } });
  assert.equal(decideWebUi(), 'app');
});
