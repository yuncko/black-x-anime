// Headless real-touch harness for the BLACK X APK web bundle (assets/public of the built APK)
// and for the website build (the phone website runs the same app interface; see web-suite.mjs).
// The bundle is served from a local server; every network call the app makes (website API,
// Algolia catalogue, Firestore, AniList) is answered by in-memory mocks, so nothing here
// depends on the live site. Touch input goes through CDP touch events (page.touchscreen),
// so scrolling and taps behave like a finger. Run it through ./run.sh / ./run-web.sh (README.md).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const REPO = path.resolve(process.env.BX_REPO || '../../..');
const { APK_RELEASE } = await import(pathToFileURL(path.join(REPO, 'shared/apkRelease.js')).href);
export { APK_RELEASE };

export const DIST = path.resolve(process.env.DIST || '/tmp/bx-touch/public');
export const PORT = Number(process.env.PORT || 8790);
export const LOCAL = `http://127.0.0.1:${PORT}`;
const VIDEO_FILE = process.env.VIDEO || '/tmp/bx-touch/test.webm';
// The website build asks Google Fonts for Cairo / Space Grotesk; the test answers with the copies the
// APK bundles, otherwise every Arabic label renders invisible in headless screenshots.
const FONT_DIR = path.join(REPO, 'client/src/mobile/fonts');
export const VIDEO_URL = `${LOCAL}/test.webm`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ results */
export const results = [];
export function check(group, name, ok, info = '') {
  results.push({ group, name, ok: Boolean(ok), info: String(info || '') });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${group}] ${name}${info ? ` — ${String(info).slice(0, 220)}` : ''}`);
  return Boolean(ok);
}

/* ------------------------------------------------------------------ local server */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg'
};

function svgImage(kind, n) {
  const shade = 40 + ((n * 37) % 120);
  const [w, h] = kind === 'page' ? [800, 1200] : kind === 'wide' ? [640, 360] : [300, 450];
  const bg = kind === 'page' ? '#f2f2f2' : `rgb(${shade},${shade},${shade})`;
  const fg = kind === 'page' ? '#111' : '#fff';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${bg}"/><text x="50%" y="50%" font-size="${Math.round(w / 6)}" fill="${fg}" text-anchor="middle" font-family="sans-serif">${kind[0].toUpperCase()}${n}</text></svg>`;
}

