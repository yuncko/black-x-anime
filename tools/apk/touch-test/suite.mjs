// BLACK X APK — real-touch regression suite (v17 UI), run against assets/public of the built APK.
// Use ./run.sh; `ONLY=nav,player ./run.sh` runs some scenarios. One browser per scenario.
import { startServer, launch, openApp, check, sleep, swipe, tapEl, boxOf, waitVt, doubleTap, text, summary, TODAY, LOCAL, APK_RELEASE } from './lib.mjs';

const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

const activeTab = (page) => page.evaluate(() => document.querySelector('.bx-dock-item.is-active')?.getAttribute('aria-label') || '');
const topTitle = (page) => page.evaluate(() => document.querySelector('.bx-topbar-title')?.textContent.trim() || '');
const winY = (page) => page.evaluate(() => Math.round(window.scrollY));
const back = (page) => page.evaluate(() => window.__bxHardwareBack && window.__bxHardwareBack());
const nativeCalls = (page, name) => page.evaluate((n) => window.__bxNativeCalls.filter((c) => c.name === n).map((c) => c.args), name);

async function toTop(page) {
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = '';
  });
  await sleep(250);
}

async function fingerScroll(page, group, label, minDelta = 120) {
  await toTop(page);
  const y0 = await winY(page);
  await swipe(page, 206, 720, 206, 250);
  await sleep(900);
  const y1 = await winY(page);
  const h = await page.evaluate(() => `${document.documentElement.scrollHeight}/${innerHeight}`);
  return check(group, `${label}: scrolls by finger`, y1 - y0 > minDelta, `${y0}→${y1} (page ${h})`);
}

/** Taps a dock tab and reports which page motion was used ('' = none). */
async function tapTab(page, label) {
  await page.evaluate(() => {
    window.__bxMotionSeen = '';
    const root = document.documentElement;
    window.__bxMotionObs?.disconnect();
    window.__bxMotionObs = new MutationObserver((records) => {
      if (window.__bxMotionSeen) return;
      for (const r of records) {
        if (r.type === 'attributes' && r.target === root && root.dataset.bxVt) {
          window.__bxMotionSeen = `vt:${root.dataset.bxVt}`;
          return;
        }
        if (r.type === 'childList') {
          for (const n of r.addedNodes) {
            if (n.nodeType !== 1) continue;
            const pg = n.matches('.bx-page') ? n : n.querySelector?.('.bx-page');
            const c = pg && [...pg.classList].find((k) => k.startsWith('bx-enter-') && k !== 'bx-enter-vt');
            if (c) {
              window.__bxMotionSeen = c;
              return;
            }
          }
        }
      }
    });
    window.__bxMotionObs.observe(root, { attributes: true, attributeFilter: ['data-bx-vt'], childList: true, subtree: true });
  });
  await tapEl(page, '.bx-dock-item', { text: label, exact: true, scroll: false });
  await waitVt(page);
  await sleep(250);
  return page.evaluate(() => {
    window.__bxMotionObs?.disconnect();
    return window.__bxMotionSeen || '';
  });
}

async function markPosterInSection(page, sectionTitle, posterTitle) {
  return page.evaluate(
    (sectionTitle, posterTitle) => {
      document.querySelectorAll('[data-test-target]').forEach((e) => e.removeAttribute('data-test-target'));
      const heads = [...document.querySelectorAll('.bx-section-title')].filter((h) => h.textContent.trim() === sectionTitle);
      for (const h of heads) {
        // Only that section (v18: «بيتعرض دلوقتي» is a row of wide cards, not posters).
        const sec = h.closest('section') || h.parentElement;
        const card = [...(sec?.querySelectorAll('.bx-poster, .bx-wide-card') || [])].find(
          (p) => p.querySelector('.bx-poster-title, .bx-wide-title')?.textContent.trim() === posterTitle
        );
        if (card) {
          card.setAttribute('data-test-target', '1');
          return true;
        }
      }
      return false;
    },
    sectionTitle,
    posterTitle
  );
}

async function videoState(page) {
  return page.evaluate(() => {
    const v = document.querySelector('video');
    return v ? { t: Number(v.currentTime.toFixed(2)), paused: v.paused, rate: v.playbackRate, rs: v.readyState, dur: Number(v.duration || 0), src: v.currentSrc || v.src || '' } : null;
  });
}

async function waitVideo(page, fn, timeout = 15000) {
  const end = Date.now() + timeout;
  let s = null;
  while (Date.now() < end) {
    s = await videoState(page);
    if (s && fn(s)) return s;
    await sleep(200);
  }
  return s;
}

async function controlsVisible(page) {
  return page.evaluate(() => document.querySelector('.bx-pc')?.classList.contains('is-visible') || false);
}

async function revealControls(page) {
  if (await controlsVisible(page)) return;
  const s = await boxOf(page, '.bx-pc-surface', { scroll: false });
  await page.touchscreen.tap(s.x, s.y - s.h * 0.25);
  await sleep(450);
}

/* ======================================================================= nav */
scenario('nav', async (browser) => {
  const G = 'nav';
  const { page, ctx } = await openApp(browser);
  const dock = await page.evaluate(() => [...document.querySelectorAll('.bx-dock .bx-dock-item')].map((b) => b.getAttribute('aria-label')));
  check(G, 'dock has exactly 5 tabs', dock.length === 5, dock.join(' | '));
  check(G, 'no «حسابي» tab in the dock', !dock.includes('حسابي'));
  check(G, 'dock labels are visible', await page.evaluate(() => [...document.querySelectorAll('.bx-dock-label')].every((l) => l.getBoundingClientRect().width > 4)));
  check(G, 'home hero is shown', await page.evaluate(() => Boolean(document.querySelector('.bx-hero'))));
  check(G, 'bundled fonts loaded (no network fonts)', await page.evaluate(() => [...document.fonts].some((f) => f.family.includes('Cairo') && f.status === 'loaded')));
  await fingerScroll(page, G, 'home');
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, 600)); // rows below the fold mount on approach
    await sleep(300);
  }
  const sections = await text(page, '.bx-section-title');
  check(G, 'home shows its sections', sections.length >= 6, sections.join(' | '));

  // A horizontal rail scrolls sideways by finger (RTL: swipe left -> right reveals more).
  const rail = await page.evaluate(() => {
    const el = [...document.querySelectorAll('main *')].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 200 && e.clientHeight > 80);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    el.setAttribute('data-test-rail', '1');
    const r = el.getBoundingClientRect();
    return { y: r.top + r.height / 2, sl: el.scrollLeft };
  });
  if (rail) {
    await sleep(300);
    await swipe(page, 60, rail.y, 350, rail.y, { steps: 12 });
    await sleep(800);
    const sl = await page.evaluate(() => document.querySelector('[data-test-rail]').scrollLeft);
    check(G, 'home rail scrolls sideways by finger', Math.abs(sl - rail.sl) > 80, `${rail.sl}→${sl}`);
    check(G, 'sideways swipe did not open anything', !(await page.evaluate(() => Boolean(document.querySelector('.bx-details-sheet, .bx-bottom-sheet')))));
  } else check(G, 'home rail found', false);

  await toTop(page);
  const indHome = await page.evaluate(() => getComputedStyle(document.querySelector('.bx-dock-indicator')).transform);
  const expectTitles = { البحث: '', الجدول: 'جدول الحلقات', المانجا: 'المانجا', المجتمع: 'المجتمع' };
  for (const [label, title] of Object.entries(expectTitles)) {
    const motion = await tapTab(page, label);
    const act = await activeTab(page);
    const tt = await topTitle(page);
    check(G, `tab «${label}» opens`, act === label && (!title || tt === title), `active=${act} title=${tt}`);
    check(G, `tab «${label}» slides in from the left (RTL forward)`, /from-left/.test(motion) || motion === 'bx-enter-from-left', motion || 'no motion');
    if (label === 'المجتمع' || label === 'البحث') await fingerScroll(page, G, `tab «${label}»`, 60);
  }
  const indComm = await page.evaluate(() => getComputedStyle(document.querySelector('.bx-dock-indicator')).transform);
  check(G, 'dock indicator moved with the tab', indHome !== indComm, `${indHome} → ${indComm}`);

  const mBack = await tapTab(page, 'الرئيسية');
  check(G, 'going back to home slides from the right', /from-right/.test(mBack), mBack || 'no motion');
  check(G, 'home tab active again', (await activeTab(page)) === 'الرئيسية');

  // Profile only from the top-bar picture
  await tapEl(page, '.bx-avatar-btn', { scroll: false });
  await waitVt(page);
  await sleep(300);
  check(G, 'top avatar opens the profile', (await topTitle(page)) === 'حسابي', await topTitle(page));
  check(G, 'no dock tab is active on the profile', (await activeTab(page)) === '' && (await page.evaluate(() => document.querySelector('.bx-dock-indicator')?.classList.contains('is-off'))));
  const guest = await page.evaluate(() => {
    const pw = [...document.querySelectorAll('input[type="password"]')].find((i) => i.getBoundingClientRect().height > 0);
    const btn = [...document.querySelectorAll('main .bxp-hero.is-guest button')].find((b) => /Google|الدخول/.test(b.innerText || ''));
    const r = (pw || btn)?.getBoundingClientRect();
    return r ? Math.round(r.top) : -1;
  });
  check(G, 'guest sees the sign-in card first', guest > 0 && guest < 915, `top=${guest}`);
  await back(page);
  await waitVt(page);
  check(G, 'hardware back from profile → home', (await activeTab(page)) === 'الرئيسية');

  await tapTab(page, 'الجدول');
  await back(page);
  await waitVt(page);
  check(G, 'hardware back from a tab → home', (await activeTab(page)) === 'الرئيسية');

  // Side menu
  await tapEl(page, '.bx-topbar [aria-label="القائمة"], [aria-label="القائمة"]', { scroll: false });
  await sleep(600);
  const items = await text(page, '.bx-menu-item');
  check(G, 'menu opens with its items', items.length >= 5 && items.some((t) => t.includes('قائمتي')) && items.some((t) => t.includes('الإعدادات')), items.join(' | ').slice(0, 200));
  check(G, 'menu has no duplicate tab links', !items.some((t) => /^(الرئيسية|البحث|الجدول|المجتمع)$/.test(t)));
  const ver = await page.evaluate((v) => document.body.innerText.match(new RegExp(`إصدار ${v.replace('.', '\\.')}[^\\n]*`))?.[0] || '', APK_RELEASE.version);
  check(G, `menu footer shows version ${APK_RELEASE.version} (shared/apkRelease.js)`, Boolean(ver), ver);
  const bd = await boxOf(page, '.bx-menu-backdrop', { scroll: false });
  await page.touchscreen.tap(bd ? Math.min(400, bd.left + bd.w - 10) : 400, 450);
  await sleep(700);
  check(G, 'menu closes from the backdrop', (await page.evaluate(() => [...document.querySelectorAll('.bx-menu-item')].filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > 0 && e.getBoundingClientRect().left < innerWidth).length)) === 0);

  // Long press on a card opens the quick peek (pointer events from a real touch)
  await toTop(page);
  check(G, 'a «أعلى 10 تقييماً» card to long-press', await page.evaluate(() => {
    const h = [...document.querySelectorAll('.bx-section-title')].find((e) => e.textContent.trim() === 'أعلى 10 تقييماً');
    let sec = h?.parentElement;
    while (sec && !sec.querySelector('.bx-poster')) sec = sec.parentElement;
    const card = sec?.querySelector('.bx-poster');
    card?.setAttribute('data-test-lp', '1');
    return Boolean(card);
  }));
  const lp = await boxOf(page, '[data-test-lp]');
  await page.touchscreen.touchStart(lp.x, lp.y);
  await sleep(800);
  await page.touchscreen.touchEnd();
  await sleep(500);
  check(G, 'long press on a card opens the quick peek (and it stays after lifting the finger)', await page.evaluate(() => Boolean(document.querySelector('.bx-peek-sheet'))));
  check(G, 'the long press did not also open the details', !(await page.evaluate(() => Boolean(document.querySelector('.bx-details-sheet')))));
  await back(page);
  await sleep(600);
  check(G, 'back closes the quick peek', !(await page.evaluate(() => Boolean(document.querySelector('.bx-peek-sheet')))));
  const lp2 = await boxOf(page, '[data-test-lp]');
  await page.touchscreen.touchStart(lp2.x, lp2.y);
  await sleep(700);
  await page.touchscreen.touchEnd();
  await sleep(700);
  await tapEl(page, '.bx-peek-sheet button', { text: 'الحلقات' });
  await page.waitForSelector('.bx-details-sheet', { timeout: 8000 }).catch(() => {});
  await sleep(500); // the peek animates out (0.24 s)
  check(G, 'a tap inside the quick peek works (opens the details)', await page.evaluate(() => Boolean(document.querySelector('.bx-details-sheet')) && !document.querySelector('.bx-peek-sheet')));
  await back(page);
  await sleep(900);
  check(G, 'normal tap on a card still opens the details', await (async () => {
    await page.evaluate(() => {
      const h = [...document.querySelectorAll('.bx-section-title')].find((e) => e.textContent.trim() === 'أعلى 10 تقييماً');
      let sec = h?.parentElement;
      while (sec && !sec.querySelector('.bx-poster')) sec = sec.parentElement;
      sec?.querySelector('.bx-poster')?.setAttribute('data-test-lp', '1');
    });
    await tapEl(page, '[data-test-lp]');
    await page.waitForSelector('.bx-details-sheet', { timeout: 8000 }).catch(() => {});
    const ok = await page.evaluate(() => Boolean(document.querySelector('.bx-details-sheet')) && !document.querySelector('.bx-peek-sheet'));
    await back(page);
    await sleep(900);
    return ok;
  })());

  // Language switch (menu → settings), saved, page direction follows
  await toTop(page); // the top bar slides away while the page is scrolled down
  await sleep(500);
  await tapEl(page, '.bx-topbar [aria-label="القائمة"]', { scroll: false });
  await sleep(600);
  await tapEl(page, '.bx-menu-item', { text: 'الإعدادات' });
  await sleep(900);
  await tapEl(page, '.bx-seg[aria-label="اللغة"] button', { text: 'English', exact: true });
  await sleep(900);
  const en = await page.evaluate(() => ({ dir: document.documentElement.dir, saved: localStorage.getItem('bx_mob_lang'), dock: [...document.querySelectorAll('.bx-dock-label')].map((l) => l.textContent.trim()).join(',') }));
  check(G, 'language switches to English (ltr, saved)', en.dir === 'ltr' && en.saved === 'en' && en.dock.startsWith('Home'), JSON.stringify(en));
  await tapEl(page, '.bx-seg[aria-label="Language"] button', { text: 'عربي', exact: true });
  await sleep(900);
  const ar = await page.evaluate(() => ({ dir: document.documentElement.dir, saved: localStorage.getItem('bx_mob_lang') }));
  check(G, 'and back to Arabic (rtl)', ar.dir === 'rtl' && ar.saved === 'ar', JSON.stringify(ar));
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

