// Phone website links <-> app pages (client/src/mobile/webRoutes.js). Pure functions, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LINKABLE_PROFILE_PAGES, parseWebLocation, webUrlFor } from '../src/mobile/webRoutes.js';

test('computer-website paths open the matching app page', () => {
  assert.deepEqual(parseWebLocation('/'), { kind: 'home' });
  assert.deepEqual(parseWebLocation('/show/aw-one-piece'), { kind: 'show', slug: 'aw-one-piece' });
  assert.deepEqual(parseWebLocation('/show/ap-123', '?source=aniproject'), { kind: 'show', slug: 'ap-123', source: 'aniproject' });
  assert.deepEqual(parseWebLocation('/watch/aw-one-piece/1071'), { kind: 'watch', slug: 'aw-one-piece', ep: 1071 });
  assert.deepEqual(parseWebLocation('/watch/aw-one-piece/0'), { kind: 'watch', slug: 'aw-one-piece', ep: 1 });
  assert.deepEqual(parseWebLocation('/trending', '?q=naruto'), { kind: 'tab', tab: 'catalog', query: 'naruto' });
  // rankings is a page of the app interface since 2026-10-17 (website only)
  assert.deepEqual(parseWebLocation('/rankings'), { kind: 'profile', page: 'rankings' });
  assert.deepEqual(parseWebLocation('/wrapped'), { kind: 'profile', page: 'wrapped' });
  // legal pages (2026-10-17): /privacy is the policy, /profile/privacy the settings page
  assert.deepEqual(parseWebLocation('/privacy'), { kind: 'profile', page: 'policy' });
  assert.deepEqual(parseWebLocation('/terms'), { kind: 'profile', page: 'terms' });
  assert.deepEqual(parseWebLocation('/profile/privacy'), { kind: 'profile', page: 'privacy' });
  assert.deepEqual(parseWebLocation('/profile/policy'), { kind: 'profile', page: 'policy' });
  assert.deepEqual(parseWebLocation('/discover'), { kind: 'tab', tab: 'schedule' });
  assert.deepEqual(parseWebLocation('/schedule'), { kind: 'tab', tab: 'schedule' });
  assert.deepEqual(parseWebLocation('/browse'), { kind: 'tab', tab: 'manga' });
  assert.deepEqual(parseWebLocation('/browse', '?q=solo'), { kind: 'tab', tab: 'manga', query: 'solo' });
  assert.deepEqual(parseWebLocation('/browse', '?manga=os:solo&server=BX1&chapter=c-2'), { kind: 'manga', id: 'os:solo', server: 'bx1', chapter: 'c-2' });
  assert.deepEqual(parseWebLocation('/community'), { kind: 'tab', tab: 'community' });
  assert.deepEqual(parseWebLocation('/mylist'), { kind: 'profile', page: 'library' });
  assert.deepEqual(parseWebLocation('/watchlist'), { kind: 'profile', page: 'library' });
  assert.deepEqual(parseWebLocation('/settings'), { kind: 'profile', page: 'settings' });
  assert.deepEqual(parseWebLocation('/profile'), { kind: 'profile' });
  assert.deepEqual(parseWebLocation('/profile/history'), { kind: 'profile', page: 'history' });
});

test('pages that need the app state, odd links and junk fall back safely', () => {
  assert.deepEqual(parseWebLocation('/profile/edit'), { kind: 'profile' });
  assert.deepEqual(parseWebLocation('/profile/developer'), { kind: 'profile' });
  assert.equal(LINKABLE_PROFILE_PAGES.includes('edit'), false);
  assert.deepEqual(parseWebLocation('/anime/123'), { kind: 'home' });
  assert.deepEqual(parseWebLocation('/nope/at/all'), { kind: 'home' });
  assert.deepEqual(parseWebLocation('/show/'), { kind: 'home' });
  assert.deepEqual(parseWebLocation('/show/%E0%A4%A'), { kind: 'show', slug: '%E0%A4%A' }); // undecodable: kept as typed
  assert.deepEqual(parseWebLocation('/show/a%20b'), { kind: 'home' }); // spaces are never slugs
});

