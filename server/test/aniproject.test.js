import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import streamingRoutes from '../src/routes/streaming.js';
import contentRoutes from '../src/routes/content.routes.js';
import mangaRoutes from '../src/routes/mangaNovel.routes.js';
import { mangalikService } from '../src/services/mangalik.service.js';

// Fixture for the documented AniProject v3 backend routes. No remote network
// or hosted upstream is required for these adapter/route integration checks.
const ANIME_ID = 'one-piece-123?dub=true';
const EPISODE_ID = 'one-piece-episode-1?server=sub';
const MANGA_ID = '15e68a69-3099-4ce4-9227-1f0fd746fc53';
const CHAPTER_ID = '01cd3700-2250-4b10-a207-45f748e01b44';
const upstream = 'https://aniproject-fixture.example';
const originalFetch = globalThis.fetch;
const originalUrl = process.env.ANIPROJECT_API_URL;
const originalHosts = process.env.ANIPROJECT_MEDIA_HOSTS;
const originalMangaPages = mangalikService.getMangaDexChapterPages;
const requests = [];
const mediaRequests = [];
let failSearch = false;
let emptyChapter = false;
let base;
let server;

function fixture(url) {
  const path = url.pathname;
  if (failSearch && path.startsWith('/search/')) return { status: 500, body: { error: 'unavailable' } };
  if (path === '/search/anime/consumet/zoro' && url.searchParams.get('query') === 'invalid payload') {
    return { message: 'Unexpected upstream shape' };
  }
  if (path === '/search/anime/consumet/zoro' && url.searchParams.get('query') === 'no matches') {
    return { status: 404, body: { message: 'No results found', results: [] } };
  }
  if (path === '/search/anime/consumet/zoro') {
    return { results: [
      { id: ANIME_ID, title: 'One Piece', image: 'https://images.example/one-piece.jpg' },
      { id: '', title: 'Missing ID' }
    ] };
  }
  if (path === '/media-info/anime/consumet/zoro') {
    return { result: {
      id: ANIME_ID, title: 'One Piece', description: '<b>Adventure</b>',
      episodes: [{ id: EPISODE_ID, number: 1 }, { id: 'two', number: 2 }]
    } };
  }
  if (path === '/episodes/consumet/zoro/episode') {
    return { results: {
      headers: { Referer: 'https://streamer.example/player/' },
      sources: [
        { url: 'https://media.example/master.m3u8', isM3U8: true, quality: 'default' },
        { url: 'https://media.example/movie.mp4', isM3U8: false, quality: '720p' },
        { url: 'file:///etc/passwd' }, { url: 'http://127.0.0.1/admin' }
      ], download: 'https://media.example/download.mp4'
    } };
  }
  if (path === '/search/manga/consumet/mangadex/no%20matches') {
    return { status: 404, body: { message: 'No results found', results: [] } };
  }
  if (path === '/search/manga/consumet/mangadex/One%20Piece%20%26%20More') {
    return { results: [{ id: MANGA_ID, title: 'One Piece & More',
      image: `https://uploads.mangadex.org/covers/${MANGA_ID}/cover.jpg`, description: 'Adventure' }] };
  }
  if (path === '/chapters/consumet/mangadex/all') {
    return { results: [{ id: CHAPTER_ID, chapterNumber: '1', title: 'Chapter 1', pages: 2 }] };
  }
  if (path === '/chapters/consumet/mangadex/chapter') {
    return { results: emptyChapter ? [] : [
      { page: 1, img: 'https://cdn.mangadex.network/data/hash/1.jpg' },
      { page: 2, img: 'https://internal.example/private.jpg' }
    ] };
  }
  return { status: 404, body: { error: 'fixture_not_found' } };
}

async function get(path, options) {
  const response = await originalFetch(`${base}${path}`, options);
  return { status: response.status, body: response.headers.get('content-type')?.includes('text/html')
    ? await response.text() : await response.json() };
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/stream', streamingRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api', mangaRoutes);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  process.env.ANIPROJECT_API_URL = upstream;
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    if (url.origin === 'https://media.example') {
      mediaRequests.push({ url, options });
      if (url.pathname === '/redirect') return new Response(null, {
        status: 302, headers: { Location: 'http://127.0.0.1/private' }
      });
      if (url.pathname.endsWith('.m3u8')) return new Response(
        '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://media.example/key"\n#EXT-X-MAP:URI="http://127.0.0.1/private"\n#EXTINF:10,\nsegment.ts\n',
        { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }
      );
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4' } });
    }
    if (url.origin !== upstream) return originalFetch(input, options);
    requests.push({ url, options });
    const answer = fixture(url);
    return new Response(JSON.stringify(answer.body || answer), {
      status: answer.status || 200, headers: { 'Content-Type': 'application/json' }
    });
  };
});

