import axios from 'axios';

/**
 * Hearbor Multi-Server Manga & Manhwa Engine (v2.0)
 * ---------------------------------------------------------------------------
 * Exclusively branded under Hearbor with 3 high-availability servers:
 *  - Server 1 (bx1): Hearbor 1 (OlympusStaff / Team X — https://olympustaff.com)
 *    -> #1 Arabic Manhwa, Webtoon & Chinese Manhua engine (200 OK direct CDN)
 *  - Server 2 (bx2): Hearbor 2 (3asq / مانجا العاشق — https://3asq.online)
 *    -> #1 Arabic Japanese Manga engine (One Piece, Berserk, HxH, Kingdom, JJK...)
 *  - Server 3 (bx3): Hearbor 3 (WeebCentral + MangaDex API v5 — https://weebcentral.com)
 *    -> #1 Complete Global Manga & Manhwa Official Rip engine (100% catalog)
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const OLYMPUS_BASE = 'https://olympustaff.com';
const ASQ_BASE = 'https://3asq.online';
const WEEBCENTRAL_BASE = 'https://weebcentral.com';
const MANGADEX_API = 'https://api.mangadex.org';
const MANGAMELLO_API = 'https://plus.mangamello.com/api/v1';
const AZORAFLY_API = 'https://api.azorafly.com/api';
const MANGASWAT_API = 'https://appswat.com/v2/api/v2';
const DILAR_API = 'https://v2.dilar.tube/api';

const MANGAMELLO_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  app_version: '1.1.7',
  installer: 'com.android.vending',
  lang: 'ar',
  device: 'android',
  time_zone: 'Africa/Cairo',
  'User-Agent': 'Dart/3.8 (dart:io)'
};

const MANGASWAT_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://meshmanga.com',
  Referer: 'https://meshmanga.com/',
  'User-Agent': 'ktor-client'
};

function rewriteLegacyMangaImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const cleaned = rawUrl.trim().replace(/\\\//g, '/').replace(/\\u0026/g, '&');
  try {
    const u = new URL(cleaned.startsWith('//') ? `https:${cleaned}` : cleaned);
    const host = u.hostname.toLowerCase();
    if (host === 'tempstorm.lekmanga.site') {
      const m = u.pathname.match(/^\/manga\/arb1(\d+)\//i);
      if (m?.[1]) {
        return u.href.replace(u.hostname, `s${m[1]}storm.lekmanga.site`);
      }
    }
    const legMatch = host.match(/^s(\d+)lekmangas\.lekmanga\.site$/i);
    if (legMatch?.[1]) {
      return u.href.replace(u.hostname, `s${legMatch[1]}storm.lekmanga.site`);
    }
    return u.href;
  } catch {
    return cleaned;
  }
}

/**
 * Curated cross-server mapping for flagship Manga & Manhwa titles so every card
 * in the library resolves immediately across Hearbor 1, Hearbor 2, and Hearbor 3.
 */
export const FLAGSHIP_MANGA_MAP = {
  'solo-leveling': {
    osSlug: 'SL',
    asqSlug: 'solo-leveling',
    wcSeriesId: '01J76XYCPSY3C4BNPBRY8JMCBE',
    wcSlug: 'Solo-Leveling',
    title_ar: 'سولو ليفلينج (ارتقاء المستوى الفردي)',
    title_en: 'Solo Leveling',
    type: 'MANHWA',
    poster: 'https://olympustaff.com/images/manga/thumbnail_b05147568d52f22c663c084172fc0dac.png',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYCPSY3C4BNPBRY8JMCBE.jpg'
  },
  'omniscient-readers-viewpoint': {
    osSlug: 'OR',
    asqSlug: null,
    wcSeriesId: '01J76XYDMWWJX3T4BFWR84FQQK',
    wcSlug: 'Omniscient-Readers-Viewpoint',
    title_ar: 'وجهة نظر القارئ العليم (Omniscient Reader)',
    title_en: "Omniscient Reader's Viewpoint",
    type: 'MANHWA',
    poster: 'https://olympustaff.com/images/manga/thumbnail_41d0a8bf257ed44612cabef8a04da121.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYDMWWJX3T4BFWR84FQQK.jpg'
  },
  'solo-swordmaster': {
    osSlug: 'SYS',
    asqSlug: null,
    wcSeriesId: '01J76XYG8FNWRR3PHEFKN2NB87',
    wcSlug: 'The-Swordmasters-Son',
    title_ar: 'الابن الأصغر لسيد السيف (Swordmaster’s Youngest Son)',
    title_en: "Swordmaster's Youngest Son",
    type: 'MANHWA',
    poster: 'https://olympustaff.com/images/manga/thumbnail_02ef7b4388c9ce84dae27df148846dad.png',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYG8FNWRR3PHEFKN2NB87.jpg'
  },
  'nano-machine': {
    osSlug: null,
    asqSlug: null,
    wcSeriesId: '01J76XYDT7H7ANER8KJG5R9SJV',
    wcSlug: 'Nano-Machine',
    title_ar: 'نانو ماشين (Nano Machine)',
    title_en: 'Nano Machine',
    type: 'MANHWA',
    poster: 'https://temp.compsci88.com/cover/fallback/01J76XYDT7H7ANER8KJG5R9SJV.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYDT7H7ANER8KJG5R9SJV.jpg'
  },
  'magic-emperor': {
    osSlug: 'demonic-emperor',
    asqSlug: null,
    wcSeriesId: '01J76XYDT3Z0ZJ7NNG4Q74QFFG',
    wcSlug: 'Magic-Emperor',
    title_ar: 'الإمبراطور الشيطاني (Demonic Emperor)',
    title_en: 'Magic Emperor',
    type: 'MANHWA',
    poster: 'https://olympustaff.com/images/manga/thumbnail_11809d13c563e62b8f74fea18dbe2417.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYDT3Z0ZJ7NNG4Q74QFFG.jpg'
  },
  'return-of-the-mount-hua-sect': {
    osSlug: 'mount-hua-sects-genius-phantom-swordsman',
    asqSlug: null,
    wcSeriesId: '01J76XYEVCSS5ANBCJZ4ZF9P65',
    wcSlug: 'Return-of-the-Blossoming-Blade',
    title_ar: 'عودة طائفة جبل هوا (Return of the Mount Hua Sect)',
    title_en: 'Return of the Mount Hua Sect',
    type: 'MANHWA',
    poster: 'https://temp.compsci88.com/cover/fallback/01J76XYEVCSS5ANBCJZ4ZF9P65.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYEVCSS5ANBCJZ4ZF9P65.jpg'
  },
  'the-beginning-after-the-end': {
    osSlug: 'BATE',
    asqSlug: null,
    wcSeriesId: '01J76XYE23859ZWDP7BJ520AKY',
    wcSlug: 'The-Beginning-After-The-End',
    title_ar: 'البداية بعد النهاية (The Beginning After The End)',
    title_en: 'The Beginning After The End',
    type: 'MANHWA',
    poster: 'https://olympustaff.com/images/manga/thumbnail_db3bc466501c2c0fca948454cc6c63b0.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYE23859ZWDP7BJ520AKY.jpg'
  },
  lookism: {
    osSlug: 'lookism',
    asqSlug: null,
    wcSeriesId: '01J76XYBD282Y3XKX0KRGD64Q5',
    wcSlug: 'Lookism',
    title_ar: 'المظهر (Lookism)',
    title_en: 'Lookism',
    type: 'MANHWA',
    poster: 'https://olympustaff.com/images/manga/thumbnail_bb9989fc65ac9c01f855763102c4a102.png',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYBD282Y3XKX0KRGD64Q5.jpg'
  },
  eleceed: {
    osSlug: 'ECD',
    asqSlug: null,
    wcSeriesId: '01J76XYD3Q2Q7HYYMB3FSDPSKC',
    wcSlug: 'Eleceed',
    title_ar: 'إليكيد (Eleceed)',
    title_en: 'Eleceed',
    type: 'MANHWA',
    poster: 'https://olympustaff.com/images/manga/thumbnail_17666987771409026756.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYD3Q2Q7HYYMB3FSDPSKC.jpg'
  },
  'pick-me-up': {
    osSlug: 'PMU',
    asqSlug: null,
    wcSeriesId: '01J76XYGY7FDV857J4HJAZ131K',
    wcSlug: 'Pick-Me-Up-Infinite-Gacha',
    title_ar: 'بيك مي أب: غاشا لا نهائية (Pick Me Up)',
    title_en: 'Pick Me Up : Infinite Gacha',
    type: 'MANHWA',
    poster: 'https://olympustaff.com/images/manga/thumbnail_15326405871502340369.jpeg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYGY7FDV857J4HJAZ131K.jpg'
  },
  'one-piece': {
    osSlug: null,
    asqSlug: 'one-piece',
    wcSeriesId: '01J76XY7E9FNDZ1DBBM6PBJPFK',
    wcSlug: 'One-Piece',
    title_ar: 'ون بيس (One Piece)',
    title_en: 'One Piece',
    type: 'MANGA',
    poster: 'https://temp.compsci88.com/cover/fallback/01J76XY7E9FNDZ1DBBM6PBJPFK.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XY7E9FNDZ1DBBM6PBJPFK.jpg'
  },
  'jujutsu-kaisen': {
    osSlug: null,
    asqSlug: 'jujutsu-kaisen',
    wcSeriesId: '01J76XYCERXE60T7FKXVCCAQ0H',
    wcSlug: 'Jujutsu-Kaisen',
    title_ar: 'جوجوتسو كايسن (Jujutsu Kaisen)',
    title_en: 'Jujutsu Kaisen',
    type: 'MANGA',
    poster: 'https://temp.compsci88.com/cover/fallback/01J76XYCERXE60T7FKXVCCAQ0H.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYCERXE60T7FKXVCCAQ0H.jpg'
  },
  'chainsaw-man': {
    osSlug: null,
    asqSlug: null,
    wcSeriesId: '01J76XYCRVY3QGYAMRR3STW941',
    wcSlug: 'Chainsaw-Man',
    title_ar: 'رجل المنشار (Chainsaw Man)',
    title_en: 'Chainsaw Man',
    type: 'MANGA',
    poster: 'https://temp.compsci88.com/cover/fallback/01J76XYCRVY3QGYAMRR3STW941.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYCRVY3QGYAMRR3STW941.jpg'
  },
  'blue-lock': {
    osSlug: null,
    asqSlug: null,
    wcSeriesId: '01J76XYD7E91K8QP6CY0Y53900',
    wcSlug: 'Blue-Lock',
    title_ar: 'بلو لوك (Blue Lock)',
    title_en: 'Blue Lock',
    type: 'MANGA',
    poster: 'https://temp.compsci88.com/cover/fallback/01J76XYD7E91K8QP6CY0Y53900.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYD7E91K8QP6CY0Y53900.jpg'
  },
  kingdom: {
    osSlug: null,
    asqSlug: 'kingdom',
    wcSeriesId: '01J76XY7VSG3R5ANYPDWTXDVP6',
    wcSlug: 'Kingdom',
    title_ar: 'المملكة (Kingdom)',
    title_en: 'Kingdom',
    type: 'MANGA',
    poster: 'https://temp.compsci88.com/cover/fallback/01J76XY7VSG3R5ANYPDWTXDVP6.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XY7VSG3R5ANYPDWTXDVP6.jpg'
  },
  berserk: {
    osSlug: null,
    asqSlug: 'berserk',
    wcSeriesId: '01J76XY7EF75DJNQCV04HTPDZK',
    wcSlug: 'Berserk',
    title_ar: 'بيرسيرك (Berserk)',
    title_en: 'Berserk',
    type: 'MANGA',
    poster: 'https://temp.compsci88.com/cover/fallback/01J76XY7EF75DJNQCV04HTPDZK.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XY7EF75DJNQCV04HTPDZK.jpg'
  },
  'hunter-x-hunter': {
    osSlug: null,
    asqSlug: 'hunter-x-hunter',
    wcSeriesId: '01J76XY7EXQV9RE9KQ3JYE0WZ9',
    wcSlug: 'Hunter-X-Hunter',
    title_ar: 'القناص (Hunter X Hunter)',
    title_en: 'Hunter X Hunter',
    type: 'MANGA',
    poster: 'https://temp.compsci88.com/cover/fallback/01J76XY7EXQV9RE9KQ3JYE0WZ9.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XY7EXQV9RE9KQ3JYE0WZ9.jpg'
  },
  bleach: {
    osSlug: null,
    asqSlug: null,
    wcSeriesId: '01J76XY7E4JCPK14V53BVQWD9Y',
    wcSlug: 'Bleach',
    title_ar: 'بليتش (Bleach)',
    title_en: 'Bleach',
    type: 'MANGA',
    poster: 'https://temp.compsci88.com/cover/fallback/01J76XY7E4JCPK14V53BVQWD9Y.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XY7E4JCPK14V53BVQWD9Y.jpg'
  },
  'black-clover': {
    osSlug: null,
    asqSlug: null,
    wcSeriesId: '01J76XYB8HNWARAQ67A4GAWG5Y',
    wcSlug: 'Black-Clover',
    title_ar: 'بلاك كلوفر (Black Clover)',
    title_en: 'Black Clover',
    type: 'MANGA',
    poster: 'https://temp.compsci88.com/cover/fallback/01J76XYB8HNWARAQ67A4GAWG5Y.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYB8HNWARAQ67A4GAWG5Y.jpg'
  },
  boruto: {
    osSlug: 'BTBV',
    asqSlug: null,
    wcSeriesId: '01J76XYGF6FZPSQW5WFC1Y21EX',
    wcSlug: 'Boruto-Two-Blue-Vortex',
    title_ar: 'بوروتو (Boruto: Two Blue Vortex)',
    title_en: 'Boruto: Two Blue Vortex',
    type: 'MANGA',
    poster: 'https://olympustaff.com/images/manga/thumbnail_952306554814455554.jpg',
    banner: 'https://temp.compsci88.com/cover/fallback/01J76XYGF6FZPSQW5WFC1Y21EX.jpg'
  }
};

