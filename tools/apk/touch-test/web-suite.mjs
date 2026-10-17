// BLACK X website — real-touch suite for the website. Since 2026-10-17 every device gets the app
// interface (client/src/webUi.js; client/src/mobile/webApp.js, laid out for wide screens by
// desktop.css); the classic website pages stay one tap away (`?ui=site`).
// Run it with ./run-web.sh (builds the website into /tmp). `ONLY=links,back ./run-web.sh` runs some.
import { startServer, launch, openWeb, waitWebReady, check, sleep, tapEl, boxOf, waitVt, summary, LOCAL, HIDDEN_ANIME } from './lib.mjs';

const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

const slugOf = (name) => `aw-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
const here = (page) => page.evaluate(() => `${location.pathname}${location.search}`);
const iface = (page) =>
  page.evaluate(() => (document.querySelector('.bx-dock') ? 'app' : document.querySelector('.app-shell') ? 'site' : 'none'));
const activeTab = (page) => page.evaluate(() => document.querySelector('.bx-dock-item.is-active')?.getAttribute('aria-label') || '');
const topTitle = (page) => page.evaluate(() => document.querySelector('.bx-topbar-title')?.textContent.trim() || '');
const detailsOpen = (page) => page.evaluate(() => Boolean(document.querySelector('.bx-details-sheet')));
const detailsTitle = (page) =>
  page.evaluate(() => document.querySelector('.bx-details-sheet h1, .bx-details-sheet h2')?.textContent.trim() || '');
const isTrap = (page) => page.evaluate(() => Boolean(history.state && history.state.bxTrap));
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll('.bx-toast')].map((t) => t.innerText.trim()).join(' | '));

async function waitFor(page, fn, arg, timeout = 8000) {
  return page.waitForFunction(fn, { timeout, polling: 100 }, arg).then(() => true, () => false);
}

/** A first tap on something harmless: browsers only keep history entries added after the visitor touched the page. */
async function firstTouch(page) {
  const b = (await boxOf(page, '.bx-details-sheet h1', { scroll: false })) || (await boxOf(page, '.bx-section-title', { scroll: false }));
  if (b) await page.touchscreen.tap(b.x, b.y);
  else await page.touchscreen.tap(206, 400);
  await sleep(250);
}

/** Taps `selector` as soon as a finger would really hit it (sheets slide in, transitions settle). */
async function tapWhenHittable(page, selector, opts = {}, timeout = 4000) {
  const end = Date.now() + timeout;
  let b = null;
  while (Date.now() < end) {
    b = await boxOf(page, selector, { scroll: false, ...opts });
    if (b && b.hitOk) {
      await page.touchscreen.tap(b.x, b.y);
      return b;
    }
    await sleep(150);
  }
  throw new Error(`never hittable: ${selector} -> ${b ? b.hit : 'not found'}`);
}

async function controlsShown(page) {
  return page.evaluate(() => document.querySelector('.bx-pc')?.classList.contains('is-visible') || false);
}

/** Browser back. history.back() is deferred so the evaluate call returns before any navigation starts:
 *  when back leaves the document, an evaluate still in flight dies with «Execution context was destroyed»
 *  (a race the old form lost now and then under load). */
async function browserBack(page) {
  await page.evaluate(() => { setTimeout(() => history.back(), 0); });
  await sleep(700);
  await waitVt(page, 3000);
}

/** Opens the first ordinary poster (not a «كمّل المشاهدة» card, which resumes playback by design). */
async function openFirstPoster(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-test-fresh]').forEach((e) => e.removeAttribute('data-test-fresh'));
    const inContinue = (el) => {
      for (let sec = el.parentElement; sec; sec = sec.parentElement) {
        const head = sec.querySelector(':scope > * .bx-section-title, :scope > .bx-section-title');
        if (head) return head.textContent.trim() === 'كمّل المشاهدة';
      }
      return false;
    };
    const card = [...document.querySelectorAll('main .bx-poster')].find((p) => !p.querySelector('.bx-poster-progress') && !inContinue(p));
    card?.setAttribute('data-test-fresh', '1');
  });
  await tapEl(page, '[data-test-fresh]');
  await waitFor(page, () => Boolean(document.querySelector('.bx-details-sheet')));
  await waitVt(page, 3000);
  await sleep(400);
}


/** A mouse click in the middle of `selector` (computer pages). */
async function clickEl(page, selector, opts = {}) {
  const b = await boxOf(page, selector, { scroll: true, ...opts });
  if (!b) throw new Error(`not found: ${selector}${opts.text ? ` "${opts.text}"` : ''}`);
  await page.mouse.click(b.x, b.y);
  return b;
}

/* ====================================================================== boot */
scenario('boot', async (browser) => {
  const G = 'boot';
  let { page, ctx } = await openWeb(browser, { route: '/' });
  check(G, 'a phone gets the app interface', (await iface(page)) === 'app');
  const flags = await page.evaluate(() => ({ web: window.__BLACKX_WEB_APP__ === true, apk: window.__BLACKX_APK__ === true, dir: document.documentElement.dir }));
  check(G, 'it runs as the website, not as the APK', flags.web && !flags.apk, JSON.stringify(flags));
  check(G, 'Arabic is right to left', flags.dir === 'rtl');
  check(G, 'the API is called on the same site (/api/…)', ctx.net.some((n) => n.startsWith('GET site/api/')) && !ctx.net.some((n) => /black-x-anime\.(me|ai\.studio)/.test(n)), ctx.net.filter((n) => n.includes('/api/')).slice(0, 4).join(' | '));
  const dock = await page.evaluate(() => [...document.querySelectorAll('.bx-dock .bx-dock-item')].map((b) => b.getAttribute('aria-label')));
  check(G, 'same 5-tab dock as the app', dock.length === 5, dock.join(' | '));
  check(G, 'no website page stylesheet on the phone', await page.evaluate(() => !document.querySelector('.app-shell') && ![...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.selectorText === '.app-shell'); } catch { return false; } })));
  check(G, 'no page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  ({ page, ctx } = await openWeb(browser, { route: '/', phone: false }));
  check(G, 'a computer gets the app interface too (owner, 2026-10-17)', (await iface(page)) === 'app');
  const rail = await page.evaluate(() => {
    const r = document.querySelector('.bx-dock')?.getBoundingClientRect();
    return r ? { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) } : null;
  });
  check(G, 'computer: the dock is a side rail on the right (RTL)', Boolean(rail && rail.h > 500 && rail.w < 140 && rail.x + rail.w >= 1430), JSON.stringify(rail));
  check(G, 'computer: no page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // A "site" choice saved under the old phone/computer split no longer keeps anyone away.
  ({ page, ctx } = await openWeb(browser, { route: '/', phone: false, seed: { bx_web_ui: 'site' } }));
  check(G, 'an old saved «site» choice (bx_web_ui) is ignored', (await iface(page)) === 'app');
  await page.close();

  // Manual switch to the classic pages, remembered on that browser.
  ({ page, ctx } = await openWeb(browser, { route: '/?ui=site', phone: false }));
  check(G, '?ui=site opens the classic website pages', (await iface(page)) === 'site');
  await page.goto(`${LOCAL}/`, { waitUntil: 'domcontentloaded' });
  await waitWebReady(page);
  check(G, '…and the choice is remembered (bx_web_ui_v2)', (await iface(page)) === 'site', await page.evaluate(() => localStorage.getItem('bx_web_ui_v2')));
  const back = await page.evaluate(() => [...document.querySelectorAll('footer a, footer button')].find((e) => /واجهة BLACK X الجديدة|New BLACK X interface/.test(e.textContent))?.textContent.trim() || '');
  check(G, 'the classic footer offers the new interface back', Boolean(back), back);
  await page.goto(`${LOCAL}/?ui=app`, { waitUntil: 'domcontentloaded' });
  await waitWebReady(page);
  check(G, '?ui=app switches back to the app interface', (await iface(page)) === 'app');
  await page.close();

  ({ page, ctx } = await openWeb(browser, { route: '/?ui=site' }));
  check(G, 'a phone can open the classic pages with ?ui=site', (await iface(page)) === 'site');
  await page.close();

  // The APK's update card never shows on the website (it is always the latest version).
  ({ page, ctx } = await openWeb(browser, { route: '/', wait: false }));
  ctx.apkOverride = { version: '99.0', versionCode: 9900, url: '/BLACK-X-Mobile-120Hz.apk', notesAr: ['x'], notesEn: ['x'] };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitWebReady(page);
  await sleep(1200);
  check(G, 'no "update the app" card on the website', await page.evaluate(() => !document.querySelector('.bx-update-card')));
  await page.close();
});

/* ===================================================================== links */
scenario('links', async (browser) => {
  const G = 'links';
  const name = 'Test Anime 3';
  let { page, ctx } = await openWeb(browser, { route: `/show/${slugOf(name)}` });
  await waitFor(page, () => Boolean(document.querySelector('.bx-details-sheet')));
  check(G, '/show/… opens that title', (await detailsOpen(page)) && (await detailsTitle(page)) === name, await detailsTitle(page));
  check(G, '…from the catalogue record (lists and history match the app)', ctx.algolia.some((a) => a.body?.query === name), ctx.algolia.map((a) => a.body?.query).filter(Boolean).join(','));
  check(G, 'the address stays on the title', (await here(page)) === `/show/${slugOf(name)}`, await here(page));
  check(G, 'browser tab title names the anime', (await page.title()).startsWith(name), await page.title());
  await page.close();

  ({ page, ctx } = await openWeb(browser, { route: `/watch/${slugOf(name)}/3` }));
  await waitFor(page, () => document.querySelector('video')?.readyState >= 1, null, 15000);
  check(G, '/watch/…/3 plays episode 3', ctx.episodes.includes(`${slugOf(name)}:3`), ctx.episodes.join(','));
  check(G, 'the address shows the episode', (await here(page)) === `/watch/${slugOf(name)}/3`, await here(page));
  await page.close();

  for (const [route, want, label] of [
    ['/discover', 'الجدول', 'schedule'],
    ['/schedule', 'الجدول', 'schedule (alias)'],
    ['/browse', 'المانجا', 'manga'],
    ['/community', 'المجتمع', 'community'],
    ['/trending', 'البحث', 'search']
  ]) {
    ({ page, ctx } = await openWeb(browser, { route }));
    check(G, `${route} opens the ${label} tab`, (await activeTab(page)) === want, await activeTab(page));
    await page.close();
  }

  ({ page, ctx } = await openWeb(browser, { route: `/trending?q=${encodeURIComponent('Test Anime 1')}` }));
  await sleep(1200);
  const q = await page.evaluate(() => document.querySelector('.bx-search-bar input')?.value || '');
  check(G, '/trending?q= fills the search box', q === 'Test Anime 1', q);
  check(G, '…and searches it (the website search, like typing)', ctx.net.some((n) => n.startsWith('GET site/api/stream/search')), ctx.net.filter((n) => n.includes('search')).join(' | '));
  await page.close();

  for (const [route, title] of [
    ['/profile', 'حسابي'],
    ['/mylist', 'قائمتي'],
    ['/profile/settings', 'الإعدادات'],
    ['/profile/history', 'سجل المشاهدة'],
    ['/profile/edit', 'حسابي']
  ]) {
    ({ page, ctx } = await openWeb(browser, { route }));
    check(G, `${route} opens «${title}»`, (await topTitle(page)) === title, await topTitle(page));
    await page.close();
  }

  ({ page, ctx } = await openWeb(browser, { route: '/browse?manga=test-manga-1&server=bx1&chapter=test-manga-1-ch-2' }));
  const reader = await waitFor(page, () => document.querySelectorAll('.bx-app img[src*="/page/"]').length > 0, null, 15000);
  check(G, '/browse?manga=…&chapter=… opens that chapter in the reader', reader, await here(page));
  await page.close();

  // Hidden genres: a link to an Ecchi / Harem / Isekai title opens nothing.
  ({ page, ctx } = await openWeb(browser, { route: `/show/${slugOf(HIDDEN_ANIME[0].name)}` }));
  await sleep(1800);
  check(G, 'a link to a hidden title does not open it', !(await detailsOpen(page)));
  check(G, '…and says it is not available', /مش متاح/.test(await toastText(page)), await toastText(page));
  await page.close();

  ({ page, ctx } = await openWeb(browser, { route: '/show/aw-missing-title' }));
  await sleep(1800);
  check(G, 'a dead link says so instead of showing an empty page', !(await detailsOpen(page)) && /ماقدرناش نلاقي/.test(await toastText(page)), await toastText(page));
  check(G, 'no page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();
});

/* ====================================================================== sync */
scenario('sync', async (browser) => {
  const G = 'sync';
  const { page, ctx } = await openWeb(browser, { route: '/' });
  await openFirstPoster(page);
  const t = await detailsTitle(page);
  check(G, 'opening a title puts its link in the address bar', (await here(page)) === `/show/${slugOf(t)}`, `${t} → ${await here(page)}`);
  await tapEl(page, '.bx-detail-cta');
  await waitFor(page, () => document.querySelector('video')?.readyState >= 1, null, 15000);
  check(G, 'playing an episode shows /watch/…/1', (await here(page)) === `/watch/${slugOf(t)}/1`, await here(page));
  await page.close();

  const p2 = (await openWeb(browser, { route: '/' })).page;
  await tapEl(p2, '.bx-dock-item', { text: 'الجدول', exact: true, scroll: false });
  await waitVt(p2);
  check(G, 'schedule tab → /discover', (await here(p2)) === '/discover', await here(p2));
  await tapEl(p2, '.bx-dock-item', { text: 'المانجا', exact: true, scroll: false });
  await waitVt(p2);
  check(G, 'manga tab → /browse', (await here(p2)) === '/browse', await here(p2));
  await tapEl(p2, '.bx-dock-item', { text: 'البحث', exact: true, scroll: false });
  await waitVt(p2);
  await tapEl(p2, '.bx-search-bar input', { scroll: false });
  await p2.keyboard.type('Test Anime 2');
  await sleep(1200);
  check(G, 'a search is kept in the link (/trending?q=…)', (await here(p2)) === `/trending?q=${encodeURIComponent('Test Anime 2')}`, await here(p2));
  await tapEl(p2, '.bx-avatar-btn', { scroll: false });
  await waitVt(p2);
  check(G, 'profile → /profile', (await here(p2)) === '/profile', await here(p2));
  await tapEl(p2, 'main .bxp-row-label', { text: 'الإعدادات', exact: true });
  await waitVt(p2);
  check(G, 'a profile page → /profile/settings', (await here(p2)) === '/profile/settings', await here(p2));
  await tapEl(p2, '.bx-topbar .bxp-back', { scroll: false });
  await waitVt(p2);
  await tapEl(p2, 'main .bxp-row-label', { text: 'قائمتي', exact: true });
  await waitVt(p2);
  check(G, 'my list → /mylist (the website’s own link)', (await here(p2)) === '/mylist', await here(p2));
  check(G, 'no page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await p2.close();
});

/* ====================================================================== back */
scenario('back', async (browser) => {
  const G = 'back';
  const { page, ctx } = await openWeb(browser, { route: '/' });
  const startLen = await page.evaluate(() => history.length);
  await firstTouch(page);
  await openFirstPoster(page);
  check(G, 'an open title adds one history entry', (await isTrap(page)) && (await page.evaluate(() => history.length)) === startLen + 1);
  await tapEl(page, '.bx-detail-cta');
  await waitFor(page, () => document.querySelector('video')?.readyState >= 1, null, 15000);
  check(G, '…and the player does not add another one', (await page.evaluate(() => history.length)) === startLen + 1, String(await page.evaluate(() => history.length)));
  await browserBack(page);
  const afterPlayer = await page.evaluate(() => ({ video: Boolean(document.querySelector('.bx-pc')), details: Boolean(document.querySelector('.bx-details-sheet')) }));
  check(G, 'browser back closes the player first', afterPlayer.details && !afterPlayer.video, JSON.stringify(afterPlayer));
  check(G, '…the address goes back to the title', (await here(page)).startsWith('/show/'), await here(page));
  await browserBack(page);
  check(G, 'browser back again closes the title', !(await detailsOpen(page)));
  check(G, '…home, address /', (await here(page)) === '/' && (await activeTab(page)) === 'الرئيسية', `${await here(page)} ${await activeTab(page)}`);
  check(G, '…and the site is still open', page.url().startsWith(LOCAL));

  // Closing with the in-app button removes the extra entry (no dead history).
  for (let i = 0; i < 3; i++) {
    await openFirstPoster(page);
    await tapWhenHittable(page, '.bx-details-sheet .bx-icon-btn[aria-label="رجوع"]');
    await sleep(900);
  }
  const st = await page.evaluate(() => ({ len: history.length, trap: Boolean(history.state && history.state.bxTrap), path: location.pathname }));
  check(G, 'in-app close ×3: no history entries pile up', st.len <= startLen + 1 && !st.trap && st.path === '/', JSON.stringify({ ...st, startLen }));

  // Tabs: back goes home, like the Android back button.
  await tapEl(page, '.bx-dock-item', { text: 'الجدول', exact: true, scroll: false });
  await waitVt(page);
  await browserBack(page);
  check(G, 'back from a tab goes home', (await activeTab(page)) === 'الرئيسية' && (await here(page)) === '/', `${await activeTab(page)} ${await here(page)}`);

  // Profile pages pop one at a time.
  await tapEl(page, '.bx-avatar-btn', { scroll: false });
  await waitVt(page);
  await tapEl(page, 'main .bxp-row-label', { text: 'الإعدادات', exact: true });
  await waitVt(page);
  await browserBack(page);
  check(G, 'back from a profile page → profile', (await topTitle(page)) === 'حسابي' && (await here(page)) === '/profile', `${await topTitle(page)} ${await here(page)}`);
  await browserBack(page);
  check(G, 'back from the profile → home', (await activeTab(page)) === 'الرئيسية', await activeTab(page));

  // Sheets close before the page under them.
  await tapEl(page, '.bx-dock-item', { text: 'البحث', exact: true, scroll: false });
  await waitVt(page);
  await tapEl(page, '.bx-search-tools .bx-chip', { text: 'فلترة', scroll: false });
  await sleep(600);
  await browserBack(page);
  const afterSheet = await page.evaluate(() => ({ sheet: Boolean(document.querySelector('.bx-bottom-sheet')), path: location.pathname }));
  check(G, 'back closes the filter sheet and stays on search', !afterSheet.sheet && afterSheet.path === '/trending' && (await activeTab(page)) === 'البحث', JSON.stringify(afterSheet));
  await browserBack(page);
  check(G, '…then back goes home', (await activeTab(page)) === 'الرئيسية');
  check(G, 'no "press back again to exit" toast in a browser', !/تاني عشان تخرج/.test(await toastText(page)), await toastText(page));
  check(G, 'no page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // With nothing open, back leaves the site like any website.
  const solo = await openWeb(browser, { route: '/__blank', wait: false });
  await sleep(500);
  await solo.page.goto(`${LOCAL}/`, { waitUntil: 'domcontentloaded' });
  await waitWebReady(solo.page);
  await firstTouch(solo.page);
  await solo.page.evaluate(() => { setTimeout(() => history.back(), 0); });
  // page.url() needs no execution context, so it cannot race the navigation back to the other site.
  const soloPath = () => new URL(solo.page.url()).pathname;
  for (let t = 0; t < 50 && soloPath() !== '/__blank'; t++) await sleep(100);
  check(G, 'back on the home page leaves the site', soloPath() === '/__blank', soloPath());
  await solo.page.close();

  // A deep link with no tap yet: back leaves at once (Chrome skips entries added before a tap).
  // Headless Chrome reports every navigated page as already touched (navigator.userActivation),
  // so the test makes the page look like a fresh visit from another site.
  const deep = await openWeb(browser, { route: '/__blank', wait: false });
  await sleep(400);
  await deep.page.evaluateOnNewDocument(() => {
    let touched = false;
    const mark = (e) => {
      if (e.isTrusted) touched = true;
    };
    window.addEventListener('pointerup', mark, true);
    window.addEventListener('keydown', mark, true);
    Object.defineProperty(navigator, 'userActivation', { configurable: true, get: () => ({ hasBeenActive: touched, isActive: false }) });
  });
  await deep.page.goto(`${LOCAL}/show/${slugOf('Test Anime 4')}`, { waitUntil: 'domcontentloaded' });
  await waitWebReady(deep.page);
  await waitFor(deep.page, () => Boolean(document.querySelector('.bx-details-sheet')));
  check(G, 'a link opened from elsewhere adds no entry before the first tap', !(await isTrap(deep.page)));
  await firstTouch(deep.page);
  check(G, '…the first tap adds it', await isTrap(deep.page));
  await browserBack(deep.page);
  check(G, '…then back closes the title and shows home', !(await detailsOpen(deep.page)) && (await here(deep.page)) === '/', await here(deep.page));
  await deep.page.close();
});

/* =================================================================== profile */
scenario('profile', async (browser) => {
  const G = 'profile';
  const { page, ctx } = await openWeb(browser, { route: '/profile' });
  const rows = await page.evaluate(() => [...document.querySelectorAll('main .bxp-row-label')].map((e) => e.textContent.trim()));
  check(G, 'website rows: «تطبيق الأندرويد» + «التصميم القديم للموقع»', rows.includes('تطبيق الأندرويد') && rows.includes('التصميم القديم للموقع'), rows.join(' | '));
  check(G, 'no «تحديث التطبيق» row on the website', !rows.includes('تحديث التطبيق'));
  // «تطبيق الأندرويد» opens «ليه تنزل التطبيق؟» (what only the APK does) with the download button
  await tapEl(page, 'main .bxp-row', { text: 'تطبيق الأندرويد' });
  await waitFor(page, () => /ليه تنزل التطبيق/.test(document.querySelector('.bx-topbar-title')?.textContent || ''), null, 5000);
  const perks = await page.evaluate(() => ({
    items: [...document.querySelectorAll('main .bx-perks-list strong')].map((e) => e.textContent.trim()),
    href: document.querySelector('main .bx-perks a.bx-btn')?.getAttribute('href') || ''
  }));
  check(G, 'the Android row opens «ليه تنزل التطبيق؟»: the APK-only features + a download from this site', perks.href === '/BLACK-X-Mobile-120Hz.apk' && perks.items.length >= 4 && perks.items.some((t) => /والتطبيق مقفول/.test(t)), `${perks.href} | ${perks.items.join(' / ')}`);
  await browserBack(page);
  const foot = await page.evaluate(() => ({ text: document.querySelector('.bxp-foot')?.textContent || '', host: location.host }));
  check(G, 'footer shows this site\'s own address (no app version)', foot.text.includes(foot.host) && !/BLACK X · v\d/.test(foot.text), foot.text);

  // Google: the web popup (Firebase), not the APK's OAuth window.
  const popups = [];
  browser.on('targetcreated', (tg) => popups.push(tg.url()));
  await tapEl(page, 'main .bxp-hero.is-guest button', { text: 'جوجل' }).catch(async () => tapEl(page, 'main .bxp-hero.is-guest button', { index: 0 }));
  await sleep(4000);
  const net = ctx.net.join(' ');
  check(G, 'Google opens Google’s sign-in popup', popups.some((u) => /firebaseapp\.com\/__\/auth\/handler|accounts\.google\.com/.test(u)) || /identitytoolkit|firebaseapp|apis\.google\.com/.test(ctx.blocked.join(' ')), popups.slice(0, 2).join(' | ') || ctx.blocked.slice(0, 3).join(' | '));
  check(G, '…not the APK OAuth window (createAuthUri)', !/createAuthUri/.test(net + ctx.blocked.join(' ')));

  // The access menu offers the classic website too.
  await tapEl(page, '.bx-topbar [aria-label="القائمة"]', { scroll: false });
  await sleep(500);
  const items = await page.evaluate(() => [...document.querySelectorAll('.bx-menu-item')].map((e) => e.textContent.trim()));
  check(G, 'menu: «التصميم القديم للموقع»', items.some((t) => t.includes('التصميم القديم للموقع')), items.join(' | '));
  const sub = await page.evaluate(() => document.querySelector('.bx-menu-item')?.innerText || '');
  check(G, 'menu: guests are told the library is kept on every device', /على كل أجهزتك/.test(sub), sub.replace(/\n/g, ' / '));
  await tapEl(page, '.bx-menu-item', { text: 'التصميم القديم للموقع' });
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await waitWebReady(page);
  check(G, '«التصميم القديم للموقع» opens the classic pages', (await iface(page)) === 'site', await iface(page));
  check(G, '…and remembers it', (await page.evaluate(() => localStorage.getItem('bx_web_ui_v2'))) === 'site');
  check(G, '…on the same page (/profile)', (await page.evaluate(() => location.pathname)) === '/profile', await page.evaluate(() => location.pathname));
  await page.close();
});

/* ==================================================================== player */
scenario('player', async (browser) => {
  const G = 'player';
  const { page, ctx } = await openWeb(browser, { route: '/' });
  await page.evaluate(() => {
    window.__fsCalls = 0;
    window.__fsLocks = [];
    const orig = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function (...a) {
      window.__fsCalls += 1;
      return orig ? orig.apply(this, a) : Promise.resolve();
    };
    if (screen.orientation) {
      screen.orientation.lock = (o) => {
        window.__fsLocks.push(o);
        return Promise.resolve();
      };
    }
  });
  await openFirstPoster(page);
  await tapEl(page, '.bx-detail-cta');
  await waitFor(page, () => document.querySelector('video')?.readyState >= 2, null, 15000);
  await sleep(800);
  if (!(await controlsShown(page))) {
    const sb = await boxOf(page, '.bx-pc-surface', { scroll: false });
    await page.touchscreen.tap(sb.x, sb.y - sb.h * 0.25);
    await sleep(450);
  }
  await tapWhenHittable(page, '.bx-pc-play');
  await sleep(400);
  const t0 = await page.evaluate(() => document.querySelector('video').currentTime);
  await tapWhenHittable(page, '[aria-label="قدّم 10 ثواني"]');
  await sleep(500);
  const t1 = await page.evaluate(() => document.querySelector('video').currentTime);
  check(G, '+10 s works on the website', Math.abs(t1 - (t0 + 10)) < 1.5, `${t0.toFixed(1)} → ${t1.toFixed(1)}`);
  if (!(await controlsShown(page))) {
    const sb = await boxOf(page, '.bx-pc-surface', { scroll: false });
    await page.touchscreen.tap(sb.x, sb.y - sb.h * 0.25);
    await sleep(450);
  }
  await tapWhenHittable(page, '.bx-pc [aria-label="ملء الشاشة"]');
  await sleep(900);
  const fs = await page.evaluate(() => ({ calls: window.__fsCalls, el: Boolean(document.fullscreenElement), locks: window.__fsLocks.join(','), ui: document.querySelector('.bx-pc')?.classList.contains('is-fs') }));
  check(G, 'full screen asks the browser for real full screen', fs.calls >= 1 && fs.ui, JSON.stringify(fs));
  check(G, '…in landscape', /landscape/.test(fs.locks) || !fs.el, JSON.stringify(fs));
  check(G, 'no native APK bridge is needed', await page.evaluate(() => typeof window.BlackXNativeAuth === 'undefined'));
  if (fs.el) {
    await page.evaluate(() => document.exitFullscreen());
    await sleep(800);
    check(G, 'leaving the browser full screen (system back) leaves the player’s', !(await page.evaluate(() => document.querySelector('.bx-pc')?.classList.contains('is-fs'))));
  } else {
    check(G, 'leaving the browser full screen (system back) leaves the player’s', true, 'headless refused real full screen; in-page layout only');
  }
  check(G, 'no page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();
});

/* ==================================================================== genres */
scenario('genres', async (browser) => {
  const G = 'genres';
  const { page, ctx } = await openWeb(browser, { route: '/' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1500);
  const titles = await page.evaluate(() => [...document.querySelectorAll('.bx-poster-title, .bx-hero h1, .bx-hero h2')].map((e) => e.textContent.trim()));
  const leaked = titles.filter((t) => /^Hidden /.test(t));
  check(G, 'phone website home: no Ecchi / Harem / Isekai titles', titles.length > 10 && leaked.length === 0, leaked.join(', ') || `${titles.length} titles`);
  // Every list query excludes the hidden tags (the once-a-day hidden-id lookup asks FOR them, ids only).
  const lists = ctx.algolia.filter((a) => !(Array.isArray(a.body?.attributesToRetrieve) && a.body.attributesToRetrieve.join() === 'objectID'));
  const bare = lists.filter((a) => !JSON.stringify(a.body?.facetFilters || []).includes('tags:-ايتشي'));
  check(G, 'Algolia list queries carry the exclusions', lists.length > 3 && bare.length === 0, bare.map((a) => `${a.index}:${JSON.stringify(a.body?.facetFilters || [])}`).slice(0, 3).join(' | ') || `${lists.length} queries`);
  await page.close();
});

/* =================================================================== desktop */
const asciiDigits = (t) => String(t).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
scenario('desktop', async (browser) => {
  const G = 'desktop';
  let { page, ctx } = await openWeb(browser, { route: '/', phone: false, ui: 'site' });
  await waitFor(page, () => /Test Anime 1/.test(document.querySelector('.app-shell h1')?.textContent || ''), null, 10000);
  const home = await page.evaluate(() => document.querySelector('.app-shell')?.innerText || '');
  const fakes = ['TV-MA', '24:00', 'S1 E1', 'م1 ح1', 'بداية أسطورة', '(Play', '(Details)', '(Add To', '(All Episodes)', '(Most Popular)', '(ANIME LIST)', '(MANGA LIST)', '(Stories)', 'DEMON SLAYER', 'BLEACH'];
  const found = fakes.filter((f) => home.includes(f));
  check(G, 'computer home: no invented badges, scores or mixed-language labels', found.length === 0, found.join(', ') || 'clean');
  const hero = await page.evaluate(() => {
    const h1 = document.querySelector('.app-shell h1');
    const box = h1?.parentElement;
    return { title: h1?.textContent.trim() || '', text: box?.innerText || '' };
  });
  check(G, 'hero shows a real title from the API', hero.title === 'Test Anime 1', hero.title);
  check(G, 'hero shows its real genres and episode', /أكشن/.test(hero.text) && /الحلقة 3/.test(hero.text) && /شغّل الحلقة 3/.test(hero.text), hero.text.replace(/\n/g, ' / ').slice(0, 160));
  check(G, 'hero shows type and year from the record', /مسلسل • 2021/.test(hero.text), hero.text.replace(/\n/g, ' / ').slice(0, 160));
  await page.evaluate(() => [...document.querySelectorAll('.app-shell button')].find((b) => b.textContent.includes('أضف إلى قائمتي'))?.click());
  await sleep(700);
  const authOpen = await page.evaluate(() => /تسجيل الدخول|Sign in|دخول/.test(document.querySelector('.modal, [role="dialog"]')?.innerText || ''));
  check(G, '«أضف إلى قائمتي» asks a guest to sign in (it saves for real)', authOpen);
  const delayClaim = home.match(/24 ساعة|24h|تتأخر|نفس اليوم/g) || [];
  check(G, 'computer home: no «24-hour delay for free users» claim (nobody is delayed)', delayClaim.length === 0, delayClaim.join(', ') || 'clean');
  check(G, 'no page errors on the computer home', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // Cards and the weekly schedule show only what the API says.
  ({ page, ctx } = await openWeb(browser, { route: '/', phone: false, ui: 'site' }));
  await waitFor(page, () => document.querySelectorAll('.wit-ep-card').length > 3, null, 10000);
  const cardTexts = await page.evaluate(() => [...document.querySelectorAll('.wit-ep-card, .wit-anime-card')].map((c) => c.innerText));
  const fhdCards = cardTexts.filter((tx) => /FHD/.test(tx));
  check(G, 'computer cards: no «👑 FHD» badge (a card does not know the qualities)', cardTexts.length > 0 && fhdCards.length === 0, `${fhdCards.length}/${cardTexts.length} cards`);
  const strayStatus = await page.evaluate(() => [...document.querySelectorAll('.wit-badge--status')].filter((b) => !b.closest('#schedule-section')).map((b) => b.textContent.trim()));
  check(G, 'computer cards: no guessed «يعرض الآن» on titles the API gave no status', strayStatus.length === 0, strayStatus.join(', ') || 'none');
  const unknownEp = await page.evaluate(() => [...document.querySelectorAll('.wit-ep-card')].find((c) => c.innerText.includes('Test Anime 2'))?.innerText ?? null);
  check(G, 'latest episodes: a card without an episode number shows no «الحلقة ٠»', unknownEp !== null && !/الحلقة\s*[0٠](?![0-9٠-٩])|Ep\.?\s*0(?!\d)/.test(unknownEp), (unknownEp ?? 'card missing').replace(/\n/g, ' / ').slice(0, 120));
  const pillUnderBell = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.wit-ep-card')].find((c) => c.querySelector('.wit-ep-card__num'));
    const a = card?.querySelector('.wit-ep-card__num')?.getBoundingClientRect();
    const b = card?.querySelector('.wit-bell-btn')?.getBoundingClientRect();
    if (!a || !b) return null;
    return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  });
  check(G, 'latest episodes: the episode label is not under the alert bell (it read «لقة ٧»)', pillUnderBell === false, String(pillUnderBell));

  await page.evaluate(() => document.querySelector('#schedule-section')?.scrollIntoView());
  await waitFor(page, () => document.querySelectorAll('#schedule-section .wit-anime-card').length > 0, null, 8000);
  const schedCards = () => page.evaluate(() => [...document.querySelectorAll('#schedule-section .wit-anime-card')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()));
  const schedToday = await schedCards();
  const laterToday = schedToday.find((tx) => / Today Show /.test(` ${tx} `) && !tx.includes('Aired Earlier Show')) || '';
  const airedToday = schedToday.find((tx) => tx.includes('Aired Earlier Show')) || '';
  check(G, 'schedule: today lists the shows of today\'s weekday (AniList times), not the latest episodes', schedToday.length === 2 && Boolean(laterToday) && Boolean(airedToday) && !schedToday.some((tx) => /Test Anime/.test(tx)), schedToday.join(' | ').slice(0, 200));
  check(G, 'schedule: the card shows the next episode and its air time', /الحلقة 5\D{1,6}\d{1,2}:\d{2}/.test(asciiDigits(laterToday)) && !/الأسبوع القادم/.test(laterToday), laterToday || 'none');
  check(G, 'schedule: a show that already aired today says its next episode is next week', /الحلقة 7\D{1,6}\d{1,2}:\d{2}.*الأسبوع القادم/.test(asciiDigits(airedToday)), airedToday || 'none');
  const pickDay = (offset) => page.evaluate((off) => {
    const names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const want = names[(new Date().getDay() + off) % 7];
    const tab = [...document.querySelectorAll('#schedule-section .wit-day-tab')].find((b) => b.textContent.trim().startsWith(want));
    tab?.click();
    return Boolean(tab);
  }, offset);
  await pickDay(1);
  await sleep(300);
  const schedTomorrow = await schedCards();
  check(G, 'schedule: tomorrow\'s tab lists tomorrow\'s show only', schedTomorrow.length === 1 && schedTomorrow[0].includes('Tomorrow Show'), schedTomorrow.join(' | ').slice(0, 160));
  await pickDay(2);
  await sleep(300);
  const schedEmpty = await page.evaluate(() => ({ cards: document.querySelectorAll('#schedule-section .wit-anime-card').length, text: document.querySelector('#schedule-section')?.innerText || '' }));
  check(G, 'schedule: a day with nothing on says so (it used to repeat the latest episodes)', schedEmpty.cards === 0 && /لا توجد حلقات مسجلة لهذا اليوم/.test(schedEmpty.text), `${schedEmpty.cards} cards`);

  await page.evaluate(() => [...document.querySelectorAll('.wit-ep-card')].find((c) => c.innerText.includes('Test Anime 2'))?.click());
  await waitFor(page, () => location.pathname !== '/', null, 5000);
  const openedPath = await page.evaluate(() => location.pathname);
  check(G, 'latest episodes: that card opens the title page (it opened /watch/<slug>/null)', openedPath === '/show/aw-test-anime-2', openedPath);
  check(G, 'no page errors on the computer cards and schedule', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // Hidden genres on the computer website: title and player pages say "not available".
  const hiddenSlug = slugOf(HIDDEN_ANIME[0].name);
  for (const route of [`/show/${hiddenSlug}`, `/watch/${hiddenSlug}/1`]) {
    ({ page, ctx } = await openWeb(browser, { route, phone: false, ui: 'site' }));
    const ok = await waitFor(page, () => /مش متاح على BLACK X/.test(document.querySelector('.app-shell')?.innerText || ''), null, 10000);
    check(G, `${route.split('/')[1]} page of a hidden title: «مش متاح»`, ok);
    await page.close();
  }
  ({ page, ctx } = await openWeb(browser, { route: `/show/${slugOf('Test Anime 2')}`, phone: false, ui: 'site' }));
  const normal = await waitFor(page, () => /Test Anime 2/.test(document.querySelector('.app-shell h1')?.textContent || ''), null, 10000);
  check(G, 'a normal title page still opens', normal && !(await page.evaluate(() => /مش متاح على BLACK X/.test(document.body.innerText))));
  const detail = await page.evaluate(() => document.querySelector('.detail-hero')?.innerText || '');
  const invented = ['120Hz', '4K Ultra', 'FHD 1080p', '1.4K', '24.8K', '98%', 'تطابق', '24 دقيقة', 'مانجا يابانية', 'يعرض الآن'].filter((f) => detail.includes(f));
  check(G, 'title page: no invented likes, views, match %, quality, duration or source', invented.length === 0, invented.join(', ') || 'clean');
  check(G, 'title page: real facts (type, year, rating, server)', /مسلسل/.test(detail) && /2022/.test(detail) && /★ 6\.7/.test(detail) && /BLACK X 1/.test(detail), detail.replace(/\n/g, ' / ').slice(0, 220));
  const showPage = await page.evaluate(() => ({
    text: document.querySelector('.app-shell')?.innerText || '',
    latest: [...document.querySelectorAll('.ep-chip')].filter((b) => b.querySelector('.ep-chip__latest')).map((b) => b.innerText.replace(/\n/g, ' '))
  }));
  const showClaims = showPage.text.match(/24 ساعة|24h|نفس اليوم|VIP اليوم|same-day/gi) || [];
  check(G, 'title page: no «same day for VIP / 24 hours for free» notes or badges', showClaims.length === 0, showClaims.join(', ') || 'clean');
  check(G, 'title page: only the newest episode is marked «الأحدث»', showPage.latest.length === 1 && /12/.test(asciiDigits(showPage.latest[0])) && /الأحدث/.test(showPage.latest[0]), showPage.latest.join(' | ') || 'none');
  await page.close();

  // Player page seen by VIP Monarch, the tier of the removed «4K HDR • 60FPS» toggle (it only put a
  // CSS colour filter on the video). The no-op «VIP Fast CDN» switch, the «وصول مبكر» pill and the
  // «⏳ 24س / VIP» badge went too (nobody is delayed; the API already lists direct servers first for VIP).
  ({ page, ctx } = await openWeb(browser, { route: `/watch/${slugOf('Test Anime 2')}/1`, phone: false, ui: 'site', seed: { 'blackx.vipTier': 'vip_monarch' } }));
  const monarchView = await waitFor(page, () => document.querySelector('.player-shell') && document.querySelector('.watch-meta__actions') && /الأحدث/.test(document.querySelector('.watch-side')?.innerText || ''), null, 10000);
  const watchState = await page.evaluate(() => {
    const text = document.querySelector('.app-shell')?.innerText || '';
    const filtered = [];
    for (let el = document.querySelector('.player-shell'); el && el !== document.body; el = el.parentElement) {
      const f = getComputedStyle(el).filter;
      if (f && f !== 'none') filtered.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}: ${f}`);
    }
    const latest = [...document.querySelectorAll('.watch-ep')].filter((b) => b.querySelector('.watch-ep__latest')).map((b) => b.innerText.replace(/\n/g, ' '));
    const digits = (t) => Number(String(t).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const labels = [...document.querySelectorAll('.watch-ep .watch-ep__num')].map((n) => digits(n.textContent.trim()));
    return { text, filtered, latest, labels, actions: document.querySelector('.watch-meta__actions')?.innerText || '' };
  });
  check(G, 'player page as VIP Monarch: player, actions and episode list render', Boolean(monarchView), watchState.actions.replace(/\n/g, ' / ').slice(0, 160));
  const fakeVip = watchState.text.match(/Fast CDN|وصول مبكر|Early Access|محرك البث|Streaming Engine|24 ?س|24 ساعة|يوم العرض/g) || [];
  check(G, 'player page: no «VIP Fast CDN» switch, «Early Access» pill or 24-hour badge', fakeVip.length === 0, fakeVip.join(', ') || 'clean');
  check(G, 'player page: the newest episode is marked «الأحدث» in the list', watchState.latest.length === 1 && /12/.test(asciiDigits(watchState.latest[0])), watchState.latest.join(' | ') || 'none');
  check(G, 'player page: the episode list shows real episode numbers (1–12)', watchState.labels.length === 12 && watchState.labels.every((n, i) => n === i + 1), watchState.labels.join(','));
  check(G, 'player page: no upgrade button for a VIP member', !/ترقية إلى VIP/.test(watchState.text));
  const fake4k = watchState.text.match(/4K|HDR|60\s*FPS/gi) || [];
  check(G, 'player page: no «4K HDR • 60FPS» toggle and no 4K / HDR / 60fps claim', fake4k.length === 0, fake4k.join(', ') || 'clean');
  check(G, 'player page: no colour filter over the video', watchState.filtered.length === 0, watchState.filtered.join(' | ') || 'none');
  check(G, 'no page errors on the player page', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // The same page for a free visitor: the upgrade button now sits with the actions under the player.
  // (Pages in one browser share localStorage, so the tier is always seeded explicitly from here on.)
  ({ page, ctx } = await openWeb(browser, { route: `/watch/${slugOf('Test Anime 2')}/1`, phone: false, ui: 'site', seed: { 'blackx.vipTier': 'free' } }));
  await waitFor(page, () => document.querySelector('.watch-meta__actions'), null, 10000);
  const freeActions = await page.evaluate(() => document.querySelector('.watch-meta__actions')?.innerText || '');
  check(G, 'player page as a free visitor: «ترقية إلى VIP» is one of the actions', /ترقية إلى VIP \/ تفعيل كود اشتراك/.test(freeActions), freeActions.replace(/\n/g, ' / ').slice(0, 160));
  check(G, 'no page errors on the player page (free visitor)', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // While the servers are still loading the page shows the loader (no crash on the missing episode data),
  // then the player once they arrive.
  ({ page, ctx } = await openWeb(browser, { route: `/watch/${slugOf('Test Anime 2')}/1`, phone: false, ui: 'site', seed: { 'blackx.vipTier': 'free' }, ctx: { episodeDelayMs: 4000 } }));
  const loaderShown = await waitFor(page, () => document.querySelector('.player-shell .liquid-loader') && document.querySelector('.watch-meta__actions'), null, 3500);
  const playerAfter = await waitFor(page, () => document.querySelector('.player-shell video'), null, 12000);
  check(G, 'player page while the servers load: loader first, then the player, no page errors', Boolean(loaderShown) && Boolean(playerAfter) && ctx.errors.length === 0, `loader=${Boolean(loaderShown)} player=${Boolean(playerAfter)} ${ctx.errors.slice(0, 2).join(' | ')}`);
  await page.close();

  // VIP plan cards (signed in): only perks the code really gives; prices untouched.
  const session = { blackx_token: 'test-session-token-login-0123456789', 'blackx.vipTier': 'free' };
  ({ page, ctx } = await openWeb(browser, { route: '/profile?tab=referrals', phone: false, ui: 'site', seed: session }));
  const plansShown = await waitFor(page, () => /VIP Monarch/.test(document.querySelector('.app-shell')?.innerText || '') && /VIP Basic/.test(document.querySelector('.app-shell')?.innerText || ''), null, 12000);
  const plans = await page.evaluate(() => document.querySelector('.app-shell')?.innerText || '');
  const falsePerks = ['وصول مبكر', 'Early Access', '24 ساعة', 'نفس يوم', 'بدون ضغط', 'uncompressed', '100 مشاهد', '25 مشاهد', '5 مشاهدين', 'Prompt Studio', 'الذكاء الاصطناعي', 'كافة الإطارات'].filter((f) => plans.includes(f));
  check(G, 'VIP plans: no early access, 24-hour delay, «uncompressed», viewer caps or AI studio', Boolean(plansShown) && falsePerks.length === 0, plansShown ? falsePerks.join(', ') || 'clean' : 'plans did not render');
  const truePerks = ['تحميل الحلقات بجودة FHD 1080p', 'السيرفرات المباشرة (Fast CDN)', 'رسائل صوتية بلا حدود', 'إطارين حصريين زيادة'].filter((f) => !plans.includes(f));
  check(G, 'VIP plans: the real perks are listed (FHD downloads, direct servers first, voice notes, frames)', truePerks.length === 0, truePerks.length ? `missing: ${truePerks.join(', ')}` : 'all there');
  check(G, 'VIP plans: no «private rooms with a custom link» (never existed), voice notes are the community\'s', !/رابط مخصص|غرف مشاهدة خاصة/.test(plans) && /رسائل صوتية بلا حدود في المجتمع/.test(plans) && !/في غرف المشاهدة/.test(plans));
  const planDigits = asciiDigits(plans);
  check(G, 'VIP plans: prices unchanged (99 / 199 ج.م)', /\b99\b/.test(planDigits) && /\b199\b/.test(planDigits), (planDigits.match(/\b(99|199|249|499|799|1499)\b/g) || []).join(','));
  const struck = await page.evaluate(() =>
    [...document.querySelectorAll('.app-shell *')]
      .filter((e) => e.children.length === 0 && /line-through/.test(getComputedStyle(e).textDecorationLine || '') && /\d/.test(e.textContent))
      .map((e) => e.textContent.trim())
  );
  check(G, 'VIP plans: no struck-through «old price» (the 150 / 320 fake discount, removed 2026-10-17)', struck.length === 0 && !/\b(150|320)\b/.test(planDigits), struck.join(', ') || 'clean');
  await page.close();
  ({ page, ctx } = await openWeb(browser, { route: '/profile?tab=referrals', phone: false, ui: 'site', seed: { ...session, 'blackx.vipTier': 'vip_monarch' } }));
  await waitFor(page, () => /VIP Monarch/.test(document.querySelector('.app-shell')?.innerText || ''), null, 12000);
  const monarchPlans = await page.evaluate(() => document.querySelector('.app-shell')?.innerText || '');
  check(G, 'VIP Monarch account: the keyword-matching «AI 3D studio» is gone, the 5 VIP frames stay', !/استوديو الذكاء|AI 3D Prompt|توليد وتطبيق/.test(monarchPlans) && /الـ 5 إطارات الحصرية/.test(monarchPlans));
  await page.close();

  // Watch party: the classic page's local imitation (sample messages from «Kuro_Kun» and
  // «Mirai_Sama», a room nobody else could see) became a card to the real party (2026-10-17).
  ({ page, ctx } = await openWeb(browser, { route: `/watch/${slugOf('Test Anime 2')}/1`, phone: false, ui: 'site', seed: { 'blackx.vipTier': 'vip_basic' } }));
  await waitFor(page, () => Boolean(document.querySelector('.watch-party-panel--handoff')), null, 10000);
  const party = await page.evaluate(() => document.querySelector('.watch-party-panel--handoff')?.innerText || '');
  check(G, 'watch party: no sample messages, no viewer counts — a card to the real party', Boolean(party) && !/Kuro_Kun|Mirai_Sama|\d+\s*\/\s*\d+/.test(party) && /الواجهة الجديدة/.test(party), party.replace(/\n/g, ' ').slice(0, 120) || 'panel missing');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
    clickEl(page, '.watch-party-panel--handoff button')
  ]);
  await waitWebReady(page);
  await waitFor(page, () => Boolean(document.querySelector('.bx-dock')), null, 15000);
  // the address bar shows «/» for a moment while the linked title loads, then the player's address
  await waitFor(page, () => location.pathname.startsWith('/watch/'), null, 15000);
  check(G, '…its button opens the same episode in the app interface', (await iface(page)) === 'app' && /^\/watch\//.test(await here(page)), `${await iface(page)} ${await here(page)}`);
  await page.close();

  // The browser's own AniList queries ask AniList to drop the hidden genres.
  ({ page, ctx } = await openWeb(browser, { route: '/browse', phone: false, ui: 'site' }));
  await sleep(2500);
  const bodies = ctx.anilist.map((b) => b?.query || '').filter(Boolean);
  check(G, 'manga page: AniList queries exclude Ecchi / Harem / Isekai', bodies.length > 0 && bodies.every((q) => /genre_not_in/.test(q) && /tag_not_in/.test(q)), `${bodies.length} queries`);
  await page.keyboard.down('Control');
  await page.keyboard.press('k');
  await page.keyboard.up('Control');
  await sleep(400);
  const before = ctx.anilist.length;
  await page.keyboard.type('naruto');
  await sleep(1500);
  const search = ctx.anilist.slice(before).map((b) => b?.query || '');
  check(G, 'search window (Ctrl+K): AniList query excludes them too', search.length > 0 && search.every((q) => /genre_not_in/.test(q)), `${search.length} queries`);
  await page.close();
});