function serveRange(req, res, file, type) {
  const size = fs.statSync(file).size;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', type);
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    let start = m[1] === '' || m[1] === undefined ? size - Number(m[2] || 0) : Number(m[1]);
    let end = m[1] !== '' && m[2] !== '' && m[2] !== undefined ? Number(m[2]) : size - 1;
    if (!(start >= 0) || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    end = Math.min(end, size - 1);
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(file).pipe(res);
}

export function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, LOCAL);
    const p = decodeURIComponent(url.pathname);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (p === '/test.webm') return serveRange(req, res, VIDEO_FILE, 'video/webm');
    // "Another site" for the back-button tests (the page the visitor came from).
    if (p === '/__blank') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><title>before</title><p>another page</p>');
    }
    const font = p.match(/^\/__fonts\/([a-z0-9-]+\.woff2)$/);
    if (font && fs.existsSync(path.join(FONT_DIR, font[1]))) {
      res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'max-age=3600' });
      return fs.createReadStream(path.join(FONT_DIR, font[1])).pipe(res);
    }
    const m = p.match(/^\/(poster|page|wide)\/(\d+)\.svg$/);
    if (m) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' });
      return res.end(svgImage(m[1], Number(m[2])));
    }
    let file = path.join(DIST, p);
    if (!file.startsWith(DIST)) {
      res.writeHead(403);
      return res.end();
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

/* ------------------------------------------------------------------ mock data */
const WEEK = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const TODAY = WEEK[new Date().getDay()];

export const ANIME = Array.from({ length: 60 }, (_, i) => {
  const n = i + 1;
  return {
    objectID: `Test Anime ${n}`,
    name: `Test Anime ${n}`,
    mal_id: 1000 + n,
    details: {
      english_title: `Test Anime ${n}`,
      state: n % 3 === 0 ? 'مكتمل' : 'مستمر',
      year: String(2020 + (n % 6)),
      season: 'Fall',
      studio: [n % 2 ? 'MAPPA' : 'Bones'],
      mal_mean: Number((6.5 + (n % 30) / 10).toFixed(2)),
      age: 'PG-13'
    },
    type: n % 7 === 0 ? 'فيلم' : 'مسلسل',
    show_time: n <= 8 ? TODAY : WEEK[(n + 1) % 7],
    poster_uri: `${LOCAL}/poster/${n}.svg`,
    cover_uri: `${LOCAL}/wide/${n}.svg`,
    story: `قصة تجريبية للأنمي رقم ${n}. نص طويل شوية عشان نختبر عرض الملخص في صفحة التفاصيل.`,
    tags: n % 2 ? ['أكشن', 'مغامرات'] : ['دراما', 'كوميدي'],
    duration: '24 min',
    views: 100000 - n * 1000
  };
});

/**
 * Titles the app must never show (Ecchi / Harem / Isekai, contentFilter.js), with the exact
 * tag values of the real index. They lead every list (top views and rating), so a missing
 * exclusion shows up at once.
 */
function hiddenAnime(k, name, tags, { type = 'مسلسل', state = 'مكتمل', showTime = WEEK[(k + 3) % 7] } = {}) {
  return {
    objectID: name,
    name,
    mal_id: 9000 + k,
    details: { english_title: name, state, year: '2024', season: 'Fall', studio: ['MAPPA'], mal_mean: 9.6, age: 'PG-13' },
    type,
    show_time: showTime,
    poster_uri: `${LOCAL}/poster/${50 + k}.svg`,
    cover_uri: `${LOCAL}/wide/${50 + k}.svg`,
    story: 'عمل مخفي للاختبار.',
    tags,
    duration: '24 min',
    views: 900000 + k
  };
}
export const HIDDEN_ANIME = [
  hiddenAnime(1, 'Hidden Isekai Hero', ['خيال', 'عالم مختلف']),
  hiddenAnime(2, 'Hidden Ecchi Club', ['كوميدي', 'ايتشي']),
  hiddenAnime(3, 'Hidden Harem House', ['رومانسي', 'حريم']),
  hiddenAnime(4, 'Hidden Isekai Movie', ['عالم مختلف'], { type: 'فيلم' }),
  hiddenAnime(5, 'Hidden Airing Harem', ['اكشن', 'حريم'], { state: 'مستمر', showTime: TODAY })
];

/** What the mocked AniList reports as its most popular manga (the manga tab's quick searches). */
export const POPULAR_MANGA_TITLES = ['Popular Manga One', 'Popular Manga Two', 'Popular Manga Three'];

export const MANGA = Array.from({ length: 12 }, (_, i) => ({
  id: `test-manhwa-${i + 1}`,
  title: `Test Manhwa ${i + 1}`,
  poster: `${LOCAL}/poster/${i + 30}.svg`,
  type: i % 2 ? 'MANGA' : 'MANHWA',
  server: 'bx1',
  rating: 8.1,
  availableServers: ['bx1']
}));

/** Manga the app must never show: genres as the website's servers / AniList report them. */
export const HIDDEN_MANGA = [
  ['hidden-isekai-manhwa', 'Hidden Isekai Manhwa', ['إيسيكاي', 'سحر']],
  ['hidden-harem-manga', 'Hidden Harem Manga', ['حريم', 'كوميدي']],
  ['hidden-ecchi-manga', 'Hidden Ecchi Manga', ['Ecchi']]
].map(([id, title, genres], i) => ({ id, title, poster: `${LOCAL}/poster/${56 + i}.svg`, type: 'MANHWA', server: 'bx1', rating: 9.4, genres, availableServers: ['bx1'] }));

export const TEST_USER = {
  id: 'u_tester',
  username: 'tester',
  email: 'tester@example.com',
  displayName: 'Tester',
  photoUrl: '',
  avatarColor: '#ffffff',
  bio: '',
  role: 'user',
  isDeveloper: false,
  vipTier: 'free',
  vipStatus: 'Free Tier',
  vipExpiresAt: null,
  isGoogleAccount: false,
  createdAt: '2026-01-01T00:00:00.000Z'
};

function seedPosts() {
  const now = Date.now();
  const extra = Array.from({ length: 9 }, (_, i) => ({ id: `post_x${i}`, author: `User ${i}`, username: `user${i}`, role: 'user', category: 'discussion', isSpoiler: false, createdAt: new Date(now - (4 + i) * 86400e3).toISOString(), time: '', text: `بوست قديم رقم ${i + 1} — كلام عن الحلقات والأنمي عشان الصفحة تبقى طويلة كفاية للتمرير.`, likes: i, likedBy: [], replies: [] }));
  return [
    { id: 'post_a', author: 'Kai', username: 'kai', role: 'user', category: 'discussion', isSpoiler: false, createdAt: new Date(now - 5 * 60e3).toISOString(), time: '', text: 'الحلقة دي كانت تحفة', likes: 2, likedBy: ['x1', 'x2'], replies: [] },
    { id: 'post_b', author: 'Mona', username: 'mona', role: 'user', category: 'recommend', isSpoiler: false, createdAt: new Date(now - 3 * 3600e3).toISOString(), time: '', text: 'ترشيح: Test Anime 3', likes: 0, likedBy: [], replies: [] },
    { id: 'post_c', author: 'Omar', username: 'omar', role: 'user', category: 'theory', isSpoiler: false, createdAt: new Date(now - 2 * 86400e3).toISOString(), time: '', text: 'نظرية عن النهاية', likes: 1, likedBy: ['x3'], replies: [] },
    ...extra
  ];
}

/* ------------------------------------------------------------------ mocks */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Algolia-Application-Id, X-Algolia-API-Key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
};

function json(req, data, status = 200) {
  return req.respond({ status, headers: { ...CORS, 'Cache-Control': 'no-store' }, contentType: 'application/json; charset=utf-8', body: JSON.stringify(data) });
}

const safeJson = (s) => {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
};