const ARABIC_TO_ENGLISH_QUERY_MAP = [
  [/سولو|ارتقاء المستوى/i, 'Solo Leveling'],
  [/القارئ العليم|اومنيسينت/i, 'Omniscient Reader'],
  [/سيد السيف|سياف/i, 'Swordmaster'],
  [/نانو/i, 'Nano Machine'],
  [/الامبراطور الشيطاني|الإمبراطور الشيطاني|ماجيك امبيرور/i, 'Magic Emperor'],
  [/جبل هوا|طائفة جبل هوا/i, 'Return of the Blossoming Blade'],
  [/البداية بعد النهاية/i, 'The Beginning After The End'],
  [/لوكيزم|المظهر/i, 'Lookism'],
  [/اليكيد|إليكيد/i, 'Eleceed'],
  [/بيك مي اب|غاشا/i, 'Pick Me Up'],
  [/ون بيس|لوفي/i, 'One Piece'],
  [/جوجوتسو|سوكونا|غوجو/i, 'Jujutsu Kaisen'],
  [/رجل المنشار|تشينسو/i, 'Chainsaw Man'],
  [/بلو لوك/i, 'Blue Lock'],
  [/المملكة|كينغدوم|كينجدوم/i, 'Kingdom'],
  [/بيرسيرك|غاتس/i, 'Berserk'],
  [/القناص|هانتر|هنتر/i, 'Hunter x Hunter'],
  [/بليتش|ايتشيغو/i, 'Bleach'],
  [/بلاك كلوفر|استا/i, 'Black Clover'],
  [/بوروتو|ناروتو/i, 'Boruto'],
  [/هجوم العمالقة|اتاك/i, 'Attack on Titan'],
  [/قاتل الشياطين|كيميتسو/i, 'Demon Slayer'],
  [/طوكيو غول/i, 'Tokyo Ghoul'],
  [/ديث نوت|مذكرة الموت/i, 'Death Note'],
  [/فاجابوند|فاغابوند/i, 'Vagabond'],
  [/فينلاند ساغا/i, 'Vinland Saga'],
  [/مونستر/i, 'Monster'],
  [/وان بانش مان|سايتاما/i, 'One Punch Man'],
  [/دراغون بول/i, 'Dragon Ball'],
  [/فيري تيل/i, 'Fairy Tail'],
  [/برج الاله|تاور اوف غود/i, 'Tower of God'],
  [/داندادان/i, 'Dandadan'],
  [/ساكاموتو/i, 'Sakamoto Days'],
  [/كايجو/i, 'Kaiju No. 8']
];

function decodeHtmlEntities(str = '') {
  return String(str)
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function normalizeQueryToEnglish(query = '') {
  const q = String(query).trim();
  for (const [regex, en] of ARABIC_TO_ENGLISH_QUERY_MAP) {
    if (regex.test(q)) return en;
  }
  return q;
}

// Simple in-memory cache with 15-minute TTL
const memCache = new Map();
function getCache(key) {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.exp) {
    memCache.delete(key);
    return null;
  }
  return entry.val;
}
function setCache(key, val, ttlMs = 15 * 60 * 1000) {
  memCache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}

class MangalikService {
  /* =========================================================================
   * ENGINE 1: Hearbor 1 — OlympusStaff / Team X (https://olympustaff.com)
   * ========================================================================= */