test('what is on screen -> its link (same paths as the computer website)', () => {
  assert.equal(webUrlFor({ tab: 'home' }), '/');
  assert.equal(webUrlFor({ tab: 'catalog' }), '/trending');
  assert.equal(webUrlFor({ tab: 'catalog', catalogQuery: 'one piece' }), '/trending?q=one%20piece');
  assert.equal(webUrlFor({ tab: 'schedule' }), '/discover');
  assert.equal(webUrlFor({ tab: 'manga' }), '/browse');
  assert.equal(webUrlFor({ tab: 'community' }), '/community');
  assert.equal(webUrlFor({ tab: 'profile' }), '/profile');
  assert.equal(webUrlFor({ tab: 'profile', profilePage: 'library' }), '/mylist');
  assert.equal(webUrlFor({ tab: 'profile', profilePage: 'settings' }), '/profile/settings');
  assert.equal(webUrlFor({ tab: 'catalog', show: { slug: 'aw-x' } }), '/show/aw-x');
  assert.equal(webUrlFor({ tab: 'catalog', show: { slug: 'aw-x' }, episode: 3 }), '/watch/aw-x/3');
  assert.equal(webUrlFor({ show: { slug: 'ap-9', source: 'aniproject' }, episode: 2 }), '/watch/ap-9/2?source=aniproject');
  assert.equal(webUrlFor({ tab: 'manga', manga: { id: 'os:solo', server: 'bx1' } }), '/browse?manga=os%3Asolo&server=bx1');
  assert.equal(webUrlFor({ tab: 'manga', manga: { id: 'os:solo', server: 'bx1' }, chapter: 'c-2' }), '/browse?manga=os%3Asolo&server=bx1&chapter=c-2');
});

test('round trip: a link made by the app opens the same page again', () => {
  const states = [
    { tab: 'catalog', catalogQuery: 'naruto' },
    { tab: 'schedule' },
    { tab: 'profile', profilePage: 'history' },
    { tab: 'home', show: { slug: 'aw-attack-on-titan' }, episode: 25 },
    { tab: 'manga', manga: { id: 'az:tower', server: 'bx2' }, chapter: 'tower-ch-10' }
  ];
  for (const st of states) {
    const url = new URL(webUrlFor(st), 'https://black-x-anime.me');
    const back = parseWebLocation(url.pathname, url.search);
    if (st.show) assert.deepEqual(back, { kind: 'watch', slug: st.show.slug, ep: st.episode });
    else if (st.manga) assert.deepEqual(back, { kind: 'manga', id: st.manga.id, server: st.manga.server, chapter: st.chapter });
    else if (st.tab === 'profile') assert.deepEqual(back, { kind: 'profile', page: st.profilePage });
    else assert.deepEqual(back, { kind: 'tab', tab: st.tab, ...(st.catalogQuery ? { query: st.catalogQuery } : {}) });
  }
});

test('watch party links: ?party= is read and written back on the player address', () => {
  assert.deepEqual(parseWebLocation('/watch/aw-one-piece/12', '?party=bx7k2m9q'), { kind: 'watch', slug: 'aw-one-piece', ep: 12, party: 'BX7K2M9Q' });
  assert.deepEqual(parseWebLocation('/watch/aw-one-piece/12', '?party=bx-7k'), { kind: 'watch', slug: 'aw-one-piece', ep: 12, party: 'BX7K' });
  // too short / junk: no party
  assert.deepEqual(parseWebLocation('/watch/aw-one-piece/12', '?party=x'), { kind: 'watch', slug: 'aw-one-piece', ep: 12 });
  assert.equal(webUrlFor({ show: { slug: 'aw-one-piece' }, episode: 12, party: 'BX7K2M9Q' }), '/watch/aw-one-piece/12?party=BX7K2M9Q');
  assert.equal(
    webUrlFor({ show: { slug: 'x1', source: 'aniproject' }, episode: 3, party: 'BX7K2M9Q' }),
    '/watch/x1/3?source=aniproject&party=BX7K2M9Q'
  );
  // the title page never carries the party
  assert.equal(webUrlFor({ show: { slug: 'aw-one-piece' }, episode: null, party: 'BX7K2M9Q' }), '/show/aw-one-piece');
  assert.equal(webUrlFor({ tab: 'profile', profilePage: 'rankings' }), '/rankings');
  assert.equal(webUrlFor({ tab: 'profile', profilePage: 'wrapped' }), '/profile/wrapped');
  assert.equal(webUrlFor({ tab: 'profile', profilePage: 'policy' }), '/privacy');
  assert.equal(webUrlFor({ tab: 'profile', profilePage: 'terms' }), '/terms');
  assert.equal(webUrlFor({ tab: 'profile', profilePage: 'privacy' }), '/profile/privacy');
});