function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function facetMatch(hit, f) {
  const s = String(f);
  const i = s.indexOf(':');
  if (i < 0) return true;
  let attr = s.slice(0, i);
  let val = s.slice(i + 1);
  // Algolia negates with a minus before the value ("tags:-ايتشي"); "-tags:x" is accepted too.
  let neg = false;
  if (attr.startsWith('-')) {
    neg = true;
    attr = attr.slice(1);
  }
  if (val.startsWith('-')) {
    neg = true;
    val = val.slice(1);
  }
  const v = getPath(hit, attr);
  const ok = Array.isArray(v) ? v.map(String).includes(val) : String(v ?? '') === val;
  return neg ? !ok : ok;
}

/** Like Algolia: nbHits counts every match, but only the first `limit` hits
 * (paginationLimitedTo, 1,000 by default) can be paged through; nbPages stops there. */
function algolia(index, body, limit = 1000) {
  let list = index === 'recent' ? [...HIDDEN_ANIME, ...ANIME.slice().reverse()] : [...HIDDEN_ANIME, ...ANIME];
  const q = String(body.query || '').trim().toLowerCase();
  if (q) list = list.filter((a) => a.name.toLowerCase().includes(q));
  const ff = Array.isArray(body.facetFilters) ? body.facetFilters : body.facetFilters ? [body.facetFilters] : [];
  for (const group of ff) {
    const ors = Array.isArray(group) ? group : [group];
    // The real `recent` index keeps tags on its records but cannot facet on them.
    if (index === 'recent' && ors.every((f) => /^-?tags:/.test(String(f)))) continue;
    list = list.filter((a) => ors.some((f) => facetMatch(a, f)));
  }
  if (/best|rank|rating|score/.test(index)) list.sort((x, y) => y.details.mal_mean - x.details.mal_mean);
  const hpp = Number(body.hitsPerPage) || 20;
  const page = Number(body.page) || 0;
  const reachable = list.slice(0, Math.min(list.length, limit));
  return {
    hits: reachable.slice(page * hpp, page * hpp + hpp),
    nbHits: list.length,
    page,
    nbPages: Math.ceil(reachable.length / hpp),
    hitsPerPage: hpp,
    query: body.query || '',
    params: '',
    facets: {},
    ...(page * hpp >= limit ? { message: `you can only fetch the ${limit} hits for this query` } : {})
  };
}

/** A catalogue record as the website API returns it (server/src/services/animeWitcher.service.js). */
function webShow(a) {
  return {
    slug: `aw-${a.objectID.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`,
    objectID: a.objectID,
    title: a.name,
    titleEn: a.name,
    titleRomaji: a.name,
    poster: a.poster_uri,
    banner: a.cover_uri,
    tagsAr: a.tags,
    genres: a.tags,
    rating: a.details.mal_mean,
    year: Number(a.details.year),
    type: a.type,
    source: 'witanime'
  };
}