after(async () => {
  globalThis.fetch = originalFetch;
  mangalikService.getMangaDexChapterPages = originalMangaPages;
  if (originalUrl === undefined) delete process.env.ANIPROJECT_API_URL;
  else process.env.ANIPROJECT_API_URL = originalUrl;
  if (originalHosts === undefined) delete process.env.ANIPROJECT_MEDIA_HOSTS;
  else process.env.ANIPROJECT_MEDIA_HOSTS = originalHosts;
  await new Promise((resolve) => server.close(resolve));
});

test('source is opt-in and disabled requests do not contact upstream', async () => {
  delete process.env.ANIPROJECT_API_URL;
  const beforeCount = requests.length;
  const sources = await get('/api/stream/sources');
  assert.equal(sources.body.sources.some((source) => source.id === 'aniproject'), false);
  assert.equal((await get('/api/stream/search?source=aniproject&q=One')).status, 503);
  assert.equal((await get('/api/search?type=manga&server=bx4&query=One')).status, 503);
  assert.equal((await get('/api/content/library?server=bx4')).status, 503);
  assert.equal(requests.length, beforeCount);
  process.env.ANIPROJECT_API_URL = upstream;
});

test('anime title search, show and episodes retain Hearbor branding and encoded IDs', async () => {
  const sources = await get('/api/stream/sources');
  assert.equal(sources.body.sources.at(-1).badge, 'Hearbor 4');
  const result = await get('/api/stream/search?source=aniproject&q=One%20Piece%20%26%20More');
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  const showSlug = result.body.items[0].slug;
  assert.match(showSlug, /^ap-[a-zA-Z0-9_-]+$/);
  assert.equal(result.body.items[0].sourceLabel, 'سيرفر Hearbor 4');
  assert.equal(requests.at(-1).url.searchParams.get('query'), 'One Piece & More');
  assert.equal(requests.at(-1).options.redirect, 'manual');

  const show = await get(`/api/stream/show/${showSlug}?source=aniproject`);
  assert.equal(show.body.show.titleEn, 'One Piece');
  assert.deepEqual(show.body.show.episodes.map((ep) => ep.number), [1, 2]);
  assert.equal(requests.at(-1).url.searchParams.get('query'), ANIME_ID);

  process.env.ANIPROJECT_MEDIA_HOSTS = 'media.example';
  const episode = await get(`/api/stream/episode/${showSlug}/1?source=aniproject`);
  assert.deepEqual(episode.body.entries.map((e) => e.server), ['Hearbor 4', 'Hearbor 4']);
  assert.equal(episode.body.entries[0].isFastCdn, false);
  assert.equal(episode.body.resolved['ap-0'].isHls, true);
  assert.match(episode.body.resolved['ap-0'].directUrl, /^\/api\/stream\/hls-proxy\?url=/);
  assert.equal(new URL(episode.body.resolved['ap-0'].directUrl, base).searchParams.get('ref'), 'https://streamer.example/player/');
  assert.equal(episode.body.resolved['ap-1'].browserDirect, false);
  assert.match(episode.body.resolved['ap-1'].directUrl, /^\/api\/stream\/proxy\?url=/);
  assert.equal(requests.at(-1).url.searchParams.get('id'), EPISODE_ID);
  assert.equal(episode.body.downloads.length, 1);
  const resolved = await get('/api/stream/resolve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: showSlug, episode: 1, entryId: 'ap-0' })
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.source.isHls, true);
  const invalid = await get('/api/stream/resolve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: showSlug, episode: 1, entryId: 'ap-99' })
  });
  assert.equal(invalid.status, 404);
  const cloud = await get(`/api/stream/download-sources/${showSlug}/1`);
  assert.equal(cloud.body.count, 1);
  assert.equal(cloud.body.cloudHosts[0].url, 'https://media.example/download.mp4');
  const download = await get('/api/stream/resolve-download', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: showSlug, episode: 1, entryId: 'dl-ap-0' })
  });
  assert.equal(download.body.source.directUrl, 'https://media.example/download.mp4');

  // Removing the allowlist falls back to browser playback, never an open proxy.
  delete process.env.ANIPROJECT_MEDIA_HOSTS;
  const direct = await get(`/api/stream/episode/${showSlug}/1`);
  assert.equal(direct.body.resolved['ap-0'].directUrl, 'https://media.example/master.m3u8');
  assert.equal(direct.body.resolved['ap-0'].browserDirect, true);
});

