/**
 * Hearbor Server 3 — Complete Japanese Anime Library + AI Arabic Translation Engine
 * ---------------------------------------------------------------------------------
 * Provides complete coverage of Japanese anime released in Japan:
 *  - Complete Japanese Anime Catalog (countryOfOrigin: JP, status: FINISHED / RELEASING)
 *  - Direct 1080p/720p MP4 streaming & downloading (Zero Iframe Sandbox)
 *  - Cross-linked Arabic-subtitled streams from Hearbor 1 & Hearbor 2 (with strict title verification)
 *  - Real-time English -> Arabic AI subtitle translation (.srt / .ass / .vtt)
 *  - 100% pure Hearbor branding with zero mention of upstream sources
 */
import { apiGet, apiSet, streamGet, streamSet } from '../db.js';
import { translateTextToArabic, getTranslatedEpisodeSubtitles } from '../subtitleTranslator.js';
import { searchShows, fetchEpisode, resolveEntry, isTitleMatch } from '../witanime.js';
import { anime3rbService } from './anime3rb.service.js';

const ANILIST_URL = 'https://graphql.anilist.co';

function slugifyTitle(title, malId) {
  const base =
    String(title || 'anime')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'anime';
  return malId ? `en-${malId}-${base}` : `en-${base}`;
}

function parseEnglishSlug(rawSlug) {
  const clean = String(rawSlug || '').trim();
  const m = clean.match(/^(?:en|mal)-(\d+)(?:-(.+))?$/i);
  if (m) {
    return {
      malId: Number(m[1]),
      query: (m[2] || '').replace(/-/g, ' ').trim()
    };
  }
  const m2 = clean.match(/^en_anime:(\d+):(.+)$/i);
  if (m2) {
    return {
      malId: null,
      query: (m2[2] || '').replace(/-/g, ' ').trim()
    };
  }
  return {
    malId: null,
    query: clean
      .replace(/^(en_anime:|en-|mal-|ani-|ok-|blkom-|a3rb-)/i, '')
      .replace(/[:_-]+/g, ' ')
      .trim()
  };
}

async function queryAniList(query, variables = {}) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data || null;
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

class EnglishAnimeService {
  /**
   * Fetch trending / airing Japanese anime
   */
  async getLatestEpisodes(page = 1) {
    const p = Math.max(1, Number(page) || 1);
    const cacheKey = `en_anime:latest:v3:${p}`;
    const cached = apiGet(cacheKey);
    if (cached) return cached;

    const gql = `
      query ($page: Int) {
        Page(page: $page, perPage: 24) {
          media(type: ANIME, countryOfOrigin: "JP", status_in: [FINISHED, RELEASING], sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: false) {
            id
            idMal
            episodes
            status
            averageScore
            genres
            description(asHtml: false)
            nextAiringEpisode { episode }
            title { english romaji native }
            coverImage { extraLarge large }
            bannerImage
          }
        }
      }
    `;

    const data = await queryAniList(gql, { page: p }).catch(() => null);
    const mediaList = data?.Page?.media || [];

    const items = mediaList
      .filter((m) => m.idMal)
      .map((m) => {
        const titleEn = m.title?.english || m.title?.romaji || `Anime ${m.idMal}`;
        const latestEp = m.nextAiringEpisode?.episode
          ? Math.max(1, m.nextAiringEpisode.episode - 1)
          : m.episodes || null; // unknown: not an invented 12
        const slug = slugifyTitle(titleEn, m.idMal);
        return {
          slug,
          malId: m.idMal,
          aniId: m.id,
          episode: latestEp,
          episodes: latestEp,
          episodeCount: latestEp,
          titleEn,
          titleAr: titleEn,
          poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
          banner: m.bannerImage || m.coverImage?.extraLarge || '',
          score: m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : null,
          genres: Array.isArray(m.genres) ? m.genres : [],
          url: `/show/${slug}?source=english`,
          source: 'english',
          hasAutoArabicSub: true,
          sourceLabel: 'سيرفر Hearbor 3'
        };
      });

    if (items.length) {
      apiSet(cacheKey, items, 15 * 60 * 1000);
    }
    return items;
  }