/* ==================================================================== search */
scenario('search', async (browser) => {
  const G = 'search';
  const { page, ctx } = await openApp(browser);
  await tapTab(page, 'البحث');
  await page.waitForFunction(() => document.querySelectorAll('main .bx-poster').length >= 6, { timeout: 10000 }).catch(() => {});
  const grid = await page.evaluate(() => [...document.querySelectorAll('main .bx-poster')].slice(0, 4).map((e) => {
    const r = e.getBoundingClientRect();
    return { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width) };
  }));
  const threeCols = grid.length === 4 && Math.abs(grid[0].t - grid[1].t) < 3 && Math.abs(grid[1].t - grid[2].t) < 3 && grid[3].t > grid[0].t + 40;
  check(G, 'results are a 3-column grid', threeCols, JSON.stringify(grid));
  await tapEl(page, '.bx-search-bar input', { scroll: false });
  await page.keyboard.type('Test Anime 1', { delay: 25 });
  await sleep(2300);
  const titles = await text(page, 'main .bx-poster-title');
  check(G, 'typing filters the results', titles.length > 0 && titles.every((t) => t.includes('Test Anime 1')), `${titles.length}: ${titles.slice(0, 5).join(', ')}`);
  const count = await page.evaluate(() => document.querySelector('.bx-search-count')?.textContent.trim() || '');
  check(G, 'result count shown', /11\s*نتيجة/.test(count), count);
  await tapEl(page, '.bx-search-clear', { scroll: false });
  await sleep(700);
  const recent = await page.evaluate(() => document.querySelector('.bx-search-recent')?.innerText || '');
  check(G, 'recent searches remember the query', recent.includes('Test Anime 1'), recent.replace(/\n/g, ' ').slice(0, 80));
  await tapEl(page, '.bx-search-recent .bx-chip', { text: 'Test Anime 1' });
  await sleep(900);
  check(G, 'tapping a recent search runs it', (await page.evaluate(() => document.querySelector('.bx-search-bar input')?.value)) === 'Test Anime 1');
  await tapEl(page, '.bx-search-clear', { scroll: false });
  await sleep(600);

  await tapEl(page, '.bx-search-tools .bx-chip', { text: 'فلترة', scroll: false });
  await sleep(700);
  const sheetTitle = await page.evaluate(() => document.querySelector('.bx-bottom-sheet .bx-sheet-head')?.innerText.trim() || '');
  check(G, 'filter sheet opens', sheetTitle.includes('فلترة'), sheetTitle);
  const before = ctx.algolia.length;
  await tapEl(page, '.bx-bottom-sheet .bx-chip', { text: 'أفلام', exact: true });
  await sleep(200);
  await tapEl(page, '.bx-bottom-sheet .bx-btn-primary', { text: 'عرض النتائج' });
  await sleep(1400);
  const req = ctx.algolia.slice(before).map((a) => JSON.stringify(a.body.facetFilters || ''));
  check(G, 'filter sends the type facet', req.some((r) => r.includes('type:فيلم')), req.slice(-2).join(' ; '));
  const movieTitles = await text(page, 'main .bx-poster-title');
  check(G, 'only movies are listed', movieTitles.length > 0 && movieTitles.every((t) => Number(t.replace(/\D+/g, '')) % 7 === 0), movieTitles.slice(0, 6).join(', '));
  const chip = await page.evaluate(() => document.querySelector('.bx-search-tools .bx-chip')?.innerText.trim() || '');
  check(G, 'filter chip shows the active count', /·\s*1/.test(chip), chip);
  check(G, 'sheet closed after applying', !(await page.evaluate(() => Boolean(document.querySelector('.bx-bottom-sheet')))));

  await tapEl(page, 'main .bx-poster', { index: 0 });
  await page.waitForSelector('.bx-details-sheet', { timeout: 8000 }).catch(() => {});
  check(G, 'tapping a result opens its details', await page.evaluate(() => Boolean(document.querySelector('.bx-details-sheet'))));
  await back(page);
  await sleep(900);
  check(G, 'back returns to the same results', (await activeTab(page)) === 'البحث' && (await text(page, 'main .bx-poster-title')).length === movieTitles.length);
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

/* ==================================================================== genres */
scenario('genres', async (browser) => {
  const G = 'genres';
  // Ecchi / Harem / Isekai are hidden from the whole app (client/src/mobile/contentFilter.js).
  // The mock puts such titles first in every list (lib.mjs HIDDEN_ANIME / HIDDEN_MANGA).
  const HIDDEN = ['Hidden Isekai Hero', 'Hidden Ecchi Club', 'Hidden Harem House', 'Hidden Isekai Movie', 'Hidden Airing Harem', 'Hidden English Isekai', 'Hidden Isekai Manhwa', 'Hidden Harem Manga', 'Hidden Ecchi Manga'];
  const saved = (name, extra = {}) => ({ slug: `aw-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, objectID: name, titleEn: name, titleAr: name, poster: `${LOCAL}/poster/2.svg`, banner: `${LOCAL}/wide/2.svg`, ...extra });
  const { page, ctx } = await openApp(browser, {
    seed: {
      // Saved before the update, so without genres: matched by the hidden-id list.
      bx_mob_favorites: [saved('Hidden Isekai Hero'), saved('Test Anime 5')],
      bx_mob_history: [
        saved('Hidden Harem House', { id: 'h1', episode: 3, docId: '003', position: 300, duration: 1440, updatedAt: new Date().toISOString() }),
        saved('Test Anime 7', { id: 'h2', episode: 2, docId: '002', position: 200, duration: 1440, updatedAt: new Date(Date.now() - 60000).toISOString() })
      ]
    }
  });
  const leaks = () => page.evaluate((names) => names.filter((n) => document.body.innerText.includes(n)), HIDDEN);
  const NEG = ['tags:-ايتشي', 'tags:-حريم', 'tags:-عالم مختلف'];
  await sleep(1200);
  const lists = ctx.algolia.filter((a) => a.body.hitsPerPage !== 1000);
  check(G, 'every catalogue query excludes Ecchi / Harem / Isekai', lists.length >= 6 && lists.every((a) => NEG.every((f) => (a.body.facetFilters || []).includes(f))), `${lists.length} queries`);
  const idq = ctx.algolia.filter((a) => a.body.hitsPerPage === 1000).map((a) => JSON.stringify(a.body.facetFilters));
  check(G, 'hidden ids fetched once per tag (for saved lists)', idq.length === 3, idq.join(' '));

  // Home: rows mount lazily, so scroll through all of them (latest episodes = `recent`, which
  // cannot facet on tags: only the app's second check keeps them out there).
  for (let i = 0; i < 9; i++) {
    await swipe(page, 206, 780, 206, 180);
    await sleep(300);
  }
  await sleep(700);
  const homeLeaks = await leaks();
  check(G, 'home shows none of them (every row, latest episodes too)', homeLeaks.length === 0, homeLeaks.join(', '));
  const chips = await text(page, '.bx-chip-row .bx-chip');
  check(G, 'browse by genre has no Isekai', chips.length >= 10 && !chips.some((c) => c.includes('عالم مختلف')), chips.join(' | '));
  await toTop(page);
  const cont = await page.evaluate(() => {
    const head = [...document.querySelectorAll('.bx-section-title')].find((h) => h.textContent.trim() === 'كمّل المشاهدة');
    return head ? (head.closest('section')?.innerText || '').replace(/\s+/g, ' ') : '';
  });
  check(G, 'continue watching keeps only visible saved titles', cont.includes('Test Anime 7') && !cont.includes('Hidden'), cont.slice(0, 120));

  // Search: grid + real total (60 of the 65 titles), no Isekai in the filter sheet
  await tapTab(page, 'البحث');
  await page.waitForFunction(() => document.querySelectorAll('main .bx-poster').length >= 6, { timeout: 10000 }).catch(() => {});
  const more = await page.evaluate(() => [...document.querySelectorAll('main .bx-btn')].map((b) => b.innerText.trim()).find((t) => t.startsWith('عرض المزيد')) || '');
  check(G, 'search grid and total leave them out (48 of 60)', (await leaks()).length === 0 && more.includes('48') && more.includes('60'), more);
  await tapEl(page, '.bx-search-tools .bx-chip', { text: 'فلترة', scroll: false });
  await sleep(700);
  const sheetChips = await text(page, '.bx-bottom-sheet .bx-chip');
  check(G, 'filter sheet has no Isekai genre', sheetChips.length > 10 && sheetChips.includes('قوة خارقة') && !sheetChips.some((c) => c.includes('عالم مختلف')), `${sheetChips.length} chips`);
  await tapEl(page, '.bx-bottom-sheet .bx-btn-primary', { text: 'عرض النتائج' });
  await sleep(900);

  // Typed search (website servers): Arabic tags and English genres are both filtered
  await tapEl(page, '.bx-search-bar input', { scroll: false });
  await page.keyboard.type('Hidden', { delay: 25 });
  await sleep(2300);
  const found = await text(page, 'main .bx-poster-title');
  check(G, 'typed search drops them (Arabic tags, English genres, manga)', found.length === 1 && found[0] === 'Hidden Gem Detective' && (await leaks()).length === 0, found.join(', '));
  await tapEl(page, '.bx-search-clear', { scroll: false });
  await sleep(600);

  // A server whose search rows carry no genres: its show page says Isekai, so it is refused
  await tapEl(page, '.bx-search-bar input', { scroll: false });
  await page.keyboard.type('Sneaky', { delay: 25 });
  await sleep(2300);
  await page.evaluate(() => {
    window.__bxToastsSeen = [];
    new MutationObserver(() => {
      document.querySelectorAll('.bx-toast').forEach((t) => window.__bxToastsSeen.push(t.innerText.trim()));
    }).observe(document.body, { childList: true, subtree: true });
  });
  await tapEl(page, 'main .bx-poster', { text: 'Sneaky Isekai Show' });
  await sleep(2600);
  const toasts = await page.evaluate(() => [...new Set(window.__bxToastsSeen)]);
  const stillOpen = await page.evaluate(() => Boolean(document.querySelector('.bx-details-sheet')));
  check(G, "details refuse a title whose show page is hidden-genre", !stillOpen && toasts.some((t) => t.includes('مش متاح في التطبيق')), `open=${stillOpen} toasts=${toasts.join(' | ')}`);
  await tapEl(page, '.bx-search-clear', { scroll: false }).catch(() => {});
  await sleep(500);

  // Schedule opens on today: the airing harem show is today's
  await tapTab(page, 'الجدول');
  await page.waitForFunction(() => (document.querySelector('main')?.innerText || '').includes('Test Anime 1'), { timeout: 10000 }).catch(() => {});
  await sleep(600);
  const sched = await page.evaluate(() => document.querySelector('main')?.innerText || '');
  check(G, "today's schedule leaves them out", sched.includes('Test Anime 1') && !sched.includes('Hidden'), sched.replace(/\s+/g, ' ').slice(0, 90));

  // Manga: website servers filtered by their genres, AniList asked without them
  await tapTab(page, 'المانجا');
  await page.waitForFunction(() => document.body.innerText.includes('Test Manhwa 1'), { timeout: 15000 }).catch(() => {});
  await sleep(600);
  const mangaLeaks = await leaks();
  check(G, 'manga library leaves them out', (await page.evaluate(() => document.body.innerText.includes('Test Manhwa 1'))) && mangaLeaks.length === 0, mangaLeaks.join(', '));
  const al = ctx.anilist.filter((b) => /type: MANGA/.test(b?.query || ''));
  check(G, 'AniList is asked without Ecchi / Isekai / Harem', al.length > 0 && al.every((b) => b.variables?.genreNotIn?.includes('Ecchi') && b.variables?.tagNotIn?.includes('Isekai') && b.variables?.tagNotIn?.includes('Male Harem')), `${al.length} AniList queries`);

  // Menu: "My list" badge and the catalogue total count what the app can show
  await tapTab(page, 'الرئيسية');
  await toTop(page);
  await tapEl(page, '.bx-topbar [aria-label="القائمة"], [aria-label="القائمة"]', { scroll: false });
  await sleep(700);
  const menu = await page.evaluate(() => ({
    mylist: [...document.querySelectorAll('.bx-menu-item')].find((e) => e.innerText.includes('قائمتي'))?.innerText.replace(/\s+/g, ' ').trim() || '',
    ver: document.body.innerText.match(/إصدار \d+(?:\.\d+)*[^\n]*/)?.[0] || ''
  }));
  check(G, 'menu: "My list" badge counts visible favorites only (1)', /قائمتي\s*1\b/.test(menu.mylist) || menu.mylist.endsWith('1'), menu.mylist);
  check(G, 'menu total = titles the app can show (60, not 65)', /60 أنمي/.test(menu.ver), menu.ver);
  await tapEl(page, '.bx-menu-item', { text: 'قائمتي' });
  await sleep(1200);
  const lib = await page.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' '));
  check(G, 'my list shows the visible favorite, not the hidden one', /المفضلة\s*1/.test(lib) && lib.includes('Test Anime 5') && !lib.includes('Hidden'), lib.slice(0, 140));
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

/* =================================================================== catalog */
scenario('catalog', async (browser) => {
  const G = 'catalog';
  const { page, ctx } = await openApp(browser);
  // Algolia pages through the first 1,000 hits of a list only (paginationLimitedTo) while
  // nbHits counts all 7,000+; the mock does the same with a limit scaled to its 60 titles.
  ctx.paginationLimit = 50;
  await tapTab(page, 'البحث');
  await page.waitForFunction(() => document.querySelectorAll('main .bx-poster').length >= 6, { timeout: 10000 }).catch(() => {});
  const moreText = () => page.evaluate(() => [...document.querySelectorAll('main .bx-btn')].map((b) => b.innerText.trim()).find((t) => t.startsWith('عرض المزيد')) || '');
  const b1 = await moreText();
  check(G, 'load-more shows loaded / real total', b1.includes('48') && b1.includes('60'), b1);
  await tapEl(page, 'main .bx-btn', { text: 'عرض المزيد' });
  await page.waitForFunction(() => document.querySelectorAll('main .bx-poster').length >= 50, { timeout: 8000 }).catch(() => {});
  await sleep(500);
  const n = await page.evaluate(() => document.querySelectorAll('main .bx-poster').length);
  check(G, 'load-more appends the next page', n === 50, `${n} cards`);
  const st = await page.evaluate(() => ({ note: document.querySelector('.bx-catalog-cap p')?.innerText.trim() || '' }));
  check(G, 'no dead load-more button at the service limit', !(await moreText()), await moreText());
  check(G, 'the limit is explained (first 50 of 60 → search / sort / filters)', st.note.includes('50') && st.note.includes('60') && st.note.includes('دوّر بالاسم'), st.note);
  const pages = ctx.algolia.filter((a) => !a.body.query && a.index === 'series_fav_count_desc' && a.body.hitsPerPage === 48).map((a) => a.body.page);
  check(G, 'never asks for a page past the limit', Math.max(...pages) <= 1, pages.join(','));
  await tapEl(page, '.bx-catalog-cap .bx-btn');
  await sleep(700);
  check(G, 'the note opens sort & filters', (await page.evaluate(() => document.querySelector('.bx-bottom-sheet .bx-sheet-head')?.innerText || '')).includes('فلترة'));
  await tapEl(page, '.bx-bottom-sheet .bx-chip', { text: 'أفلام', exact: true });
  await tapEl(page, '.bx-bottom-sheet .bx-btn-primary', { text: 'عرض النتائج' });
  await sleep(1400);
  const after = await page.evaluate(() => ({ cards: document.querySelectorAll('main .bx-poster').length, note: Boolean(document.querySelector('.bx-catalog-cap')) }));
  check(G, 'a narrower filter lists everything (8 movies, no note)', after.cards === 8 && !after.note && !(await moreText()), JSON.stringify(after));
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

/* ================================================================== schedule */
scenario('schedule', async (browser) => {
  const G = 'schedule';
  const { page, ctx } = await openApp(browser);
  await tapTab(page, 'الجدول');
  await sleep(1000);
  const chip = await page.evaluate(() => document.querySelector('.bx-day-chip.is-active')?.innerText.replace(/\s+/g, ' ').trim() || '');
  check(G, 'opens on today', chip.includes(TODAY) && chip.includes('النهارده'), `${chip} (today=${TODAY})`);
  const rows = await page.evaluate(() => document.querySelectorAll('.bx-sched-row').length);
  check(G, "lists today's shows", rows >= 1, `${rows} rows`);
  check(G, "asks the catalogue for today's day", ctx.algolia.some((a) => JSON.stringify(a.body.facetFilters || '').includes(`show_time:${TODAY}`)));
  const other = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.bx-day-chip')].find((e) => !e.classList.contains('is-active') && !e.innerText.includes('كل'));
    if (!c) return '';
    c.setAttribute('data-test-day', '1');
    return c.innerText.trim();
  });
  await tapEl(page, '[data-test-day]');
  await sleep(1000);
  const chip2 = await page.evaluate(() => document.querySelector('.bx-day-chip.is-active')?.innerText.trim() || '');
  check(G, 'another day can be picked', chip2.includes(other), `${other} → ${chip2}`);
  await tapEl(page, '.bx-sched-row', { index: 0 });
  await page.waitForSelector('.bx-details-sheet', { timeout: 8000 }).catch(() => {});
  check(G, 'a schedule row opens details', await page.evaluate(() => Boolean(document.querySelector('.bx-details-sheet'))));
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

/* ==================================================================== player */
scenario('player', async (browser) => {
  const G = 'player';
  const now = Date.now();
  const { page, ctx } = await openApp(browser, {
    seed: {
      bx_mob_history: [{ slug: 'aw-test-anime-1', objectID: 'Test Anime 1', episode: 5, docId: '005', titleEn: 'Test Anime 1', titleAr: 'Test Anime 1', poster: `${LOCAL}/poster/1.svg`, position: 600, duration: 1440, updatedAt: new Date(now - 3600e3).toISOString() }],
      bx_mob_positions_v16: { 'aw-test-anime-1:5': { sec: 600, dur: 1440, at: now - 3600e3 }, 'aw-test-anime-1:2': { sec: 1440, dur: 1440, at: now - 7200e3, done: true } }
    }
  });
  const sections = await text(page, '.bx-section-title');
  check(G, 'home shows «كمّل المشاهدة» with progress', sections.includes('كمّل المشاهدة') && (await page.evaluate(() => document.querySelectorAll('.bx-poster-progress').length)) > 0, sections.join(' | '));
  check(G, 'home shows «عشان اتفرجت على …»', sections.some((s) => s.startsWith('عشان اتفرجت')), sections.join(' | '));

  let marked = false;
  for (let i = 0; i < 8 && !marked; i++) {
    marked = await markPosterInSection(page, 'بيتعرض دلوقتي', 'Test Anime 1');
    if (!marked) {
      await page.evaluate(() => window.scrollBy(0, 500)); // rows below the fold mount on approach
      await sleep(500);
    }
  }
  check(G, 'found Test Anime 1 on home', marked);
  await tapEl(page, '[data-test-target]');
  await page.waitForFunction(() => /كمّل الحلقة|شغّل الحلقة/.test(document.querySelector('.bx-detail-cta')?.innerText || ''), { timeout: 10000 }).catch(() => {});
  const cta = await page.evaluate(() => document.querySelector('.bx-detail-cta')?.innerText.trim() || '');
  check(G, 'details CTA resumes: «كمّل الحلقة 5 · فاضل 14 د»', cta.includes('كمّل الحلقة 5') && cta.includes('فاضل 14 د'), cta);
  const eps = await page.evaluate(() => ({
    watched: [...document.querySelectorAll('.bx-details-sheet span')].filter((e) => e.textContent.trim() === 'اتشافت').length,
    watchedRow: [...document.querySelectorAll('.bx-details-sheet span')].filter((e) => e.textContent.trim() === 'اتشافت').map((e) => e.parentElement?.innerText.split('\n')[0] || '').join(','),
    progress: document.querySelectorAll('.bx-details-sheet .bx-ep-progress').length
  }));
  check(G, 'only the finished episode says «اتشافت»', eps.watched === 1 && /2/.test(eps.watchedRow), JSON.stringify(eps));
  check(G, 'the half-watched episode has a progress bar', eps.progress >= 1, JSON.stringify(eps));

  await tapEl(page, '.bx-detail-cta');
  let s = await waitVideo(page, (v) => v.rs >= 2 && v.t > 1, 20000);
  check(G, 'episode plays the BLACK X source', Boolean(s && s.src.includes('test.webm')), s ? s.src : 'no video');
  check(G, 'resumes at the saved second (~600 s)', Boolean(s && s.t >= 585 && s.t <= 640), s ? `t=${s.t}` : '');
  const t1 = s?.t || 0;
  await sleep(1600);
  s = await videoState(page);
  check(G, 'video is playing', Boolean(s && !s.paused && s.t > t1 + 0.5), s ? `t ${t1}→${s.t}` : '');
  check(G, 'native controls are off', await page.evaluate(() => !document.querySelector('video')?.controls));
  check(G, 'intro mark drawn on the seek bar', (await page.evaluate(() => document.querySelectorAll('.bx-pc-seg').length)) >= 1);

  await sleep(3600);
  check(G, 'controls auto-hide while playing', !(await controlsVisible(page)));
  const surf = await boxOf(page, '.bx-pc-surface', { scroll: false });
  await page.touchscreen.tap(surf.x, surf.y - surf.h * 0.25);
  await sleep(450);
  check(G, 'a tap shows the controls', await controlsVisible(page));
  await tapEl(page, '.bx-pc-play', { scroll: false });
  await sleep(400);
  s = await videoState(page);
  check(G, 'pause button pauses', Boolean(s?.paused));
  let t = s.t;
  await tapEl(page, '[aria-label="قدّم 10 ثواني"]', { scroll: false });
  await sleep(500);
  s = await videoState(page);
  check(G, '«قدّم 10 ثواني» = +10 s', Math.abs(s.t - (t + 10)) < 1.2, `${t} → ${s.t}`);
  t = s.t;
  await tapEl(page, '[aria-label="رجوع 10 ثواني"]', { scroll: false });
  await sleep(500);
  s = await videoState(page);
  check(G, '«رجوع 10 ثواني» = −10 s', Math.abs(s.t - (t - 10)) < 1.2, `${t} → ${s.t}`);

  t = s.t;
  await doubleTap(page, surf.left + surf.w * 0.82, surf.top + surf.h * 0.5);
  await sleep(800);
  s = await videoState(page);
  check(G, 'double-tap right = +10 s', Math.abs(s.t - (t + 10)) < 1.2, `${t} → ${s.t}`);
  t = s.t;
  await doubleTap(page, surf.left + surf.w * 0.18, surf.top + surf.h * 0.5);
  await sleep(800);
  s = await videoState(page);
  check(G, 'double-tap left = −10 s', Math.abs(s.t - (t - 10)) < 1.2, `${t} → ${s.t}`);

  // Full screen
  await revealControls(page);
  await tapEl(page, '.bx-pc [aria-label="ملء الشاشة"]', { scroll: false });
  await sleep(900);
  const fsOn = await page.evaluate(() => ({ fs: document.querySelector('.bx-pc')?.classList.contains('is-fs'), exitBtn: Boolean(document.querySelector('.bx-pc [aria-label="خروج من ملء الشاشة"]')) }));
  const fsCalls = await nativeCalls(page, 'setFullscreen');
  check(G, 'full screen turns on', fsOn.fs && fsOn.exitBtn, JSON.stringify(fsOn));
  check(G, 'native immersive + landscape requested', JSON.stringify(fsCalls.at(-1)) === '[true,true]', JSON.stringify(fsCalls.slice(-2)));
  const vbox = await boxOf(page, 'video', { scroll: false });
  check(G, 'video fills the screen in full screen', vbox && vbox.w >= 400 && vbox.h >= 880, vbox ? `${Math.round(vbox.w)}x${Math.round(vbox.h)}` : '');

  await revealControls(page);
  await tapEl(page, '.bx-pc [aria-label="إعدادات التشغيل"]', { scroll: false });
  await sleep(800);
  const st = await page.evaluate(() => document.querySelector('.bx-bottom-sheet .bx-sheet-head')?.innerText.trim() || '');
  check(G, 'playback settings sheet opens over the player', st.includes('إعدادات التشغيل'), st);
  s = await videoState(page);
  t = s.t;
  await tapEl(page, '.bx-bottom-sheet .bx-chip', { text: '+ 10 دقايق' });
  await sleep(700);
  s = await videoState(page);
  check(G, '«+ 10 دقايق» = +600 s', Math.abs(s.t - (t + 600)) < 1.5, `${t} → ${s.t}`);
  t = s.t;
  await tapEl(page, '.bx-bottom-sheet .bx-chip', { text: '− 10 دقايق' });
  await sleep(700);
  s = await videoState(page);
  check(G, '«− 10 دقايق» = −600 s', Math.abs(s.t - (t - 600)) < 1.5, `${t} → ${s.t}`);
  await tapEl(page, '.bx-bottom-sheet .bx-chip', { text: '1.5x', exact: true });
  await sleep(400);
  s = await videoState(page);
  check(G, 'speed 1.5x applies', s.rate === 1.5, `rate=${s.rate}`);
  await tapEl(page, '.bx-bottom-sheet .bx-sheet-head [aria-label="إغلاق"]', { scroll: false });
  await sleep(800);
  check(G, 'settings sheet closes', !(await page.evaluate(() => Boolean(document.querySelector('.bx-bottom-sheet')))));

  await revealControls(page);
  const lock = await boxOf(page, '.bx-pc [aria-label="قفل اللمس"]', { scroll: false });
  if (lock) {
    await page.touchscreen.tap(lock.x, lock.y);
    await sleep(500);
    check(G, 'lock hides the controls', await page.evaluate(() => Boolean(document.querySelector('.bx-pc.is-locked'))));
    const ub = await boxOf(page, '.bx-pc-unlock', { scroll: false });
    if (ub) await page.touchscreen.tap(ub.x, ub.y);
    await sleep(500);
    check(G, 'unlock brings them back', !(await page.evaluate(() => Boolean(document.querySelector('.bx-pc.is-locked')))));
  } else check(G, 'lock button in full screen', false);

  await revealControls(page);
  await tapEl(page, '.bx-pc-play', { scroll: false });
  await sleep(700);
  s = await videoState(page);
  check(G, 'play button resumes', s && !s.paused, JSON.stringify(s));
  await revealControls(page);
  await tapEl(page, '.bx-pc-bottom [aria-label="خروج من ملء الشاشة"], .bx-pc [aria-label="خروج من ملء الشاشة"]', { scroll: false });
  await sleep(900);
  const fsCalls2 = await nativeCalls(page, 'setFullscreen');
  check(G, 'full screen turns off', !(await page.evaluate(() => document.querySelector('.bx-pc')?.classList.contains('is-fs'))) && JSON.stringify(fsCalls2.at(-1)) === '[false,false]', JSON.stringify(fsCalls2.slice(-2)));

  await revealControls(page);
  await tapEl(page, '.bx-pc [aria-label="إعدادات التشغيل"]', { scroll: false });
  await sleep(900);
  check(G, 'inline settings open «إعدادات المشغل»', await page.evaluate(() => {
    const el = document.getElementById('bx-player-studio');
    return Boolean(el && el.getBoundingClientRect().height > 0);
  }));

  await revealControls(page);
  const nb = await boxOf(page, '.bx-pc [aria-label="الحلقة اللي بعدها"]', { scroll: false });
  if (nb) {
    await page.touchscreen.tap(nb.x, nb.y);
    await sleep(2500);
    check(G, 'next-episode button loads episode 6', ctx.episodes.includes('aw-test-anime-1:6'), ctx.episodes.join(','));
  } else check(G, 'next-episode button shown', false);
  s = await waitVideo(page, (v) => v.rs >= 2 && !v.paused && v.t > 0.5, 10000);
  // Positions are saved after 5 s of an episode (shorter plays never create a resume point).
  for (let i = 0; i < 2; i++) {
    await revealControls(page);
    await tapEl(page, '[aria-label="قدّم 10 ثواني"]', { scroll: false });
    await sleep(400);
  }
  await sleep(1500);
  // Back order: settings sheet -> full screen -> player -> details -> home
  await revealControls(page);
  await tapEl(page, '.bx-pc [aria-label="ملء الشاشة"]', { scroll: false });
  await sleep(700);
  await revealControls(page);
  await tapEl(page, '.bx-pc [aria-label="إعدادات التشغيل"]', { scroll: false });
  await sleep(700);
  const layer = () => page.evaluate(() => ({ sheet: Boolean(document.querySelector('.bx-bottom-sheet')), fs: Boolean(document.querySelector('.bx-pc.is-fs')), video: Boolean(document.querySelector('video')) }));
  const st0 = await layer();
  await back(page);
  await sleep(700);
  const st1 = await layer();
  check(G, 'back #1 closes only the settings sheet', st0.sheet && st0.fs && !st1.sheet && st1.fs, `${JSON.stringify(st0)} → ${JSON.stringify(st1)}`);
  await back(page);
  await sleep(800);
  const st2 = await layer();
  check(G, 'back #2 leaves full screen, the episode keeps playing', !st2.fs && st2.video && !(await videoState(page))?.paused, JSON.stringify(st2));
  s = await videoState(page);
  const tLast = s?.t || 0;
  await back(page);
  await sleep(1200);
  const afterBack = await page.evaluate(() => ({ details: Boolean(document.querySelector('.bx-details-sheet')), cta: document.querySelector('.bx-detail-cta')?.innerText.trim() || '' }));
  check(G, 'back #3 leaves the player to the details', afterBack.details, JSON.stringify(afterBack));
  const pos = await page.evaluate(() => JSON.parse(localStorage.getItem('bx_mob_positions_v16') || '{}')['aw-test-anime-1:6'] || null);
  check(G, 'position of the new episode was saved', Boolean(pos && pos.sec > 5 && Math.abs(pos.sec - tLast) < 5), JSON.stringify(pos) + ` last=${tLast}`);
  check(G, 'details CTA now resumes episode 6 with time left', /كمّل الحلقة 6 · فاضل \d+ د/.test(afterBack.cta), afterBack.cta);
  await back(page);
  await sleep(900);
  check(G, 'back #4 closes the details → home', !(await page.evaluate(() => Boolean(document.querySelector('.bx-details-sheet')))) && (await activeTab(page)) === 'الرئيسية');
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

/* ===================================================================== manga */
scenario('manga', async (browser) => {
  const G = 'manga';
  const { page, ctx } = await openApp(browser);
  await tapTab(page, 'المانجا');
  await page.waitForFunction(() => document.body.innerText.includes('Test Manhwa 1'), { timeout: 15000 }).catch(() => {});
  check(G, 'library lists titles', await page.evaluate(() => document.body.innerText.includes('Test Manhwa 1')));
  await fingerScroll(page, G, 'manga tab', 60);
  await toTop(page);
  const target = await page.evaluate(() => {
    const el = [...document.querySelectorAll('main *')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Test Manhwa 1')[0];
    if (!el) return false;
    let card = el;
    while (card && card.tagName !== 'BUTTON' && !card.onclick && !card.getAttribute('role') && card.parentElement && card.parentElement.tagName !== 'MAIN') card = card.parentElement;
    (card || el).setAttribute('data-test-manga', '1');
    return true;
  });
  await tapEl(page, '[data-test-manga]', { force: true });
  await page.waitForFunction(() => /Chapter 1|الفصل 1/.test(document.body.innerText), { timeout: 12000 }).catch(() => {});
  check(G, 'title opens with its chapters', target && (await page.evaluate(() => /Chapter 8|الفصل 8/.test(document.body.innerText))));
  const ch = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button, [role="button"], li, div')].filter((e) => /^(Chapter 1|الفصل 1)$/.test((e.innerText || '').trim().split('\n')[0]) && e.getBoundingClientRect().height > 0).pop();
    if (!el) return false;
    el.setAttribute('data-test-ch', '1');
    return true;
  });
  if (ch) await tapEl(page, '[data-test-ch]', { force: true });
  await page.waitForFunction(() => [...document.querySelectorAll('img')].filter((i) => i.src.includes('/page/') && i.naturalWidth > 0).length >= 2, { timeout: 15000 }).catch(() => {});
  const pages = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.src.includes('/page/') && i.naturalWidth > 0).length);
  check(G, 'reader shows the chapter pages', pages >= 2, `${pages} pages`);
  const fsr = await nativeCalls(page, 'setFullscreen');
  check(G, 'reader asks for immersive (portrait)', fsr.some((a) => JSON.stringify(a) === '[true,false]'), JSON.stringify(fsr.slice(-2)));
  const scrollEl = await page.evaluate(() => {
    const cands = [document.scrollingElement, ...document.querySelectorAll('*')].filter((e) => e && e.scrollHeight > e.clientHeight + 300 && /(auto|scroll)/.test(getComputedStyle(e).overflowY || '') || e === document.scrollingElement);
    const img = [...document.querySelectorAll('img')].find((i) => i.src.includes('/page/'));
    let p = img;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 100) break;
      p = p.parentElement;
    }
    const el = p && p !== document.body ? p : document.scrollingElement;
    el.setAttribute('data-test-scroller', '1');
    return { top: el.scrollTop, n: cands.length };
  });
  await swipe(page, 206, 760, 206, 240);
  await sleep(900);
  const top2 = await page.evaluate(() => document.querySelector('[data-test-scroller]').scrollTop);
  check(G, 'reader scrolls by finger', top2 - scrollEl.top > 120, `${scrollEl.top}→${top2}`);
  await back(page);
  await sleep(900);
  check(G, 'back closes the reader', (await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.src.includes('/page/') && i.getBoundingClientRect().height > 0).length)) === 0);
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

/* ================================================================= community */
scenario('community', async (browser) => {
  const G = 'community';
  const { page, ctx } = await openApp(browser);
  await tapTab(page, 'المجتمع');
  await page.waitForFunction(() => document.querySelectorAll('.bx-post').length >= 3, { timeout: 10000 }).catch(() => {});
  const posts = await page.evaluate(() => [...document.querySelectorAll('.bx-post')].map((p) => ({ time: p.querySelector('.bx-post-time')?.innerText.trim() || '', text: p.querySelector('.bx-post-text')?.innerText.trim() || '' })));
  check(G, 'feed shows the posts', posts.length === 12, `${posts.length} posts`);
  await fingerScroll(page, G, 'community feed', 120);
  await toTop(page);
  check(G, 'posts show a real relative time', posts.every((p) => p.time && !/T\d\d:/.test(p.time)), posts.map((p) => p.time).join(' | '));
  check(G, 'no predictions section anymore', !(await page.evaluate(() => /التوقعات|توقعات الحلقة/.test(document.querySelector('main')?.innerText || ''))));
  const writes = ctx.fsWrites.length;
  await tapEl(page, '.bx-post-act[aria-label="لايك"]', { index: 0 });
  await sleep(700);
  const toast = await page.evaluate(() => [...document.querySelectorAll('.bx-toast')].map((t) => t.innerText.trim()).join(' | '));
  check(G, 'guest like asks to sign in', toast.includes('سجّل دخولك'), toast);
  check(G, 'guest like writes nothing', ctx.fsWrites.length === writes);
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

/* ================================================================ logged in */
scenario('logged', async (browser) => {
  const G = 'logged';
  const { page, ctx } = await openApp(browser, {
    seed: {
      bx_mob_session_v16: { token: 'test-session-token-0123456789abcdef', savedAt: Date.now() },
      bx_mob_user: { id: 'u_tester', username: 'tester', displayName: 'Tester', email: 'tester@example.com', role: 'user', vipTier: 'free' }
    }
  });
  await sleep(800);
  check(G, 'session is checked with /api/app/me', ctx.net.some((n) => n.includes('/api/app/me')));
  check(
    G,
    'the app calls the website at black-x-anime.ai.studio (black-x-anime.me is paused)',
    ctx.net.some((n) => n.startsWith('GET black-x-anime.ai.studio/api/app/me')) && !ctx.net.some((n) => n.includes('black-x-anime.me')),
    ctx.net.filter((n) => n.includes('/api/')).slice(0, 3).join(' | ')
  );
  await tapEl(page, '.bx-avatar-btn', { scroll: false });
  await waitVt(page);
  await sleep(500);
  const head = await page.evaluate(() => document.querySelector('.bxp-hero')?.innerText.replace(/\s+/g, ' ').trim() || '');
  check(G, 'profile header shows the member', head.includes('Tester'), head.slice(0, 120));
  check(G, 'no sign-in form for members', !(await page.evaluate(() => [...document.querySelectorAll('input[type="password"]')].some((i) => i.getBoundingClientRect().height > 0))));
  await tapTab(page, 'المجتمع');
  await page.waitForFunction(() => document.querySelectorAll('.bx-post').length >= 3, { timeout: 10000 }).catch(() => {});
  const w0 = ctx.fsWrites.length;
  await tapEl(page, '.bx-post-act[aria-label="لايك"]', { index: 1 });
  await sleep(900);
  const liked = ctx.fsWrites.slice(w0).map((w) => JSON.parse(w.body.fields?.json?.stringValue || '[]')).at(-1) || [];
  const pb = liked.find((p) => p.id === 'post_b');
  check(G, 'like is saved once for this account', Boolean(pb && pb.likes === 1 && pb.likedBy.filter((k) => k === 'u_tester').length === 1), JSON.stringify(pb && { likes: pb.likes, likedBy: pb.likedBy }));
  check(G, 'like button turns on', (await page.evaluate(() => document.querySelectorAll('.bx-post-act.is-on').length)) === 1);
  await tapEl(page, '.bx-post-act[aria-label="لايك"]', { index: 1 });
  await sleep(900);
  const un = ctx.fsWrites.map((w) => JSON.parse(w.body.fields?.json?.stringValue || '[]')).at(-1) || [];
  const pb2 = un.find((p) => p.id === 'post_b');
  check(G, 'second tap removes the like (no double likes)', Boolean(pb2 && pb2.likes === 0 && !pb2.likedBy.includes('u_tester')), JSON.stringify(pb2 && { likes: pb2.likes, likedBy: pb2.likedBy }));
  await tapEl(page, '.bx-composer textarea');
  await page.keyboard.type('بوست تجريبي من الاختبار', { delay: 10 });
  await tapEl(page, '.bx-composer button[type="submit"]');
  await sleep(1000);
  const firstPost = await page.evaluate(() => ({ text: document.querySelector('.bx-post .bx-post-text')?.innerText.trim() || '', time: document.querySelector('.bx-post .bx-post-time')?.innerText.trim() || '' }));
  const saved = (ctx.fsWrites.map((w) => JSON.parse(w.body.fields?.json?.stringValue || '[]')).at(-1) || [])[0] || {};
  check(G, 'member can post; it appears on top', firstPost.text === 'بوست تجريبي من الاختبار', JSON.stringify(firstPost));
  check(G, 'new post stores createdAt', Boolean(saved.createdAt && !Number.isNaN(Date.parse(saved.createdAt))), saved.createdAt || '');

  // Account deletion: profile → «الخصوصية والأمان» → «مسح الحساب».
  ctx.deletePassword = 'secret-pass';
  await tapEl(page, '.bx-avatar-btn', { scroll: false });
  await waitVt(page);
  await tapEl(page, 'main .bxp-row', { text: 'الخصوصية والأمان' });
  await waitVt(page);
  await tapEl(page, 'main .bxp-row', { text: 'مسح الحساب' });
  await waitVt(page);
  await page.waitForFunction(() => Boolean(document.querySelector('.bxp-delete-btn')), { timeout: 6000 }).catch(() => {});
  const off = await page.evaluate(() => document.querySelector('.bxp-delete-btn')?.disabled === true);
  await tapEl(page, 'main .bxp-form input:not([type="password"])');
  await page.keyboard.type('tester', { delay: 10 });
  await tapEl(page, 'main input[type="password"]');
  await page.keyboard.type('secret-pass', { delay: 10 });
  const on = await page.evaluate(() => document.querySelector('.bxp-delete-btn')?.disabled === false);
  check(G, 'delete account: the button waits for the typed user name', off && on, JSON.stringify({ off, on }));
  await tapEl(page, '.bxp-delete-btn');
  await page.waitForFunction(() => !localStorage.getItem('bx_mob_session_v16'), { timeout: 8000 }).catch(() => {});
  const del = (ctx.accountDeletes || [])[0] || {};
  const after = await page.evaluate(() => ({ session: Boolean(localStorage.getItem('bx_mob_session_v16')), user: Boolean(localStorage.getItem('bx_mob_user')) }));
  check(G, '…sends the user name and password to the website, then signs out', del.confirm === 'tester' && del.password === 'secret-pass' && !after.session && !after.user, JSON.stringify({ del, after }));
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

/* ================================================================== profile */
scenario('profile', async (browser) => {
  const G = 'profile';
  const now = Date.now();
  const saved = (name, extra = {}) => ({ slug: `aw-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, objectID: name, titleEn: name, titleAr: name, poster: `${LOCAL}/poster/${(name.length % 9) + 1}.svg`, ...extra });
  const { page, ctx } = await openApp(browser, {
    seed: {
      bx_mob_favorites: [saved('Test Anime 5'), saved('Test Anime 9'), saved('Test Anime 12'), saved('Test Anime 3')],
      bx_mob_history: [
        saved('Test Anime 7', { id: 'h2', episode: 2, docId: '002', position: 200, duration: 1440, updatedAt: new Date(now - 60e3).toISOString() }),
        saved('Test Anime 4', { id: 'h3', episode: 5, docId: '005', position: 900, duration: 1440, updatedAt: new Date(now - 3 * 86400e3).toISOString() })
      ],
      bx_mob_manga_history: [{ objectID: 'bx:test-manhwa-1', name: 'Test Manhwa 1', poster_uri: `${LOCAL}/poster/31.svg`, mangaId: 'bx:test-manhwa-1', chapter: '4', chapterId: 'c4', updatedAt: new Date(now - 120e3).toISOString() }]
    }
  });
  const info = () => page.evaluate(() => ({ title: document.querySelector('.bx-topbar-title')?.textContent.trim() || '', page: document.querySelector('main.bxp')?.dataset.page || '', back: Boolean(document.querySelector('.bx-topbar .bxp-back')) }));
  const mainText = () => page.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').trim());
  const ls = (k) => page.evaluate((key) => localStorage.getItem(key), k);
  const settle = async (ms = 550) => {
    await waitVt(page);
    await sleep(ms);
  };
  const openRow = async (label) => {
    await tapEl(page, 'main .bxp-row-label', { text: label, exact: true });
    await settle();
  };
  const tapBack = async () => {
    await tapEl(page, '.bx-topbar .bxp-back', { scroll: false });
    await settle();
  };
  const hwBack = async () => {
    await back(page);
    await settle();
  };
  const sw = (label) => page.evaluate((l) => [...document.querySelectorAll('main [role="switch"]')].find((x) => x.innerText.includes(l))?.getAttribute('aria-checked') ?? null, label);
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  // Guest root: a sign-in hero instead of a whole form, then grouped rows
  await tapEl(page, '.bx-avatar-btn', { scroll: false });
  await settle(700);
  const guest = await page.evaluate(() => ({
    hero: document.querySelector('.bxp-hero.is-guest')?.innerText.replace(/\s+/g, ' ').trim() || '',
    pw: [...document.querySelectorAll('input[type="password"]')].some((i) => i.getBoundingClientRect().height > 0),
    groups: [...document.querySelectorAll('main .bxp-group-title')].map((h) => h.textContent.trim())
  }));
  check(G, 'guest sees a sign-in hero (Google + username), no password form', guest.hero.includes('Google') && guest.hero.includes('باسم المستخدم') && !guest.pw, guest.hero.slice(0, 90));
  check(G, 'root is organised in groups', ['مكتبتي', 'العضوية', 'التطبيق', 'المساعدة'].every((t) => guest.groups.includes(t)), guest.groups.join(','));
  check(G, 'no horizontal overflow on the profile', await noOverflow());
  await fingerScroll(page, G, 'profile root');
  await toTop(page);

  // A sub-page is pushed (back button + title); the phone back button pops it
  await tapEl(page, 'main .bxp-hero .bx-btn-ghost');
  await settle();
  let at = await info();
  check(G, 'username sign-in opens as its own page (back button + title)', at.page === 'signin' && at.back && at.title === 'تسجيل الدخول', JSON.stringify(at));
  await hwBack();
  at = await info();
  check(G, 'phone back closes the sub-page first (not the tab)', at.page === 'root' && at.title === 'حسابي' && !at.back, JSON.stringify(at));

  // My list
  await openRow('قائمتي');
  const lib = await page.evaluate(() => ({ posters: document.querySelectorAll('main .bx-poster').length, chip: document.querySelector('main .bx-chip.is-active')?.innerText.replace(/\s+/g, ' ').trim() || '' }));
  check(G, 'my list: grid of the 4 saved titles, counted on the chip', lib.posters === 4 && /المفضلة\s*4/.test(lib.chip), JSON.stringify(lib));
  await tapEl(page, 'main .bx-chip', { text: 'بتابعه' });
  await sleep(400);
  check(G, 'an empty list shows a helpful empty state', Boolean(await page.$('main .bxp-empty')) && (await mainText()).includes('فاضية'));
  await tapBack();

  // Watch history: real episode + time left (v17.0 printed a field that never existed)
  await openRow('سجل المشاهدة');
  const hist = await page.evaluate(() => [...document.querySelectorAll('main .bxp-media-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  check(G, 'history rows show the episode and the time left', hist.length === 2 && /Test Anime 7/.test(hist[0]) && /الحلقة\s2/.test(hist[0]) && /فاضل\s21\sد/.test(hist[0]), hist.join(' | '));
  check(G, 'history is grouped by day', (await page.evaluate(() => [...document.querySelectorAll('main .bxp-group-title')].map((h) => h.textContent.trim()))).includes('النهارده'));
  const gap = await page.evaluate(() => {
    const label = document.querySelector('main .bxp-media-row .bxp-row-label');
    const r = document.createRange();
    r.selectNodeContents(label);
    return Math.round(label.getBoundingClientRect().right - r.getBoundingClientRect().right);
  });
  check(G, 'a Latin title lines up with the Arabic text (RTL)', Math.abs(gap) <= 2, `${gap}px from the right edge`);
  await tapEl(page, 'main .bxp-media-row');
  await sleep(1200);
  check(G, 'a history row opens the title', Boolean(await page.$('.bx-details-sheet')));
  await hwBack();
  await sleep(300);
  at = await info();
  check(G, 'closing the title returns to the same history page', at.page === 'history', JSON.stringify(at));
  await tapBack();

  // Reading history: chapter + cover (v17.0 read fields that were never stored)
  await openRow('سجل القراءة');
  const mh = await page.evaluate(() => {
    const r = document.querySelector('main .bxp-media-row');
    return { text: r?.innerText.replace(/\s+/g, ' ').trim() || '', img: r?.querySelector('img')?.getAttribute('src') || '' };
  });
  check(G, 'reading history shows the chapter and the cover', /Test Manhwa 1/.test(mh.text) && /الفصل\s4/.test(mh.text) && mh.img.includes('/poster/31.svg'), JSON.stringify(mh));
  await tapBack();

  // Settings: real switches, saved
  await openRow('الإعدادات');
  check(G, 'settings: haptics is a switch, on by default', (await sw('اهتزاز')) === 'true');
  await tapEl(page, 'main [role="switch"]', { text: 'اهتزاز' });
  await sleep(300);
  check(G, 'haptics switch turns off and is saved', (await sw('اهتزاز')) === 'false' && (await ls('bx_mob_haptics')) === 'off', String(await ls('bx_mob_haptics')));
  await tapEl(page, 'main [role="switch"]', { text: 'اهتزاز' });
  await tapEl(page, 'main [role="switch"]', { text: 'صوت شاشة البداية' });
  await sleep(300);
  check(G, 'splash sound switch is saved', (await sw('صوت شاشة البداية')) === 'true' && (await ls('bx_mob_splash_sound')) === 'on');
  await tapEl(page, 'main [role="switch"]', { text: 'صوت شاشة البداية' });
  await tapEl(page, '.bx-seg[aria-label="توفير البيانات"] button', { text: 'شغال', exact: true });
  await sleep(300);
  check(G, 'data saver choice is saved', (await ls('bx_mob_data_saver')) === 'on');
  await tapEl(page, '.bx-seg[aria-label="توفير البيانات"] button', { text: 'تلقائي', exact: true });
  await openRow('شاشة البداية');
  await tapEl(page, 'main [role="radio"]', { text: 'ضربة سيف الكاتانا' });
  await sleep(300);
  const sel = await page.evaluate(() => document.querySelector('main [role="radio"][aria-checked="true"]')?.innerText.trim() || '');
  check(G, 'splash screen: picking a motion saves and checks it', (await ls('bx_motion_pref')) === 'katana' && sel.includes('الكاتانا'), sel);
  await tapBack();
  check(G, 'the settings row shows the chosen splash', (await mainText()).includes('ضربة سيف الكاتانا'));
  await tapBack();

  // Privacy: incognito + PIN lock
  await openRow('الخصوصية والأمان');
  await tapEl(page, 'main [role="switch"]', { text: 'التصفح الخفي' });
  await sleep(300);
  check(G, 'incognito switch is saved', (await sw('التصفح الخفي')) === 'true' && (await ls('bx_mob_incognito')) === 'true');
  await tapEl(page, 'main .bxp-pin');
  await page.keyboard.type('12a34', { delay: 20 });
  await sleep(200);
  check(G, 'the PIN field keeps digits only', (await page.$eval('main .bxp-pin', (i) => i.value)) === '1234');
  await tapEl(page, 'main button[type="submit"]');
  await sleep(400);
  check(G, 'PIN lock turns on', (await ls('bx_mob_pin_code')) === '1234' && (await mainText()).includes('شغال'));
  await tapEl(page, 'main .bx-btn-outline', { text: 'إلغاء القفل' });
  await sleep(300);
  check(G, 'PIN lock can be removed', (await ls('bx_mob_pin_code')) === null);
  await tapEl(page, 'main [role="switch"]', { text: 'التصفح الخفي' });
  await tapBack();

  // VIP as a guest: sign in first (v17.0 showed a code box that could not work)
  await openRow('BLACK X VIP');
  const vip = await page.evaluate(() => ({ input: Boolean(document.querySelector('main .bxp-code')), text: document.querySelector('main')?.innerText.replace(/\s+/g, ' ') || '' }));
  check(G, 'guest VIP page asks to sign in instead of showing a code box', !vip.input && vip.text.includes('سجّل دخولك'), vip.text.slice(0, 100));
  await tapEl(page, 'main .bxp-empty .bx-btn');
  await settle();
  at = await info();
  check(G, 'its button pushes the sign-in page', at.page === 'signin', JSON.stringify(at));

  // Sign in with a username: the page closes itself and the member header appears
  await tapEl(page, 'main input[autocomplete="username"]');
  await page.keyboard.type('tester', { delay: 10 });
  await tapEl(page, 'main input[type="password"]');
  await page.keyboard.type('secret-pass', { delay: 10 });
  await tapEl(page, 'main button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('main.bxp')?.dataset.page !== 'signin', { timeout: 8000 }).catch(() => {});
  await settle(900);
  at = await info();
  check(G, 'after signing in, the sign-in page closes by itself', ctx.logins.includes('tester') && at.page === 'vip', `${JSON.stringify(at)} logins=${ctx.logins.join(',')}`);
  await hwBack();
  const head = await page.evaluate(() => ({ text: document.querySelector('.bxp-hero')?.innerText.replace(/\s+/g, ' ').trim() || '', stats: [...document.querySelectorAll('.bxp-stats strong')].map((s) => s.textContent.trim()) }));
  check(G, 'member header: name, @handle and real stats', head.text.includes('Tester') && head.text.includes('@tester') && head.stats.join(',') === '4,2,120', JSON.stringify(head));

  // Titles: a locked one is refused, an unlocked one is saved and shown on the header
  await openRow('اللقب');
  await tapEl(page, 'main [role="radio"]', { text: 'سيد الظلال' });
  await sleep(300);
  check(G, 'a locked title is not applied', (await ls('bx_mob_sovereign_title')) !== 'سيد الظلال', String(await ls('bx_mob_sovereign_title')));
  await tapEl(page, 'main [role="radio"]', { text: 'جامع المفضلات' });
  await sleep(300);
  check(G, 'an unlocked title is saved', (await ls('bx_mob_sovereign_title')) === 'جامع المفضلات');
  await tapBack();
  check(G, 'the header shows the title', (await page.evaluate(() => document.querySelector('.bxp-hero')?.innerText || '')).includes('جامع المفضلات'));

  // Edit profile: saved to the account, the page closes, the header updates
  await tapEl(page, 'main .bxp-hero .bx-btn', { text: 'تعديل الملف' });
  await settle();
  await tapEl(page, 'main input[autocomplete="nickname"]');
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.type('Tester Pro', { delay: 10 });
  await tapEl(page, 'main button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('main.bxp')?.dataset.page === 'root', { timeout: 6000 }).catch(() => {});
  await settle();
  const put = ctx.profilePuts.at(-1) || {};
  check(G, 'edit profile saves to the account and closes the page', put.displayName === 'Tester Pro' && (await info()).page === 'root', JSON.stringify(put));
  check(G, 'the header shows the new name', (await page.evaluate(() => document.querySelector('.bxp-name')?.textContent.trim())) === 'Tester Pro');

  // Request to the developer
  await openRow('اطلب أنمي أو مانهوا');
  await tapEl(page, 'main textarea');
  await page.keyboard.type('Frieren season 2', { delay: 10 });
  await tapEl(page, 'main button[type="submit"]');
  await sleep(900);
  const rq = ctx.requests.at(-1) || {};
  check(G, 'a request reaches the developer and the box clears', rq.type === 'anime' && rq.text === 'Frieren season 2' && (await page.$eval('main textarea', (t) => t.value)) === '', JSON.stringify(rq));
  await tapBack();

  // Sign out asks first; the phone back button closes the question
  await tapEl(page, 'main .bxp-signout');
  await sleep(500);
  check(G, 'sign out asks for confirmation', (await page.evaluate(() => document.querySelector('.bx-bottom-sheet')?.innerText || '')).includes('تسجيل الخروج؟'));
  await back(page);
  await sleep(500);
  check(G, 'phone back closes the question and keeps you signed in', !(await page.$('.bx-bottom-sheet')) && Boolean(await page.$('.bxp-hero:not(.is-guest)')));
  await tapEl(page, 'main .bxp-signout');
  await sleep(500);
  await tapEl(page, '.bx-bottom-sheet .bx-btn-primary', { scroll: false });
  await sleep(900);
  check(G, 'confirming signs out', Boolean(await page.$('.bxp-hero.is-guest')) && (await ls('bx_mob_user')) === null);

  // Menu shortcuts land on the matching page; back returns to the profile root
  await toTop(page);
  await tapEl(page, '.bx-topbar [aria-label="القائمة"]', { scroll: false });
  await sleep(600);
  await tapEl(page, '.bx-menu-item', { text: 'الإعدادات' });
  await settle();
  at = await info();
  check(G, 'menu → Settings opens the settings page', at.page === 'settings' && at.back, JSON.stringify(at));
  await hwBack();
  at = await info();
  check(G, 'back from it lands on the profile root', at.page === 'root' && at.title === 'حسابي', JSON.stringify(at));

  // An account saved by a pre-v16 build (a user but no server session) must be able to sign in
  await page.evaluate(() => localStorage.setItem('bx_mob_user', JSON.stringify({ id: 'u_old', username: 'olduser', displayName: 'Old User', role: 'user', vipTier: 'free' })));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.bx-dock') && !document.querySelector('.bx-intro'), { timeout: 30000 }).catch(() => {});
  await sleep(800);
  await tapEl(page, '.bx-avatar-btn', { scroll: false });
  await settle(700);
  check(G, 'an old account without a session sees the "sign in once more" note', Boolean(await page.$('main .bxp-note')));
  await openRow('BLACK X VIP');
  await tapEl(page, 'main .bxp-empty .bx-btn');
  await settle(900);
  at = await info();
  check(G, 'its sign-in page stays open (does not close itself)', at.page === 'signin', JSON.stringify(at));
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

/* =================================================================== motion */
scenario('motion', async (browser) => {
  const G = 'motion';
  const { page, ctx } = await openApp(browser);
  // Reduced motion: no page movement at all.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const m = await tapTab(page, 'الجدول');
  check(G, 'reduced motion: tab switch has no slide', m === '', m);
  check(G, 'reduced motion: tab still switches', (await activeTab(page)) === 'الجدول');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  const m2 = await tapTab(page, 'الرئيسية');
  check(G, 'normal motion is back', /from-right/.test(m2), m2);
  // Rapid taps must not break navigation.
  for (const l of ['البحث', 'المانجا', 'المجتمع', 'الجدول']) {
    const b = await boxOf(page, '.bx-dock-item', { text: l, exact: true, scroll: false });
    await page.touchscreen.tap(b.x, b.y);
    await sleep(60);
  }
  await waitVt(page, 4000);
  await sleep(800);
  check(G, 'rapid tab taps end on the last tab', (await activeTab(page)) === 'الجدول' && (await topTitle(page)) === 'جدول الحلقات', `${await activeTab(page)} / ${await topTitle(page)}`);
  check(G, 'no page left half-transparent', await page.evaluate(() => [...document.querySelectorAll('main')].every((e) => Number(getComputedStyle(e).opacity) > 0.99)));
  // A second tap while the page transition still runs (the browser hit-tests the snapshot then).
  let lost = [];
  for (const [a, b, gap] of [['البحث', 'المانجا', 60], ['المجتمع', 'الرئيسية', 150], ['الجدول', 'البحث', 260]]) {
    const ba = await boxOf(page, '.bx-dock-item', { text: a, exact: true, scroll: false });
    const bb = await boxOf(page, '.bx-dock-item', { text: b, exact: true, scroll: false });
    await page.touchscreen.tap(ba.x, ba.y);
    await sleep(gap);
    const during = await page.evaluate(() => document.documentElement.classList.contains('bx-vt-running'));
    await page.touchscreen.tap(bb.x, bb.y);
    await waitVt(page, 3000);
    await sleep(500);
    const end = await activeTab(page);
    if (end !== b) lost.push(`${a}→${b} @${gap}ms (vt ${during}) ended on ${end}`);
  }
  check(G, 'a dock tap during a page transition is never lost', lost.length === 0, lost.join(' ; ') || 'all 3 landed');
  const bt = await boxOf(page, '.bx-dock-item', { text: 'الجدول', exact: true, scroll: false });
  const av = await boxOf(page, '.bx-avatar-btn', { scroll: false });
  await page.touchscreen.tap(bt.x, bt.y);
  await sleep(120);
  await page.touchscreen.tap(av.x, av.y);
  await waitVt(page, 3000);
  await sleep(600);
  check(G, 'the top avatar works during a transition too', (await topTitle(page)) === 'حسابي', await topTitle(page));
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

/* =================================================================== runner */

/* ==================================================================== bundle */
// APK v18 (2026-10-17): air-time reminders handed to the native side, the alerts sheet saying
// so, «على الموقع بس», «على الداتا», the sleep-timer chip, the watch party by code (no website
// invite link) — and none of the website's computer extras.
scenario('bundle', async (browser) => {
  const G = 'bundle';
  const now = Date.now();
  const fav = (n) => ({
    objectID: `Test Anime ${n}`,
    slug: `aw-test-anime-${n}`,
    titleEn: `Test Anime ${n}`,
    titleAr: `Test Anime ${n}`,
    poster: `${LOCAL}/poster/${(n % 8) + 1}.svg`,
    malId: 1000 + n,
    createdAt: new Date(now - 86400e3).toISOString()
  });
  // the schedule mock airs MAL 1001 (+1 min), 1010 (+1 day) and 1011 (+3 days); 1020 has no air time
  const { page, ctx } = await openApp(browser, { seed: { bx_mob_favorites: [fav(1), fav(10), fav(11), fav(20)] } });
  await page.waitForFunction(() => window.__bxNativeCalls.some((c) => c.name === 'scheduleEpisodeAlarms'), { timeout: 15000 }).catch(() => {});
  const calls = await nativeCalls(page, 'scheduleEpisodeAlarms');
  const list = calls.length ? JSON.parse(calls[calls.length - 1][0]) : [];
  check(
    G,
    'air-time reminders go to the APK: one per followed title with a real air time',
    list.length === 3 && list.every((a) => a.at > now && a.id > 0) && ['Test Anime 1', 'Test Anime 10', 'Test Anime 11'].every((t) => list.some((a) => a.title === `ميعاد ${t}`)),
    list.map((a) => `${a.title} +${Math.round((a.at - now) / 60000)}m`).join(' | ') || 'no call'
  );
  check(G, '…the text: the Japanese air time, and that it reaches BLACK X once subtitled', list.length > 0 && list.every((a) => /بتتعرض دلوقتي في اليابان\. هتنزل على BLACK X لما تتترجم\./.test(a.body)), list[0]?.body || '');
  check(G, '…never an empty list (that would wipe the phone\'s reminders)', calls.length > 0 && calls.every((c) => JSON.parse(c[0]).length > 0), `${calls.length} calls`);

  await tapEl(page, '.bx-topbar [aria-label="القائمة"], [aria-label="القائمة"]', { scroll: false });
  await sleep(700);
  const items = await page.evaluate(() => [...document.querySelectorAll('.bx-menu-item')].map((e) => e.innerText.trim()));
  check(G, 'menu: «على الموقع بس», none of the website pages (الترتيب، ملخصك، الاختصارات)', items.some((t) => t.includes('على الموقع بس')) && !items.some((t) => /الترتيب|ملخصك|اختصارات/.test(t)), items.join(' | '));
  await tapEl(page, '.bx-menu-item', { text: 'تنبيهات الحلقات' });
  await sleep(900);
  const native = await page.evaluate(() => {
    const p = document.querySelector('.bx-alerts-native');
    return p ? { mode: p.dataset.bxNative, text: p.innerText.trim() } : null;
  });
  check(G, 'the alerts sheet says the reminders come while the app is closed', native?.mode === 'on' && /حتى وهو مقفول/.test(native.text), JSON.stringify(native));
  await back(page);
  await sleep(600);

  await tapEl(page, '.bx-topbar [aria-label="القائمة"], [aria-label="القائمة"]', { scroll: false });
  await sleep(700);
  await tapEl(page, '.bx-menu-item', { text: 'على الموقع بس' });
  await waitVt(page);
  await sleep(700);
  const perks = await page.evaluate(() => ({
    title: document.querySelector('.bx-topbar-title')?.textContent.trim() || '',
    items: [...document.querySelectorAll('.bx-perks-list strong')].map((e) => e.textContent.trim()),
    btn: document.querySelector('.bx-perks .bx-btn')?.innerText.trim() || ''
  }));
  check(G, '«على الموقع بس»: what the website adds + copy its address', /على الموقع بس/.test(perks.title) && perks.items.length >= 5 && perks.items.includes('حفلة المشاهدة باللينك') && /انسخ لينك الموقع/.test(perks.btn), JSON.stringify(perks));
  await back(page);
  await sleep(600);
  const rows = await page.evaluate(() => [...document.querySelectorAll('main .bxp-row-label')].map((e) => e.textContent.trim()));
  check(G, 'profile: the «على الموقع بس» row next to «تحديث التطبيق»', rows.includes('على الموقع بس') && rows.includes('تحديث التطبيق') && !rows.includes('الترتيب'), rows.join(' | '));

  await tapEl(page, 'main .bxp-row', { text: 'الإعدادات' });
  await waitVt(page);
  await sleep(600);
  const saver = await page.evaluate(() => [...document.querySelectorAll('main .bxp-seg button')].map((b) => b.textContent.trim()));
  check(G, 'settings: data saver can follow mobile data («على الداتا»)', ['تلقائي', 'على الداتا', 'شغال', 'مقفول'].every((t) => saver.includes(t)), saver.join(' | '));
  await tapEl(page, 'main .bxp-seg button', { text: 'على الداتا', exact: true });
  await sleep(300);
  check(G, '…and remembers it', (await page.evaluate(() => localStorage.getItem('bx_mob_data_saver'))) === 'cellular');
  await back(page);
  await sleep(500);

  // the player: sleep-timer chip, watch party by code
  await tapTab(page, 'الرئيسية');
  await page.evaluate(() => window.scrollTo(0, 0));
  let marked = false;
  for (let i = 0; i < 8 && !marked; i++) {
    marked = await markPosterInSection(page, 'بيتعرض دلوقتي', 'Test Anime 1');
    if (!marked) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await sleep(500);
    }
  }
  await tapEl(page, '[data-test-target]');
  await page.waitForFunction(() => Boolean(document.querySelector('.bx-detail-cta')), { timeout: 10000 }).catch(() => {});
  await tapEl(page, '.bx-detail-cta');
  await waitVideo(page, (v) => v.rs >= 2, 20000);
  await sleep(600);
  await tapEl(page, '.bx-player-side button', { text: 'إعدادات المشغل' });
  await sleep(500);
  await tapEl(page, '.bx-player-side button', { text: 'مؤقت النوم' });
  await sleep(500);
  await tapEl(page, '.bx-player-side button', { text: 'مؤقت النوم' }); // off → end of episode → 15 min
  await sleep(600);
  const chip = await page.evaluate(() => document.querySelector('.bx-sleep-chip')?.innerText.trim() || '');
  check(G, 'sleep timer: a chip above the player shows the time left', /1[45]:\d\d/.test(chip), chip || 'no chip');
  await tapEl(page, '.bx-sleep-chip', { scroll: false });
  await sleep(500);
  check(G, '…one tap cancels it', !(await page.evaluate(() => Boolean(document.querySelector('.bx-sleep-chip')))));

  await tapEl(page, '.bx-party-toggle');
  await sleep(500);
  await tapEl(page, '.bx-party button', { text: 'افتح غرفة للحلقة دي' });
  await page.waitForFunction(() => Boolean(document.querySelector('.bx-party-code')), { timeout: 8000 }).catch(() => {});
  const party = await page.evaluate(() => ({
    code: document.querySelector('.bx-party-code')?.textContent.trim() || '',
    chips: [...document.querySelectorAll('.bx-party-actions .bx-chip')].map((b) => b.innerText.trim())
  }));
  check(G, 'watch party in the APK: a real room by code (copy the code; the invite link is the website\'s)', /^BX[A-Z0-9]{6}$/.test(party.code) && ctx.fs.has(`settings/wp_${party.code.toLowerCase()}`) && party.chips.includes('انسخ الكود') && !party.chips.some((t) => /لينك/.test(t)), JSON.stringify(party));
  await tapEl(page, '.bx-party-leave');
  await sleep(500);

  check(G, 'no website computer extras in the APK (preview card, quick search)', await page.evaluate(() => !document.querySelector('.bx-hover-card, .bx-palette')));
  check(G, 'no uncaught page errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
});

const server = await startServer();
for (const sc of scenarios) {
  if (ONLY.length && !ONLY.includes(sc.name)) continue;
  console.log(`\n--- ${sc.name} ---`);
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