test('the allowlisted media proxy forwards Referer, rewrites HLS and blocks private redirects', async () => {
  process.env.ANIPROJECT_MEDIA_HOSTS = 'media.example';
  const ref = encodeURIComponent('https://streamer.example/player/');
  const playlist = await originalFetch(`${base}/api/stream/hls-proxy?url=${encodeURIComponent('https://media.example/master.m3u8')}&ref=${ref}`);
  assert.equal(playlist.status, 200);
  const text = await playlist.text();
  assert.match(text, /segment\.ts/);
  assert.match(text, /URI="\/api\/stream\/hls-proxy\?url=https%3A%2F%2Fmedia\.example%2Fkey/);
  assert.match(text, /#EXT-X-MAP:URI=""/); // private key/segment URL never leaks into the playlist
  assert.doesNotMatch(text, /127\.0\.0\.1/);
  assert.match(text, /ref=https%3A%2F%2Fstreamer\.example%2Fplayer%2F/);
  assert.equal(mediaRequests.at(-1).options.headers.Referer, 'https://streamer.example/player/');
  assert.equal(mediaRequests.at(-1).options.headers.Origin, 'https://streamer.example');

  const video = await originalFetch(`${base}/api/stream/proxy?url=${encodeURIComponent('https://media.example/movie.mp4')}&ref=${ref}`);
  assert.equal(video.status, 200);
  assert.deepEqual(Array.from(new Uint8Array(await video.arrayBuffer())), [1, 2, 3]);
  assert.equal(mediaRequests.at(-1).options.headers.Referer, 'https://streamer.example/player/');

  const count = mediaRequests.length;
  const privateRedirect = await originalFetch(`${base}/api/stream/hls-proxy?url=${encodeURIComponent('https://media.example/redirect')}`);
  assert.equal(privateRedirect.status, 403);
  assert.equal(mediaRequests.length, count + 1); // never fetched Location
  const videoRedirect = await originalFetch(`${base}/api/stream/proxy?url=${encodeURIComponent('https://media.example/redirect')}`);
  assert.equal(videoRedirect.status, 403);
  assert.equal(mediaRequests.length, count + 2);
  const downloadRedirect = await originalFetch(`${base}/api/stream/download?url=${encodeURIComponent('https://media.example/redirect')}`, { redirect: 'manual' });
  assert.equal(downloadRedirect.status, 403);
  assert.equal(mediaRequests.length, count + 3);
  const segment = await originalFetch(`${base}/api/stream/hls-proxy?url=${encodeURIComponent('https://media.example/segment.ts')}&ref=${ref}`);
  assert.equal(segment.status, 200);
  assert.deepEqual(Array.from(new Uint8Array(await segment.arrayBuffer())), [1, 2, 3]);
  delete process.env.ANIPROJECT_MEDIA_HOSTS;
  assert.equal((await originalFetch(`${base}/api/stream/proxy?url=${encodeURIComponent('https://media.example/movie.mp4')}`)).status, 403);
});

test('v3 no-results responses return empty searches instead of upstream errors', async () => {
  const anime = await get('/api/stream/search?source=aniproject&q=no%20matches');
  assert.equal(anime.status, 200);
  assert.deepEqual(anime.body.items, []);
  const manga = await get('/api/search?type=manga&server=bx4&query=no%20matches');
  assert.equal(manga.status, 200);
  assert.deepEqual(manga.body.manga, []);
});

test('all-source manga search includes the configured source without replacing existing results', async () => {
  const originalSearch = mangalikService.searchArabicManga;
  mangalikService.searchArabicManga = async () => [{ id: 'legacy-title', title_en: 'Legacy', type: 'MANGA' }];
  try {
    const search = await get('/api/search?type=manga&server=all&query=One%20Piece%20%26%20More');
    assert.equal(search.status, 200);
    assert.equal(search.body.manga.length, 2);
    assert.ok(search.body.manga.some((item) => item.id === 'legacy-title'));
    assert.ok(search.body.manga.some((item) => item.server === 'bx4'));
  } finally {
    mangalikService.searchArabicManga = originalSearch;
  }
});

test('manga search, chapter navigation and page URLs are integrated', async () => {
  const search = await get('/api/search?type=manga&server=bx4&query=One%20Piece%20%26%20More');
  assert.equal(search.status, 200);
  assert.equal(search.body.manga.length, 1);
  const mangaId = search.body.manga[0].id;
  assert.match(mangaId, /^ap:[a-zA-Z0-9_-]+$/);
  assert.deepEqual(search.body.manga[0].availableServers, ['bx4']);
  assert.equal(search.body.manga[0].rating, null);
  const noFeed = await get('/api/content/library?server=bx4&page=1');
  assert.deepEqual(noFeed.body, { success: true, totalCount: 0, page: 1, hasNext: false, items: [] });
  const library = await get('/api/content/library?server=bx4&q=One%20Piece%20%26%20More');
  assert.equal(library.body.totalCount, 1);
  assert.equal(library.body.hasNext, false);

  const detail = await get(`/api/content/library/${encodeURIComponent(mangaId)}?server=bx4`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.item.activeServer, 'bx4');
  assert.equal(detail.body.item.chapters[0].number, '1');
  const chapters = await get(`/api/manga/${encodeURIComponent(mangaId)}/chapters?server=bx4`);
  assert.equal(chapters.body.availableServers[0].id, 'bx4');
  assert.equal(chapters.body.chapters.length, 1);
  const chapterId = chapters.body.chapters[0].chapterId;
  const pages = await get(`/api/manga/chapter/${encodeURIComponent(chapterId)}/pages?server=bx4`);
  assert.equal(pages.status, 200);
  assert.deepEqual(pages.body.pages.map((p) => p.pageNumber), [1]);
  assert.equal(pages.body.pages[0].imageUrl, 'https://cdn.mangadex.network/data/hash/1.jpg');
  assert.equal(requests.at(-1).url.searchParams.get('id'), CHAPTER_ID);
  assert.equal((await get('/api/manga/ap%3Anot-base64/chapters')).status, 404);

  const download = await get(`/api/manga/chapter/${encodeURIComponent(chapterId)}/download?server=bx4&title=%3Cscript%3Ealert(1)%3C%2Fscript%3E&chapter=1`);
  assert.equal(download.status, 200);
  assert.doesNotMatch(download.body, /<script>alert\(1\)<\/script>/);
  assert.match(download.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('v3 empty chapter responses fall back to existing MangaDex at-home pages', async () => {
  emptyChapter = true;
  mangalikService.getMangaDexChapterPages = async (id) => {
    assert.equal(id, CHAPTER_ID);
    return [
      { imageUrl: 'https://uploads.mangadex.org/data/hash/a.jpg' },
      { imageUrl: 'https://private.example/data/hash/b.jpg' }
    ];
  };
  const mangaId = `ap:${Buffer.from(MANGA_ID).toString('base64url')}`;
  const chapterId = (await get(`/api/manga/${encodeURIComponent(mangaId)}/chapters`)).body.chapters[0].chapterId;
  const result = await get(`/api/manga/chapter/${encodeURIComponent(chapterId)}/pages`);
  assert.deepEqual(result.body.pages.map((p) => p.imageUrl), ['https://uploads.mangadex.org/data/hash/a.jpg']);
  emptyChapter = false;
  mangalikService.getMangaDexChapterPages = originalMangaPages;
});

test('explicit source errors report upstream failure without inventing results', async () => {
  assert.equal((await get('/api/stream/search?source=aniproject&q=invalid%20payload')).status, 502);
  failSearch = true;
  assert.equal((await get('/api/stream/search?source=aniproject&q=One')).status, 502);
  assert.equal((await get('/api/search?server=bx4&type=manga&query=One')).status, 502);
  assert.equal((await get('/api/content/library?server=bx4&q=One')).status, 502);
  failSearch = false;
});