  /**
   * Search any anime (Japanese catalog + direct title match)
   */
  async search(q) {
    const clean = String(q || '').trim();
    if (!clean) return this.getLatestEpisodes(1);
    const cacheKey = `en_anime:search:v4:${clean.toLowerCase()}`;
    const cached = apiGet(cacheKey);
    if (cached) return cached;

    const gql = `
      query ($search: String) {
        Page(page: 1, perPage: 20) {
          media(search: $search, type: ANIME, status_in: [FINISHED, RELEASING], sort: [POPULARITY_DESC], isAdult: false) {
            id
            idMal
            countryOfOrigin
            episodes
            status
            averageScore
            genres
            synonyms
            description(asHtml: false)
            nextAiringEpisode { episode }
            title { english romaji native }
            coverImage { extraLarge large }
            bannerImage
          }
        }
      }
    `;

    const data = await queryAniList(gql, { search: clean }).catch(() => null);
    const mediaList = data?.Page?.media || [];

    const items = mediaList
      .filter((m) => m.idMal)
      .map((m) => {
        const titleEn = m.title?.english || m.synonyms?.[0] || m.title?.romaji || clean;
        const epCount = m.nextAiringEpisode?.episode
          ? Math.max(1, m.nextAiringEpisode.episode - 1)
          : m.episodes || null;
        const slug = slugifyTitle(m.title?.romaji || titleEn, m.idMal);
        return {
          slug,
          malId: m.idMal,
          aniId: m.id,
          titleEn,
          titleRomaji: m.title?.romaji || titleEn,
          titleAr: titleEn,
          poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
          banner: m.bannerImage || m.coverImage?.extraLarge || '',
          episodes: epCount,
          episodeCount: epCount,
          score: m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : null,
          genres: Array.isArray(m.genres) ? m.genres : [],
          url: `/show/${slug}?source=english`,
          source: 'english',
          hasAutoArabicSub: true,
          sourceLabel: 'سيرفر Hearbor 3'
        };
      });

    apiSet(cacheKey, items, 20 * 60 * 1000);
    return items;
  }

