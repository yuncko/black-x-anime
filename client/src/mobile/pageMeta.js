/**
 * Browser-tab title and description of the website's app interface (2026-10-17): every page gets
 * its own title (and a title / manga page its own description from its story), so tabs, history,
 * shared links and search results say what the page is instead of one generic name.
 * Pure `pageMetaFor` (unit-tested) + `applyPageMeta` (DOM).
 */

const SITE = 'Hearbor';
export const DEFAULT_DESCRIPTION = {
  ar: 'تابع الأنمي والمانجا بالعربي: مواعيد الحلقات، قائمتك وسجل مشاهدتك، ومجتمع للنقاش.',
  en: 'Follow anime and manga in Arabic and English: episode schedules, your list and history, and a community.'
};
const TAB_TITLES = {
  catalog: ['الأنمي', 'Anime'],
  schedule: ['المواعيد', 'Schedule'],
  manga: ['المانجا', 'Manga'],
  community: ['المجتمع', 'Community'],
  profile: ['حسابي', 'Profile']
};

function clip(text, max = 158) {
  const s = String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s;
}

/**
 * { title, description } for what is on screen.
 *  show / manga: { title, story } of the open title page (wins over the tab);
 *  profileTitle / profileDescription: the open profile page (e.g. «سياسة الخصوصية»).
 */
export function pageMetaFor({ lang = 'ar', tab = 'home', show = null, manga = null, profileTitle = '', profileDescription = '' } = {}) {
  const ar = lang === 'ar';
  const fallback = ar ? DEFAULT_DESCRIPTION.ar : DEFAULT_DESCRIPTION.en;
  if (show && show.title) return { title: `${show.title} — ${SITE}`, description: clip(show.story) || fallback };
  if (manga && manga.title) return { title: `${manga.title} — ${SITE}`, description: clip(manga.story) || fallback };
  if (tab === 'profile' && profileTitle) return { title: `${profileTitle} — ${SITE}`, description: clip(profileDescription) || fallback };
  const t = TAB_TITLES[tab];
  if (t) return { title: `${ar ? t[0] : t[1]} — ${SITE}`, description: fallback };
  return { title: ar ? `${SITE} — أنمي ومانجا` : `${SITE} — Anime & Manga`, description: fallback };
}

function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  if (el.getAttribute('content') !== value) el.setAttribute('content', value);
}

export function applyPageMeta({ title, description }) {
  if (typeof document === 'undefined' || !title) return;
  if (document.title !== title) document.title = title;
  if (description) {
    setMeta('name', 'description', description);
    setMeta('property', 'og:description', description);
  }
  setMeta('property', 'og:title', title);
}
