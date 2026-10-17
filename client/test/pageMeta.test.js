// Page titles / descriptions of the website's app interface (client/src/mobile/pageMeta.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DESCRIPTION, pageMetaFor } from '../src/mobile/pageMeta.js';
import { LEGAL_DOCS } from '../src/legal/legalContent.js';

test('a title page uses its name and story; long stories are cut on a word', () => {
  const story = `${'كلمة '.repeat(60)}النهاية`;
  const m = pageMetaFor({ lang: 'ar', tab: 'home', show: { title: 'Frieren', story } });
  assert.equal(m.title, 'Frieren — BLACK X');
  assert.ok(m.description.length <= 158);
  assert.ok(m.description.endsWith('…'));
  assert.ok(!m.description.includes('النهاية'));
  // no story: the site description, never an empty one
  assert.equal(pageMetaFor({ lang: 'en', show: { title: 'X', story: '' } }).description, DEFAULT_DESCRIPTION.en);
  assert.equal(pageMetaFor({ lang: 'en', show: { title: 'X', story: '<b>Hi</b>  there' } }).description, 'Hi there');
});

test('tabs, profile pages and the legal pages get their own titles', () => {
  assert.equal(pageMetaFor({ lang: 'ar', tab: 'home' }).title, 'BLACK X — أنمي ومانجا');
  assert.equal(pageMetaFor({ lang: 'en', tab: 'home' }).title, 'BLACK X — Anime & Manga');
  assert.equal(pageMetaFor({ lang: 'ar', tab: 'schedule' }).title, 'المواعيد — BLACK X');
  assert.equal(pageMetaFor({ lang: 'en', tab: 'community' }).title, 'Community — BLACK X');
  assert.equal(pageMetaFor({ lang: 'ar', tab: 'profile' }).title, 'حسابي — BLACK X');
  const policy = pageMetaFor({ lang: 'ar', tab: 'profile', profileTitle: LEGAL_DOCS.policy.titleAr, profileDescription: LEGAL_DOCS.policy.introAr });
  assert.equal(policy.title, 'سياسة الخصوصية — BLACK X');
  assert.ok(policy.description.startsWith('الصفحة دي بتشرح'));
  // a manga page wins over its tab
  assert.equal(pageMetaFor({ lang: 'en', tab: 'manga', manga: { title: 'Solo Leveling' } }).title, 'Solo Leveling — BLACK X');
});

test('legal documents: both languages, same sections, dated', () => {
  for (const id of ['policy', 'terms']) {
    const doc = LEGAL_DOCS[id];
    assert.ok(doc.titleAr && doc.titleEn && doc.introAr && doc.introEn);
    assert.ok(doc.sections.length >= 5);
    for (const s of doc.sections) {
      assert.ok(s.hAr && s.hEn, `${id}: section heading`);
      assert.equal(s.ar.length, s.en.length, `${id} / ${s.hEn}: same number of paragraphs in both languages`);
    }
  }
  assert.equal(LEGAL_DOCS.policy.path, '/privacy');
  assert.equal(LEGAL_DOCS.terms.path, '/terms');
});