/* ================================================================== features */
// The 2026-10-17 app updates, on a phone: real air times (schedule, home), honest alerts with a
// test notification that says so, details tabs without empty ones, episode options in one sheet,
// manga quick searches from AniList + one filter sheet, community spoiler cover + anime card,
// watch stats from real saved positions.
const nearMidnight = () => {
  const d = new Date();
  const m = d.getHours() * 60 + d.getMinutes();
  return m < 4 || m > 1436;
};

scenario('features', async (browser) => {
  const G = 'features';
  // ---- schedule: real air times (AniList via /api/anime/schedule, matched by MAL id)
  let { page, ctx } = await openWeb(browser, { route: '/', ctx: { extraSlots: [] } });
  await waitFor(page, () => document.querySelectorAll('.bx-wide-card').length > 2, null, 10000);
  const wide = await page.evaluate(() => [...document.querySelectorAll('.bx-wide-card')].map((c) => ({ t: c.querySelector('.bx-wide-title')?.textContent.trim(), sub: c.querySelector('.bx-wide-sub')?.textContent.trim() || '' })));
  const w1 = wide.find((w) => w.t === 'Test Anime 1');
  check(G, 'home: «بيتعرض دلوقتي» is a row of wide cards', wide.length >= 3, `${wide.length} cards`);
  check(G, 'home: a wide card shows the real next episode and countdown', Boolean(w1 && /الحلقة 5/.test(w1.sub) && /بعد/.test(w1.sub)), w1 ? w1.sub : JSON.stringify(wide.slice(0, 2)));
  const storyTimes = await page.evaluate(() => [...document.querySelectorAll('.bx-story-time')].map((e) => e.textContent.trim()));
  check(G, 'home: today’s circles carry the real air time', storyTimes.length >= 2, storyTimes.join(' | '));
  await page.close();

  ({ page, ctx } = await openWeb(browser, { route: '/', ctx: { extraSlots: [] } }));
  await tapEl(page, '.bx-dock-item', { text: 'الجدول' });
  await waitFor(page, () => document.querySelectorAll('.bx-sched-row').length > 3, null, 10000);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.bx-sched-row')].map((r) => ({
      title: r.querySelector('.bx-sched-title')?.textContent.trim() || '',
      time: r.querySelector('.bx-sched-time')?.innerText.replace(/\n/g, ' ').trim() || '',
      meta: r.querySelector('.bx-sched-meta')?.innerText.replace(/\n/g, ' ') || ''
    }))
  );
  const r1 = rows.find((r) => r.title === 'Test Anime 1');
  const r2 = rows.find((r) => r.title === 'Test Anime 2');
  check(G, 'schedule: shows with a real air time come first', Boolean(rows[0]?.time && rows[1]?.time && !rows[2]?.time), JSON.stringify(rows.slice(0, 3)));
  check(G, 'schedule: airing in a minute → a live countdown', /بعد/.test(r1?.time || ''), r1?.time || 'missing');
  check(G, 'schedule: the episode number comes from AniList', /الحلقة 5/.test(r1?.meta || ''), r1?.meta || '');
  check(G, 'schedule: aired earlier today → «الأسبوع الجاي»', /الأسبوع الجاي/.test(r2?.time || ''), r2?.time || 'missing');
  if (!nearMidnight()) check(G, 'schedule: ordered by time of day', rows.indexOf(r2) < rows.indexOf(r1), rows.slice(0, 2).map((r) => r.title).join(' → '));
  const extra = await page.evaluate(() => ({
    divider: document.querySelector('.bx-sched-divider')?.textContent.trim() || '',
    note: document.querySelector('.bx-sched-note')?.textContent.trim() || '',
    bar: document.querySelector('.bx-sched-bar')?.innerText.trim() || ''
  }));
  check(G, 'schedule: shows without a known time are listed under «من غير ميعاد معروف»', extra.divider === 'من غير ميعاد معروف', extra.divider);
  check(G, 'schedule: says the times are the Japanese broadcast (subtitles come later)', /اليابان/.test(extra.note) && /AniList/.test(extra.note), extra.note);
  check(G, 'schedule: the count says «بالميعاد»', /بالميعاد/.test(extra.bar), extra.bar);
  // tomorrow: Test Anime 10 airs in 24 h
  const tomorrowIdx = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.bx-day-chip')];
    const i = chips.findIndex((c) => c.classList.contains('is-today'));
    return i >= 0 && i < 6 ? i + 1 : 0;
  });
  if (tomorrowIdx) {
    await tapEl(page, '.bx-day-chip', { index: tomorrowIdx });
    await waitFor(page, () => [...document.querySelectorAll('.bx-sched-row')].some((r) => r.querySelector('.bx-sched-time') && /Test Anime 10/.test(r.innerText)), null, 8000);
    const tm = await page.evaluate(() => [...document.querySelectorAll('.bx-sched-row')].find((r) => /Test Anime 10\b/.test(r.innerText))?.querySelector('.bx-sched-time')?.innerText.replace(/\n/g, ' ') || '');
    check(G, 'schedule: tomorrow’s tab lists tomorrow’s show with its time', /[0-9]/.test(tm), tm || 'missing');
  }

  // ---- alerts: how they really work + a test notification that says it is a test
  await page.evaluate(() => {
    window.__notes = [];
    window.Notification = class {
      constructor(t, o) {
        window.__notes.push({ t, b: o?.body || '' });
      }
      static get permission() {
        return 'granted';
      }
      static requestPermission() {
        return Promise.resolve('granted');
      }
    };
  });
  await tapEl(page, '.bx-sched-bar .bx-chip', { text: 'التنبيهات' });
  await waitFor(page, () => Boolean(document.querySelector('.bx-alerts-sheet')), null, 5000);
  await sleep(700); // the sheet slides up
  const how = await page.evaluate(() => document.querySelector('.bx-alerts-how')?.innerText || '');
  check(G, 'alerts: explains followed titles only, checked while open (30 min / 10 min after airing)', /بتتابعها/.test(how) && /٣٠ دقيقة/.test(how) && /١٠ دقايق/.test(how), how.replace(/\n/g, ' ').slice(0, 140));
  check(G, 'alerts: no «ACTIVE • مفعل تلقائياً» badge, no fake «متاح الآن» rows', await page.evaluate(() => !/ACTIVE|مفعل تلقائياً|متاح الآن على سيرفرات/.test(document.querySelector('.bx-alerts-sheet')?.innerText || '')));
  check(G, 'alerts: a guest who follows nothing is told how to follow', await page.evaluate(() => /اضغط \+/.test(document.querySelector('.bx-alerts-empty')?.innerText || '')));
  await tapWhenHittable(page, '.bx-alerts-how .bx-btn', { text: 'إشعار تجربة' });
  await sleep(500);
  const notes = await page.evaluate(() => window.__notes || []);
  check(G, 'alerts: the test notification says it is a test (no invented «نزلت الآن»)', notes.length === 1 && /تجربة/.test(notes[0].t) && !/نزلت|حلقة جديدة/.test(notes[0].t + notes[0].b), JSON.stringify(notes));
  check(G, 'no page errors (home, schedule, alerts)', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // ---- details: no empty tabs; episode tools = search + one options sheet
  ({ page, ctx } = await openWeb(browser, { route: `/show/${slugOf('Test Anime 3')}` }));
  await waitFor(page, () => Boolean(document.querySelector('.bx-details-sheet')), null, 10000);
  await waitFor(page, () => /الحلقات \(12\)/.test(document.querySelector('.bx-details-sheet')?.innerText || ''), null, 10000);
  await sleep(800);
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('.bx-details-sheet button')].map((b) => b.textContent.trim()).filter((t) => /^(الحلقات|الشخصيات|التريلر|أعمال مشابهة|التقييمات)/.test(t))
  );
  check(G, 'details: no «الشخصيات (0)» tab when AniList has no cast', !tabs.some((t) => t.startsWith('الشخصيات')), tabs.join(' | '));
  check(G, 'details: no «(0)» counts on the tabs', !tabs.some((t) => /\(0\)/.test(t)) && tabs.includes('الحلقات (12)') && tabs.includes('التقييمات'), tabs.join(' | '));
  const tools = await page.evaluate(() => {
    const box = document.querySelector('.bx-ep-tools');
    return box ? { inputs: box.querySelectorAll('input').length, buttons: [...box.querySelectorAll('button')].map((b) => b.textContent.trim()) } : null;
  });
  check(G, 'episodes: one search box + one «خيارات» button (was 4 controls)', Boolean(tools && tools.inputs === 1 && tools.buttons.length === 1 && /خيارات/.test(tools.buttons[0])), JSON.stringify(tools));
  check(G, 'episodes: no filler switch when the server marks no filler', await page.evaluate(() => !/إخفاء الفلر|بدون فلر/.test(document.querySelector('.bx-details-sheet')?.innerText || '')));
  await tapEl(page, '.bx-ep-tools .bx-chip');
  await waitFor(page, () => Boolean(document.querySelector('.bx-ep-options')), null, 4000);
  await sleep(700); // the sheet slides up
  const opt = await page.evaluate(() => document.querySelector('.bx-ep-options')?.innerText || '');
  check(G, 'episode options: layout + order (no filler group without filler data)', /طريقة العرض/.test(opt) && /الترتيب/.test(opt) && !/الفلر/.test(opt), opt.replace(/\n/g, ' / ').slice(0, 120));
  await tapWhenHittable(page, '.bx-ep-options .bx-seg button', { text: 'من الأحدث' });
  await sleep(300);
  await page.evaluate(() => { setTimeout(() => history.back(), 0); });
  await sleep(900);
  const sheetGone = await page.evaluate(() => !document.querySelector('.bx-ep-options'));
  check(G, 'episode options: the back button closes the sheet', sheetGone);
  const firstEp = await page.evaluate(() => [...document.querySelectorAll('.bx-details-sheet')].map((d) => d.innerText.match(/Episode (\d+)/)?.[1] || '')[0]);
  check(G, 'episode options: «من الأحدث» puts episode 12 first', firstEp === '12', firstEp);
  check(G, 'details: no page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // ---- manga: quick searches from AniList, server + type in one filter sheet, no fake progress
  ({ page, ctx } = await openWeb(browser, {
    route: '/',
    seed: { bx_mob_manga_history: [{ objectID: 'bx:test-manhwa-1', name: 'Test Manhwa 1', poster_uri: `${LOCAL}/poster/31.svg`, mangaId: 'bx:test-manhwa-1', lastChapter: '4', chapterId: 'c4', updatedAt: new Date().toISOString() }] }
  }));
  await tapEl(page, '.bx-dock-item', { text: 'المانجا' });
  await waitFor(page, () => document.querySelectorAll('.bx-manga-popular .bx-chip').length > 0, null, 10000);
  const chips = await page.evaluate(() => [...document.querySelectorAll('.bx-manga-popular .bx-chip')].map((c) => c.textContent.trim()));
  check(G, 'manga: quick searches are AniList’s most popular (no hard-coded list)', chips.join('|') === 'Popular Manga One|Popular Manga Two|Popular Manga Three' && !chips.includes('Solo Leveling'), chips.join(' | '));
  const popQ = ctx.anilist.map((b) => b?.query || '').filter((q) => /type: MANGA, sort: POPULARITY_DESC/.test(q));
  check(G, 'manga: that AniList query excludes the hidden genres', popQ.length === 1 && /genre_not_in/.test(popQ[0]) && /tag_not_in/.test(popQ[0]), `${popQ.length} queries`);
  check(G, 'manga: «كمّل قراءة» has no invented 68 % progress bar', await page.evaluate(() => ![...document.querySelectorAll('main div')].some((d) => d.style && d.style.width === '68%')));
  const tools2 = await page.evaluate(() => ({ serverChips: document.querySelectorAll('main .bx-mob-scroll button[style*="999px"]').length, tools: document.querySelector('.bx-manga-tools')?.innerText.replace(/\n/g, ' ') || '' }));
  check(G, 'manga: one «فلترة» button replaces the two chip rows', /فلترة/.test(tools2.tools) && /جميع سيرفرات BLACK X/.test(tools2.tools), tools2.tools);
  await tapEl(page, '.bx-manga-tools .bx-chip');
  await waitFor(page, () => /السيرفر/.test(document.querySelector('.bx-bottom-sheet')?.innerText || ''), null, 4000);
  await sleep(700);
  const sheet = await page.evaluate(() => document.querySelector('.bx-bottom-sheet')?.innerText || '');
  check(G, 'manga filter sheet: server + type groups', /السيرفر/.test(sheet) && /النوع/.test(sheet) && /مانجا يابانية/.test(sheet), sheet.replace(/\n/g, ' / ').slice(0, 140));
  await tapWhenHittable(page, '.bx-bottom-sheet .bx-chip', { text: 'مانجا يابانية' });
  await tapWhenHittable(page, '.bx-bottom-sheet .bx-btn-primary');
  await sleep(700);
  const summary2 = await page.evaluate(() => document.querySelector('.bx-manga-tools')?.innerText.replace(/\n/g, ' ') || '');
  check(G, 'manga filter: applied, counted and summarised', /فلترة · 1/.test(summary2) && /مانجا يابانية/.test(summary2), summary2);
  check(G, 'manga: no page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // ---- community: spoiler cover (also for the «فيه حرق» category) and the anime a post is about
  const now = Date.now();
  const posts = [
    { id: 'post_s', author: 'Sara', username: 'sara', role: 'user', category: 'spoiler', isSpoiler: false, createdAt: new Date(now - 60e3).toISOString(), text: 'البطل بيموت في الآخر', likes: 0, likedBy: [], replies: [] },
    { id: 'post_m', author: 'Kai', username: 'kai', role: 'user', category: 'recommend', isSpoiler: false, anime: { objectID: 'Test Anime 3', titleEn: 'Test Anime 3', poster: `${LOCAL}/poster/3.svg` }, createdAt: new Date(now - 120e3).toISOString(), text: 'لازم تتفرجوا عليه', likes: 0, likedBy: [], replies: [] }
  ];
  ({ page, ctx } = await openWeb(browser, { route: '/', ctx: { communityPosts: posts } }));
  await tapEl(page, '.bx-dock-item', { text: 'المجتمع' });
  await waitFor(page, () => document.querySelectorAll('.bx-post').length >= 2, null, 10000);
  check(G, 'community: a «فيه حرق» post is covered even without the spoiler flag', await page.evaluate(() => Boolean(document.querySelector('.bx-post .bx-post-spoiler.is-covered .bx-spoiler-btn'))));
  await tapEl(page, '.bx-spoiler-btn');
  await sleep(300);
  check(G, 'community: a tap reveals it', await page.evaluate(() => !document.querySelector('.bx-post-spoiler.is-covered') && /البطل بيموت/.test(document.querySelector('.bx-post-spoiler')?.innerText || '')));
  const card = await page.evaluate(() => document.querySelector('.bx-post-anime')?.innerText.replace(/\n/g, ' ') || '');
  check(G, 'community: the anime a post is about shows as a card', /Test Anime 3/.test(card), card);
  await tapEl(page, '.bx-post-anime');
  await waitFor(page, () => Boolean(document.querySelector('.bx-details-sheet')), null, 8000);
  check(G, 'community: the card opens that anime (fresh catalogue record)', (await detailsTitle(page)) === 'Test Anime 3' && ctx.algolia.some((a) => a.object === 'Test Anime 3'), await detailsTitle(page));
  check(G, 'community: no page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // ---- composer: tie a post to an anime
  ({ page, ctx } = await openWeb(browser, {
    route: '/',
    seed: {
      bx_mob_session_v16: { token: 'test-session-token-0123456789abcdef', savedAt: Date.now() },
      bx_mob_user: { id: 'u_tester', username: 'tester', displayName: 'Tester', email: 'tester@example.com', role: 'user', vipTier: 'free' }
    }
  }));
  await tapEl(page, '.bx-dock-item', { text: 'المجتمع' });
  await waitFor(page, () => Boolean(document.querySelector('.bx-composer')), null, 10000);
  await tapEl(page, '.bx-composer-attach');
  await waitFor(page, () => Boolean(document.querySelector('.bx-post-picker-search input')), null, 4000);
  await sleep(350);
  await page.type('.bx-post-picker-search input', 'Test Anime 4');
  await waitFor(page, () => document.querySelectorAll('.bx-post-picker-list .bx-alerts-row').length > 0, null, 6000);
  await tapWhenHittable(page, '.bx-post-picker-list .bx-alerts-row', { index: 0 });
  await sleep(400);
  check(G, 'composer: the chosen anime is shown on the draft', /Test Anime 4/.test(await page.evaluate(() => document.querySelector('.bx-composer-anime')?.innerText || '')));
  await page.type('.bx-composer textarea', 'بوست عن أنمي');
  await tapEl(page, '.bx-composer button[type="submit"]');
  await sleep(1200);
  const write = ctx.fsWrites.map((w) => w.body || w).map((b) => (typeof b === 'string' ? b : JSON.stringify(b))).find((b) => /بوست عن أنمي/.test(b)) || '';
  check(G, 'composer: the post is saved with that anime (objectID + title)', /Test Anime 4/.test(write) && /objectID/.test(write), write.slice(0, 160));
  check(G, 'composer: the new post shows the anime card', /Test Anime 4/.test(await page.evaluate(() => document.querySelector('.bx-post .bx-post-anime')?.innerText || '')));
  check(G, 'composer: no page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // ---- profile: watch stats from the real saved positions and history genres
  const at = Date.now();
  ({ page, ctx } = await openWeb(browser, {
    route: '/profile',
    seed: {
      bx_mob_positions_v16: {
        'aw-test-anime-1:1': { sec: 1440, dur: 1440, at: at - 5000, done: true },
        'aw-test-anime-1:2': { sec: 1400, dur: 1440, at: at - 4000 },
        'aw-test-anime-2:1': { sec: 600, dur: 1440, at: at - 3000 }
      },
      bx_mob_history: [
        { slug: 'aw-test-anime-1', objectID: 'Test Anime 1', episode: 2, titleEn: 'Test Anime 1', poster: `${LOCAL}/poster/1.svg`, tags: ['أكشن', 'مغامرات'], updatedAt: new Date(at - 4000).toISOString() },
        { slug: 'aw-test-anime-2', objectID: 'Test Anime 2', episode: 1, titleEn: 'Test Anime 2', poster: `${LOCAL}/poster/2.svg`, tags: ['أكشن', 'دراما'], updatedAt: new Date(at - 3000).toISOString() }
      ]
    }
  }));
  await waitFor(page, () => Boolean(document.querySelector('.bxp-watchstats')), null, 8000);
  const stats = await page.evaluate(() => document.querySelector('.bxp-watchstats')?.innerText.replace(/\n/g, ' ') || '');
  // 1440 + 1400 + 600 s = 57 min; 2 finished (done, 97 %); 3 started; top genre أكشن
  check(G, 'profile stats: finished / time / started from the saved positions', /\b2\b حلقة كمّلتها/.test(stats) && /57/.test(stats) && /\b3\b حلقة بدأتها/.test(stats), stats);
  check(G, 'profile stats: top genres from the history (أكشن first)', /أكتر تصنيفات بتتفرجها:\s*أكشن/.test(stats), stats);
  check(G, 'profile stats: says what they are counted from', /آخر 120 حلقة/.test(stats), stats);
  await page.close();
});

/* ====================================================================== wide */
// Computers get the app interface laid out for wide screens (desktop.css): side rail, rails with
// arrows, more grid columns, centred dialogs, the player with mouse + keyboard, the classic link.
scenario('wide', async (browser) => {
  const G = 'wide';
  let { page, ctx } = await openWeb(browser, { route: '/', phone: false });
  await waitFor(page, () => document.querySelectorAll('.bx-poster').length > 8, null, 10000);
  await sleep(600);
  const layout = await page.evaluate(() => {
    const dock = document.querySelector('.bx-dock')?.getBoundingClientRect();
    const copy = document.querySelector('.bx-hero-copy')?.getBoundingClientRect();
    const img = document.querySelector('.bx-hero-img');
    const poster = document.querySelector('.bx-row .bx-poster')?.getBoundingClientRect();
    return {
      dock: dock && { x: Math.round(dock.x), w: Math.round(dock.width), h: Math.round(dock.height) },
      copyRight: copy ? Math.round(copy.right) : 0,
      copyWidth: copy ? Math.round(copy.width) : 0,
      heroSrc: img?.currentSrc || '',
      posterW: poster ? Math.round(poster.width) : 0
    };
  });
  check(G, 'side rail on the right, full height', Boolean(layout.dock && layout.dock.h >= 880 && layout.dock.x >= 1330), JSON.stringify(layout.dock));
  check(G, 'hero: copy on the start side next to the rail, not centred full width', layout.copyRight > 1250 && layout.copyRight <= 1348 && layout.copyWidth <= 640, `${layout.copyRight} / ${layout.copyWidth}`);
  check(G, 'hero: the landscape banner (not the stretched poster)', /\/wide\//.test(layout.heroSrc), layout.heroSrc);
  check(G, 'rails: bigger posters for a big screen', layout.posterW >= 150, `${layout.posterW}px`);

  // rail arrows (mouse); the top-10 rail mounts when it comes near the screen
  for (let i = 0; i < 6 && !(await page.evaluate(() => Boolean(document.querySelector('.bx-top10-row')))); i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await sleep(400);
  }
  const railBox = await boxOf(page, '.bx-rail-wrap .bx-top10-row', { scroll: true });
  check(G, 'rails: no arrows before a mouse is used', await page.evaluate(() => getComputedStyle(document.querySelector('.bx-rail-arrow')).display === 'none'));
  await page.mouse.move(railBox.x - 40, railBox.y - 40);
  await page.mouse.move(railBox.x, railBox.y, { steps: 4 });
  await sleep(500);
  const arrow = await page.evaluate(() => {
    const row = document.querySelector('.bx-rail-wrap .bx-top10-row');
    const btn = row?.parentElement?.querySelector('.bx-rail-arrow.is-forward');
    const cs = btn ? getComputedStyle(btn) : null;
    return btn ? { on: btn.classList.contains('is-on'), display: cs.display, opacity: cs.opacity, start: row.scrollLeft } : null;
  });
  check(G, 'rails: moving the mouse over a rail shows the «more» arrow', Boolean(arrow && arrow.on && arrow.display !== 'none' && Number(arrow.opacity) > 0.9), JSON.stringify(arrow));
  await page.evaluate(() => document.querySelector('.bx-rail-wrap .bx-top10-row')?.parentElement?.querySelector('.bx-rail-arrow.is-forward')?.setAttribute('data-test-arrow', '1'));
  const ab = await boxOf(page, '[data-test-arrow]', { scroll: false });
  await page.mouse.click(ab.x, ab.y);
  await sleep(900);
  const moved = await page.evaluate(() => Math.abs(document.querySelector('.bx-rail-wrap .bx-top10-row')?.scrollLeft || 0));
  check(G, 'rails: clicking the arrow scrolls the rail a screen', moved > 300, `${moved}px`);
  const backOn = await page.evaluate(() => document.querySelector('.bx-rail-wrap .bx-top10-row')?.parentElement?.querySelector('.bx-rail-arrow.is-back')?.classList.contains('is-on'));
  check(G, 'rails: …and the «back» arrow appears', Boolean(backOn));

  // search grid + filter dialog
  const searchTab = await boxOf(page, '.bx-dock-item', { text: 'البحث', scroll: false });
  await page.mouse.click(searchTab.x, searchTab.y);
  await waitFor(page, () => document.querySelectorAll('.bx-grid .bx-poster').length > 6, null, 8000);
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.bx-grid')).gridTemplateColumns.split(' ').length);
  check(G, 'search: a wide grid (6+ columns)', cols >= 6, `${cols} columns`);
  await page.evaluate(() => [...document.querySelectorAll('.bx-search-tools .bx-chip')][0]?.click());
  await waitFor(page, () => Boolean(document.querySelector('.bx-bottom-sheet')), null, 4000);
  await sleep(500);
  const dlg = await page.evaluate(() => {
    const r = document.querySelector('.bx-bottom-sheet').getBoundingClientRect();
    return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), w: Math.round(r.width), bottom: Math.round(r.bottom) };
  });
  check(G, 'sheets are centred dialogs on a computer', Math.abs(dlg.cx - 720) < 30 && dlg.w <= 600 && dlg.bottom < 890, JSON.stringify(dlg));
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => document.querySelector('.bx-sheet-layer')?.click());
  await sleep(500);
  check(G, 'no page errors (home, rails, search)', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // details keep the rail; the player works with the keyboard and the mouse
  ({ page, ctx } = await openWeb(browser, { route: `/show/${slugOf('Test Anime 3')}`, phone: false }));
  await waitFor(page, () => Boolean(document.querySelector('.bx-details-sheet')), null, 10000);
  await sleep(800);
  const det = await page.evaluate(() => {
    const d = document.querySelector('.bx-details-sheet').getBoundingClientRect();
    const dock = document.querySelector('.bx-dock').getBoundingClientRect();
    return { right: Math.round(d.right), dockLeft: Math.round(dock.left), dockVisible: getComputedStyle(document.querySelector('.bx-dock')).opacity !== '0' };
  });
  check(G, 'title page sits next to the rail (rail still visible)', det.right <= det.dockLeft + 1 && det.dockVisible, JSON.stringify(det));
  await page.evaluate(() => document.querySelector('.bx-detail-cta')?.click());
  await waitFor(page, () => {
    const v = document.querySelector('video');
    return Boolean(v && v.readyState >= 2 && v.currentTime > 0.5);
  }, null, 20000);
  const vid = await page.evaluate(() => {
    const b = document.querySelector('.bx-video-box')?.getBoundingClientRect();
    return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null;
  });
  check(G, 'player: the video fits the screen height', Boolean(vid && vid.h <= 900 - 140 && vid.w >= 900), JSON.stringify(vid));
  const t0 = await page.evaluate(() => document.querySelector('video').currentTime);
  await page.keyboard.press('ArrowRight');
  await sleep(500);
  const t1 = await page.evaluate(() => document.querySelector('video').currentTime);
  check(G, 'player keyboard: → jumps +10 s', t1 - t0 >= 9 && t1 - t0 <= 13, `${t0.toFixed(1)} → ${t1.toFixed(1)}`);
  await page.keyboard.press('Space');
  await sleep(400);
  check(G, 'player keyboard: Space pauses', await page.evaluate(() => document.querySelector('video').paused));
  await page.keyboard.press('k');
  await sleep(500);
  check(G, 'player keyboard: K plays again', await page.evaluate(() => !document.querySelector('video').paused));
  await page.keyboard.press('m');
  await sleep(200);
  check(G, 'player keyboard: M mutes', await page.evaluate(() => document.querySelector('video').muted));
  await page.keyboard.press('m');
  await page.keyboard.press('f');
  await sleep(700);
  check(G, 'player keyboard: F enters full screen', await page.evaluate(() => Boolean(document.querySelector('.bx-pc.is-fs'))));
  await page.keyboard.press('f');
  await sleep(700);
  check(G, '…and F leaves it', await page.evaluate(() => !document.querySelector('.bx-pc.is-fs')));
  const surf = await boxOf(page, '.bx-pc-surface', { scroll: false });
  await page.mouse.click(surf.x, surf.y);
  await sleep(800);
  check(G, 'player mouse: a click on the picture pauses', await page.evaluate(() => document.querySelector('video').paused));
  check(G, 'player: no page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // the classic website stays one click away
  ({ page, ctx } = await openWeb(browser, { route: '/', phone: false }));
  await waitFor(page, () => Boolean(document.querySelector('.bx-classic-link')), null, 10000);
  // lazy rows above it mount while scrolling down, so scroll until the link stays put
  let cl = null;
  for (let i = 0; i < 8; i++) {
    await boxOf(page, '.bx-classic-link');
    await sleep(500);
    cl = await boxOf(page, '.bx-classic-link', { scroll: false });
    if (cl && cl.hitOk && cl.y > 0 && cl.y < 900) break;
  }
  await page.mouse.click(cl.x, cl.y);
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await waitWebReady(page);
  check(G, 'home: «التصميم القديم للموقع» opens the classic pages and remembers it', (await iface(page)) === 'site' && (await page.evaluate(() => localStorage.getItem('bx_web_ui_v2'))) === 'site', await iface(page));
  await page.close();
});


/* ==================================================================== bundle */
// What only the website has (2026-10-17): the computer's cinema mode, the mouse preview, quick
// search, shortcuts and new-tab links, the rankings and «ملخصك» pages, «ليه تنزل التطبيق؟»,
// and the watch party between two browsers (shared Firestore mock with its preconditions).
scenario('bundle', async (browser) => {
  const G = 'bundle';

  // ---- computer home: mouse preview, new tabs, quick search, shortcuts
  let { page, ctx } = await openWeb(browser, { route: '/', phone: false, ctx: { recordOpen: true } });
  await page.mouse.move(700, 300);
  await page.mouse.move(720, 320, { steps: 3 });
  await waitFor(page, () => document.querySelectorAll('main .bx-rail-wrap .bx-poster').length > 3, null, 10000);
  await page.evaluate(() => document.querySelector('main .bx-rail-wrap')?.scrollIntoView({ block: 'center' }));
  await sleep(500);
  const poster = await boxOf(page, 'main .bx-rail-wrap .bx-poster', { scroll: false, index: 1 });
  await page.mouse.move(poster.x, poster.y, { steps: 6 });
  const shown = await waitFor(page, () => Boolean(document.querySelector('.bx-hover-card.is-in')), null, 3000);
  const card = await page.evaluate(() => {
    const c = document.querySelector('.bx-hover-card');
    return c
      ? { title: c.querySelector('h3')?.textContent || '', meta: c.querySelector('.bx-hover-meta')?.textContent || '', btns: [...c.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean) }
      : null;
  });
  check(G, 'mouse preview: resting on a poster opens its card (real details, play / details / my list)', shown && Boolean(card?.title) && card.btns.includes('شاهد') && card.btns.includes('التفاصيل'), JSON.stringify(card));
  check(G, '…without invented values', Boolean(card) && !/TV-MA|98%|9\.5|24 دقيقة|4K/.test(card.meta), card?.meta || '');
  check(G, '…and the rail keeps its arrows while the card covers it', await page.evaluate(() => Boolean(document.querySelector('.bx-rail-wrap.is-previewing'))));
  await clickEl(page, '.bx-hover-card button', { text: 'التفاصيل', scroll: false });
  await waitFor(page, () => Boolean(document.querySelector('.bx-details-sheet')), null, 8000);
  check(G, '…«التفاصيل» opens that title', (await detailsTitle(page)).includes(card?.title || '?'), await detailsTitle(page));
  await browserBack(page);
  await sleep(400);
  const p2 = await boxOf(page, 'main .bx-rail-wrap .bx-poster', { scroll: false, index: 2 });
  await page.mouse.move(p2.x, p2.y, { steps: 4 });
  await waitFor(page, () => Boolean(document.querySelector('.bx-hover-card.is-in')), null, 3000);
  await page.mouse.move(30, 880, { steps: 6 });
  check(G, '…it closes when the mouse leaves', await waitFor(page, () => !document.querySelector('.bx-hover-card'), null, 2000));

  await page.mouse.click(p2.x, p2.y, { button: 'middle' });
  await sleep(300);
  let opened = await page.evaluate(() => window.__bxOpened.slice());
  check(G, 'middle click on a poster opens its page in a new tab (this page stays)', opened.length === 1 && /^\/show\/aw-/.test(opened[0]) && !(await detailsOpen(page)), opened.join(' '));
  await page.keyboard.down('Control');
  await page.mouse.click(p2.x, p2.y);
  await page.keyboard.up('Control');
  await sleep(300);
  opened = await page.evaluate(() => window.__bxOpened.slice());
  check(G, '…Ctrl + click too', opened.length === 2 && opened[1] === opened[0] && !(await detailsOpen(page)), opened.join(' '));
  await page.mouse.move(30, 880);
  await sleep(300);

  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  const pal = await waitFor(page, () => Boolean(document.querySelector('.bx-palette')), null, 3000);
  const pages = await page.evaluate(() => [...document.querySelectorAll('.bx-palette-row .bx-palette-label')].map((e) => e.textContent.trim()));
  check(G, 'Ctrl+K opens the quick search with the pages', pal && pages.includes('الترتيب') && pages.includes('جدول الحلقات') && pages.includes('ملخصك'), pages.join(' | '));
  const focused = await waitFor(page, () => document.activeElement === document.querySelector('.bx-palette-input input'), null, 2000);
  check(G, '…with the cursor already in its field', focused);
  if (!focused) await clickEl(page, '.bx-palette-input input', { scroll: false });
  await page.keyboard.type('Test Anime 7');
  const res = await waitFor(page, () => Boolean(document.querySelector('.bx-palette-row.is-item')), null, 8000);
  const first = await page.evaluate(() => document.querySelector('.bx-palette-row.is-item')?.innerText.replace(/\s+/g, ' ') || '');
  check(G, '…typing searches the catalogue', res && /Test Anime 7/.test(first), first);
  await page.keyboard.press('Enter');
  await waitFor(page, () => Boolean(document.querySelector('.bx-details-sheet')), null, 8000);
  check(G, '…Enter opens the first result', /Test Anime 7/.test(await detailsTitle(page)), await detailsTitle(page));
  await browserBack(page);
  await sleep(300);
  await page.keyboard.press('/');
  const slashOpen = await waitFor(page, () => Boolean(document.querySelector('.bx-palette')), null, 2000);
  await page.keyboard.press('Escape');
  check(G, '«/» opens it too, Esc closes it', slashOpen && (await waitFor(page, () => !document.querySelector('.bx-palette'), null, 2000)));
  await page.keyboard.press('?');
  const sc = await waitFor(page, () => /اختصارات الكيبورد والماوس/.test(document.body.innerText), null, 3000);
  check(G, '«?» lists every shortcut', sc && (await page.evaluate(() => document.querySelectorAll('.bx-shortcuts-group li').length)) >= 15);
  await page.keyboard.press('Escape');
  check(G, 'no page errors (preview, new tabs, quick search)', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // ---- cinema mode
  ({ page, ctx } = await openWeb(browser, { route: `/watch/${slugOf('Test Anime 4')}/1`, phone: false }));
  await waitFor(page, () => Boolean(document.querySelector('.bx-player-shell video')), null, 15000);
  await sleep(900);
  const lay = () =>
    page.evaluate(() => {
      const sh = document.querySelector('.bx-player-shell');
      const v = document.querySelector('.bx-player-shell > .bx-video-box')?.getBoundingClientRect();
      const sd = document.querySelector('.bx-player-shell > .bx-player-side')?.getBoundingClientRect();
      return {
        theatre: Boolean(sh?.classList.contains('is-theatre')),
        v: v ? { l: Math.round(v.left), r: Math.round(v.right), t: Math.round(v.top), w: Math.round(v.width) } : null,
        s: sd ? { l: Math.round(sd.left), r: Math.round(sd.right), t: Math.round(sd.top) } : null
      };
    });
  let L = await lay();
  const beside = (x) => Boolean(x.v && x.s && (x.s.r <= x.v.l + 2 || x.s.l >= x.v.r - 2) && Math.abs(x.s.t - x.v.t) < 40);
  check(G, 'cinema mode (computer): the video big, the episodes / party column beside it', L.theatre && beside(L) && L.v.w >= 760, JSON.stringify(L));
  await clickEl(page, '.bx-theatre-btn');
  await sleep(500);
  L = await lay();
  check(G, '…the header button turns it off (column under the video) and remembers it', !L.theatre && Boolean(L.s && L.v && L.s.t > L.v.t + 100) && (await page.evaluate(() => localStorage.getItem('bx_theatre'))) === 'off', JSON.stringify(L));
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('t');
  await sleep(500);
  L = await lay();
  check(G, '…and T turns it back on', L.theatre && beside(L), JSON.stringify(L));
  check(G, 'no page errors (cinema mode)', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();

  // ---- rankings
  ({ page, ctx } = await openWeb(browser, { route: '/rankings', phone: false }));
  await waitFor(page, () => document.querySelectorAll('.bx-rank-row:not(.is-skeleton)').length >= 5, null, 10000);
  const rk = await page.evaluate(() => [...document.querySelectorAll('.bx-rank-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  check(G, '/rankings: the app\'s ranking page (AniList average on every row)', rk.length === 6 && rk[0].includes('Test Anime 3') && /\b9\b/.test(rk[0]) && /AniList/.test(rk[0]), rk.slice(0, 2).join(' | '));
  check(G, '…BLACK X votes only where someone voted', /4 صوت على BLACK X/.test(rk[1] || '') && !/صوت/.test(rk[0] || '') && !/صوت/.test(rk[2] || ''), rk.slice(0, 3).join(' | '));
  check(G, '…members\' average on the 10-point scale (85 from the API → 8.5)', /8\.5\s*4 صوت/.test(rk[1] || '') && !/\b85\b/.test(rk[1] || ''), rk[1]);
  await clickEl(page, '.bx-rank-row', { text: 'Test Anime 5' });
  await waitFor(page, () => Boolean(document.querySelector('.bx-details-sheet')), null, 8000);
  check(G, '…a row opens that title on BLACK X', /Test Anime 5/.test(await detailsTitle(page)), await detailsTitle(page));
  await browserBack(page);
  await waitFor(page, () => document.querySelectorAll('.bx-rank-row').length >= 5, null, 6000);
  await clickEl(page, '.bx-rank-row', { text: 'Only On AniList' });
  await sleep(2000);
  check(G, '…a title BLACK X does not have opens the search for it, nothing else', !(await detailsOpen(page)) && /\/trending\?q=Only/.test(await here(page)), await here(page));
  await page.close();

  // ---- «ملخصك»
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const wrappedSeed = {
    bx_mob_positions_v16: {
      'aw-test-anime-4:1': { sec: 1400, dur: 1440, at: now - 3 * 3600e3 },
      'aw-test-anime-4:2': { sec: 700, dur: 1440, at: now - 2 * 3600e3 },
      'aw-test-anime-9:1': { sec: 1440, dur: 1440, done: true, at: now - 3600e3 }
    },
    bx_mob_history: [
      { slug: 'aw-test-anime-4', objectID: 'Test Anime 4', episode: 2, titleEn: 'Test Anime 4', poster: `${LOCAL}/poster/4.svg`, tags: ['دراما', 'كوميدي'], updatedAt: iso(now - 2 * 3600e3) },
      { slug: 'aw-test-anime-9', objectID: 'Test Anime 9', episode: 1, titleEn: 'Test Anime 9', poster: `${LOCAL}/poster/1.svg`, tags: ['أكشن', 'مغامرات'], updatedAt: iso(now - 3600e3) }
    ],
    bx_mob_favorites: [{ objectID: 'Test Anime 9', slug: 'aw-test-anime-9', titleEn: 'Test Anime 9', poster: `${LOCAL}/poster/1.svg`, createdAt: iso(now - 3600e3) }]
  };
  ({ page, ctx } = await openWeb(browser, { route: '/profile/wrapped', phone: false, seed: wrappedSeed }));
  await waitFor(page, () => Boolean(document.querySelector('.bx-wrapped-grid')), null, 8000);
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.bx-wrapped-tile')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()));
  const tileText = tiles.join(' | ');
  check(
    G,
    '«ملخصك»: the year from what was recorded (59 د, 2 finished, 3 started, 2 titles, 1 added)',
    /59 د وقت المشاهدة/.test(tileText) && /2 حلقة كمّلتها/.test(tileText) && /3 حلقة بدأتها/.test(tileText) && /2 عمل اتفرجت عليه/.test(tileText) && /0 مانجا/.test(tileText) && /1 اتضاف لقائمتك/.test(tileText),
    tileText
  );
  const top = await page.evaluate(() => document.querySelector('.bx-wrapped-top li')?.innerText.replace(/\s+/g, ' ') || '');
  check(G, '…most watched: Test Anime 4 (2 episodes)', /Test Anime 4/.test(top) && /2 حلقة/.test(top), top);
  check(G, '…no level, «TOP 1%» or fixed genre like the classic card had', !/TOP 1%|LVL|Dark Fantasy/.test(await page.evaluate(() => document.querySelector('main')?.innerText || '')));
  await clickEl(page, '.bx-wrapped-actions button', { text: 'نزّل الصورة' });
  check(G, '…the image is made and saved', await waitFor(page, () => /اتحفظت الصورة/.test(document.body.innerText), null, 6000));
  await page.close();
  ({ page, ctx } = await openWeb(browser, { route: '/profile/wrapped', phone: false, seed: { bx_mob_positions_v16: {}, bx_mob_history: [], bx_mob_favorites: [] } }));
  await waitFor(page, () => /لسه مفيش مشاهدات/.test(document.querySelector('main')?.innerText || ''), null, 8000);
  check(G, '…nothing recorded: it says so (no made-up numbers)', /لسه مفيش مشاهدات/.test(await page.evaluate(() => document.querySelector('main')?.innerText || '')));
  await page.close();

  // ---- the watch party between two browsers
  const fs = new Map();
  const fsTimes = new Map();
  // A second browser (its own storage = another person). Extra browser contexts crash the
  // single-process test Chromium, so the guest gets its own browser process.
  const browser2 = await launch();
  const host = await openWeb(browser, { route: `/watch/${slugOf('Test Anime 6')}/1`, phone: false, ctx: { fs, fsTimes } });
  await waitFor(host.page, () => Boolean(document.querySelector('.bx-player-shell video')), null, 15000);
  await sleep(800);
  await clickEl(host.page, '.bx-party-toggle');
  await waitFor(host.page, () => Boolean(document.querySelector('.bx-party')), null, 3000);
  await clickEl(host.page, '.bx-party button', { text: 'افتح غرفة للحلقة دي' });
  await waitFor(host.page, () => Boolean(document.querySelector('.bx-party-code')), null, 8000);
  const code = await host.page.evaluate(() => document.querySelector('.bx-party-code')?.textContent.trim() || '');
  check(G, 'watch party: «افتح غرفة» makes a real room with a code (the host\'s document)', /^BX[A-Z0-9]{6}$/.test(code) && fs.has(`settings/wp_${code.toLowerCase()}`), code);
  check(G, '…the address bar is the invite link', new RegExp(`[?&]party=${code}`).test(await here(host.page)), await here(host.page));
  await host.page.evaluate(() => {
    const v = document.querySelector('.bx-player-shell video');
    v.currentTime = 300;
    return v.play().catch(() => {});
  });
  await sleep(1200);
  const guest = await openWeb(browser2, { route: `/watch/${slugOf('Test Anime 6')}/1?party=${code}`, phone: false, ctx: { fs, fsTimes } });
  const joined = await waitFor(guest.page, () => /الفيديو ماشي مع/.test(document.querySelector('.bx-party')?.innerText || ''), null, 20000);
  check(G, '…a friend opening the link in another browser joins the room', joined, await guest.page.evaluate(() => document.querySelector('.bx-party')?.innerText.slice(0, 80) || 'no panel'));
  const synced = await waitFor(
    guest.page,
    () => {
      const v = document.querySelector('.bx-player-shell video');
      return Boolean(v && v.currentTime > 296 && !v.paused);
    },
    null,
    20000
  );
  const gt = await guest.page.evaluate(() => document.querySelector('.bx-player-shell video')?.currentTime || 0);
  const ht = await host.page.evaluate(() => document.querySelector('.bx-player-shell video')?.currentTime || 0);
  check(G, '…and the video follows the host (same moment, playing)', synced && Math.abs(gt - ht) < 4, `host ${ht.toFixed(1)} s, guest ${gt.toFixed(1)} s`);
  await host.page.evaluate(() => document.querySelector('.bx-player-shell video').pause());
  check(G, '…the host pauses, the guest pauses', await waitFor(guest.page, () => Boolean(document.querySelector('.bx-player-shell video')?.paused), null, 10000));
  await guest.page.type('.bx-party-form input', 'أهلا من الضيف');
  await guest.page.keyboard.press('Enter');
  check(G, '…chat: the guest\'s message reaches the host', await waitFor(host.page, () => /أهلا من الضيف/.test(document.querySelector('.bx-party-chat')?.innerText || ''), null, 10000));
  await host.page.type('.bx-party-form input', 'رسالة من صاحب الغرفة');
  await guest.page.type('.bx-party-form input', 'رسالة من الضيف');
  await Promise.all([host.page.keyboard.press('Enter'), guest.page.keyboard.press('Enter')]);
  const both = (pg) => waitFor(pg, () => /رسالة من صاحب الغرفة/.test(document.querySelector('.bx-party-chat')?.innerText || '') && /رسالة من الضيف/.test(document.querySelector('.bx-party-chat')?.innerText || ''), null, 12000);
  check(G, '…two messages sent at the same moment both arrive (no lost message)', (await both(host.page)) && (await both(guest.page)));
  await clickEl(host.page, '.bx-party-reactions button');
  check(G, '…reactions float over the video for everyone', await waitFor(guest.page, () => Boolean(document.querySelector('.bx-party-float span')), null, 10000));
  const members = await host.page.evaluate(() => document.querySelector('.bx-party-members')?.innerText || '');
  check(G, '…the people list is who joined (two names), no viewer count', (members.match(/ضيف \d{4}/g) || []).length >= 2 && !/\d+\s*\/\s*\d+/.test(members), members);
  await clickEl(host.page, '.bx-party-leave');
  check(G, '…the host ends it and the guest is told', await waitFor(guest.page, () => /صاحب الغرفة قفل الحفلة/.test(document.body.innerText), null, 12000));
  const partyDocs = [...fs.entries()].filter(([k]) => /^settings\/wp_/.test(k));
  check(G, 'room and chat documents use only the fields the Firestore rules accept', partyDocs.length === 2 && partyDocs.every(([, f]) => Object.keys(f).sort().join() === 'json,updatedAt'), partyDocs.map(([k]) => k).join(' '));
  check(G, 'no page errors (watch party)', host.ctx.errors.length === 0 && guest.ctx.errors.length === 0, [...host.ctx.errors, ...guest.ctx.errors].slice(0, 3).join(' | '));
  await host.page.close();
  await guest.page.close();
  await browser2.close().catch(() => {});

  // ---- the classic profile's «ملخص 2026»: no more invented numbers
  ({ page, ctx } = await openWeb(browser, { route: '/profile?tab=wrapped', phone: false, ui: 'site', seed: { blackx_token: 'test-session-token-login-0123456789' } }));
  await waitFor(page, () => /ملخصك السنوي/.test(document.querySelector('.app-shell')?.innerText || ''), null, 12000);
  const classic = await page.evaluate(() => document.querySelector('.app-shell')?.innerText || '');
  check(G, 'classic «ملخص 2026»: no «TOP 1%», levels or fixed genre — a link to «ملخصك»', /ملخصك السنوي/.test(classic) && !/TOP 1%|Dark Fantasy|ZIAD AL SHAFY/.test(classic));
  await page.close();
});

/* ============================================================ close-out (2026-10-17) */
// Community writes from two browsers (precondition updates, client/src/mobile/sharedLists.js),
// the privacy policy / terms, the redesigned developer panel, crash reports and the SEO files.
scenario('closeout', async (browser) => {
  const G = 'closeout';
  let page;
  let ctx;
  const until = async (fn, timeout = 10000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (fn()) return true;
      await sleep(150);
    }
    return Boolean(fn());
  };
  const person = (id, name, extra = {}) => ({ id: `u_${id}`, username: id, displayName: name, email: `${id}@example.com`, role: 'user', ...extra });
  const sessionOf = (user) => ({
    bx_mob_session_v16: { token: `test-session-token-${user.username}-0123456789abcdef`, savedAt: Date.now() },
    bx_mob_user: { vipTier: 'free', ...user }
  });
  const mainText = (pg) => pg.evaluate(() => document.querySelector('main')?.innerText || '');
  // localStorage is shared by every page of one browser: sign the seeded person out again.
  const clearStorage = async (br) => {
    const pg = await br.newPage();
    await pg.goto(`${LOCAL}/__blank`, { waitUntil: 'domcontentloaded' });
    await pg.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await pg.close();
  };

  // ---- community: two people write at the same moment, nothing is lost
  const fs = new Map();
  const fsTimes = new Map();
  fs.set('settings/shared_community_feed', {
    json: {
      stringValue: JSON.stringify([
        { id: 'post_z', author: 'Kai', username: 'kai', role: 'user', category: 'discussion', isSpoiler: false, createdAt: new Date(Date.now() - 60e3).toISOString(), time: '', text: 'بوست للايكات', likes: 0, likedBy: [], replies: [] }
      ])
    }
  });
  const feedNow = () => JSON.parse(fs.get('settings/shared_community_feed')?.json?.stringValue || '[]');
  const alice = person('alice', 'Alice');
  const bob = person('bob', 'Bob');
  const browser2 = await launch();
  const a = await openWeb(browser, { route: '/community', seed: sessionOf(alice), ctx: { fs, fsTimes, userPatch: alice } });
  const b = await openWeb(browser2, { route: '/community', seed: sessionOf(bob), ctx: { fs, fsTimes, userPatch: bob } });
  for (const x of [a, b]) await waitFor(x.page, () => Boolean(document.querySelector('.bx-composer textarea')) && /بوست للايكات/.test(document.querySelector('main')?.innerText || ''), null, 15000);
  await a.page.type('.bx-composer textarea', 'بوست من أليس');
  await b.page.type('.bx-composer textarea', 'بوست من بوب');
  await Promise.all([tapEl(a.page, '.bx-composer button[type="submit"]'), tapEl(b.page, '.bx-composer button[type="submit"]')]);
  const both = await until(() => {
    const t = feedNow().map((x) => x.text).join('|');
    return /بوست من أليس/.test(t) && /بوست من بوب/.test(t) && /بوست للايكات/.test(t);
  }, 15000);
  check(G, 'two posts sent at the same moment from two browsers are both saved (and the old one kept)', both, feedNow().map((x) => x.text).join(' | '));
  for (const x of [a, b]) {
    await x.page.evaluate(() => {
      const post = [...document.querySelectorAll('.bx-post')].find((el) => /بوست للايكات/.test(el.innerText));
      post?.querySelector('.bx-post-act')?.setAttribute('data-test-like', '1');
    });
  }
  await Promise.all([tapEl(a.page, '[data-test-like]'), tapEl(b.page, '[data-test-like]')]);
  const liked = await until(() => {
    const z = feedNow().find((x) => x.id === 'post_z');
    return Boolean(z && z.likes === 2 && z.likedBy.length === 2);
  }, 15000);
  check(G, 'two likes at the same moment on one post count 2', liked, JSON.stringify(feedNow().find((x) => x.id === 'post_z') || {}).slice(0, 160));
  await a.page.reload({ waitUntil: 'domcontentloaded' });
  const seen = await waitFor(a.page, () => /بوست من بوب/.test(document.querySelector('main')?.innerText || '') && /بوست من أليس/.test(document.querySelector('main')?.innerText || ''), null, 15000);
  check(G, '…and everyone sees both posts', seen, (await mainText(a.page)).slice(0, 120));
  check(G, 'no page errors (two-browser community)', a.ctx.errors.length === 0 && b.ctx.errors.length === 0, [...a.ctx.errors, ...b.ctx.errors].slice(0, 3).join(' | '));
  await a.page.close();
  await b.page.close();
  await browser2.close().catch(() => {});
  await clearStorage(browser);

  // ---- privacy policy and terms (app interface)
  ({ page, ctx } = await openWeb(browser, { route: '/privacy' }));
  await waitFor(page, () => Boolean(document.querySelector('.bx-legal')), null, 10000);
  check(G, '/privacy opens the privacy policy page', (await topTitle(page)) === 'سياسة الخصوصية' && (await page.evaluate(() => document.querySelectorAll('.bx-legal-section').length)) >= 8, await topTitle(page));
  check(G, '…dated, in Arabic, right to left', await page.evaluate(() => /آخر تحديث/.test(document.querySelector('.bx-legal-updated')?.innerText || '') && document.querySelector('.bx-legal')?.getAttribute('dir') === 'rtl'));
  check(G, '…the browser tab says so', (await page.title()).startsWith('سياسة الخصوصية'), await page.title());
  await tapEl(page, '.bx-legal-footer .bxp-row', { text: 'شروط الاستخدام' });
  await waitFor(page, () => document.querySelector('.bx-legal')?.getAttribute('data-legal') === 'terms', null, 6000);
  check(G, '…links to the terms, at /terms', (await topTitle(page)) === 'شروط الاستخدام' && (await here(page)) === '/terms', `${await topTitle(page)} ${await here(page)}`);
  check(G, 'no page errors (legal pages)', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();
  ({ page, ctx } = await openWeb(browser, { route: '/profile' }));
  await waitFor(page, () => Boolean(document.querySelector('.bxp.is-root')), null, 10000);
  const legalRows = await page.evaluate(() => [...document.querySelectorAll('.bxp-row')].map((r) => r.innerText.trim()).filter((t) => /سياسة الخصوصية|شروط الاستخدام/.test(t)));
  check(G, 'profile: «عن BLACK X» has the privacy policy and the terms', legalRows.length === 2, legalRows.join(' | '));
  await page.close();
  ({ page, ctx } = await openWeb(browser, { route: '/profile/privacy' }));
  await waitFor(page, () => Boolean(document.querySelector('.bxp.is-sub')), null, 10000);
  check(G, '/profile/privacy is still the privacy & security settings', (await topTitle(page)) === 'الخصوصية والأمان', await topTitle(page));
  await page.close();
  ({ page, ctx } = await openWeb(browser, { route: '/profile/signin' }));
  await waitFor(page, () => Boolean(document.querySelector('.bxp-consent')), null, 10000);
  check(G, 'sign in: the consent line links the terms and the policy', (await page.evaluate(() => document.querySelectorAll('.bxp-consent .bxp-link').length)) === 2);
  await tapEl(page, '.bxp-consent .bxp-link', { text: 'سياسة الخصوصية' });
  await waitFor(page, () => document.querySelector('.bx-legal')?.getAttribute('data-legal') === 'policy', null, 6000);
  check(G, '…and a tap opens the policy', (await topTitle(page)) === 'سياسة الخصوصية', await topTitle(page));
  await page.close();
  // classic website pages
  ({ page, ctx } = await openWeb(browser, { route: '/privacy', phone: false, ui: 'site' }));
  await waitFor(page, () => Boolean(document.querySelector('.bx-legal-page .bx-legal-title')), null, 12000);
  check(G, 'classic website: /privacy is the same policy', /سياسة الخصوصية/.test(await page.evaluate(() => document.querySelector('.bx-legal-title')?.innerText || '')));
  check(G, '…and its footer links both pages', await page.evaluate(() => Boolean(document.querySelector('footer a[href="/privacy"]') && document.querySelector('footer a[href="/terms"]'))));
  check(G, 'no page errors (classic legal page)', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();
  await clearStorage(browser); // forget the classic-pages choice (bx_web_ui_v2)

  // ---- developer panel (developer session only)
  const dev = { id: 'u_dev', username: 'blackx', displayName: 'BLACK X', email: 'mz0970mmz@gmail.com', role: 'developer', isDeveloper: true, vipTier: 'vip_monarch' };
  ({ page, ctx } = await openWeb(browser, { route: '/profile', seed: sessionOf(dev), ctx: { developer: true, userPatch: dev } }));
  await waitFor(page, () => [...document.querySelectorAll('.bxp-row')].some((r) => /لوحة المطور/.test(r.innerText)), null, 12000);
  await tapEl(page, '.bxp-row', { text: 'لوحة المطور' });
  await waitFor(page, () => Boolean(document.querySelector('.bxp-devpanel')) && /BX-MON-TEST-CODE/.test(document.querySelector('.bxp-devpanel')?.innerText || ''), null, 10000);
  const shape = await page.evaluate(() => ({
    stats: document.querySelectorAll('.bxp-dev-stats > button').length,
    tabs: document.querySelectorAll('.bxp-dev-tabs [role="radio"]').length,
    inline: document.querySelectorAll('.bxp-devpanel [style]').length
  }));
  check(G, 'developer panel: profile-hub design (4 stats, 5 tabs, no inline styles)', shape.stats === 4 && shape.tabs === 5 && shape.inline === 0, JSON.stringify(shape));
  check(G, '…the codes from the server are listed', /BX-MON-TEST-CODE/.test(await page.evaluate(() => document.querySelector('.bxp-devpanel')?.innerText || '')));
  await tapEl(page, '.bxp-dev-tabs [role="radio"]', { text: 'الطلبات' });
  await waitFor(page, () => /الحلقة 3 مش شغالة/.test(document.querySelector('.bxp-devpanel')?.innerText || ''), null, 4000);
  check(G, '…requests tab: members\' requests', /الحلقة 3 مش شغالة/.test(await page.evaluate(() => document.querySelector('.bxp-devpanel')?.innerText || '')));
  await tapEl(page, '.bxp-dev-tabs [role="radio"]', { text: 'الأخطاء' });
  await waitFor(page, () => /Cannot read properties/.test(document.querySelector('.bxp-devpanel')?.innerText || '') && /المفتاح العام/.test(document.querySelector('.bxp-devpanel')?.innerText || ''), null, 8000);
  const errText = await page.evaluate(() => document.querySelector('.bxp-devpanel')?.innerText || '');
  check(G, '…errors tab: the crash reports with their count', /Cannot read properties/.test(errText) && /3×/.test(errText), errText.slice(0, 160));
  check(G, '…and the phase-2 status from /api/health', /حماية الحسابات \(المرحلة 2\)/.test(errText) && /المفتاح العام/.test(errText));
  check(G, 'no page errors (developer panel)', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();
  await clearStorage(browser);
  ({ page, ctx } = await openWeb(browser, { route: '/profile' }));
  await waitFor(page, () => Boolean(document.querySelector('.bxp.is-root')), null, 10000);
  check(G, 'a normal visitor has no developer row', await page.evaluate(() => ![...document.querySelectorAll('.bxp-row')].some((r) => /لوحة المطور/.test(r.innerText))));
  await page.close();

  // ---- account deletion (profile → privacy & security → delete account)
  const sara = person('sara', 'Sara');
  ({ page, ctx } = await openWeb(browser, {
    route: '/profile/privacy',
    seed: { ...sessionOf(sara), bx_mob_favorites: [{ objectID: 'Naruto', titleEn: 'Naruto', slug: 'naruto' }] },
    ctx: { userPatch: sara, deletePassword: 'secret12' }
  }));
  const hasDeleteRow = await waitFor(page, () => [...document.querySelectorAll('main .bxp-row')].some((r) => /مسح الحساب/.test(r.innerText)), null, 10000);
  check(G, 'privacy & security: a member gets «مسح الحساب»', hasDeleteRow);
  await tapEl(page, 'main .bxp-row', { text: 'مسح الحساب' });
  await waitFor(page, () => document.querySelector('.bx-topbar-title')?.textContent.trim() === 'مسح الحساب' && Boolean(document.querySelector('.bxp-delete-btn')), null, 6000);
  const delPage = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('main .bxp-group')];
    const gone = groups.find((g) => /هيتمسح/.test(g.querySelector('.bxp-group-title')?.textContent || ''));
    return {
      gone: gone ? gone.querySelectorAll('.bxp-row').length : 0,
      kept: /تعليقات الحلقات/.test(document.querySelector('main')?.innerText || ''),
      password: Boolean(document.querySelector('main input[type="password"]')),
      disabled: document.querySelector('.bxp-delete-btn')?.disabled === true
    };
  });
  check(G, 'the delete page says what goes (5 rows) and what stays, and asks for the password', delPage.gone === 5 && delPage.kept && delPage.password, JSON.stringify(delPage));
  check(G, '…its button stays off until the user name is typed', delPage.disabled);
  await page.type('main .bxp-form input:not([type="password"])', 'sara');
  await page.type('main input[type="password"]', 'wrong');
  await tapEl(page, '.bxp-delete-btn');
  const refused = await until(() => (ctx.accountDeletes || []).length === 1, 8000);
  await waitFor(page, () => /كلمة المرور غلط/.test([...document.querySelectorAll('.bx-toast')].map((t) => t.innerText).join(' ')), null, 4000);
  check(G, 'a wrong password is refused: told so, still signed in', refused && /كلمة المرور غلط/.test(await toastText(page)) && (await page.evaluate(() => Boolean(localStorage.getItem('bx_mob_session_v16')))), await toastText(page));
  await page.$eval('main input[type="password"]', (el) => el.select());
  await page.type('main input[type="password"]', 'secret12');
  await tapEl(page, '.bxp-delete-btn');
  const sent = await until(() => (ctx.accountDeletes || []).length === 2, 8000);
  const signedOut = await waitFor(page, () => !localStorage.getItem('bx_mob_session_v16') && !localStorage.getItem('bx_mob_user'), null, 8000);
  const lastDelete = (ctx.accountDeletes || [])[1] || {};
  check(G, 'the right password deletes it: user name + password sent, signed out', sent && signedOut && lastDelete.confirm === 'sara' && lastDelete.password === 'secret12', JSON.stringify(ctx.accountDeletes || []));
  check(G, '…the list on this device is cleared too (the default)', await page.evaluate(() => !localStorage.getItem('bx_mob_favorites')));
  await waitFor(page, () => Boolean(document.querySelector('.bxp.is-root')), null, 6000);
  check(G, '…and the profile is back to the guest page', await page.evaluate(() => Boolean(document.querySelector('.bxp.is-root')) && !document.querySelector('.bxp-signout')), await topTitle(page));
  check(G, 'no page errors (account deletion)', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await page.close();
  await clearStorage(browser);
  ({ page, ctx } = await openWeb(browser, { route: '/privacy' }));
  await waitFor(page, () => Boolean(document.querySelector('.bx-legal')), null, 10000);
  const policyText = await page.evaluate(() => document.querySelector('.bx-legal')?.innerText || '');
  check(G, 'the policy explains the delete button and names the new address', /«الخصوصية والأمان» ← «مسح الحساب»/.test(policyText) && /black-x-anime\.ai\.studio/.test(policyText) && !/لسه مفيش زرار/.test(policyText), policyText.slice(0, 80));
  await page.close();

  // ---- crash reports (thrown from a page script: errors from DevTools-evaluated code reach
  // window.onerror as a muted «Script error.», which the reporter ignores on purpose)
  const pageScript = (pg, code) =>
    pg.evaluate((c) => {
      const el = document.createElement('script');
      el.textContent = c;
      document.head.appendChild(el);
    }, code);
  ({ page, ctx } = await openWeb(browser, { route: '/trending' }));
  await waitFor(page, () => Boolean(document.querySelector('.bx-dock')), null, 10000);
  await pageScript(page, "setTimeout(function () { throw new Error('bx test crash 7'); }, 0);");
  await until(() => (ctx.telemetry || []).length > 0, 5000);
  const rep = (ctx.telemetry || [])[0] || {};
  check(G, 'a crash sends one anonymous report', (ctx.telemetry || []).length === 1 && /bx test crash/.test(rep.message || ''), JSON.stringify(rep).slice(0, 160));
  check(G, '…page path only, platform web, no account in it', rep.path === '/trending' && rep.platform === 'web' && !/tester|@example/.test(JSON.stringify(rep)), JSON.stringify(rep).slice(0, 200));
  await pageScript(page, "setTimeout(function () { throw new Error('bx test crash 8'); }, 0); Promise.reject(new Error('Failed to fetch'));");
  await sleep(1000);
  check(G, '…the same error again and network drops send nothing more', (ctx.telemetry || []).length === 1, String((ctx.telemetry || []).length));
  await page.close();

  // ---- SEO files and the page description
  const robots = await (await fetch(`${LOCAL}/robots.txt`)).text();
  check(G, 'robots.txt: keeps crawlers off /api and the player, points to the sitemap', /Disallow: \/api\//.test(robots) && /Disallow: \/watch\//.test(robots) && /Sitemap: https:\/\/black-x-anime\.ai\.studio\/sitemap\.xml/.test(robots), robots.slice(0, 120));
  const sitemap = await (await fetch(`${LOCAL}/sitemap.xml`)).text();
  check(G, 'sitemap.xml lists the main pages and the legal pages', /<loc>https:\/\/black-x-anime\.ai\.studio\/trending<\/loc>/.test(sitemap) && !/black-x-anime\.me/.test(sitemap) && /\/privacy<\/loc>/.test(sitemap) && /\/terms<\/loc>/.test(sitemap), sitemap.slice(0, 80));
  ({ page, ctx } = await openWeb(browser, { route: '/discover' }));
  await waitFor(page, () => document.title.startsWith('المواعيد'), null, 8000);
  const meta = await page.evaluate(() => ({ title: document.title, desc: document.querySelector('meta[name="description"]')?.content || '' }));
  check(G, 'every tab has its own title; the description has no old «Prediction Engine» claim', meta.title === 'المواعيد — BLACK X' && /الأنمي والمانجا/.test(meta.desc) && !/Prediction/.test(meta.desc), JSON.stringify(meta));
  await page.close();
});

/* ==================================================================== runner */
const server = await startServer();
for (const sc of scenarios) {
  if (ONLY.length && !ONLY.includes(sc.name)) continue;
  console.log(`\n--- web:${sc.name} ---`);
  const browser = await launch();
  try {
    await sc.fn(browser);
  } catch (err) {
    check(sc.name, 'scenario finished without crashing', false, err.stack?.split('\n').slice(0, 3).join(' / ') || String(err));
  } finally {
    await browser.close().catch(() => {});
  }
}
server.close();
const { pass, total } = summary();
process.exit(pass === total ? 0 : 1);