  async getOlympusCatalog(page = 1) {
    const cacheKey = `os:catalog:${page}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data: html } = await axios.get(`${OLYMPUS_BASE}/series?page=${page}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        timeout: 12000
      });

      const items = [];
      const seen = new Set();
      const blocks = String(html).split('<div class="bs">').slice(1);
      for (const block of blocks) {
        const hrefMatch = block.match(/href="https:\/\/olympustaff\.com\/series\/([^"\/?#]+)"/i);
        const imgMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/i);
        const typeMatch = block.match(/<span\s+class="type">([^<]+)<\/span>/i);
        const statusMatch = block.match(/<span\s+class="status">([^<]+)<\/span>/i);
        if (!hrefMatch) continue;

        const slug = hrefMatch[1].trim();
        if (seen.has(slug)) continue;
        seen.add(slug);

        const title = decodeHtmlEntities(imgMatch?.[2] || slug.replace(/-/g, ' '));
        const poster = (imgMatch?.[1] || '').trim().replace(/ /g, '%20');
        const rawType = (typeMatch?.[1] || '').trim();
        const isManga = /ياباني|مانجا/i.test(rawType);

        items.push({
          id: `os:${slug}`,
          mangalikSlug: `os:${slug}`,
          title,
          title_ar: title,
          title_en: title,
          poster,
          coverImage: poster,
          banner: poster,
          type: isManga ? 'MANGA' : 'MANHWA',
          status: statusMatch?.[1]?.trim() || 'مستمر',
          rating: null,
          chapters_count: 85,
          author: 'سيرفر Hearbor 1 (مترجم للعربية)',
          description_ar: `اقرأ ${title} مترجماً باللغة العربية بجودة فائقة مباشرة عبر سيرفر Hearbor 1.`,
          description_en: `Read ${title} in high resolution directly on Hearbor 1.`,
          genres: [],
          release_year: null,
          source: 'Hearbor 1',
          server: 'bx1'
        });
      }

      if (items.length > 0) setCache(cacheKey, items);
      return items;
    } catch (error) {
      console.error('Olympus catalog error:', error.message);
      return [];
    }
  }

  async searchOlympus(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const searchTerms = [...new Set([q, normalizeQueryToEnglish(q)])];
    const results = [];
    const seen = new Set();

    for (const term of searchTerms) {
      if (term.length < 2) continue;
      try {
        const { data: html } = await axios.get(
          `${OLYMPUS_BASE}/ajax/search?keyword=${encodeURIComponent(term)}`,
          {
            headers: {
              'User-Agent': USER_AGENT,
              'X-Requested-With': 'XMLHttpRequest',
              Referer: `${OLYMPUS_BASE}/`
            },
            timeout: 10000
          }
        );

        const regex =
          /href="https:\/\/olympustaff\.com\/series\/([^"\/?#]+)"[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"/gi;
        let match;
        while ((match = regex.exec(String(html))) !== null) {
          const slug = match[1].trim();
          if (seen.has(slug)) continue;
          seen.add(slug);

          const poster = match[2].trim().replace(/ /g, '%20');
          const title = decodeHtmlEntities(match[3] || slug);
          results.push({
            id: `os:${slug}`,
            mangalikSlug: `os:${slug}`,
            title,
            title_ar: title,
            title_en: title,
            poster,
            coverImage: poster,
            type: 'MANHWA',
            status: 'ONGOING',
            rating: null,
            chapters_count: 100,
            author: 'سيرفر Hearbor 1 (مترجم)',
            description_ar: `${title} — متاح للقراءة المباشرة بالترجمة العربية عبر سيرفر Hearbor 1.`,
            description_en: `${title} — Available on Hearbor 1 Server.`,
            source: 'Hearbor 1',
            server: 'bx1'
          });
        }
      } catch (err) {
        // ignore individual search term failure
      }
    }

    return results;
  }

  async getOlympusChapters(osSlug) {
    const cleanSlug = String(osSlug || '').replace(/^os:/i, '').trim();
    if (!cleanSlug) return [];

    const cacheKey = `os:chapters:${cleanSlug}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data: html } = await axios.get(
        `${OLYMPUS_BASE}/series/${encodeURIComponent(cleanSlug)}`,
        {
          headers: { 'User-Agent': USER_AGENT, Referer: `${OLYMPUS_BASE}/` },
          timeout: 12000
        }
      );

      const chapterMap = new Map();
      const escapedSlug = cleanSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linkRegex = new RegExp(
        `href="https:\\/\\/olympustaff\\.com\\/series\\/${escapedSlug}\\/([^"\\/?#]+)"`,
        'gi'
      );

      let match;
      let maxIntChapter = 0;
      while ((match = linkRegex.exec(String(html))) !== null) {
        const chStr = match[1].trim();
        const num = parseFloat(chStr);
        if (!Number.isNaN(num)) {
          if (Math.floor(num) > maxIntChapter && num < 5000) {
            maxIntChapter = Math.floor(num);
          }
          chapterMap.set(chStr, {
            chapterId: `os:${cleanSlug}:${chStr}`,
            chapterNumber: chStr,
            slug: chStr,
            title: `الفصل ${chStr}`,
            releaseDate: '2026',
            scanlationGroup: 'سيرفر Hearbor 1 (مترجم)',
            server: 'bx1',
            url: `${OLYMPUS_BASE}/series/${cleanSlug}/${chStr}`
          });
        }
      }

      // Also check total chapter count indicator `قائمة الفصول (N)`
      const countMatch = String(html).match(/قائمة الفصول\s*\((\d+)\)/);
      if (countMatch && maxIntChapter === 0) {
        maxIntChapter = Math.min(parseInt(countMatch[1], 10) || 0, 1500);
      }

      // Fill all integer chapters 1..maxIntChapter because OlympusStaff uses sequential `/series/{slug}/{n}` URLs
      if (maxIntChapter > 0) {
        for (let n = maxIntChapter; n >= 1; n--) {
          const chStr = String(n);
          if (!chapterMap.has(chStr)) {
            chapterMap.set(chStr, {
              chapterId: `os:${cleanSlug}:${chStr}`,
              chapterNumber: chStr,
              slug: chStr,
              title: `الفصل ${chStr}`,
              releaseDate: '2026',
              scanlationGroup: 'سيرفر Hearbor 1 (مترجم)',
              server: 'bx1',
              url: `${OLYMPUS_BASE}/series/${cleanSlug}/${chStr}`
            });
          }
        }
      }

      const chapters = Array.from(chapterMap.values()).sort(
        (a, b) => (parseFloat(b.chapterNumber) || 0) - (parseFloat(a.chapterNumber) || 0)
      );

      if (chapters.length > 0) setCache(cacheKey, chapters);
      return chapters;
    } catch (error) {
      console.error(`Olympus chapters error (${cleanSlug}):`, error.message);
      return [];
    }
  }

  async getOlympusChapterPages(osSlug, chapterNum) {
    const cleanSlug = String(osSlug || '').replace(/^os:/i, '').trim();
    const cleanCh = String(chapterNum || '').trim();
    if (!cleanSlug || !cleanCh) return [];

    const cacheKey = `os:pages:${cleanSlug}:${cleanCh}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const candidateChs = [cleanCh];
    if (/^\d$/.test(cleanCh)) candidateChs.push(`0${cleanCh}`);

    for (const chTry of candidateChs) {
      try {
        const chapterUrl = `${OLYMPUS_BASE}/series/${encodeURIComponent(cleanSlug)}/${encodeURIComponent(chTry)}`;
        const { data: html } = await axios.get(chapterUrl, {
          headers: { 'User-Agent': USER_AGENT, Referer: `${OLYMPUS_BASE}/series/${cleanSlug}` },
          timeout: 14000
        });

        const pages = [];
        const seen = new Set();
        const imgRegex = /<img[^>]+(?:src|data-src)="(https:\/\/olympustaff\.com\/uploads\/[^"]+)"/gi;
        let match;
        while ((match = imgRegex.exec(String(html))) !== null) {
          const rawUrl = match[1].trim();
          // Skip TeamX static watermark banner if present
          if (/TeamX\.png|logo|avatar|banner/i.test(rawUrl)) continue;
          const normalizedUrl = rawUrl.replace(/ /g, '%20');
          if (seen.has(normalizedUrl)) continue;
          seen.add(normalizedUrl);

          pages.push({
            pageNumber: pages.length + 1,
            url: normalizedUrl,
            directUrl: normalizedUrl,
            server: 'Hearbor 1'
          });
        }

        if (pages.length > 0) {
          setCache(cacheKey, pages);
          return pages;
        }
      } catch (err) {
        // try next candidate
      }
    }

    return [];
  }

  /* =========================================================================
   * ENGINE 2: Hearbor 2 — 3asq / مانجا العاشق (https://3asq.online)
   * ========================================================================= */

  async get3asqCatalog() {
    const cacheKey = 'asq:catalog';
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data: html } = await axios.get(`${ASQ_BASE}/manga/?m_orderby=trending`, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 12000
      });

      const items = [];
      const seen = new Set();
      const blocks = String(html).split('page-item-detail').slice(1);
      for (const block of blocks) {
        const hrefMatch = block.match(/href="https:\/\/3asq\.online\/manga\/([^"\/?#]+)\/"[^>]*title="([^"]*)"/i) ||
                          block.match(/href="https:\/\/3asq\.online\/manga\/([^"\/?#]+)\/"/i);
        if (!hrefMatch) continue;
        const slug = hrefMatch[1].trim();
        if (slug === 'feed' || seen.has(slug)) continue;
        seen.add(slug);

        const imgMatch = block.match(/src="(https:\/\/3asq\.online\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/i);
        const h3Match = block.match(/<h3[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i);
        const title = decodeHtmlEntities(h3Match?.[1] || hrefMatch[2] || slug.replace(/-/g, ' '));
        const poster = (imgMatch?.[1] || '').trim();

        items.push({
          id: `asq:${slug}`,
          mangalikSlug: `asq:${slug}`,
          title,
          title_ar: title,
          title_en: title,
          poster,
          coverImage: poster,
          banner: poster,
          type: 'MANGA',
          status: 'ONGOING',
          rating: null,
          chapters_count: 120,
          author: 'سيرفر Hearbor 2 (مانجا عربية)',
          description_ar: `اقرأ مانجا ${title} بالترجمة العربية الكاملة عبر سيرفر Hearbor 2.`,
          description_en: `Read ${title} Manga in Arabic on Hearbor 2.`,
          genres: [],
          release_year: null,
          source: 'Hearbor 2',
          server: 'bx2'
        });
      }

      if (items.length > 0) setCache(cacheKey, items);
      return items;
    } catch (error) {
      console.error('3asq catalog error:', error.message);
      return [];
    }
  }

  async search3asq(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const searchTerms = [...new Set([normalizeQueryToEnglish(q), q])];
    const results = [];
    const seen = new Set();

    for (const term of searchTerms) {
      try {
        const { data: html } = await axios.get(
          `${ASQ_BASE}/?s=${encodeURIComponent(term)}&post_type=wp-manga`,
          {
            headers: { 'User-Agent': USER_AGENT, Referer: `${ASQ_BASE}/` },
            timeout: 12000
          }
        );

        const blocks = String(html).split('c-tabs-item__content').slice(1);
        for (const block of blocks) {
          const linkMatch = block.match(/href="https:\/\/3asq\.online\/manga\/([^"\/?#]+)\/"[^>]*title="([^"]*)"/i) ||
                            block.match(/<h3[^>]*>\s*<a\s+href="https:\/\/3asq\.online\/manga\/([^"\/?#]+)\/"[^>]*>([^<]+)<\/a>/i);
          if (!linkMatch) continue;
          const slug = linkMatch[1].trim();
          if (slug === 'feed' || seen.has(slug)) continue;
          seen.add(slug);

          const imgMatch = block.match(/src="(https:\/\/3asq\.online\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/i);
          const title = decodeHtmlEntities(linkMatch[2] || slug.replace(/-/g, ' '));
          const poster = imgMatch?.[1] || '';

          results.push({
            id: `asq:${slug}`,
            mangalikSlug: `asq:${slug}`,
            title,
            title_ar: title,
            title_en: title,
            poster,
            coverImage: poster,
            type: 'MANGA',
            status: 'ONGOING',
            rating: null,
            chapters_count: 100,
            author: 'سيرفر Hearbor 2 (مترجم)',
            description_ar: `${title} — متاح بالترجمة العربية المباشرة على سيرفر Hearbor 2.`,
            description_en: `${title} — Arabic Manga on Hearbor 2.`,
            source: 'Hearbor 2',
            server: 'bx2'
          });
        }
      } catch (err) {
        // ignore single term error
      }
    }

    return results;
  }

  async get3asqChapters(asqSlug) {
    const cleanSlug = String(asqSlug || '').replace(/^asq:/i, '').trim();
    if (!cleanSlug) return [];

    const cacheKey = `asq:chapters:${cleanSlug}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data: html } = await axios.post(
        `${ASQ_BASE}/manga/${encodeURIComponent(cleanSlug)}/ajax/chapters/`,
        '',
        {
          headers: {
            'User-Agent': USER_AGENT,
            'X-Requested-With': 'XMLHttpRequest',
            Referer: `${ASQ_BASE}/manga/${encodeURIComponent(cleanSlug)}/`
          },
          timeout: 12000
        }
      );

      const chapters = [];
      const seen = new Set();
      const escapedSlug = cleanSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(
        `<a\\s+href="https:\\/\\/3asq\\.online\\/manga\\/${escapedSlug}\\/([^"\\/?#]+)\\/"[^>]*>([\\s\\S]*?)<\\/a>`,
        'gi'
      );

      let match;
      while ((match = regex.exec(String(html))) !== null) {
        const chSlug = match[1].trim();
        if (seen.has(chSlug)) continue;
        seen.add(chSlug);

        const rawTitle = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, '').trim());
        const numMatch = chSlug.match(/(\d+(?:\.\d+)?)/) || rawTitle.match(/(\d+(?:\.\d+)?)/);
        const chapterNumber = numMatch ? numMatch[1] : chSlug;

        chapters.push({
          chapterId: `asq:${cleanSlug}:${chSlug}`,
          chapterNumber: String(chapterNumber),
          slug: chSlug,
          title: rawTitle ? `الفصل ${rawTitle}` : `الفصل ${chapterNumber}`,
          releaseDate: '2026',
          scanlationGroup: 'سيرفر Hearbor 2 (مترجم)',
          server: 'bx2',
          url: `${ASQ_BASE}/manga/${cleanSlug}/${chSlug}/`
        });
      }

      if (chapters.length > 0) setCache(cacheKey, chapters);
      return chapters;
    } catch (error) {
      console.error(`3asq chapters error (${cleanSlug}):`, error.message);
      return [];
    }
  }

  async get3asqChapterPages(asqSlug, chSlug) {
    const cleanSlug = String(asqSlug || '').replace(/^asq:/i, '').trim();
    const cleanCh = String(chSlug || '').trim();
    if (!cleanSlug || !cleanCh) return [];

    const cacheKey = `asq:pages:${cleanSlug}:${cleanCh}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const url = `${ASQ_BASE}/manga/${encodeURIComponent(cleanSlug)}/${encodeURIComponent(cleanCh)}/`;
      const { data: html } = await axios.get(url, {
        headers: { 'User-Agent': USER_AGENT, Referer: `${ASQ_BASE}/manga/${cleanSlug}/` },
        timeout: 14000
      });

      const pages = [];
      const seen = new Set();
      const regex =
        /(?:src|data-src)="(\s*https:\/\/3asq\.online\/wp-content\/uploads\/WP-manga\/data\/[^"]+\.(?:jpg|jpeg|png|webp)\s*)"/gi;
      let match;
      while ((match = regex.exec(String(html))) !== null) {
        const imgUrl = match[1].trim().replace(/ /g, '%20');
        if (seen.has(imgUrl)) continue;
        seen.add(imgUrl);

        pages.push({
          pageNumber: pages.length + 1,
          url: imgUrl,
          directUrl: imgUrl,
          server: 'Hearbor 2'
        });
      }

      if (pages.length > 0) setCache(cacheKey, pages);
      return pages;
    } catch (error) {
      console.error(`3asq pages error (${cleanSlug}/${cleanCh}):`, error.message);
      return [];
    }
  }

  /* =========================================================================
   * ENGINE 3: Hearbor 3 — WeebCentral + MangaDex API v5 (Global & Arabic HD)
   * ========================================================================= */

  async searchWeebCentral(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const enQuery = normalizeQueryToEnglish(q);

    try {
      const body = new URLSearchParams({ text: enQuery }).toString();
      const { data: html } = await axios.post(
        `${WEEBCENTRAL_BASE}/search/simple?location=main`,
        body,
        {
          headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
            'HX-Request': 'true',
            Origin: WEEBCENTRAL_BASE,
            Referer: `${WEEBCENTRAL_BASE}/`
          },
          timeout: 12000
        }
      );

      const results = [];
      const seen = new Set();
      const regex =
        /href="https:\/\/weebcentral\.com\/series\/([^\/"]+)\/([^"]+)"[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<div class="flex-1[^"]*">\s*([^<\n]+)/gi;

      let match;
      while ((match = regex.exec(String(html))) !== null) {
        const seriesId = match[1].trim();
        const slug = match[2].trim();
        if (seen.has(seriesId)) continue;
        seen.add(seriesId);

        const poster = match[3].trim();
        const title = decodeHtmlEntities(match[4] || slug.replace(/-/g, ' '));
        const id = `wc:${seriesId}:${slug}`;

        results.push({
          id,
          mangalikSlug: id,
          title,
          title_ar: title,
          title_en: title,
          poster,
          coverImage: poster,
          type: 'MANGA',
          status: 'ONGOING',
          rating: null,
          chapters_count: 150,
          author: 'سيرفر Hearbor 3 (المكتبة العالمية الشاملة)',
          description_ar: `${title} — متاح بالكامل بدقة أصلية فائقة عبر سيرفر Hearbor 3.`,
          description_en: `${title} — Full HD Official Rips on Hearbor 3.`,
          source: 'Hearbor 3',
          server: 'bx3'
        });
      }

      return results;
    } catch (error) {
      console.error('WeebCentral search error:', error.message);
      return [];
    }
  }

  async getWeebCentralChapters(seriesId, wcSlug = 'series') {
    const cleanSeriesId = String(seriesId || '').trim();
    if (!cleanSeriesId) return [];

    const cacheKey = `wc:chapters:${cleanSeriesId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data: html } = await axios.get(
        `${WEEBCENTRAL_BASE}/series/${encodeURIComponent(cleanSeriesId)}/full-chapter-list`,
        {
          headers: {
            'User-Agent': USER_AGENT,
            'HX-Request': 'true',
            Referer: `${WEEBCENTRAL_BASE}/series/${cleanSeriesId}/${wcSlug}`
          },
          timeout: 12000
        }
      );

      const chapters = [];
      const seen = new Set();
      const regex =
        /<a\s+href="(?:https:\/\/weebcentral\.com)?\/chapters\/([A-Z0-9]+)"[\s\S]*?<span\s+class="">([^<]+)<\/span>/gi;

      let match;
      while ((match = regex.exec(String(html))) !== null) {
        const chId = match[1].trim();
        if (seen.has(chId)) continue;
        seen.add(chId);

        const rawLabel = decodeHtmlEntities(match[2].trim());
        const numMatch = rawLabel.match(/(\d+(?:\.\d+)?)/);
        const chapterNumber = numMatch ? numMatch[1] : String(chapters.length + 1);

        chapters.push({
          chapterId: `wc:${chId}`,
          chapterNumber: String(chapterNumber),
          slug: chId,
          title: `الفصل ${chapterNumber} (${rawLabel})`,
          releaseDate: '2026',
          scanlationGroup: 'سيرفر Hearbor 3 (جودة أصلية)',
          server: 'bx3',
          url: `${WEEBCENTRAL_BASE}/chapters/${chId}`
        });
      }

      if (chapters.length > 0) setCache(cacheKey, chapters);
      return chapters;
    } catch (error) {
      console.error(`WeebCentral chapters error (${cleanSeriesId}):`, error.message);
      return [];
    }
  }

  async getWeebCentralChapterPages(chId) {
    const cleanChId = String(chId || '').replace(/^wc:/i, '').trim();
    if (!cleanChId) return [];

    const cacheKey = `wc:pages:${cleanChId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data: html } = await axios.get(
        `${WEEBCENTRAL_BASE}/chapters/${encodeURIComponent(cleanChId)}/images?is_prev=False&current_page=1&reading_style=long_strip`,
        {
          headers: {
            'User-Agent': USER_AGENT,
            'HX-Request': 'true',
            Referer: `${WEEBCENTRAL_BASE}/chapters/${cleanChId}`
          },
          timeout: 14000
        }
      );

      const pages = [];
      const seen = new Set();
      const imgRegex = /<img[^>]+src="(https:\/\/[^"]+\.(?:png|jpg|jpeg|webp))"/gi;
      let match;
      while ((match = imgRegex.exec(String(html))) !== null) {
        const imgUrl = match[1].trim();
        if (/static\/images|logo|avatar/i.test(imgUrl)) continue;
        if (seen.has(imgUrl)) continue;
        seen.add(imgUrl);

        pages.push({
          pageNumber: pages.length + 1,
          url: imgUrl,
          directUrl: imgUrl,
          server: 'Hearbor 3'
        });
      }

      if (pages.length > 0) setCache(cacheKey, pages);
      return pages;
    } catch (error) {
      console.error(`WeebCentral pages error (${cleanChId}):`, error.message);
      return [];
    }
  }

  /* =========================================================================
   * MANGA PEAK ENGINES (MangaMello Plus 14,331 + Dilar 9,164 + Azora 2,453 + Swat 1,669)
   * ========================================================================= */

  async getMangaMelloCatalog(page = 1, sort = 'views') {
    const cacheKey = `mm:catalog:${page}:${sort}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(
        `${MANGAMELLO_API}/mangas?page=${page}&per_page=40&relations=genres&sort_by=${sort}&dir=desc`,
        { headers: MANGAMELLO_HEADERS, timeout: 10000 }
      );
      const list = Array.isArray(data?.data) ? data.data : [];
      const items = list.map((m) => {
        const id = `mm:${m.id}`;
        const title = String(m.title || m.name || '').trim();
        const poster = rewriteLegacyMangaImageUrl(m.img || m.image || m.cover || m.poster || '');
        const genres = Array.isArray(m.genres) ? m.genres.map((g) => g.name || g.title).filter(Boolean) : [];
        const isManga = genres.some((g) => /مانجا|شونين|سينين/i.test(g));
        const rawRate = parseFloat(m.ten_rate || m.average_rate || m.rate) || 0; // unknown stays unknown (no invented rating)
        return {
          id,
          mangalikSlug: id,
          title,
          title_ar: title,
          title_en: title,
          poster,
          coverImage: poster,
          banner: poster,
          type: isManga ? 'MANGA' : 'MANHWA',
          status: m.is_completed === 1 ? 'COMPLETED' : 'ONGOING',
          rating: rawRate > 0 ? (rawRate > 10 ? +(rawRate / 10).toFixed(1) : +rawRate.toFixed(1)) : null,
          chapters_count: Number(m.chapters_count || m.last_chapter || 100),
          author: 'سيرفر Hearbor 1',
          description_ar: m.summary || m.description || `اقرأ ${title} بالترجمة العربية الكاملة عبر سيرفر Hearbor 1.`,
          description_en: m.summary || m.description || `Read ${title} in Arabic on Hearbor 1.`,
          genres,
          release_year: null,
          source: 'Hearbor 1',
          server: 'bx1'
        };
      });
      if (items.length > 0) setCache(cacheKey, items);
      return items;
    } catch (err) {
      console.error('MangaMello catalog error:', err.message);
      return [];
    }
  }

  async searchMangaMello(query, page = 1) {
    const q = String(query || '').trim();
    if (!q) return [];
    const terms = [...new Set([q, normalizeQueryToEnglish(q)])];
    const results = [];
    const seen = new Set();

    for (const term of terms) {
      try {
        const { data } = await axios.get(
          `${MANGAMELLO_API}/mangas/search?per_page=30&page=${page}&relations=genres,type,ageRate&title=${encodeURIComponent(term)}`,
          { headers: MANGAMELLO_HEADERS, timeout: 10000 }
        );
        const list = Array.isArray(data?.data) ? data.data : [];
        for (const m of list) {
          if (!m?.id || seen.has(m.id)) continue;
          seen.add(m.id);
          const id = `mm:${m.id}`;
          const title = String(m.title || m.name || '').trim();
          const poster = rewriteLegacyMangaImageUrl(m.img || m.image || m.cover || m.poster || '');
          const genres = Array.isArray(m.genres) ? m.genres.map((g) => g.name || g.title).filter(Boolean) : [];
          results.push({
            id,
            mangalikSlug: id,
            title,
            title_ar: title,
            title_en: title,
            poster,
            coverImage: poster,
            banner: poster,
            type: 'MANHWA',
            status: m.is_completed === 1 ? 'COMPLETED' : 'ONGOING',
            rating: null,
            chapters_count: Number(m.chapters_count || 100),
            author: 'سيرفر Hearbor 1',
            description_ar: m.summary || m.description || `${title} — متاح بالترجمة العربية عبر سيرفر Hearbor 1.`,
            description_en: m.summary || m.description || `${title} on Hearbor 1.`,
            genres,
            source: 'Hearbor 1',
            server: 'bx1'
          });
        }
      } catch (_) {}
    }
    return results;
  }

  async getMangaMelloDetails(mmId) {
    const cleanId = String(mmId || '').replace(/^mm:/i, '').trim();
    if (!cleanId) return null;
    const cacheKey = `mm:details:${cleanId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(
        `${MANGAMELLO_API}/mangas/${encodeURIComponent(cleanId)}?relations=genres,chapters`,
        { headers: MANGAMELLO_HEADERS, timeout: 12000 }
      );
      const m = data?.data || data;
      if (!m?.id) return null;
      const title = String(m.title || m.name || '').trim();
      const poster = rewriteLegacyMangaImageUrl(m.img || m.image || m.cover || m.poster || '');
      const genres = Array.isArray(m.genres) ? m.genres.map((g) => g.name || g.title).filter(Boolean) : [];
      const rawChapters = Array.isArray(m.chapters) ? m.chapters : m.chapters?.data || [];
      const info = {
        id: `mm:${m.id}`,
        title,
        title_ar: title,
        title_en: title,
        poster,
        coverImage: poster,
        banner: poster,
        type: 'MANHWA',
        status: m.is_completed === 1 ? 'COMPLETED' : 'ONGOING',
        rating: null,
        chapters_count: rawChapters.length || 100,
        author: 'سيرفر Hearbor 1',
        description_ar: m.summary || m.description || `اقرأ ${title} بالترجمة العربية عبر سيرفر Hearbor 1.`,
        description_en: m.summary || m.description || `Read ${title} on Hearbor 1.`,
        genres,
        release_year: null
      };
      setCache(cacheKey, info);
      return info;
    } catch (_) {
      return null;
    }
  }

  async getMangaMelloChapters(mmId) {
    const cleanId = String(mmId || '').replace(/^mm:/i, '').trim();
    if (!cleanId) return [];
    const cacheKey = `mm:chapters:${cleanId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(
        `${MANGAMELLO_API}/mangas/${encodeURIComponent(cleanId)}?relations=genres,chapters`,
        { headers: MANGAMELLO_HEADERS, timeout: 12000 }
      );
      const m = data?.data || data;
      let rawChapters = Array.isArray(m?.chapters) ? m.chapters : m?.chapters?.data || [];
      if (!rawChapters.length) {
        const chRes = await axios.get(
          `${MANGAMELLO_API}/mangas/${encodeURIComponent(cleanId)}/chapters?per_page=2000`,
          { headers: MANGAMELLO_HEADERS, timeout: 12000 }
        );
        rawChapters = Array.isArray(chRes.data?.data) ? chRes.data.data : [];
      }

      const chapters = rawChapters
        .map((ch, idx) => {
          const chId = String(ch.id || '').trim();
          if (!chId || chId === '0') return null;
          const num = ch.order ?? ch.chapter ?? ch.number ?? idx + 1;
          const chTitle = String(ch.title || ch.name || '').trim();
          return {
            chapterId: `mm:${cleanId}:${chId}`,
            chapterNumber: String(num),
            slug: chId,
            title: chTitle ? `الفصل ${num} — ${chTitle}` : `الفصل ${num}`,
            releaseDate: ch.created_at ? String(ch.created_at).slice(0, 10) : '2026',
            scanlationGroup: 'سيرفر Hearbor 1',
            server: 'bx1',
            url: `${MANGAMELLO_API}/mangas/${cleanId}/chapters/${chId}`
          };
        })
        .filter(Boolean)
        .sort((a, b) => (parseFloat(b.chapterNumber) || 0) - (parseFloat(a.chapterNumber) || 0));

      if (chapters.length > 0) setCache(cacheKey, chapters);
      return chapters;
    } catch (err) {
      console.error(`MangaMello chapters error (${cleanId}):`, err.message);
      return [];
    }
  }

  async getMangaMelloChapterPages(mmId, chapterId) {
    const cleanMangaId = String(mmId || '').replace(/^mm:/i, '').trim();
    const cleanChId = String(chapterId || '').trim();
    if (!cleanMangaId || !cleanChId) return [];

    const cacheKey = `mm:pages:${cleanMangaId}:${cleanChId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(
        `${MANGAMELLO_API}/mangas/${encodeURIComponent(cleanMangaId)}/chapters/${encodeURIComponent(cleanChId)}?relations=chapterImages`,
        { headers: MANGAMELLO_HEADERS, timeout: 14000 }
      );
      const root = data?.data || data || {};
      const arr = root.chapterImages || root.chapter_images || root.images || root.pages || [];
      const pages = [];
      const seen = new Set();

      for (const item of arr) {
        const rawSrc =
          typeof item === 'string'
            ? item
            : item?.src || item?.originalSrc || item?.original_src || item?.url || item?.image || item?.path;
        const imgUrl = rewriteLegacyMangaImageUrl(rawSrc).replace(/ /g, '%20');
        if (!imgUrl || seen.has(imgUrl)) continue;
        seen.add(imgUrl);
        pages.push({
          pageNumber: pages.length + 1,
          url: imgUrl,
          directUrl: imgUrl,
          server: 'Hearbor 1'
        });
      }

      if (pages.length > 0) setCache(cacheKey, pages);
      return pages;
    } catch (err) {
      console.error(`MangaMello pages error (${cleanMangaId}/${cleanChId}):`, err.message);
      return [];
    }
  }

  async getAzoraflyCatalog(page = 1) {
    const cacheKey = `az:catalog:${page}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(
        `${AZORAFLY_API}/query?page=${page}&perPage=24&orderBy=totalViews&orderDirection=desc`,
        { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, timeout: 10000 }
      );
      const posts = Array.isArray(data?.posts) ? data.posts : [];
      const items = posts
        .filter((p) => p?.slug && String(p.seriesType || '').toUpperCase() !== 'NOVEL')
        .map((p) => {
          const id = `az:${p.id}:${p.slug}`;
          const title = String(p.postTitle || p.slug).trim();
          const poster = String(p.featuredImage || '').trim();
          const genres = Array.isArray(p.genres) ? p.genres.map((g) => g.name).filter(Boolean) : [];
          return {
            id,
            mangalikSlug: id,
            title,
            title_ar: title,
            title_en: title,
            poster,
            coverImage: poster,
            banner: poster,
            type: 'MANHWA',
            status: String(p.seriesStatus || 'ONGOING').toUpperCase(),
            rating: Number(p.averageRating) > 0 ? +(Number(p.averageRating) * 2).toFixed(1) : null,
            chapters_count: Array.isArray(p.chapters) ? p.chapters.length : null,
            author: 'سيرفر Hearbor 3',
            description_ar: `اقرأ مانهوا ${title} بالترجمة العربية المباشرة عبر سيرفر Hearbor 1.`,
            description_en: `Read ${title} Manhwa on Hearbor 1.`,
            genres,
            release_year: null,
            source: 'Hearbor 1',
            server: 'bx1'
          };
        });
      if (items.length > 0) setCache(cacheKey, items);
      return items;
    } catch (err) {
      console.error('Azorafly catalog error:', err.message);
      return [];
    }
  }

  async searchAzorafly(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const terms = [...new Set([q, normalizeQueryToEnglish(q)])];
    const results = [];
    const seen = new Set();

    for (const term of terms) {
      try {
        const { data } = await axios.get(
          `${AZORAFLY_API}/query?page=1&perPage=20&searchTerm=${encodeURIComponent(term)}&orderBy=totalViews&orderDirection=desc`,
          { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, timeout: 10000 }
        );
        const posts = Array.isArray(data?.posts) ? data.posts : [];
        for (const p of posts) {
          if (!p?.id || seen.has(p.id) || String(p.seriesType || '').toUpperCase() === 'NOVEL') continue;
          seen.add(p.id);
          const id = `az:${p.id}:${p.slug}`;
          const title = String(p.postTitle || p.slug).trim();
          const poster = String(p.featuredImage || '').trim();
          results.push({
            id,
            mangalikSlug: id,
            title,
            title_ar: title,
            title_en: title,
            poster,
            coverImage: poster,
            banner: poster,
            type: 'MANHWA',
            status: 'ONGOING',
            rating: null,
            chapters_count: 80,
            author: 'سيرفر Hearbor 3',
            description_ar: `${title} — متاح بالترجمة العربية عبر سيرفر Hearbor 1.`,
            description_en: `${title} on Hearbor 1.`,
            source: 'Hearbor 1',
            server: 'bx1'
          });
        }
      } catch (_) {}
    }
    return results;
  }

  async getAzoraflyChapters(azIdentifier) {
    const clean = String(azIdentifier || '').replace(/^az:/i, '').trim();
    const parts = clean.split(':');
    let postId = /^\d+$/.test(parts[0]) ? parts[0] : null;
    const slug = parts[1] || parts[0];

    const cacheKey = `az:chapters:${clean}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      if (!postId && slug) {
        const postRes = await axios.get(`${AZORAFLY_API}/post?postSlug=${encodeURIComponent(slug)}`, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          timeout: 10000
        });
        postId = postRes.data?.post?.id;
      }
      if (!postId) return [];

      const { data } = await axios.get(`${AZORAFLY_API}/chapters?postId=${encodeURIComponent(postId)}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeout: 12000
      });
      const list = data?.post?.chapters || data?.chapters || [];
      const chapters = list.map((ch) => ({
        chapterId: `az:${ch.id}`,
        chapterNumber: String(ch.number ?? ch.slug ?? 1),
        slug: String(ch.id),
        title: ch.title ? `الفصل ${ch.number} — ${ch.title}` : `الفصل ${ch.number}`,
        releaseDate: ch.createdAt ? String(ch.createdAt).slice(0, 10) : '2026',
        scanlationGroup: 'سيرفر Hearbor 3',
        server: 'bx1',
        url: `${AZORAFLY_API}/chapter?chapterId=${ch.id}`
      }));

      if (chapters.length > 0) setCache(cacheKey, chapters);
      return chapters;
    } catch (err) {
      console.error(`Azorafly chapters error (${clean}):`, err.message);
      return [];
    }
  }

  async getAzoraflyChapterPages(chapterId) {
    const cleanChId = String(chapterId || '').replace(/^az:/i, '').split(':')[0].trim();
    if (!cleanChId) return [];

    const cacheKey = `az:pages:${cleanChId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${AZORAFLY_API}/chapter?chapterId=${encodeURIComponent(cleanChId)}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeout: 12000
      });
      const imgs = data?.chapter?.images || data?.images || [];
      const pages = imgs
        .map((img, i) => {
          const url = String(img?.url || img || '').trim().replace(/ /g, '%20');
          if (!url) return null;
          return {
            pageNumber: i + 1,
            url,
            directUrl: url,
            server: 'Hearbor 1'
          };
        })
        .filter(Boolean);

      if (pages.length > 0) setCache(cacheKey, pages);
      return pages;
    } catch (err) {
      console.error(`Azorafly pages error (${cleanChId}):`, err.message);
      return [];
    }
  }

  async getMangaSwatCatalog(page = 1) {
    const cacheKey = `sw:catalog:${page}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(
        `${MANGASWAT_API}/series/?page=${page}&order_by=-followers_count`,
        { headers: MANGASWAT_HEADERS, timeout: 10000 }
      );
      const list = Array.isArray(data?.results) ? data.results : [];
      const items = list.map((s) => {
        const seriesId = s.id || s.serie_id;
        const id = `sw:${seriesId}`;
        const title = String(s.title || s.slug || '').trim();
        const poster = String(s.poster?.medium || s.poster?.thumbnail || '').trim();
        const genres = Array.isArray(s.genres) ? s.genres.map((g) => g.name).filter(Boolean) : [];
        return {
          id,
          mangalikSlug: id,
          title,
          title_ar: title,
          title_en: title,
          poster,
          coverImage: poster,
          banner: poster,
          type: 'MANHWA',
          status: 'ONGOING',
          rating: parseFloat(s.rating) > 0 ? +parseFloat(s.rating).toFixed(1) : null,
          chapters_count: Number(s.chapters_count || 90),
          author: 'سيرفر Hearbor 4',
          description_ar: s.description || `اقرأ ${title} بالترجمة العربية المباشرة عبر سيرفر Hearbor 2.`,
          description_en: s.description || `Read ${title} on Hearbor 2.`,
          genres,
          release_year: null,
          source: 'Hearbor 2',
          server: 'bx2'
        };
      });
      if (items.length > 0) setCache(cacheKey, items);
      return items;
    } catch (err) {
      console.error('MangaSwat catalog error:', err.message);
      return [];
    }
  }

  async searchMangaSwat(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const terms = [...new Set([q, normalizeQueryToEnglish(q)])];
    const results = [];
    const seen = new Set();

    for (const term of terms) {
      try {
        const { data } = await axios.get(
          `${MANGASWAT_API}/series/?page=1&search=${encodeURIComponent(term)}`,
          { headers: MANGASWAT_HEADERS, timeout: 10000 }
        );
        const list = Array.isArray(data?.results) ? data.results : [];
        for (const s of list) {
          const seriesId = s.id || s.serie_id;
          if (!seriesId || seen.has(seriesId)) continue;
          seen.add(seriesId);
          const id = `sw:${seriesId}`;
          const title = String(s.title || s.slug || '').trim();
          const poster = String(s.poster?.medium || s.poster?.thumbnail || '').trim();
          results.push({
            id,
            mangalikSlug: id,
            title,
            title_ar: title,
            title_en: title,
            poster,
            coverImage: poster,
            banner: poster,
            type: 'MANHWA',
            status: 'ONGOING',
            rating: null,
            chapters_count: 90,
            author: 'سيرفر Hearbor 4',
            description_ar: s.description || `${title} — متاح بالترجمة العربية عبر سيرفر Hearbor 2.`,
            description_en: s.description || `${title} on Hearbor 2.`,
            source: 'Hearbor 2',
            server: 'bx2'
          });
        }
      } catch (_) {}
    }
    return results;
  }

  async getMangaSwatChapters(swId) {
    const cleanId = String(swId || '').replace(/^sw:/i, '').split(':')[0].trim();
    if (!cleanId) return [];
    const cacheKey = `sw:chapters:${cleanId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(
        `${MANGASWAT_API}/chapters/?serie=${encodeURIComponent(cleanId)}&order_by=order&page_size=300&page=1`,
        { headers: MANGASWAT_HEADERS, timeout: 12000 }
      );
      const list = Array.isArray(data?.results) ? data.results : [];
      const chapters = list
        .map((ch, idx) => ({
          chapterId: `sw:${ch.id}`,
          chapterNumber: String(ch.chapter || idx + 1),
          slug: String(ch.id),
          title: ch.title ? `الفصل ${ch.chapter || idx + 1} — ${ch.title}` : `الفصل ${ch.chapter || idx + 1}`,
          releaseDate: ch.created_at ? String(ch.created_at).slice(0, 10) : '2026',
          scanlationGroup: 'سيرفر Hearbor 4',
          server: 'bx2',
          url: `${MANGASWAT_API}/chapters/${ch.id}/`
        }))
        .reverse();

      if (chapters.length > 0) setCache(cacheKey, chapters);
      return chapters;
    } catch (err) {
      console.error(`MangaSwat chapters error (${cleanId}):`, err.message);
      return [];
    }
  }

  async getMangaSwatChapterPages(chapterId) {
    const cleanChId = String(chapterId || '').replace(/^sw:/i, '').split(':')[0].trim();
    if (!cleanChId) return [];
    const cacheKey = `sw:pages:${cleanChId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(
        `${MANGASWAT_API}/chapters/${encodeURIComponent(cleanChId)}/`,
        { headers: MANGASWAT_HEADERS, timeout: 12000 }
      );
      const imgs = Array.isArray(data?.images) ? data.images : [];
      const pages = imgs
        .map((img, i) => {
          const url = String(img?.image || img?.url || '').trim();
          if (!url) return null;
          return {
            pageNumber: i + 1,
            url,
            directUrl: url,
            server: 'Hearbor 2'
          };
        })
        .filter(Boolean);

      if (pages.length > 0) setCache(cacheKey, pages);
      return pages;
    } catch (err) {
      console.error(`MangaSwat pages error (${cleanChId}):`, err.message);
      return [];
    }
  }

  async getDilarCatalog(page = 1) {
    const cacheKey = `dt:catalog:${page}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${DILAR_API}/series/?page=${page}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeout: 10000
      });
      const list = Array.isArray(data?.series) ? data.series : [];
      const items = list.map((s) => {
        const id = `dt:${s.id}`;
        const title = String(s.synonyms?.arabic || s.title || '').trim();
        const titleEn = String(s.title || title).trim();
        const cover = String(s.cover || '').trim();
        const poster = cover.startsWith('http')
          ? cover
          : cover
          ? `https://dilar.tube/uploads/manga/cover/${s.id}/large_${cover.replace(/\.[^.]+$/, '.webp')}`
          : '';
        return {
          id,
          mangalikSlug: id,
          title,
          title_ar: title,
          title_en: titleEn,
          poster,
          coverImage: poster,
          banner: poster,
          type: 'MANHWA',
          status: String(s.story_status || 'ONGOING').toUpperCase(),
          rating: parseFloat(s.rating) > 0 ? +(parseFloat(s.rating) * 2).toFixed(1) : null,
          chapters_count: Number(s.chapters_count || 60),
          author: 'سيرفر Hearbor 2',
          description_ar: s.summary || `اقرأ ${title} بالترجمة العربية عبر سيرفر Hearbor 2.`,
          description_en: s.summary || `Read ${titleEn} on Hearbor 2.`,
          genres: [],
          release_year: null,
          source: 'Hearbor 2',
          server: 'bx2'
        };
      });
      if (items.length > 0) setCache(cacheKey, items);
      return items;
    } catch (err) {
      console.error('Dilar catalog error:', err.message);
      return [];
    }
  }

  /* =========================================================================
   * MASTER GLOBAL INDEX (AniList GraphQL + MangaDex API v5 + Dilar Search)
   * +100,000 Works (Manga JP, Manhwa KR, Manhua CN) + Synonym Expansion
   * ========================================================================= */

  async getAniListMasterCatalog(page = 1, countryOfOrigin = null, search = '') {
    const cacheKey = `anilist_master:${page}:${countryOfOrigin || 'ALL'}:${search || ''}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const gqlQuery = `
        query ($page: Int, $perPage: Int, $countryOfOrigin: CountryCode, $search: String, $sort: [MediaSort]) {
          Page(page: $page, perPage: $perPage) {
            media(type: MANGA, countryOfOrigin: $countryOfOrigin, search: $search, sort: $sort, isAdult: false) {
              id
              title { romaji english native }
              synonyms
              countryOfOrigin
              status
              chapters
              averageScore
              popularity
              genres
              description(asHtml: false)
              coverImage { extraLarge large }
              bannerImage
              startDate { year }
            }
          }
        }
      `;
      const variables = {
        page: Math.max(1, Number(page) || 1),
        perPage: 28,
        sort: search ? ['SEARCH_MATCH', 'POPULARITY_DESC'] : ['POPULARITY_DESC', 'TRENDING_DESC']
      };
      if (countryOfOrigin && ['KR', 'JP', 'CN', 'TW'].includes(String(countryOfOrigin).toUpperCase())) {
        variables.countryOfOrigin = String(countryOfOrigin).toUpperCase();
      }
      if (search && String(search).trim()) {
        variables.search = String(search).trim();
      }

      const { data } = await axios.post(
        'https://graphql.anilist.co',
        { query: gqlQuery, variables },
        {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
          timeout: 10000
        }
      );

      const mediaList = data?.data?.Page?.media || [];
      const items = mediaList.map((m) => {
        const titleEn = m.title?.english || m.title?.romaji || m.title?.native || `Manga #${m.id}`;
        const titleRomaji = m.title?.romaji || titleEn;
        const country = String(m.countryOfOrigin || 'JP').toUpperCase();
        const typeLabel = country === 'KR' ? 'MANHWA' : country === 'CN' || country === 'TW' ? 'MANHUA' : 'MANGA';
        const poster = m.coverImage?.extraLarge || m.coverImage?.large || '';
        const banner = m.bannerImage || poster;
        const cleanDesc = String(m.description || '')
          .replace(/<[^>]+>/g, '')
          .trim();
        const allSynonyms = Array.from(
          new Set(
            [m.title?.english, m.title?.romaji, m.title?.native, ...(Array.isArray(m.synonyms) ? m.synonyms : [])]
              .map((s) => String(s || '').trim())
              .filter((s) => s.length >= 2)
          )
        );
        return {
          id: `al:${m.id}`,
          mangalikSlug: `al:${m.id}`,
          anilistId: m.id,
          title: titleEn,
          title_ar: titleEn,
          title_en: titleEn,
          title_romaji: titleRomaji,
          synonyms: allSynonyms,
          countryOfOrigin: country,
          poster,
          coverImage: poster,
          banner,
          type: typeLabel,
          status: m.status === 'FINISHED' ? 'COMPLETED' : 'ONGOING',
          rating: m.averageScore ? +(m.averageScore / 10).toFixed(1) : null,
          chapters_count: m.chapters || null,
          author: country === 'KR' ? 'مانهوا كورية • Hearbor' : country === 'CN' ? 'مانهاوا صينية • Hearbor' : 'مانجا يابانية • Hearbor',
          description_ar: cleanDesc || `اقرأ ${titleEn} مباشرة عبر الفهرس العالمي الشامل ومصادر Hearbor.`,
          description_en: cleanDesc || `Read ${titleEn} on Hearbor Global Master Index.`,
          genres: Array.isArray(m.genres) ? m.genres : [],
          release_year: m.startDate?.year || 2025,
          source: 'Hearbor 3',
          server: 'bx3'
        };
      });

      if (items.length > 0) setCache(cacheKey, items);
      return items;
    } catch (err) {
      console.error('AniList Master Catalog error:', err.message);
      return [];
    }
  }

  async getAniListMangaDetails(anilistId) {
    const cleanId = String(anilistId || '').replace(/^al:/, '').trim();
    if (!cleanId) return null;
    const cacheKey = `anilist_detail:${cleanId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const gqlQuery = `
        query ($id: Int) {
          Media(id: $id, type: MANGA) {
            id
            title { romaji english native }
            synonyms
            countryOfOrigin
            status
            chapters
            averageScore
            genres
            description(asHtml: false)
            coverImage { extraLarge large }
            bannerImage
            startDate { year }
          }
        }
      `;
      const { data } = await axios.post(
        'https://graphql.anilist.co',
        { query: gqlQuery, variables: { id: Number(cleanId) } },
        {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
          timeout: 9000
        }
      );
      const m = data?.data?.Media;
      if (!m) return null;
      const titleEn = m.title?.english || m.title?.romaji || m.title?.native || `Manga #${m.id}`;
      const country = String(m.countryOfOrigin || 'JP').toUpperCase();
      const typeLabel = country === 'KR' ? 'MANHWA' : country === 'CN' || country === 'TW' ? 'MANHUA' : 'MANGA';
      const poster = m.coverImage?.extraLarge || m.coverImage?.large || '';
      const cleanDesc = String(m.description || '').replace(/<[^>]+>/g, '').trim();
      const allSynonyms = Array.from(
        new Set(
          [m.title?.english, m.title?.romaji, m.title?.native, ...(Array.isArray(m.synonyms) ? m.synonyms : [])]
            .map((s) => String(s || '').trim())
            .filter((s) => s.length >= 2)
        )
      );
      const detail = {
        id: `al:${m.id}`,
        anilistId: m.id,
        title: titleEn,
        title_ar: titleEn,
        title_en: titleEn,
        synonyms: allSynonyms,
        countryOfOrigin: country,
        poster,
        banner: m.bannerImage || poster,
        type: typeLabel,
        status: m.status === 'FINISHED' ? 'COMPLETED' : 'ONGOING',
        rating: m.averageScore ? +(m.averageScore / 10).toFixed(1) : null,
        chapters_count: m.chapters || 120,
        author: country === 'KR' ? 'مانهوا كورية • Hearbor' : country === 'CN' ? 'مانهاوا صينية • Hearbor' : 'مانجا يابانية • Hearbor',
        description_ar: cleanDesc || `اقرأ ${titleEn} عبر محرك Hearbor الشامل.`,
        description_en: cleanDesc || `Read ${titleEn} on Hearbor.`,
        genres: Array.isArray(m.genres) ? m.genres : [],
        release_year: m.startDate?.year || 2025,
        source: 'Hearbor 3',
        server: 'bx3'
      };
      setCache(cacheKey, detail);
      return detail;
    } catch (_) {
      return null;
    }
  }

  async searchDilar(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    try {
      const { data } = await axios.post(
        'https://dilar.tube/api/search/quick_search',
        { query: q, includes: ['Manga'] },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Referer: 'https://dilar.tube/',
            'User-Agent': USER_AGENT
          },
          timeout: 8000
        }
      );
      const rows = data?.[0]?.data || [];
      return rows.map((row) => {
        const cleanCov = String(row.cover || '').replace(/\.webp$/i, '');
        const poster = cleanCov
          ? `https://dilar.tube/uploads/manga/cover/${row.id}/large_${cleanCov}.webp`
          : '';
        const title = String(row.title || row.english || `Manga #${row.id}`).trim();
        return {
          id: `dt:${row.id}`,
          mangalikSlug: `dt:${row.id}`,
          title,
          title_ar: title,
          title_en: String(row.english || title).trim(),
          poster,
          coverImage: poster,
          banner: poster,
          type: 'MANHWA',
          status: 'ONGOING',
          rating: null,
          chapters_count: 80,
          author: 'سيرفر Hearbor 2',
          description_ar: row.summary || `اقرأ ${title} بالترجمة العربية عبر سيرفر Hearbor 2.`,
          description_en: row.summary || `Read ${title} on Hearbor 2.`,
          genres: [],
          release_year: null,
          source: 'Hearbor 2',
          server: 'bx2'
        };
      });
    } catch (_) {
      return [];
    }
  }

  async searchMangaDex(query, limit = 16) {
    const q = String(query || '').trim();
    if (!q) return [];
    try {
      const { data } = await axios.get(`${MANGADEX_API}/manga`, {
        params: {
          title: q,
          limit,
          'includes[]': ['cover_art'],
          'contentRating[]': ['safe', 'suggestive'],
          'order[followedCount]': 'desc'
        },
        headers: { 'User-Agent': USER_AGENT },
        timeout: 9000
      });
      const list = data?.data || [];
      return list.map((item) => {
        const attrs = item.attributes || {};
        const titleObj = attrs.title || {};
        const altTitles = Array.isArray(attrs.altTitles) ? attrs.altTitles : [];
        const arAlt = altTitles.find((t) => t.ar)?.ar;
        const enAlt = altTitles.find((t) => t.en)?.en;
        const titleEn = titleObj.en || enAlt || Object.values(titleObj)[0] || 'Manga';
        const titleAr = arAlt || titleEn;
        const coverRel = (item.relationships || []).find((r) => r.type === 'cover_art');
        const fileName = coverRel?.attributes?.fileName;
        const poster = fileName ? `https://uploads.mangadex.org/covers/${item.id}/${fileName}.512.jpg` : '';
        const origLang = String(attrs.originalLanguage || 'ja').toLowerCase();
        const typeLabel = origLang === 'ko' ? 'MANHWA' : origLang.startsWith('zh') ? 'MANHUA' : 'MANGA';
        return {
          id: `md:${item.id}`,
          mangalikSlug: `md:${item.id}`,
          title: titleAr,
          title_ar: titleAr,
          title_en: titleEn,
          poster,
          coverImage: poster,
          banner: poster,
          type: typeLabel,
          status: attrs.status === 'completed' ? 'COMPLETED' : 'ONGOING',
          rating: null,
          chapters_count: Number(attrs.lastChapter) || 100,
          author: 'سيرفر Hearbor 3 (Global HD)',
          description_ar: attrs.description?.ar || attrs.description?.en || `اقرأ ${titleAr} عبر سيرفر Hearbor 3.`,
          description_en: attrs.description?.en || `Read ${titleEn} on Hearbor 3.`,
          genres: [],
          release_year: attrs.year || 2025,
          source: 'Hearbor 3',
          server: 'bx3'
        };
      });
    } catch (_) {
      return [];
    }
  }

  async getMangaDexChapters(mdMangaId) {
    const cleanId = String(mdMangaId || '').replace(/^md:/, '').trim();
    if (!cleanId) return [];
    const cacheKey = `md_chapters:${cleanId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${MANGADEX_API}/manga/${encodeURIComponent(cleanId)}/feed`, {
        params: {
          limit: 300,
          'translatedLanguage[]': ['ar', 'en'],
          'order[chapter]': 'asc',
          'contentRating[]': ['safe', 'suggestive', 'erotica']
        },
        headers: { 'User-Agent': USER_AGENT },
        timeout: 10000
      });
      const rows = data?.data || [];
      const byNum = new Map();
      for (const ch of rows) {
        const attrs = ch.attributes || {};
        if (attrs.externalUrl) continue;
        const chNum = String(attrs.chapter || '1').trim();
        const lang = attrs.translatedLanguage || 'en';
        const existing = byNum.get(chNum);
        if (!existing || (existing.lang !== 'ar' && lang === 'ar')) {
          byNum.set(chNum, {
            chapterId: `md:${ch.id}`,
            slug: `md:${ch.id}`,
            chapterNumber: chNum,
            title:
              lang === 'ar'
                ? `الفصل ${chNum}${attrs.title ? ` — ${attrs.title}` : ''} (عربي)`
                : `الفصل ${chNum}${attrs.title ? ` — ${attrs.title}` : ''} (Global HD)`,
            releaseDate: attrs.publishAt ? String(attrs.publishAt).slice(0, 10) : '2026',
            server: 'bx3',
            lang,
            scanlationGroup: lang === 'ar' ? 'ترجمة عربية • Hearbor 3' : 'الفصل الرسمي • Hearbor 3 Global'
          });
        }
      }
      const list = Array.from(byNum.values()).sort((a, b) => parseFloat(a.chapterNumber) - parseFloat(b.chapterNumber));
      if (list.length > 0) setCache(cacheKey, list);
      return list;
    } catch (_) {
      return [];
    }
  }

  async getMangaDexChapterPages(mdChId) {
    const cleanChId = String(mdChId || '').replace(/^md:/, '').trim();
    if (!cleanChId) return [];
    const cacheKey = `md_pages:${cleanChId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${MANGADEX_API}/at-home/server/${encodeURIComponent(cleanChId)}`, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 10000
      });
      const baseUrl = data?.baseUrl;
      const hash = data?.chapter?.hash;
      const files = data?.chapter?.data || data?.chapter?.dataSaver || [];
      const mode = data?.chapter?.data?.length ? 'data' : 'data-saver';
      if (!baseUrl || !hash || !files.length) return [];
      const pages = files.map((file, idx) => ({
        pageNumber: idx + 1,
        imageUrl: `${baseUrl}/${mode}/${hash}/${file}`
      }));
      setCache(cacheKey, pages);
      return pages;
    } catch (_) {
      return [];
    }
  }

  /**
   * Smart Multi-Title & Synonym Chapter Resolver + Hybrid Arabic/Global Chapter Merger:
   * Searches all Arabic servers (`MangaMello`, `Azora`, `MangaSwat`, `Olympus`, `3asq`)
   * AND Global servers (`WeebCentral`, `MangaDex`) across all candidate titles/synonyms,
   * and merges any newer untranslated global chapters (`N+1..Latest`) onto the Arabic list!
   */
  async resolveChaptersByCandidateTitles(candidateTitles = [], preferredServer = '') {
    const uniqueCandidates = Array.from(
      new Set(
        (candidateTitles || [])
          .map((t) => String(t || '').replace(/\([^)]*\)/g, '').trim())
          .filter((t) => t.length >= 2)
      )
    ).slice(0, 4);

    if (uniqueCandidates.length === 0) return [];

    let arabicChapters = [];
    let globalChapters = [];

    for (const candidate of uniqueCandidates) {
      const [mmRes, azRes, swRes, osRes, asqRes] = await Promise.allSettled([
        this.searchMangaMello(candidate),
        this.searchAzorafly(candidate),
        this.searchMangaSwat(candidate),
        this.searchOlympus(candidate),
        this.search3asq(candidate)
      ]);

      const tryFetch = async (res, getter, prefixLen) => {
        if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value.length > 0) {
          for (const hit of res.value.slice(0, 2)) {
            const chs = await getter.call(this, hit.id.slice(prefixLen));
            if (Array.isArray(chs) && chs.length > arabicChapters.length) {
              arabicChapters = chs;
            }
          }
        }
      };

      await Promise.allSettled([
        tryFetch(mmRes, this.getMangaMelloChapters, 3),
        tryFetch(azRes, this.getAzoraflyChapters, 3),
        tryFetch(swRes, this.getMangaSwatChapters, 3),
        tryFetch(osRes, this.getOlympusChapters, 3),
        tryFetch(asqRes, this.get3asqChapters, 4)
      ]);

      if (arabicChapters.length >= 10) break;
    }

    // Also query Global HD (WeebCentral + MangaDex) for full chapter coverage
    const primaryQuery = uniqueCandidates[0];
    const [wcHitsRes, mdHitsRes] = await Promise.allSettled([
      this.searchWeebCentral(primaryQuery),
      this.searchMangaDex(primaryQuery, 5)
    ]);

    if (wcHitsRes.status === 'fulfilled' && wcHitsRes.value.length > 0) {
      const [seriesId, slug] = wcHitsRes.value[0].id.slice(3).split(':');
      const wcChs = await this.getWeebCentralChapters(seriesId, slug);
      if (wcChs.length > globalChapters.length) globalChapters = wcChs;
    }
    if (globalChapters.length === 0 && mdHitsRes.status === 'fulfilled' && mdHitsRes.value.length > 0) {
      const mdChs = await this.getMangaDexChapters(mdHitsRes.value[0].id);
      if (mdChs.length > globalChapters.length) globalChapters = mdChs;
    }

    if (preferredServer === 'bx3' && globalChapters.length > 0) {
      return globalChapters;
    }

    if (arabicChapters.length === 0) {
      return globalChapters;
    }

    // Hybrid Merge: Keep all Arabic chapters (1..N) and append any newer chapters (> N) from Global HD!
    if (globalChapters.length > 0) {
      const existingNums = new Set(arabicChapters.map((c) => parseFloat(c.chapterNumber)));
      const extraGlobal = globalChapters.filter((g) => {
        const num = parseFloat(g.chapterNumber);
        return !Number.isNaN(num) && !existingNums.has(num);
      });
      if (extraGlobal.length > 0) {
        return [...arabicChapters, ...extraGlobal].sort(
          (a, b) => parseFloat(a.chapterNumber) - parseFloat(b.chapterNumber)
        );
      }
    }

    return arabicChapters;
  }

  /* =========================================================================
   * UNIFIED MULTI-SERVER ROUTER (Hearbor 1 + Hearbor 2 + Hearbor 3)
   * ========================================================================= */

  /**
   * Resolves how a given series `id` maps to `bx1` (Olympus), `bx2` (3asq), and `bx3` (WeebCentral).
   */
  async resolveSeriesHandles(rawId) {
    const id = String(rawId || '').trim();
    const handles = { bx1: null, bx2: null, bx3: null };

    // 1. Check flagship map first
    if (FLAGSHIP_MANGA_MAP[id]) {
      const f = FLAGSHIP_MANGA_MAP[id];
      if (f.osSlug) handles.bx1 = f.osSlug;
      if (f.asqSlug) handles.bx2 = f.asqSlug;
      if (f.wcSeriesId) handles.bx3 = { seriesId: f.wcSeriesId, slug: f.wcSlug || id };
      return handles;
    }

    // 2. Check explicit prefixes (`mm:`, `az:`, `sw:`, `dt:`, `os:`, `asq:`, `wc:`, `al:`, `md:`)
    if (id.startsWith('mm:') || id.startsWith('az:') || id.startsWith('os:')) {
      handles.bx1 = id;
      return handles;
    }
    if (id.startsWith('sw:') || id.startsWith('dt:') || id.startsWith('asq:')) {
      handles.bx2 = id;
      return handles;
    }
    if (id.startsWith('al:') || id.startsWith('md:')) {
      handles.bx1 = id;
      handles.bx2 = id;
      handles.bx3 = id;
      return handles;
    }
    if (id.startsWith('wc:')) {
      const parts = id.slice(3).split(':');
      handles.bx3 = { seriesId: parts[0], slug: parts[1] || 'series' };
      return handles;
    }

    // 3. Otherwise treat `id` as a generic slug/title and probe all 3 servers in parallel
    const cleanQuery = id.replace(/-/g, ' ');
    const [osRes, asqRes, wcRes] = await Promise.allSettled([
      this.searchOlympus(cleanQuery),
      this.search3asq(cleanQuery),
      this.searchWeebCentral(cleanQuery)
    ]);

    if (osRes.status === 'fulfilled' && osRes.value.length > 0) {
      handles.bx1 = osRes.value[0].id.replace(/^os:/, '');
    }
    if (asqRes.status === 'fulfilled' && asqRes.value.length > 0) {
      handles.bx2 = asqRes.value[0].id.replace(/^asq:/, '');
    }
    if (wcRes.status === 'fulfilled' && wcRes.value.length > 0) {
      const parts = wcRes.value[0].id.replace(/^wc:/, '').split(':');
      handles.bx3 = { seriesId: parts[0], slug: parts[1] || 'series' };
    }

    return handles;
  }

  /**
   * Unified search across all 8 Hearbor Manga, Manhwa & Manhua engines + AniList Global Master Index (+100,000 works) + Synonym Expansion!
   */
  async searchArabicManga(query, serverFilter = 'all') {
    const q = String(query || '').trim();
    if (!q) return [];

    const tasks = [];
    if (serverFilter === 'all' || serverFilter === 'bx1') {
      tasks.push(this.searchMangaMello(q));
      tasks.push(this.searchAzorafly(q));
      tasks.push(this.searchOlympus(q));
    }
    if (serverFilter === 'all' || serverFilter === 'bx2') {
      tasks.push(this.searchMangaSwat(q));
      tasks.push(this.searchDilar(q));
      tasks.push(this.search3asq(q));
    }
    if (serverFilter === 'all' || serverFilter === 'bx3') {
      tasks.push(this.getAniListMasterCatalog(1, null, q));
      tasks.push(this.searchMangaDex(q, 16));
      tasks.push(this.searchWeebCentral(q));
    }

    const settled = await Promise.allSettled(tasks);
    const merged = [];
    const seenIds = new Set();
    const seenTitles = new Set();

    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        for (const item of res.value) {
          if (seenIds.has(item.id)) continue;
          const normTitle = String(item.title_en || item.title_ar || item.title || '').toLowerCase().trim();
          if (normTitle && seenTitles.has(normTitle) && item.id.startsWith('al:')) continue;
          seenIds.add(item.id);
          if (normTitle) seenTitles.add(normTitle);
          merged.push(item);
        }
      }
    }

    // Smart Synonym Expansion: if AniList found alternative synonyms for the query, also search Arabic engines by the primary synonym!
    const topAl = merged.find((it) => it.id?.startsWith('al:') && Array.isArray(it.synonyms) && it.synonyms.length > 0);
    if (topAl && merged.filter((m) => !m.id?.startsWith('al:')).length < 4) {
      const altName = topAl.synonyms.find((s) => s.toLowerCase() !== q.toLowerCase());
      if (altName) {
        const [altMm, altAz, altSw] = await Promise.allSettled([
          this.searchMangaMello(altName),
          this.searchAzorafly(altName),
          this.searchMangaSwat(altName)
        ]);
        for (const r of [altMm, altAz, altSw]) {
          if (r.status === 'fulfilled' && Array.isArray(r.value)) {
            for (const item of r.value) {
              if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                merged.unshift(item);
              }
            }
          }
        }
      }
    }

    return merged;
  }

  async searchManga(query, serverFilter = 'all') {
    return this.searchArabicManga(query, serverFilter);
  }

  /**
   * Unified chapter list fetcher with Smart Synonym Resolver & Hybrid Arabic + Global HD Chapter Completion.
   */
  async getArabicChapters(mangaId, preferredServer = '') {
    const id = String(mangaId || '').trim();
    if (!id) return [];

    // 0a. AniList Master Global Index ID (`al:{anilistId}`) -> Smart Multi-Title Synonym Resolver + Hybrid Merger
    if (id.startsWith('al:')) {
      const detail = await this.getAniListMangaDetails(id.slice(3));
      const candidates = detail?.synonyms?.length
        ? detail.synonyms
        : [detail?.title_en, detail?.title_ar].filter(Boolean);
      const resolved = await this.resolveChaptersByCandidateTitles(candidates, preferredServer);
      if (resolved.length > 0) return resolved;
      return [];
    }

    // 0b. MangaDex Official v5 ID (`md:{uuid}`)
    if (id.startsWith('md:')) {
      const mdId = id.slice(3);
      if (preferredServer !== 'bx3') {
        try {
          const { data } = await axios.get(`${MANGADEX_API}/manga/${encodeURIComponent(mdId)}`, { timeout: 7000 });
          const titleObj = data?.data?.attributes?.title || {};
          const altTitles = (data?.data?.attributes?.altTitles || []).flatMap((o) => Object.values(o));
          const candidates = [...Object.values(titleObj), ...altTitles].filter(Boolean);
          const resolved = await this.resolveChaptersByCandidateTitles(candidates.slice(0, 4), preferredServer);
          if (resolved.length > 0) return resolved;
        } catch (_) {}
      }
      return this.getMangaDexChapters(mdId);
    }

    // Direct prefixed IDs from Manga Peak engines
    if (id.startsWith('mm:')) {
      const chs = await this.getMangaMelloChapters(id.slice(3));
      if (chs.length > 0) return chs;
    }
    if (id.startsWith('az:')) {
      const chs = await this.getAzoraflyChapters(id.slice(3));
      if (chs.length > 0) return chs;
    }
    if (id.startsWith('sw:')) {
      const chs = await this.getMangaSwatChapters(id.slice(3));
      if (chs.length > 0) return chs;
    }
    if (id.startsWith('dt:')) {
      const dtId = id.slice(3);
      try {
        const { data } = await axios.get(`${DILAR_API}/series/${encodeURIComponent(dtId)}`, { timeout: 8000 });
        const candidates = [data?.title, data?.synonyms?.english, data?.synonyms?.arabic].filter(Boolean);
        const resolved = await this.resolveChaptersByCandidateTitles(candidates, preferredServer);
        if (resolved.length > 0) return resolved;
      } catch (_) {}
      return [];
    }

    // Direct prefixed IDs
    if (id.startsWith('os:') && (!preferredServer || preferredServer === 'bx1')) {
      return this.getOlympusChapters(id.slice(3));
    }
    if (id.startsWith('asq:') && (!preferredServer || preferredServer === 'bx2')) {
      return this.get3asqChapters(id.slice(4));
    }
    if (id.startsWith('wc:') && (!preferredServer || preferredServer === 'bx3')) {
      const [seriesId, slug] = id.slice(3).split(':');
      return this.getWeebCentralChapters(seriesId, slug);
    }

    const handles = await this.resolveSeriesHandles(id);

    // Build ordered server priority based on user selection
    const order =
      preferredServer === 'bx1'
        ? ['bx1', 'bx2', 'bx3']
        : preferredServer === 'bx2'
        ? ['bx2', 'bx1', 'bx3']
        : preferredServer === 'bx3'
        ? ['bx3', 'bx1', 'bx2']
        : ['bx1', 'bx2', 'bx3'];

    for (const srv of order) {
      if (srv === 'bx1' && handles.bx1) {
        const chs = await this.getOlympusChapters(String(handles.bx1).replace(/^os:/, ''));
        if (chs.length > 0) return chs;
      }
      if (srv === 'bx2' && handles.bx2) {
        const chs = await this.get3asqChapters(String(handles.bx2).replace(/^asq:/, ''));
        if (chs.length > 0) return chs;
      }
      if (srv === 'bx3' && handles.bx3) {
        const chs = await this.getWeebCentralChapters(handles.bx3.seriesId, handles.bx3.slug);
        if (chs.length > 0) return chs;
      }
    }

    return [];
  }

  async getChapters(mangaId, preferredServer = '') {
    return this.getArabicChapters(mangaId, preferredServer);
  }

  /**
   * Unified chapter pages fetcher supporting all Hearbor servers:
   * - `mm:{mangaId}:{chId}` -> Hearbor 1 (MangaMello Plus)
   * - `az:{chId}` -> Hearbor 1 (Azorafly)
   * - `sw:{chId}` -> Hearbor 2 (MangaSwat)
   * - `os:{slug}:{ch}` -> Hearbor 1 (OlympusStaff)
   * - `asq:{slug}:{ch}` -> Hearbor 2 (3asq)
   * - `wc:{chId}` -> Hearbor 3 (WeebCentral)
   * - `md:{chUuid}` -> Hearbor 3 (MangaDex Official v5)
   * - `{flagshipSlug}:{chNum}` -> Auto-resolves across Hearbor 1 -> Hearbor 2 -> Hearbor 3
   */
  async getArabicChapterPages(chapterIdentifier, preferredServer = '') {
    const raw = String(chapterIdentifier || '').trim();
    if (!raw) return [];

    // 00. Explicit MangaDex chapter ID (`md:{chUuid}`)
    if (raw.startsWith('md:')) {
      const mdChId = raw.slice(3).split(':')[0];
      const pages = await this.getMangaDexChapterPages(mdChId);
      if (pages.length > 0) return pages;
    }

    // 0a. Explicit MangaMello Plus chapter ID (`mm:{mangaId}:{chId}`)
    if (raw.startsWith('mm:')) {
      const parts = raw.split(':');
      const mmMangaId = parts[1];
      const mmChId = parts[2];
      const pages = await this.getMangaMelloChapterPages(mmMangaId, mmChId);
      if (pages.length > 0) return pages;
    }

    // 0b. Explicit Azorafly chapter ID (`az:{chId}`)
    if (raw.startsWith('az:')) {
      const azChId = raw.slice(3).split(':')[0];
      const pages = await this.getAzoraflyChapterPages(azChId);
      if (pages.length > 0) return pages;
    }

    // 0c. Explicit MangaSwat chapter ID (`sw:{chId}`)
    if (raw.startsWith('sw:')) {
      const swChId = raw.slice(3).split(':')[0];
      const pages = await this.getMangaSwatChapterPages(swChId);
      if (pages.length > 0) return pages;
    }

    // 1. Explicit OlympusStaff chapter ID (`os:{slug}:{ch}`)
    if (raw.startsWith('os:')) {
      const parts = raw.split(':');
      const osSlug = parts[1];
      const chNum = parts.slice(2).join(':');
      const pages = await this.getOlympusChapterPages(osSlug, chNum);
      if (pages.length > 0) return pages;
    }

    // 2. Explicit 3asq chapter ID (`asq:{slug}:{ch}`)
    if (raw.startsWith('asq:')) {
      const parts = raw.split(':');
      const asqSlug = parts[1];
      const chSlug = parts.slice(2).join(':');
      const pages = await this.get3asqChapterPages(asqSlug, chSlug);
      if (pages.length > 0) return pages;
    }

    // 3. Explicit WeebCentral chapter ID (`wc:{chId}`)
    if (raw.startsWith('wc:')) {
      const chId = raw.slice(3).split(':')[0];
      const pages = await this.getWeebCentralChapterPages(chId);
      if (pages.length > 0) return pages;
    }

    // 4. Generic `{mangaSlug}:{chapterNumber}` (e.g. `solo-leveling:1` or `one-piece:1100`)
    const lastColon = raw.lastIndexOf(':');
    const mangaId = lastColon > 0 ? raw.slice(0, lastColon) : raw;
    const chNum = lastColon > 0 ? raw.slice(lastColon + 1) : '1';

    const handles = await this.resolveSeriesHandles(mangaId);
    const order =
      preferredServer === 'bx1'
        ? ['bx1', 'bx2', 'bx3']
        : preferredServer === 'bx2'
        ? ['bx2', 'bx1', 'bx3']
        : preferredServer === 'bx3'
        ? ['bx3', 'bx1', 'bx2']
        : ['bx1', 'bx2', 'bx3'];

    for (const srv of order) {
      if (srv === 'bx1' && handles.bx1) {
        const pages = await this.getOlympusChapterPages(handles.bx1, chNum);
        if (pages.length > 0) return pages;
      }
      if (srv === 'bx2' && handles.bx2) {
        const pages = await this.get3asqChapterPages(handles.bx2, chNum);
        if (pages.length > 0) return pages;
      }
      if (srv === 'bx3' && handles.bx3) {
        const chs = await this.getWeebCentralChapters(handles.bx3.seriesId, handles.bx3.slug);
        if (chs.length > 0) {
          const target =
            chs.find((c) => String(c.chapterNumber) === String(chNum)) ||
            chs[chs.length - 1];
          if (target) {
            const pages = await this.getWeebCentralChapterPages(target.slug);
            if (pages.length > 0) return pages;
          }
        }
      }
    }

    return [];
  }

  async getChapterPages(chapterIdentifier, preferredServer = '') {
    return this.getArabicChapterPages(chapterIdentifier, preferredServer);
  }

  /**
   * Returns metadata for any series ID (flagship or dynamic `os:` / `asq:` / `wc:`)
   * along with which servers (`bx1`, `bx2`, `bx3`) have chapters for it.
   */
  async getSeriesMetadata(id) {
    const cleanId = String(id || '').trim();
    if (FLAGSHIP_MANGA_MAP[cleanId]) {
      const f = FLAGSHIP_MANGA_MAP[cleanId];
      return {
        id: cleanId,
        title_ar: f.title_ar,
        title_en: f.title_en,
        type: f.type,
        poster: f.poster,
        banner: f.banner,
        status: 'ONGOING',
        rating: null,
        chapters_count: 150,
        author: 'سيرفرات Hearbor الرسمية',
        description_ar: `اقرأ ${f.title_ar} مباشرة بجودة عالية عبر سيرفرات Hearbor 1 و Hearbor 2 و Hearbor 3.`,
        description_en: `Read ${f.title_en} directly on Hearbor 1, Hearbor 2, and Hearbor 3.`,
        genres: Array.isArray(f.genres) ? f.genres : [],
        release_year: null
      };
    }

    if (cleanId.startsWith('mm:')) {
      const details = await this.getMangaMelloDetails(cleanId.slice(3));
      if (details) return details;
    }

    if (cleanId.startsWith('az:')) {
      const parts = cleanId.slice(3).split(':');
      const slug = parts[1] || parts[0];
      const catalog = await this.getAzoraflyCatalog(1);
      const found = catalog.find((it) => it.id === cleanId);
      if (found) return found;
      return {
        id: cleanId,
        title_ar: slug.replace(/-/g, ' '),
        title_en: slug.replace(/-/g, ' '),
        type: 'MANHWA',
        poster: '',
        banner: '',
        status: 'ONGOING',
        rating: null,
        chapters_count: 80,
        author: 'سيرفر Hearbor 3',
        description_ar: 'متاح للقراءة المباشرة بالترجمة العربية عبر سيرفر Hearbor 1.',
        description_en: 'Available on Hearbor 1 Server.',
        genres: [],
        release_year: null
      };
    }

    if (cleanId.startsWith('sw:')) {
      const seriesId = cleanId.slice(3);
      try {
        const { data: s } = await axios.get(`${MANGASWAT_API}/series/${encodeURIComponent(seriesId)}/`, {
          headers: MANGASWAT_HEADERS,
          timeout: 10000
        });
        if (s?.title) {
          const poster = String(s.poster?.medium || s.poster?.thumbnail || '').trim();
          return {
            id: cleanId,
            title_ar: s.title,
            title_en: s.title,
            type: 'MANHWA',
            poster,
            banner: poster,
            status: 'ONGOING',
            rating: null,
            chapters_count: 90,
            author: 'سيرفر Hearbor 4',
            description_ar: s.description || `اقرأ ${s.title} بالترجمة العربية عبر سيرفر Hearbor 2.`,
            description_en: s.description || `Read ${s.title} on Hearbor 2.`,
            genres: Array.isArray(s.genres) ? s.genres.map((g) => g.name).filter(Boolean) : [],
            release_year: null
          };
        }
      } catch (_) {}
    }

    if (cleanId.startsWith('dt:')) {
      const dtId = cleanId.slice(3);
      try {
        const { data: s } = await axios.get(`${DILAR_API}/series/${encodeURIComponent(dtId)}`, { timeout: 10000 });
        if (s?.title) {
          const cover = String(s.cover || '').trim();
          const poster = cover.startsWith('http')
            ? cover
            : cover
            ? `https://dilar.tube/uploads/manga/cover/${dtId}/large_${cover.replace(/\.[^.]+$/, '.webp')}`
            : '';
          return {
            id: cleanId,
            title_ar: s.synonyms?.arabic || s.title,
            title_en: s.title,
            type: 'MANHWA',
            poster,
            banner: poster,
            status: 'ONGOING',
            rating: null,
            chapters_count: 60,
            author: 'سيرفر Hearbor 2',
            description_ar: s.summary || `اقرأ ${s.title} بالترجمة العربية عبر سيرفر Hearbor 2.`,
            description_en: s.summary || `Read ${s.title} on Hearbor 2.`,
            genres: [],
            release_year: null
          };
        }
      } catch (_) {}
    }

    if (cleanId.startsWith('os:')) {
      const slug = cleanId.slice(3);
      const catalog = await this.getOlympusCatalog(1);
      const found = catalog.find((it) => it.id === cleanId);
      if (found) return found;
      return {
        id: cleanId,
        title_ar: slug.replace(/-/g, ' '),
        title_en: slug.replace(/-/g, ' '),
        type: 'MANHWA',
        poster: 'https://olympustaff.com/images/manga/thumbnail_b05147568d52f22c663c084172fc0dac.png',
        banner: 'https://olympustaff.com/images/manga/thumbnail_b05147568d52f22c663c084172fc0dac.png',
        status: 'ONGOING',
        rating: null,
        chapters_count: 100,
        author: 'سيرفر Hearbor 1',
        description_ar: 'متاح للقراءة المباشرة بالترجمة العربية عبر سيرفر Hearbor 1.',
        description_en: 'Available on Hearbor 1 Server.',
        genres: [],
        release_year: null
      };
    }

    if (cleanId.startsWith('asq:')) {
      const slug = cleanId.slice(4);
      const catalog = await this.get3asqCatalog();
      const found = catalog.find((it) => it.id === cleanId);
      if (found) return found;
      return {
        id: cleanId,
        title_ar: slug.replace(/-/g, ' '),
        title_en: slug.replace(/-/g, ' '),
        type: 'MANGA',
        poster: 'https://temp.compsci88.com/cover/fallback/01J76XY7E9FNDZ1DBBM6PBJPFK.jpg',
        banner: 'https://temp.compsci88.com/cover/fallback/01J76XY7E9FNDZ1DBBM6PBJPFK.jpg',
        status: 'ONGOING',
        rating: null,
        chapters_count: 100,
        author: 'سيرفر Hearbor 2',
        description_ar: 'متاح للقراءة المباشرة بالترجمة العربية عبر سيرفر Hearbor 2.',
        description_en: 'Available on Hearbor 2 Server.',
        genres: [],
        release_year: null
      };
    }

    if (cleanId.startsWith('al:')) {
      const detail = await this.getAniListMangaDetails(cleanId.slice(3));
      if (detail) return detail;
    }

    if (cleanId.startsWith('md:')) {
      const mdId = cleanId.slice(3);
      try {
        const { data } = await axios.get(`${MANGADEX_API}/manga/${encodeURIComponent(mdId)}?includes[]=cover_art`, {
          timeout: 8000
        });
        const item = data?.data;
        if (item) {
          const attrs = item.attributes || {};
          const titleObj = attrs.title || {};
          const titleEn = titleObj.en || Object.values(titleObj)[0] || 'Manga';
          const coverRel = (item.relationships || []).find((r) => r.type === 'cover_art');
          const fileName = coverRel?.attributes?.fileName;
          const poster = fileName ? `https://uploads.mangadex.org/covers/${item.id}/${fileName}.512.jpg` : '';
          return {
            id: cleanId,
            title_ar: titleEn,
            title_en: titleEn,
            type: attrs.originalLanguage === 'ko' ? 'MANHWA' : attrs.originalLanguage?.startsWith('zh') ? 'MANHUA' : 'MANGA',
            poster,
            banner: poster,
            status: attrs.status === 'completed' ? 'COMPLETED' : 'ONGOING',
            rating: null,
            chapters_count: Number(attrs.lastChapter) || 100,
            author: 'سيرفر Hearbor 3 (Global HD)',
            description_ar: attrs.description?.ar || attrs.description?.en || `${titleEn} — متاح عبر سيرفر Hearbor 3.`,
            description_en: attrs.description?.en || `${titleEn} — Available on Hearbor 3.`,
            genres: [],
            release_year: attrs.year || 2025
          };
        }
      } catch (_) {}
    }

    if (cleanId.startsWith('wc:')) {
      const [seriesId, slug = 'Manga'] = cleanId.slice(3).split(':');
      const title = slug.replace(/-/g, ' ');
      const poster = `https://temp.compsci88.com/cover/fallback/${seriesId}.jpg`;
      return {
        id: cleanId,
        title_ar: title,
        title_en: title,
        type: 'MANGA',
        poster,
        banner: poster,
        status: 'ONGOING',
        rating: null,
        chapters_count: 120,
        author: 'سيرفر Hearbor 3',
        description_ar: `${title} — متاح بدقة أصلية كاملة عبر سيرفر Hearbor 3.`,
        description_en: `${title} — Available in Full HD on Hearbor 3.`,
        genres: [],
        release_year: null
      };
    }

    return null;
  }

  /* =========================================================================
   * ARABIC LIGHT NOVELS ENGINE (preserved for backward compatibility)
   * ========================================================================= */
  async getNovelChapters(novelSlug) {
    return Array.from({ length: 12 }, (_, idx) => {
      const num = idx + 1;
      return {
        chapterId: `${novelSlug}__ch__${num}`,
        chapterNumber: String(num),
        title: `الفصل ${num}: بداية الأساطير والظلال`,
        releaseDate: '2026'
      };
    });
  }

  async getNovelChapterContent(chapterIdentifier) {
    const parts = String(chapterIdentifier || '').split('__ch__');
    const chNum = parseInt(parts[1], 10) || 1;
    return {
      title: `الفصل ${chNum}`,
      content: `الفصل ${chNum} من أرشيف سيرفرات Hearbor للروايات العربية المترجمة.`
    };
  }
}

export const mangalikService = new MangalikService();
