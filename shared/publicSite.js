/**
 * Where the Hearbor website lives — one place for every absolute link to it.
 *
 * Since 2026-10-17 the site runs on Google AI Studio (Cloud Run) at black-x-anime.ai.studio:
 * Vercel paused the old black-x-anime.me deployment (Hobby limits). The website itself always
 * uses its own address (`window.location.origin`, same-origin `/api`); this constant is for the
 * places that have no address of their own — the APK (its API calls, share links, the update
 * link) and fixed texts (privacy policy, the «ملخصك» image).
 *
 * Changing it: also update client/public/robots.txt, client/public/sitemap.xml and the Open
 * Graph tags in client/index.html (client/test/publicSite.test.js checks they agree), and build a
 * new APK — installed apps keep calling the address they were built with.
 */
export const PUBLIC_SITE_HOST = 'black-x-anime.ai.studio';
export const PUBLIC_SITE_ORIGIN = `https://${PUBLIC_SITE_HOST}`;

/**
 * Earlier addresses. APKs up to v18.0 were built against black-x-anime.me and keep calling it;
 * the server still accepts requests from these origins.
 */
export const LEGACY_SITE_ORIGINS = Object.freeze(['https://black-x-anime.me', 'https://www.black-x-anime.me']);