function api(req, url, ctx) {
  const p = url.pathname;
  // Website-only lists (the server already removed the hidden genres from them).
  if (p === '/api/stream/latest') {
    return json(req, {
      items: ANIME.slice(0, 8).map((a, i) => ({
        ...webShow(a),
        status: a.details.state,
        // Like the live feed: BLACK X 1 and 2 do not always say which episode is new.
        episode: i === 1 ? null : i + 3
      }))
    });
  }
  // Real air times (AniList) for the computer home's weekly schedule: one show later today,
  // one that aired earlier today (next episode in a week), one tomorrow, one in three days. Day buckets are UTC like the server; the page regroups.
  if (p === '/api/anime/schedule') {
    const now = Math.floor(Date.now() / 1000);
    // `malId` matches catalogue records (Test Anime N has mal_id 1000 + N): the app's schedule
    // tab, home cards and alerts use those real times.
    const slot = (id, name, inSec, episode, malId) => ({
      episode,
      airingAt: now + inSec,
      media: {
        id, malId, titleRomaji: name, titleEnglish: name, titleArabic: null, coverUrl: `${LOCAL}/poster/${(id % 8) + 1}.svg`,
        color: '#888888', genres: ['Action'], episodes: 12, status: 'RELEASING', format: 'TV', nextEpisode: episode, nextAiringAt: now + inSec
      }
    });
    const slots = [
      slot(9101, 'Today Show', 60, 5, 1001),
      // Aired a minute ago, so AniList's next airing is the same weekday next week.
      slot(9104, 'Aired Earlier Show', 7 * 86400 - 60, 7, 1002),
      slot(9102, 'Tomorrow Show', 86400, 9, 1010),
      slot(9103, 'Later Show', 3 * 86400, 2, 1011),
      ...(ctx.extraSlots || [])
    ];
    const days = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const s of slots) days[new Date(s.airingAt * 1000).getUTCDay()].push(s);
    return json(req, { days, weekStart: now, weekEnd: now + 7 * 86400 });
  }
  // AniList's top-rated titles (/api/anime/rankings): names match catalogue records so a row
  // opens the title; BLACK X votes only on #2 (the page shows them only when someone voted).
  if (p === '/api/anime/rankings') {
    const rows = [3, 5, 8, 12, 15].map((n, i) => ({
      id: 8000 + n,
      titleRomaji: `Test Anime ${n}`,
      titleEnglish: `Test Anime ${n}`,
      coverUrl: `${LOCAL}/poster/${(n % 8) + 1}.svg`,
      genres: ['Action', 'Drama'],
      episodes: 12,
      status: 'FINISHED',
      format: 'TV',
      seasonYear: 2024,
      score: 90 - i,
      rank: i + 1,
      scoreTen: Number(((90 - i) / 10).toFixed(1)),
      // like the live API: members' average on the 0–100 scale (an 8.5 average → 85)
      communityScore: i === 1 ? 85 : null,
      votesCount: i === 1 ? 4 : 0
    }));
    // a title only AniList has: the page must search for it instead of opening something else
    rows.push({ id: 8999, titleRomaji: 'Only On AniList', titleEnglish: 'Only On AniList', coverUrl: `${LOCAL}/poster/1.svg`, genres: ['Drama'], episodes: 1, status: 'FINISHED', format: 'MOVIE', seasonYear: 2023, score: 84, rank: 6, scoreTen: 8.4, communityScore: null, votesCount: 0 });
    return json(req, { anime: rows });
  }
  if (p === '/api/anime/trending') {
    return json(req, {
      anime: ANIME.slice(20, 26).map((a) => ({ id: a.mal_id, title_english: a.name, title_romaji: a.name, cover_url: a.poster_uri, banner_url: a.cover_uri, genres: ['Action'], score: 81, season_year: 2024 }))
    });
  }
  const method = req.method();
  const auth = req.headers().authorization || '';
  let m;
  if (p === '/api/app/config') return json(req, { enforced: false, broadcastMsg: '', pinnedRec: null, apk: ctx.apkOverride || APK_RELEASE, serverTime: new Date().toISOString() });
  if (p === '/api/app/skip-times') return json(req, { found: true, malId: Number(url.searchParams.get('mal')) || null, segments: [{ type: 'op', start: 90, end: 180 }] });
  if (p === '/api/app/me') return auth ? json(req, { user: { ...TEST_USER, ...ctx.userPatch }, state: { favorites: [], progress: [], positions: {}, xp: 120 } }) : json(req, { error: 'auth_required' }, 401);
  // The computer website restores its session here (client/src/context/AuthContext.jsx).
  if (p === '/api/auth/me') return auth ? json(req, { user: { ...TEST_USER, ...ctx.userPatch }, stats: null }) : json(req, { error: 'auth_required' }, 401);
  // Username sign-in (password "secret-pass"), profile edits and requests to the developer.
  if (p === '/api/app/auth/login' && method === 'POST') {
    const body = safeJson(req.postData()) || {};
    ctx.logins.push(String(body.identifier || ''));
    if (body.password !== 'secret-pass') return json(req, { error: 'invalid_credentials' }, 401);
    return json(req, { token: 'test-session-token-login-0123456789', user: { ...TEST_USER, ...ctx.userPatch }, state: { favorites: [], progress: [], positions: {}, xp: 120 } });
  }
  if (p === '/api/app/profile' && method === 'PUT') {
    if (!auth) return json(req, { error: 'auth_required' }, 401);
    const patch = safeJson(req.postData()) || {};
    ctx.profilePuts.push(patch);
    Object.assign(ctx.userPatch, patch);
    return json(req, { user: { ...TEST_USER, ...ctx.userPatch } });
  }
  if (p === '/api/app/requests' && method === 'POST') {
    ctx.requests.push(safeJson(req.postData()) || {});
    return json(req, { ok: true });
  }
  if (p === '/api/app/state') return auth ? json(req, { ok: true, state: safeJson(req.postData()) }) : json(req, { error: 'auth_required' }, 401);
  // Account deletion (profile → privacy & security → delete account): recorded in ctx.accountDeletes.
  if (p === '/api/app/account/delete' && method === 'POST') {
    if (!auth) return json(req, { error: 'auth_required' }, 401);
    const body = safeJson(req.postData()) || {};
    (ctx.accountDeletes || (ctx.accountDeletes = [])).push(body);
    if (ctx.deletePassword && body.password !== ctx.deletePassword) return json(req, { error: 'bad_password' }, 401);
    return json(req, { ok: true, removed: false, posts: 1, replies: 0, likes: 2, votes: 0, requests: 0 });
  }
  // Crash reports (client/src/errorReporter.js): recorded in ctx.telemetry.
  if (p === '/api/telemetry/error' && method === 'POST') {
    (ctx.telemetry || (ctx.telemetry = [])).push(safeJson(req.postData()) || {});
    return req.respond({ status: 204, headers: CORS, body: '' });
  }
  if (p === '/api/health') return json(req, { ok: true, name: 'BLACK X API', database: 'ok', authentication: 'ok', firestoreAuth: ctx.firestoreAuth || 'api_key', time: new Date().toISOString() });
  // Developer panel (client/src/mobile/profile/DeveloperPanel.jsx): only for a developer session.
  if (p.startsWith('/api/app/admin/')) {
    if (!auth || !ctx.developer) return json(req, { error: 'forbidden' }, 403);
    if (p === '/api/app/admin/vip') {
      return json(req, {
        enforced: false,
        codes: [{ code: 'BX-MON-TEST-CODE', tier: 'vip_monarch', durationDays: 30, usedCount: 0, maxUses: 1 }],
        userRequests: [{ id: 'req_1', type: 'issue', text: 'الحلقة 3 مش شغالة', author: 'Sara', username: 'sara', createdAt: new Date().toISOString() }],
        broadcastMsg: '',
        pinnedRec: null
      });
    }
    if (p === '/api/app/admin/errors') {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const at = new Date().toISOString();
      return json(req, {
        days: [
          { day, dropped: 0, entries: [{ fp: 'abc123', message: "Cannot read properties of undefined (reading 'slug')", stack: 'TypeError: x\n    at openShow (https://black-x-anime.ai.studio/assets/index.js:1:2)', kind: 'error', path: '/watch/aw-x/3', platform: 'web', build: 'abc1234', ua: 'Mozilla/5.0', count: 3, firstAt: at, lastAt: at }] },
          { day: '20000101', dropped: 0, entries: [] }
        ]
      });
    }
    return json(req, { ok: true });
  }
  if (p === '/api/stream/sources') return json(req, { sources: [{ id: 'witanime' }, { id: 'anime3rb' }, { id: 'english' }] });
  if (p === '/api/stream/stats') return json(req, { animeTotal: ANIME.length + HIDDEN_ANIME.length });
  if ((m = p.match(/^\/api\/stream\/show\/([^/]+)$/))) {
    const slug = decodeURIComponent(m[1]);
    if (slug.includes('missing')) return json(req, { error: 'not_found' }, 404);
    // BLACK X 1 slugs name a catalogue record (same rule as the server's toWitcherSlug()).
    const record = [...HIDDEN_ANIME, ...ANIME].find((a) => `aw-${a.objectID.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}` === slug);
    return json(req, {
      show: {
        slug,
        title: record ? record.name : slug,
        ...(record ? { titleEn: record.name, titleRomaji: record.name, tagsAr: record.tags, type: record.type, year: Number(record.details.year), rating: record.details.mal_mean, sourceName: 'سيرفر BLACK X 1' } : {}),
        ...(slug === 'a3rb-sneaky-isekai' ? { genres: ['عالم مختلف', 'اكشن'] } : {}),
        poster: `${LOCAL}/poster/1.svg`,
        banner: `${LOCAL}/wide/1.svg`,
        // Same shape as the real API (server/src/routes/streaming.js sends both fields).
        episodes: Array.from({ length: 12 }, (_, i) => ({ episode: i + 1, number: i + 1, title: `Episode ${i + 1}`, thumb: `${LOCAL}/wide/${i + 1}.svg` }))
      }
    });
  }
  if ((m = p.match(/^\/api\/stream\/episode\/([^/]+)\/(\d+)$/))) {
    ctx.episodes.push(`${decodeURIComponent(m[1])}:${m[2]}`);
    const payload = { entries: [{ id: `e-${m[2]}`, server: 'BLACK X 1', serverCode: 'PD_DEV', quality: '1080p', directUrl: VIDEO_URL }], resolved: {} };
    // ctx.episodeDelayMs holds the servers back, to test the page while they are still loading.
    if (ctx.episodeDelayMs) return new Promise((r) => setTimeout(r, ctx.episodeDelayMs)).then(() => json(req, payload));
    return json(req, payload);
  }
  if (p === '/api/stream/resolve') return json(req, { source: { directUrl: VIDEO_URL } });
  if (p === '/api/stream/search') {
    const q = String(url.searchParams.get('q') || '').toLowerCase();
    const items = [...HIDDEN_ANIME, ...ANIME].filter((a) => a.name.toLowerCase().includes(q)).map((a) => ({
      slug: `aw-${a.objectID.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      objectID: a.objectID,
      title: a.name,
      titleEn: a.name,
      titleRomaji: a.name,
      poster: a.poster_uri,
      banner: a.cover_uri,
      rating: a.details.mal_mean,
      type: a.type,
      status: a.details.state,
      year: a.details.year,
      tagsAr: a.tags,
      source: 'witanime'
    }));
    // Another server whose search rows carry no genres; its show page does (Isekai).
    if (q.includes('sneaky')) items.push({ slug: 'a3rb-sneaky-isekai', title: 'Sneaky Isekai Show', titleEn: 'Sneaky Isekai Show', poster: `${LOCAL}/poster/57.svg`, source: 'anime3rb' });
    if (q.includes('hidden')) {
      items.push(
        { slug: 'en-hidden-isekai', title: 'Hidden English Isekai', titleEn: 'Hidden English Isekai', poster: `${LOCAL}/poster/58.svg`, genres: ['Action', 'Isekai'], source: 'english' },
        { slug: 'aw-hidden-gem-detective', objectID: 'Hidden Gem Detective', title: 'Hidden Gem Detective', titleEn: 'Hidden Gem Detective', poster: `${LOCAL}/poster/59.svg`, tagsAr: ['غموض'], source: 'witanime' }
      );
    }
    return json(req, { items });
  }
  if (p === '/api/search') {
    const q = String(url.searchParams.get('query') || '').toLowerCase();
    return json(req, { manga: [...HIDDEN_MANGA, ...MANGA].filter((x) => x.title.toLowerCase().includes(q)) });
  }
  if (p === '/api/content/library') return json(req, { items: [...HIDDEN_MANGA, ...MANGA], page: 1, hasNextPage: false });
  if ((m = p.match(/^\/api\/content\/library\/([^/]+)$/))) {
    return json(req, {
      item: {
        id: decodeURIComponent(m[1]),
        chapters: Array.from({ length: 8 }, (_, i) => ({ chapterId: `${m[1]}-ch-${i + 1}`, chapterNumber: String(i + 1), title: `Chapter ${i + 1}`, server: 'bx1' })),
        availableServers: ['bx1'],
        activeServer: 'bx1'
      }
    });
  }
  if ((m = p.match(/^\/api\/manga\/chapter\/([^/]+)\/pages$/))) {
    return json(req, { pages: Array.from({ length: 6 }, (_, i) => ({ pageNumber: i + 1, directUrl: `${LOCAL}/page/${i + 1}.svg` })) });
  }
  if (p === '/api/proxy/image') return req.respond({ status: 200, headers: CORS, contentType: 'image/svg+xml', body: svgImage('poster', 1) });
  if (method !== 'GET') return json(req, { ok: true });
  return json(req, { error: 'not_found' }, 404);
}

// Firestore REST like the real one: every write gets a new updateTime, and the
// currentDocument.exists / currentDocument.updateTime preconditions are enforced (the watch
// party's chat relies on them). `ctx.fs` / `ctx.fsTimes` can be shared by several pages
// (openWeb / openApp `ctx: { fs, fsTimes }`), so two browsers see the same documents.
let fsClock = 0;
function firestore(req, url, ctx) {
  const m = url.pathname.match(/\/documents\/(.+)$/);
  const docPath = m ? decodeURIComponent(m[1]) : '';
  const method = req.method();
  const times = ctx.fsTimes || (ctx.fsTimes = new Map());
  const stamp = (p) => times.get(p) || '2026-10-17T00:00:00.000000Z';
  if (method === 'GET') {
    const fields = ctx.fs.get(docPath);
    return fields ? json(req, { name: docPath, fields, updateTime: stamp(docPath) }) : json(req, { error: { code: 404, status: 'NOT_FOUND' } }, 404);
  }
  if (method === 'PATCH' || method === 'POST') {
    const exists = ctx.fs.has(docPath);
    const mustNot = url.searchParams.get('currentDocument.exists') === 'false';
    const wantTime = url.searchParams.get('currentDocument.updateTime');
    if (mustNot && exists) return json(req, { error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
    if (wantTime && !exists) return json(req, { error: { code: 404, status: 'NOT_FOUND' } }, 404);
    if (wantTime && stamp(docPath) !== wantTime) return json(req, { error: { code: 400, status: 'FAILED_PRECONDITION' } }, 400);
    const body = safeJson(req.postData());
    fsClock += 1;
    const t = `2026-10-17T00:00:${String(Math.floor(fsClock / 1e6) % 60).padStart(2, '0')}.${String(fsClock % 1e6).padStart(6, '0')}Z`;
    ctx.fs.set(docPath, body.fields || {});
    times.set(docPath, t);
    ctx.fsWrites.push({ docPath, body });
    return json(req, { name: docPath, fields: body.fields || {}, updateTime: t });
  }
  return json(req, {});
}

const GOOGLE_FONTS_CSS = [
  `@font-face{font-family:'Cairo';font-weight:200 1000;src:url(${LOCAL}/__fonts/cairo-arabic-wght.woff2) format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF;}`,
  `@font-face{font-family:'Cairo';font-weight:200 1000;src:url(${LOCAL}/__fonts/cairo-latin-wght.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F;}`,
  `@font-face{font-family:'Space Grotesk';font-weight:300 700;src:url(${LOCAL}/__fonts/space-grotesk-latin-wght.woff2) format('woff2');}`
].join('');

function route(req, ctx) {
  const raw = req.url();
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return req.continue();
  const url = new URL(raw);
  // The website build calls its API on the same origin (/api/...); the APK calls the public site
  // (shared/publicSite.js: black-x-anime.ai.studio since v18.1, black-x-anime.me before).
  if (url.host === `127.0.0.1:${PORT}` && url.pathname.startsWith('/api/')) {
    ctx.net.push(`${req.method()} site${url.pathname}`);
    return api(req, url, ctx);
  }
  if (url.host === `127.0.0.1:${PORT}`) return req.continue();
  if (url.host === 'fonts.googleapis.com') return req.respond({ status: 200, headers: CORS, contentType: 'text/css', body: GOOGLE_FONTS_CSS });
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
  ctx.net.push(`${req.method()} ${url.host}${url.pathname}`);
  if (url.host === 'black-x-anime.ai.studio' || url.host === 'black-x-anime.me') return api(req, url, ctx);
  if (/algolia(net)?\.(net|com)$/.test(url.host)) {
    const index = decodeURIComponent(url.pathname.split('/')[3] || '');
    const objectPart = url.pathname.split('/')[4] || '';
    // getObject: GET /1/indexes/<index>/<objectID> (the community post's anime card)
    if (req.method() === 'GET' && objectPart && objectPart !== 'query') {
      const id = decodeURIComponent(objectPart);
      ctx.algolia.push({ index, object: id });
      const hit = [...HIDDEN_ANIME, ...ANIME].find((a) => a.objectID === id);
      return hit ? json(req, hit) : json(req, { message: 'ObjectID does not exist', status: 404 }, 404);
    }
    const body = safeJson(req.postData());
    ctx.algolia.push({ index, body });
    return json(req, algolia(index, body, ctx.paginationLimit));
  }
  if (url.host === 'firestore.googleapis.com') return firestore(req, url, ctx);
  if (url.host === 'graphql.anilist.co') ctx.anilist.push(safeJson(req.postData()));
  if (url.host === 'graphql.anilist.co') {
    const q = String(safeJson(req.postData()).query || '');
    // The manga tab's quick searches: AniList's most popular manga (titles only).
    if (/type: MANGA, sort: POPULARITY_DESC/.test(q)) {
      const media = POPULAR_MANGA_TITLES.map((t, i) => ({ id: 7000 + i, title: { english: t, romaji: t }, genres: ['Action'] }));
      return json(req, { data: { Page: { media } } });
    }
    return json(req, { data: { Page: { pageInfo: { hasNextPage: false, currentPage: 1 }, media: [], airingSchedules: [] }, Media: null } });
  }
  ctx.blocked.push(raw.slice(0, 160));
  return req.respond({ status: 404, headers: CORS, contentType: 'text/plain', body: 'blocked in test' });
}

/* ------------------------------------------------------------------ browser */
export async function launch() {
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: await puppeteer.defaultArgs({
      args: [...chromium.args, '--autoplay-policy=no-user-gesture-required', '--disable-web-security'],
      headless: 'shell'
    }),
    headless: 'shell',
    protocolTimeout: 120000
  });
}

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36';

export async function openApp(browser, { seed = {}, ctx: ctxPatch = {} } = {}) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const ctx = { net: [], algolia: [], fs: new Map(), fsWrites: [], errors: [], consoleErrors: [], blocked: [], episodes: [], anilist: [], paginationLimit: 1000, logins: [], profilePuts: [], requests: [], userPatch: {} };
  ctx.fs.set('settings/shared_community_feed', { json: { stringValue: JSON.stringify(seedPosts()) } });
  Object.assign(ctx, ctxPatch);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    try {
      route(req, ctx);
    } catch (e) {
      ctx.errors.push(`route: ${e.message}`);
      req.abort().catch(() => {});
    }
  });
  page.on('pageerror', (e) => ctx.errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') ctx.consoleErrors.push(msg.text().slice(0, 200));
  });
  await page.evaluateOnNewDocument((seedData) => {
    window.__BLACKX_APK__ = true;
    window.__bxNativeCalls = [];
    const rec = (name) => (...args) => {
      window.__bxNativeCalls.push({ name, args });
    };
    window.BlackXNativeAuth = {
      setFullscreen: rec('setFullscreen'),
      setVolumeKeyScroll: rec('setVolumeKeyScroll'),
      setScreenBrightness: rec('setScreenBrightness'),
      requestNotificationPermission: rec('requestNotificationPermission'),
      sendPhoneNotification: rec('sendPhoneNotification'),
      exitApp: rec('exitApp'),
      enterPipMode: rec('enterPipMode'),
      // APK v18: air-time reminders (returns how many were armed, like the real bridge)
      scheduleEpisodeAlarms: (json) => {
        window.__bxNativeCalls.push({ name: 'scheduleEpisodeAlarms', args: [json] });
        try {
          return JSON.parse(json).length;
        } catch {
          return -1;
        }
      }
    };
    if (!sessionStorage.getItem('__bx_seeded')) {
      sessionStorage.setItem('__bx_seeded', '1');
      for (const [k, v] of Object.entries(seedData)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }, { bx_mob_splash_seen: APK_RELEASE.version, bx_mob_lang: 'ar', ...seed });
  await page.goto(`${LOCAL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.bx-dock') && !document.querySelector('.bx-intro'), { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('.bx-poster').length > 4, { timeout: 20000 }).catch(() => {});
  await sleep(500);
  return { page, ctx };
}

/** Browser user agents for the website tests (a phone browser is NOT the APK's WebView). */
export const PHONE_UA = UA.replace('; wv', '');
export const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/**
 * Opens the WEBSITE build at `route`. `phone: true` = a 412×915 touch phone, otherwise a
 * 1440×900 computer with a mouse; both get the app interface (webUi.js) unless `ui: 'site'`
 * stores the classic-website choice first. `seed` fills localStorage before the first load;
 * the splash is skipped (as on a second page view).
 */
export async function openWeb(browser, { route: routePath = '/', phone = true, seed = {}, wait = true, ctx: ctxPatch = {}, ui = '' } = {}) {
  const page = await browser.newPage();
  await page.setUserAgent(phone ? PHONE_UA : DESKTOP_UA);
  await page.setViewport(
    phone ? { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 }
  );
  const ctx = { net: [], algolia: [], fs: new Map(), fsWrites: [], errors: [], consoleErrors: [], blocked: [], episodes: [], anilist: [], paginationLimit: 1000, logins: [], profilePuts: [], requests: [], userPatch: {} };
  ctx.fs.set('settings/shared_community_feed', { json: { stringValue: JSON.stringify(seedPosts()) } });
  Object.assign(ctx, ctxPatch);
  // `ctx: { communityPosts }` replaces the seeded feed for one page.
  if (Array.isArray(ctxPatch.communityPosts)) ctx.fs.set('settings/shared_community_feed', { json: { stringValue: JSON.stringify(ctxPatch.communityPosts) } });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    try {
      route(req, ctx);
    } catch (e) {
      ctx.errors.push(`route: ${e.message}`);
      req.abort().catch(() => {});
    }
  });
  page.on('pageerror', (e) => ctx.errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') ctx.consoleErrors.push(msg.text().slice(0, 200));
  });
  await page.evaluateOnNewDocument((seedData) => {
    try {
      sessionStorage.setItem('bx_splash_played', '1');
      if (!sessionStorage.getItem('__bx_seeded')) {
        sessionStorage.setItem('__bx_seeded', '1');
        for (const [k, v] of Object.entries(seedData)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    } catch {
      /* about:blank */
    }
  }, { bx_mob_lang: 'ar', blackx_lang: 'ar', ...(ui ? { bx_web_ui_v2: ui } : {}), ...seed });
  // `ctx: { recordOpen: true }`: window.open only records the address (new-tab links)
  if (ctxPatch.recordOpen) {
    await page.evaluateOnNewDocument(() => {
      window.__bxOpened = [];
      window.open = (url) => {
        window.__bxOpened.push(String(url));
        return null;
      };
    });
  }
  await page.goto(`${LOCAL}${routePath}`, { waitUntil: 'domcontentloaded' });
  if (wait) await waitWebReady(page);
  return { page, ctx };
}

/** Waits for whichever interface the website chose: the app (.bx-dock) or the website pages (.app-shell). */
export async function waitWebReady(page, timeout = 30000) {
  await page.waitForFunction(() => (document.querySelector('.bx-dock') || document.querySelector('.app-shell')) && !document.querySelector('.bx-intro'), { timeout });
  await sleep(700);
}

/* ------------------------------------------------------------------ touch helpers */
export async function tapAt(page, x, y) {
  await page.touchscreen.tap(x, y);
}

export async function swipe(page, x1, y1, x2, y2, { steps = 14, stepMs = 16 } = {}) {
  await page.touchscreen.touchStart(x1, y1);
  for (let i = 1; i <= steps; i++) {
    await page.touchscreen.touchMove(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    await sleep(stepMs);
  }
  await page.touchscreen.touchEnd();
}

export async function doubleTap(page, x, y, gapMs = 110) {
  await page.touchscreen.tap(x, y);
  await sleep(gapMs);
  await page.touchscreen.tap(x, y);
}

/** Visible element box (+ whether a finger at its centre would really hit it). */
export async function boxOf(page, selector, { text = null, exact = false, index = 0, scroll = true } = {}) {
  return page.evaluate(
    ({ selector, text, exact, index, scroll }) => {
      const vis = (e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      let els = [...document.querySelectorAll(selector)].filter(vis);
      if (text) {
        els = els.filter((e) => {
          const t = (e.innerText || e.textContent || '').trim();
          const a = e.getAttribute('aria-label') || '';
          return exact ? t === text || a === text : t.includes(text) || a.includes(text);
        });
      }
      const el = els[index];
      if (!el) return null;
      if (scroll) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      const desc = (n) => (n ? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${typeof n.className === 'string' && n.className ? `.${n.className.trim().split(/\s+/).join('.')}` : ''}` : 'none');
      return { x, y, w: r.width, h: r.height, top: r.top, left: r.left, hitOk: Boolean(hit) && (hit === el || el.contains(hit)), hit: desc(hit), text: (el.innerText || '').trim().slice(0, 80) };
    },
    { selector, text, exact, index, scroll }
  );
}

export async function tapEl(page, selector, opts = {}) {
  // A finger lands on the view-transition snapshot while a page transition (≤ 0.32 s) runs.
  await page.waitForFunction(() => !document.documentElement.classList.contains('bx-vt-running'), { timeout: 2000, polling: 50 }).catch(() => {});
  const b = await boxOf(page, selector, opts);
  if (!b) throw new Error(`not found: ${selector}${opts.text ? ` "${opts.text}"` : ''}`);
  if (!b.hitOk && !opts.force) throw new Error(`blocked: ${selector}${opts.text ? ` "${opts.text}"` : ''} -> ${b.hit}`);
  await page.touchscreen.tap(b.x, b.y);
  return b;
}

export async function waitVt(page, timeout = 3000) {
  await page.waitForFunction(() => !document.documentElement.classList.contains('bx-vt-running'), { timeout, polling: 50 }).catch(() => {});
  await sleep(120);
}

export async function text(page, selector) {
  return page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => (e.innerText || e.textContent || '').trim()), selector);
}

export function summary() {
  const groups = {};
  for (const r of results) {
    groups[r.group] = groups[r.group] || { pass: 0, fail: 0 };
    groups[r.group][r.ok ? 'pass' : 'fail'] += 1;
  }
  const pass = results.filter((r) => r.ok).length;
  console.log('\n==== SUMMARY ====');
  for (const [g, c] of Object.entries(groups)) console.log(`${g.padEnd(10)} ${c.pass}/${c.pass + c.fail}`);
  console.log(`TOTAL ${pass}/${results.length}`);
  const fails = results.filter((r) => !r.ok);
  if (fails.length) {
    console.log('FAILED:');
    for (const f of fails) console.log(` - [${f.group}] ${f.name} — ${f.info}`);
  }
  return { pass, total: results.length };
}
