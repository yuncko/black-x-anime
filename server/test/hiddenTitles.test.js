// Ecchi / Harem / Isekai hidden from the website API (server/src/lib/hiddenTitles.js) and the
// rules shared with the app (shared/contentFilter.js). No network: the hidden Hearbor 1 titles
// are injected with setHiddenIndexForTests().
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANILIST_EXCLUSION_ARGS,
  hasBlockedGenre,
  isBlockedGenre,
  isHiddenAnime,
  isHiddenManga,
  visibleGenres,
  withAlgoliaExclusions
} from '../../shared/contentFilter.js';
import {
  filterAnimeList,
  filterMangaList,
  isHiddenAnimeItem,
  isHiddenMangaItem,
  markHiddenAnime,
  markHiddenManga,
  setHiddenIndexForTests,
  titleKey
} from '../src/lib/hiddenTitles.js';

const HIDDEN = [
  { objectID: 'Mushoku Tensei', slug: 'aw-mushoku-tensei', names: ['Mushoku Tensei', 'Mushoku Tensei: Jobless Reincarnation'] },
  { objectID: 'Overlord IV', slug: 'aw-overlord-iv', names: ['Overlord IV'] },
  { objectID: 'K', slug: 'aw-k', names: ['K'] }
];

test('shared rules: every spelling of the three genres, never reincarnation', () => {
  for (const g of ['Ecchi', 'إيتشي', 'ايتشي', 'Harem', 'Reverse Harem', 'حريم', 'Isekai', 'عالم مختلف', 'إيسيكاي', { name: 'Male Harem' }]) {
    assert.equal(isBlockedGenre(g), true, JSON.stringify(g));
  }
  for (const g of ['تناسخ', 'تناسخ أرواح', 'Reincarnation', 'Action', 'إيتشيغو', 'Fantasy', '']) {
    assert.equal(isBlockedGenre(g), false, JSON.stringify(g));
  }
  assert.deepEqual(visibleGenres(['Action', 'Isekai', 'دراما']), ['Action', 'دراما']);
  assert.equal(hasBlockedGenre(['Action'], null, [{ name: 'Isekai' }]), true);
});

test('shared rules: Algolia and AniList exclusions', () => {
  const body = withAlgoliaExclusions({ query: '', facetFilters: [['type:فيلم']] });
  assert.deepEqual(body.facetFilters, [['type:فيلم'], 'tags:-ايتشي', 'tags:-حريم', 'tags:-عالم مختلف']);
  assert.match(ANILIST_EXCLUSION_ARGS, /^genre_not_in: \["Ecchi","Hentai"\], tag_not_in: \["Isekai","Male Harem","Female Harem","Mixed Gender Harem"\]$/);
});

test('shared rules: bxHidden is the server verdict, AniList tag objects count', () => {
  assert.equal(isHiddenAnime({ title: 'x', bxHidden: true }), true);
  assert.equal(isHiddenAnime({ title: 'x', genres: ['Action'], tags: [{ name: 'Isekai' }] }), true);
  assert.equal(isHiddenAnime({ title: 'x', genres: ['Action'] }), false);
  assert.equal(isHiddenManga({ title: 'x', genres: ['حريم'] }), true);
  assert.equal(isHiddenManga({ title: 'x', genres: ['أكشن'] }), false);
});

test('title keys ignore punctuation and refuse very short names', () => {
  assert.equal(titleKey('Mushoku Tensei: Jobless Reincarnation'), 'mushokutenseijoblessreincarnation');
  assert.equal(titleKey('K'), '');
  assert.equal(titleKey('Air'), '');
});

test('website lists: by genre, by Hearbor 1 identity, by exact title on other servers', async () => {
  setHiddenIndexForTests(HIDDEN);
  const list = [
    { slug: 'aw-mushoku-tensei', title: 'whatever' }, // saved entry: no genres, known slug
    { slug: 'a3rb-xOverlordIV', titleEn: 'Overlord IV', source: 'anime3rb' }, // another server, same title
    { slug: 'en-123', titleEn: 'Mushoku Tensei: Jobless Reincarnation', source: 'english' },
    { slug: 'aw-k', title: 'K' }, // hidden by slug even though its name is too short to match
    { slug: 'a3rb-xK', titleEn: 'K', source: 'anime3rb' }, // too short to match by title: kept
    { slug: 'aw-naruto', title: 'Naruto', tagsAr: ['اكشن'] },
    { slug: 'aw-some-isekai', title: 'Some Isekai', tagsAr: ['عالم مختلف'] },
    { slug: 'en-9', titleEn: 'Plain Show', genres: ['Ecchi'] },
    { slug: 'aw-overlord-movie', title: 'Overlord IV', tagsAr: ['اكشن'] } // Hearbor 1 record: judged by its own tags
  ];
  const kept = await filterAnimeList(list);
  assert.deepEqual(kept.map((i) => i.slug), ['a3rb-xK', 'aw-naruto', 'aw-overlord-movie']);
  assert.equal(isHiddenAnimeItem({ objectID: 'Overlord IV' }), true);
});

test('manga lists: genres, and manga sharing a hidden anime title', async () => {
  setHiddenIndexForTests(HIDDEN);
  const kept = await filterMangaList([
    { id: 'm1', title: 'Solo Leveling', genres: ['أكشن'] },
    { id: 'm2', title_en: 'Mushoku Tensei', genres: [] },
    { id: 'm3', title: 'Harem Days', genres: ['Harem'] },
    { id: 'm4', title: 'تناسخ الإمبراطور', genres: ['تناسخ', 'فانتازيا'] }
  ]);
  assert.deepEqual(kept.map((i) => i.id), ['m1', 'm4']);
  assert.equal(isHiddenMangaItem({ title: 'Overlord IV' }), true);
});

test('title pages are marked, not refused', async () => {
  setHiddenIndexForTests(HIDDEN);
  const shown = await markHiddenAnime({ slug: 'aw-naruto', title: 'Naruto', tagsAr: ['اكشن'] });
  assert.equal(shown.bxHidden, undefined);
  const hidden = await markHiddenAnime({ slug: 'aw-mushoku-tensei', title: 'Mushoku Tensei' });
  assert.equal(hidden.bxHidden, true);
  assert.equal((await markHiddenManga({ id: 'x', genres: ['ecchi'] })).bxHidden, true);
});

test('without the hidden-title list (Algolia down) the genre rules still apply', async () => {
  setHiddenIndexForTests(null);
  const kept = await filterAnimeList([
    { slug: 'aw-mushoku-tensei', title: 'Mushoku Tensei' },
    { slug: 'en-9', titleEn: 'Plain Show', genres: ['Isekai'] }
  ]);
  assert.deepEqual(kept.map((i) => i.slug), ['aw-mushoku-tensei']);
});