  /**
   * Resolve full anime details & episode list
   */
  async getShow(rawSlug) {
    const { malId, query } = parseEnglishSlug(rawSlug);
    const cacheKey = `en_anime:show:v4:${malId || query.toLowerCase()}`;
    const cached = apiGet(cacheKey);
    if (cached) return cached;

    const gql = malId
      ? `
        query ($idMal: Int) {
          Media(idMal: $idMal, type: ANIME) {
            id
            idMal
            episodes
            status
            averageScore
            genres
            synonyms
            description(asHtml: false)
            nextAiringEpisode { episode }
            title { english romaji native }
            coverImage { extraLarge large }
            bannerImage
          }
        }
      `
      : `
        query ($search: String) {
          Media(search: $search, type: ANIME, status_in: [FINISHED, RELEASING], sort: [POPULARITY_DESC]) {
            id
            idMal
            episodes
            status
            averageScore
            genres
            synonyms
            description(asHtml: false)
            nextAiringEpisode { episode }
            title { english romaji native }
            coverImage { extraLarge large }
            bannerImage
          }
        }
      `;

    const vars = malId ? { idMal: malId } : { search: query };
    const data = await queryAniList(gql, vars).catch(() => null);
    const m = data?.Media;
    if (!m || !m.idMal) return null;

    const titleEn = m.title?.english || m.synonyms?.find((s) => /^[a-zA-Z0-9\s:'-]+$/.test(s)) || m.title?.romaji || query || `Anime ${m.idMal}`;
    const titleRomaji = m.title?.romaji || titleEn;
    const titleNative = m.title?.native || '';
    const synonyms = Array.isArray(m.synonyms) ? m.synonyms : [];
    const epCount = m.nextAiringEpisode?.episode
      ? Math.max(1, m.nextAiringEpisode.episode - 1)
      : m.episodes || 0; // only episodes AniList knows about

    const cleanDesc = (m.description || '').replace(/<[^>]+>/g, '').trim();
    const descAr = cleanDesc ? await translateTextToArabic(cleanDesc).catch(() => cleanDesc) : '';

    const canonicalSlug = slugifyTitle(titleRomaji || titleEn, m.idMal);
    const episodes = Array.from({ length: Math.min(epCount, 1200) }, (_, i) => ({
      episode: i + 1,
      number: i + 1,
      title: `الحلقة ${i + 1}`,
      slug: canonicalSlug,
      url: `/watch/${canonicalSlug}/${i + 1}?source=english`
    }));

    const show = {
      slug: canonicalSlug,
      malId: m.idMal,
      aniId: m.id,
      kind: 'anime',
      titleEn,
      titleRomaji,
      titleNative,
      synonyms,
      titleAr: titleEn,
      poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
      banner: m.bannerImage || m.coverImage?.extraLarge || '',
      score: m.averageScore ? (m.averageScore / 10).toFixed(1) : null,
      status: m.status === 'FINISHED' ? 'مكتمل' : 'يعرض الان',
      genres: Array.isArray(m.genres) ? m.genres : [],
      description: descAr || cleanDesc,
      episodeCount: epCount,
      episodes,
      hasAutoArabicSub: true,
      source: 'english',
      sourceName: 'سيرفر Hearbor 3'
    };

    apiSet(cacheKey, show, 30 * 60 * 1000);
    return show;
  }

  /**
   * Deobfuscate ZokoAnime / HiAnime embed payload: base64(json XOR "otaku-embed-v1")
   */
  deobfuscateZokoBlob(b64) {
    try {
      const raw = Buffer.from(String(b64 || ''), 'base64');
      const key = Buffer.from('otaku-embed-v1');
      const out = Buffer.alloc(raw.length);
      for (let i = 0; i < raw.length; i++) {
        out[i] = raw[i] ^ key[i % key.length];
      }
      return JSON.parse(out.toString('utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Fetch ZokoAnime / HiAnime 1080p/720p/360p HLS (.m3u8) + official .vtt subtitle track via MAL ID
   * (with fallback to hianime.at search when needed)
   */
  async fetchZokoMalStreams(malId, titleEn, titleRomaji, episode) {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    const result = {
      sub: null,
      dub: null
    };

    const resolveEmbedPage = async (embedUrl) => {
      try {
        const res = await fetch(embedUrl, {
          headers: { 'User-Agent': ua, Referer: 'https://hianime.at/' },
          signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) return null;
        const html = await res.text();
        const m = html.match(/window\.__P="([^"]+)"/);
        if (!m) return null;
        const data = this.deobfuscateZokoBlob(m[1]);
        if (!data?.src || !data.src.includes('.m3u8')) return null;

        const masterUrl = data.src;
        const defaultSub =
          (data.subtitles || []).find((s) => s.default && s.src) ||
          (data.subtitles || []).find((s) => /en/i.test(s.lang || s.label || '') && s.src) ||
          (data.subtitles || [])[0] ||
          null;

        const variants = {};
        try {
          const mRes = await fetch(masterUrl, {
            headers: { 'User-Agent': ua, Referer: 'https://zokoanime.video/' },
            signal: AbortSignal.timeout(6000)
          });
          if (mRes.ok) {
            const mText = await mRes.text();
            const lines = mText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/i);
                const nextLine = lines[i + 1];
                if (resMatch && nextLine && !nextLine.startsWith('#')) {
                  const q = `${resMatch[1]}p`;
                  variants[q] = new URL(nextLine, masterUrl).href;
                }
              }
            }
          }
        } catch {}

        return {
          masterUrl,
          variants,
          subtitleUrl: defaultSub?.src || null
        };
      } catch {
        return null;
      }
    };

    if (malId) {
      const [subStream, dubStream] = await Promise.all([
        resolveEmbedPage(`https://zokoanime.video/stream/mal/${malId}/${episode}/sub`),
        resolveEmbedPage(`https://zokoanime.video/stream/mal/${malId}/${episode}/dub`)
      ]);
      result.sub = subStream;
      result.dub = dubStream;
    }

    // Fallback via hianime.at search with strict title verification if direct MAL lookup returned nothing
    if (!result.sub && (titleEn || titleRomaji)) {
      const queries = [titleEn, titleRomaji].filter(Boolean);
      for (const q of [...new Set(queries)]) {
        try {
          const sRes = await fetch(`https://hianime.at/search?keyword=${encodeURIComponent(q)}`, {
            headers: { 'User-Agent': ua },
            signal: AbortSignal.timeout(7000)
          });
          if (!sRes.ok) continue;
          const sHtml = await sRes.text();
          const mainPart = sHtml.split('id="main-sidebar"')[0] || sHtml;
          const items = [
            ...mainPart.matchAll(/<h3 class="film-name">\s*<a href="[^"]*\/([^"/?]+)"\s*title="([^"]*)"/gi)
          ];
          const verified = items.find((m) => {
            const candTitle = decodeHtmlEntities(m[2]).trim();
            return (
              isTitleMatch(titleEn, candTitle) ||
              (titleRomaji && isTitleMatch(titleRomaji, candTitle))
            );
          });
          if (!verified) continue;

          const showId = verified[1].split('-').pop();
          const epRes = await fetch(`https://hianime.at/api/theme/episode/list/${showId}`, {
            headers: { 'User-Agent': ua },
            signal: AbortSignal.timeout(7000)
          });
          if (!epRes.ok) continue;
          const epText = (await epRes.text()).replace(/\\/g, '');
          const epMatch = epText.match(
            new RegExp(`data-number="${episode}"[^>]*data-id="(\\d+)"`, 'i')
          );
          if (!epMatch?.[1]) continue;

          const srvRes = await fetch(
            `https://hianime.at/api/theme/episode/servers?episodeId=${epMatch[1]}`,
            {
              headers: { 'User-Agent': ua },
              signal: AbortSignal.timeout(7000)
            }
          );
          if (!srvRes.ok) continue;
          const srvClean = (await srvRes.text()).replace(/\\"/g, '"');
          const hashMatch = srvClean.match(
            /data-type="sub"[^>]*data-server-name="ZokoAnime"[^>]*data-hash="([^"]+)"/i
          );
          if (hashMatch?.[1]) {
            const embedUrl = Buffer.from(hashMatch[1], 'base64').toString('utf8');
            result.sub = await resolveEmbedPage(embedUrl);
            if (result.sub) break;
          }
        } catch {}
      }
    }

    return result;
  }

  /**
   * Fetch AllAnime / AllManga POST GraphQL streams with strict title verification
   */
  async fetchAllAnimePostStreams(titleEn, titleRomaji, episode) {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const gqlPost = async (query) => {
      const r = await fetch('https://api.allanime.day/api', {
        method: 'POST',
        headers: {
          Origin: 'https://allmanga.to',
          Referer: 'https://allmanga.to/',
          'User-Agent': ua,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*'
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(7000)
      });
      if (!r.ok) return null;
      return r.json();
    };

    try {
      const searchQ = String(titleEn || titleRomaji || '')
        .replace(/"/g, ' ')
        .trim();
      if (!searchQ) return [];

      const sData = await gqlPost(
        `{shows(search:{sortBy:Trending,query:"${searchQ}"},limit:8,page:1){edges{_id name englishName nativeName}}}`
      );
      const edges = sData?.data?.shows?.edges || [];
      const matchedShow = edges.find(
        (e) =>
          isTitleMatch(titleEn, e.englishName || e.name) ||
          (titleRomaji && isTitleMatch(titleRomaji, e.name || e.englishName))
      );
      if (!matchedShow?._id) return [];

      const epData = await gqlPost(
        `{episodeInfos(showId:"${matchedShow._id}",episodeNumStart:${episode},episodeNumEnd:${episode}){_id episodeIdNum vidInforssub vidInforsdub}}`
      );
      const epInfo = (epData?.data?.episodeInfos || []).find(
        (x) => Number(x.episodeIdNum) === Number(episode)
      );
      if (!epInfo) return [];

      const out = [];
      for (const [mode, field] of [
        ['sub', 'vidInforssub'],
        ['dub', 'vidInforsdub']
      ]) {
        const info = epInfo[field];
        if (info?.vidPath) {
          const url = info.vidPath.startsWith('http')
            ? info.vidPath
            : `https://allanimenews.com/${info.vidPath.replace(/^\/+/, '')}`;
          out.push({
            mode,
            quality: `${info.vidResolution || 720}p`,
            url
          });
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * Fetch direct MP4 streams with strict title verification so it never plays a wrong anime
   */
  async fetchAnimeHeavenStreams(titleEn, titleRomaji, episode) {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    const clean = (s) =>
      String(s || '')
        .replace(/\([^)]*[\u0600-\u06FF][^)]*\)/g, ' ')
        .replace(/[\u0600-\u06FF]+/g, ' ')
        .replace(/season\s*\d+|part\s*\d+|cour\s*\d+/gi, ' ')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const queries = [];
    const cEn = clean(titleEn);
    const cRo = clean(titleRomaji);
    if (cEn) queries.push(cEn);
    if (cRo && cRo.toLowerCase() !== cEn.toLowerCase()) queries.push(cRo);
    const words = cEn.split(' ').filter((w) => w.length >= 3);
    if (words.length >= 2) queries.push(words.slice(0, 2).join(' '));
    if (words.length === 1 && words[0].length >= 4) queries.push(words[0]);

    for (const q of [...new Set(queries)]) {
      try {
        const sRes = await fetch(`https://animeheaven.me/search.php?s=${encodeURIComponent(q)}`, {
          headers: { 'User-Agent': ua },
          signal: AbortSignal.timeout(8000)
        });
        if (!sRes.ok) continue;
        const sHtml = await sRes.text();
        const matches = [...sHtml.matchAll(/href=['"](anime\.php\?[^'"]+)['"][^>]*>([^<]+)<\/a>/gi)];
        if (!matches.length) continue;

        // Strict title verification: only accept a match whose title matches titleEn or titleRomaji
        const verified = matches.find((m) => {
          const candTitle = decodeHtmlEntities(m[2]).trim();
          return isTitleMatch(cEn, candTitle) || (cRo && isTitleMatch(cRo, candTitle));
        });
        if (!verified) continue;

        const bestHref = verified[1];
        const showRes = await fetch(`https://animeheaven.me/${bestHref}`, {
          headers: { 'User-Agent': ua },
          signal: AbortSignal.timeout(8000)
        });
        if (!showRes.ok) continue;
        const showHtml = await showRes.text();
        const eps = [
          ...showHtml.matchAll(
            /id\s*=\s*"([a-f0-9]{32})"[\s\S]*?<div\s+class=\s*'\s*watch2\s+bc\s*'\s*>(\d+(?:\.\d+)?)<\/div>/gi
          )
        ];
        if (!eps.length) continue;

        const targetEp = eps.find((m) => Number(m[2]) === Number(episode));
        if (!targetEp) continue;

        const epKey = targetEp[1];
        const gateRes = await fetch('https://animeheaven.me/gate.php', {
          headers: {
            'User-Agent': ua,
            Cookie: `key=${epKey}`,
            Referer: `https://animeheaven.me/${bestHref}`
          },
          signal: AbortSignal.timeout(8000)
        });
        if (!gateRes.ok) continue;
        const gateHtml = await gateRes.text();
        const vidIdx = gateHtml.indexOf("<video id='vid'");
        const vidBlock =
          vidIdx >= 0 ? gateHtml.slice(vidIdx, gateHtml.indexOf('</video>', vidIdx)) : gateHtml;
        const sources = [
          ...new Set(
            [...vidBlock.matchAll(/src=['"](https:\/\/[a-z0-9.]*animeheaven\.me\/video\.mp4\?[^'"]+)['"]/gi)].map(
              (m) => m[1]
            )
          )
        ];
        if (sources.length > 0) {
          return sources;
        }
      } catch {}
    }
    return [];
  }

  /**
   * Resolve episode streaming servers + auto-translated Arabic subtitle tracks
   */
  async getEpisode(rawSlug, epNumber) {
    const episode = Math.max(1, Number(epNumber) || 1);
    const show = await this.getShow(rawSlug);
    if (!show) return null;

    const { malId, aniId, titleEn, titleRomaji, slug } = show;
    const cacheKey = `en_anime:ep:v6:${malId}:${episode}`;
    const cached = streamGet(cacheKey);
    if (cached) return cached;

    const entries = [];
    const downloads = [];
    const resolved = {};
    const resolvedDownloads = {};

    // 0) Fetch ZokoAnime / HiAnime MAL-ID 1080p/720p/360p HLS + official .VTT subtitle track first
    let zokoData = { sub: null, dub: null };
    try {
      zokoData = await this.fetchZokoMalStreams(malId, titleEn, titleRomaji, episode);
    } catch (_) {}

    const officialVttUrl = zokoData?.sub?.subtitleUrl || '';
    const subQueryExtra = officialVttUrl ? `&url=${encodeURIComponent(officialVttUrl)}` : '';
    const subVttUrl = `/api/stream/subtitles/${encodeURIComponent(slug)}/${episode}.vtt?title=${encodeURIComponent(titleEn)}${subQueryExtra}`;
    const subSrtUrl = `/api/stream/subtitles/${encodeURIComponent(slug)}/${episode}.srt?title=${encodeURIComponent(titleEn)}${subQueryExtra}`;

    // Add ZokoAnime / HiAnime 1080p / 720p / 360p HLS + Arabic AI Subtitle servers
    if (zokoData?.sub?.masterUrl) {
      const subMaster = zokoData.sub.masterUrl;
      const variants = zokoData.sub.variants || {};
      const enSubParam = officialVttUrl ? `&sub_en=${encodeURIComponent(officialVttUrl)}` : '';

      // Primary 1080p FHD / Auto HLS Server
      const fhdUrl = variants['1080p'] || subMaster;
      const idZokoFhd = `en-zoko-fhd-${malId}-${episode}`;
      const embedZokoFhd = `/api/stream/hls-player?url=${encodeURIComponent(fhdUrl)}&sub=${encodeURIComponent(subVttUrl)}${enSubParam}`;
      entries.push({
        id: idZokoFhd,
        token: idZokoFhd,
        server: '👑 Hearbor Ultra 1080p FHD (مترجم عربي AI)',
        quality: '1080p FHD',
        version: 'sub',
        lang: 'en->ar',
        embedUrl: embedZokoFhd,
        directUrl: null,
        isFastCdn: true,
        hasAutoArabicSub: true,
        source: 'english'
      });
      resolved[idZokoFhd] = { embedUrl: embedZokoFhd, directUrl: null };

      // Multi-Quality Auto HLS Server
      const idZokoAuto = `en-zoko-auto-${malId}-${episode}`;
      const embedZokoAuto = `/api/stream/hls-player?url=${encodeURIComponent(subMaster)}&sub=${encodeURIComponent(subVttUrl)}${enSubParam}`;
      entries.push({
        id: idZokoAuto,
        token: idZokoAuto,
        server: '⚡ Hearbor Master HLS (تلقائي 1080p/720p/360p — مترجم)',
        quality: '1080p / 720p',
        version: 'sub',
        lang: 'en->ar',
        embedUrl: embedZokoAuto,
        directUrl: null,
        isFastCdn: true,
        hasAutoArabicSub: true,
        source: 'english'
      });
      resolved[idZokoAuto] = { embedUrl: embedZokoAuto, directUrl: null };

      if (variants['720p']) {
        const idZokoHd = `en-zoko-hd-${malId}-${episode}`;
        const embedZokoHd = `/api/stream/hls-player?url=${encodeURIComponent(variants['720p'])}&sub=${encodeURIComponent(subVttUrl)}${enSubParam}`;
        entries.push({
          id: idZokoHd,
          token: idZokoHd,
          server: '🎬 Hearbor Stream 720p HD (مترجم عربي AI)',
          quality: '720p HD',
          version: 'sub',
          lang: 'en->ar',
          embedUrl: embedZokoHd,
          directUrl: null,
          isFastCdn: true,
          hasAutoArabicSub: true,
          source: 'english'
        });
        resolved[idZokoHd] = { embedUrl: embedZokoHd, directUrl: null };
      }

      if (variants['360p']) {
        const idZokoSd = `en-zoko-sd-${malId}-${episode}`;
        const embedZokoSd = `/api/stream/hls-player?url=${encodeURIComponent(variants['360p'])}&sub=${encodeURIComponent(subVttUrl)}${enSubParam}`;
        entries.push({
          id: idZokoSd,
          token: idZokoSd,
          server: '📱 Hearbor Eco 360p SD (سريع للباقات — مترجم)',
          quality: '360p SD',
          version: 'sub',
          lang: 'en->ar',
          embedUrl: embedZokoSd,
          directUrl: null,
          isFastCdn: true,
          hasAutoArabicSub: true,
          source: 'english'
        });
        resolved[idZokoSd] = { embedUrl: embedZokoSd, directUrl: null };
      }
    }

    if (zokoData?.dub?.masterUrl) {
      const dubUrl = zokoData.dub.variants?.['1080p'] || zokoData.dub.masterUrl;
      const idZokoDub = `en-zoko-dub-${malId}-${episode}`;
      const embedZokoDub = `/api/stream/hls-player?url=${encodeURIComponent(dubUrl)}&sub=${encodeURIComponent(subVttUrl)}`;
      entries.push({
        id: idZokoDub,
        token: idZokoDub,
        server: '🎙️ Hearbor Dub 1080p (مدبلج إنجليزي + ترجمة عربية)',
        quality: '1080p FHD',
        version: 'dub',
        lang: 'en->ar',
        embedUrl: embedZokoDub,
        directUrl: null,
        isFastCdn: true,
        hasAutoArabicSub: true,
        source: 'english'
      });
      resolved[idZokoDub] = { embedUrl: embedZokoDub, directUrl: null };
    }

    // 1) Cross-link Hearbor Server 2 (Arabic-subtitled direct MP4 1080p/720p/480p + OK.ru + Sendvid) with strict title check
    try {
      let bx2Ep = await anime3rbService.getEpisode(titleRomaji || titleEn, episode).catch(() => null);
      if (!bx2Ep && titleEn && titleEn !== titleRomaji) {
        bx2Ep = await anime3rbService.getEpisode(titleEn, episode).catch(() => null);
      }
      if (bx2Ep && Array.isArray(bx2Ep.entries)) {
        for (const e of bx2Ep.entries) {
          entries.push(e);
        }
        Object.assign(resolved, bx2Ep.resolved || {});
        for (const d of bx2Ep.downloads || []) {
          downloads.push(d);
        }
        Object.assign(resolvedDownloads, bx2Ep.resolvedDownloads || {});
      }
    } catch (_) {}

    // 2) Fetch Direct MP4 streams from Hearbor Server 3 AnimeHeaven engine (plays in native <video> + AI Arabic Subtitles)
    try {
      const ahSources = await this.fetchAnimeHeavenStreams(titleEn, titleRomaji, episode);
      if (ahSources.length > 0) {
        const primaryMp4 = ahSources[0];
        const backupMp4 = ahSources[1] || ahSources[0];

        const idNativeHd = `en-ah-native-hd-${malId}-${episode}`;
        entries.push({
          id: idNativeHd,
          token: idNativeHd,
          server: '⚡ Hearbor Direct MP4 HD (مترجم عربي AI)',
          quality: '720p HD',
          version: 'sub',
          lang: 'en->ar',
          embedUrl: `/api/stream/mp4-player?url=${encodeURIComponent(primaryMp4)}&sub=${encodeURIComponent(subVttUrl)}`,
          directUrl: primaryMp4,
          isFastCdn: true,
          hasAutoArabicSub: true,
          source: 'english'
        });
        resolved[idNativeHd] = {
          embedUrl: `/api/stream/mp4-player?url=${encodeURIComponent(primaryMp4)}&sub=${encodeURIComponent(subVttUrl)}`,
          directUrl: primaryMp4
        };

        const idEmbedClean = `en-ah-embed-hd-${malId}-${episode}`;
        entries.push({
          id: idEmbedClean,
          token: idEmbedClean,
          server: '🌐 Hearbor Cinema MP4 (مشغل مدمج بالترجمة)',
          quality: '720p HD',
          version: 'sub',
          lang: 'en->ar',
          embedUrl: `/api/stream/mp4-player?url=${encodeURIComponent(backupMp4)}&sub=${encodeURIComponent(subVttUrl)}`,
          directUrl: null,
          isFastCdn: true,
          hasAutoArabicSub: true,
          source: 'english'
        });
        resolved[idEmbedClean] = {
          embedUrl: `/api/stream/mp4-player?url=${encodeURIComponent(backupMp4)}&sub=${encodeURIComponent(subVttUrl)}`,
          directUrl: null
        };

        ahSources.slice(0, 2).forEach((mp4Url, idx) => {
          const dlId = `dl-en-mp4-${malId}-${episode}-${idx + 1}`;
          const proxiedDl = `/api/stream/download?url=${encodeURIComponent(mp4Url)}&filename=${encodeURIComponent(`${titleEn}-EP${episode}.mp4`)}`;
          downloads.push({
            id: dlId,
            token: dlId,
            server: `📥 سيرفر تحميل Hearbor المباشر (${idx === 0 ? '1080p FHD' : '720p HD'})`,
            quality: idx === 0 ? '1080p FHD' : '720p HD',
            version: 'sub',
            lang: 'en',
            downloadUrl: proxiedDl
          });
          resolvedDownloads[dlId] = {
            url: proxiedDl,
            directUrl: proxiedDl
          };
        });
      }
    } catch (_) {}

    // 2.5) Fetch AllAnime POST GraphQL direct MP4 streams
    try {
      const allStreams = await this.fetchAllAnimePostStreams(titleEn, titleRomaji, episode);
      allStreams.forEach((st, idx) => {
        const idAll = `en-all-mp4-${malId}-${episode}-${idx + 1}`;
        const embedAll = `/api/stream/mp4-player?url=${encodeURIComponent(st.url)}&sub=${encodeURIComponent(subVttUrl)}`;
        entries.push({
          id: idAll,
          token: idAll,
          server: `🚀 Hearbor Archive ${st.quality} (${st.mode === 'dub' ? 'مدبلج' : 'مترجم عربي AI'})`,
          quality: st.quality,
          version: st.mode,
          lang: 'en->ar',
          embedUrl: embedAll,
          directUrl: null,
          isFastCdn: true,
          hasAutoArabicSub: true,
          source: 'english'
        });
        resolved[idAll] = { embedUrl: embedAll, directUrl: null };
      });
    } catch (_) {}

    // 3) Cross-link Hearbor Server 1 (witanime) with strict title verification
    try {
      let witaCandidates = await searchShows(titleEn).catch(() => []);
      if (!witaCandidates.length && titleRomaji && titleRomaji !== titleEn) {
        witaCandidates = await searchShows(titleRomaji).catch(() => []);
      }
      const verifiedWita = witaCandidates.find(
        (c) =>
          isTitleMatch(titleEn, c.titleEn, c.slug) ||
          (titleRomaji && isTitleMatch(titleRomaji, c.titleEn, c.slug))
      );
      const witaSlug = verifiedWita?.slug;
      if (witaSlug) {
        const witaEp = await fetchEpisode(witaSlug, episode).catch(() => null);
        if (witaEp && Array.isArray(witaEp.entries) && witaEp.entries.length > 0) {
          const firstEntry = witaEp.entries[0];
          try {
            const firstResolved = await resolveEntry(witaSlug, episode, firstEntry.id);
            if (firstResolved) {
              resolved[firstEntry.id] = firstResolved;
            }
          } catch (_) {}

          for (const we of witaEp.entries) {
            entries.push({
              ...we,
              witaSlug
            });
            if (witaEp.resolved?.[we.id]) {
              resolved[we.id] = witaEp.resolved[we.id];
            }
          }

          for (const wd of witaEp.downloads || []) {
            downloads.push({
              ...wd,
              witaSlug
            });
            if (witaEp.resolvedDownloads?.[wd.id]) {
              resolvedDownloads[wd.id] = witaEp.resolvedDownloads[wd.id];
            }
          }
        }
      }
    } catch (_) {}

    // 4) Fallback for rare ONAs/shorts (e.g. Horangi Deureowayo / Tiger Coming In) via verified YouTube Episode Stream
    if (!entries.length) {
      try {
        const ytCandidates = [titleEn, ...(show.synonyms || []), titleRomaji, show.titleNative].filter(Boolean);
        for (const baseTitle of [...new Set(ytCandidates)]) {
          const ytQuery = `${baseTitle} Episode ${episode} English Sub`;
          const ytRes = await fetch(
            `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}`,
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
              },
              signal: AbortSignal.timeout(7000)
            }
          );
          if (!ytRes.ok) continue;
          const ytHtml = await ytRes.text();
          const m = ytHtml.match(/var ytInitialData = (\{.*?\});<\/script>/);
          if (!m) continue;
          const ytData = JSON.parse(m[1]);
          const contents =
            ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
              ?.contents?.[0]?.itemSectionRenderer?.contents || [];
          const videos = [];
          for (const item of contents) {
            const v = item.videoRenderer;
            if (!v?.videoId) continue;
            const vTitle = v.title?.runs?.[0]?.text || '';
            const matchesAnyTitle = ytCandidates.some(
              (cand) =>
                cand &&
                (vTitle.toLowerCase().includes(String(cand).toLowerCase()) ||
                  isTitleMatch(String(cand), vTitle))
            );
            if (matchesAnyTitle) {
              videos.push({ id: v.videoId, title: vTitle });
            }
          }
          if (videos.length > 0) {
            videos.slice(0, 2).forEach((vid, idx) => {
              const entryId = `en-yt-${malId}-${episode}-${idx + 1}`;
              const embedUrl = `https://www.youtube-nocookie.com/embed/${vid.id}?autoplay=1&rel=0&cc_load_policy=1&cc_lang_pref=ar`;
              entries.push({
                id: entryId,
                token: entryId,
                server: idx === 0 ? '🎬 Hearbor Stream HD (مترجم)' : '🌐 Hearbor Cinema HD (احتياطي)',
                quality: '1080p FHD',
                version: 'sub',
                lang: 'ar',
                embedUrl,
                directUrl: null,
                isFastCdn: true,
                source: 'english'
              });
              resolved[entryId] = { embedUrl, directUrl: null };
            });
            break;
          }
        }
      } catch (_) {}
    }

    if (!entries.length) return null;

    downloads.push(
      {
        id: `dl-en-sub-srt-${malId}-${episode}`,
        token: `dl-en-srt-${malId}-${episode}`,
        server: '📥 تحميل ملف الترجمة العربية (.SRT) — Hearbor AI',
        quality: 'SRT',
        version: 'sub',
        lang: 'ar',
        downloadUrl: subSrtUrl
      },
      {
        id: `dl-en-sub-vtt-${malId}-${episode}`,
        token: `dl-en-vtt-${malId}-${episode}`,
        server: '📥 تحميل ملف الترجمة العربية (.VTT) — Hearbor AI',
        quality: 'VTT',
        version: 'sub',
        lang: 'ar',
        downloadUrl: subVttUrl
      }
    );
    resolvedDownloads[`dl-en-sub-srt-${malId}-${episode}`] = { url: subSrtUrl, directUrl: subSrtUrl };
    resolvedDownloads[`dl-en-sub-vtt-${malId}-${episode}`] = { url: subVttUrl, directUrl: subVttUrl };

    const payload = {
      entries,
      downloads,
      resolved,
      resolvedDownloads,
      subtitles: [
        {
          lang: 'ar',
          label: 'العربية (ترجمة فورية Hearbor AI)',
          vttUrl: subVttUrl,
          srtUrl: subSrtUrl,
          default: true
        }
      ],
      hasAutoArabicSub: true,
      titleEn,
      malId,
      aniId,
      episode,
      source: 'english',
      sourceName: 'سيرفر Hearbor 3'
    };

    streamSet(cacheKey, payload, 2 * 60 * 60 * 1000);
    return payload;
  }

  async getArabicSubtitles(rawSlug, epNumber) {
    const show = await this.getShow(rawSlug);
    const titleEn = show?.titleEn || parseEnglishSlug(rawSlug).query;
    return getTranslatedEpisodeSubtitles(titleEn, epNumber);
  }
}

export const englishAnimeService = new EnglishAnimeService();
