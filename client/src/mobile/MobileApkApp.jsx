import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { BLACK_X_MOTION_THEMES } from '../components/BlackXSplashVortex.jsx';
import BxIcon, { stripEmoji } from './BxIcon.jsx';
import './nuvioTokens.css';
import './mobileUi.css';
import './desktop.css';
import ToastHost from './ToastHost.jsx';
import { showToastMessage } from './toastStore.js';
import {
  adminBroadcast,
  adminDeleteCode,
  adminDeleteRequest,
  adminGenerateCodes,
  adminGetVip,
  adminInspectUser,
  adminPin,
  adminSetEnforced,
  adminSetUserVip,
  apiErrorMessage,
  deleteAccount as apkDeleteAccount,
  fetchAppConfig,
  fetchMe,
  fetchSkipTimes,
  loadSession,
  loginWithGoogle,
  loginWithPassword,
  pushAccountState,
  readCachedConfig,
  redeemVipCode,
  registerAccount,
  sendDeveloperRequest,
  signOut as apkSignOut,
  updateAccountProfile
} from './apkApi.js';
import { animeSlugOf, clearPositions, episodeKey, flushPositions, formatClock, getPosition, mergePositions, positionEntries, positionsForSync, savePosition } from './resumeStore.js';
import { checkFollowedTitles, lastAlertRun } from './episodeAlerts.js';
import { attachHls, needsHlsJs } from './hlsPlayer.js';
import { haptic, hapticsEnabled, setHapticsEnabled } from './haptics.js';
import {
  getHiddenIds,
  isHiddenAnime,
  isHiddenManga,
  refreshHiddenIds,
  visibleGenres,
  withAlgoliaExclusions
} from './contentFilter.js';
import { coverForMode, useDataSaver } from './dataSaver.js';
import { installPointerTracker, transitionBackToCard, transitionFromTappedPoster } from './viewTransition.js';
import SearchBox from './SearchBox.jsx';
import { SkeletonGrid, SkeletonList } from './Skeleton.jsx';
import PullToRefresh from './PullToRefresh.jsx';
import useSwipeDismiss from './useSwipeDismiss.js';
import HomeTab from './HomeTab.jsx';
import PlayerControls from './PlayerControls.jsx';
import BottomSheet from './BottomSheet.jsx';
import usePresence from './usePresence.js';
import ScheduleTab from './ScheduleTab.jsx';
import AlertsSheet from './AlertsSheet.jsx';
import CommunityTab from './CommunityTab.jsx';
import VipGate from './VipGate.jsx';
import AccessMenu from './AccessMenu.jsx';
import StoryPreview from './StoryPreview.jsx';
import MangaTab from './MangaTab.jsx';
import ProfileTab, { profilePageTitle } from './profile/ProfileTab.jsx';
import MobileDock from './MobileDock.jsx';
import PosterCard from './PosterCard.jsx';
import SectionHead from './SectionHead.jsx';
import FilterSheet, { SORT_OPTIONS, activeFilterCount } from './FilterSheet.jsx';
import { navigateStack, navigateWithMotion, pageEnterClass } from './tabMotion.js';
import { todayScheduleId } from './scheduleDays.js';
import { airingFor, buildScheduleDay, fetchAiringTimes } from './airingSchedule.js';
import { NextEpisodeCountdown, SkipSegmentOverlay } from './PlayerExtras.jsx';
import useWatchParty from './useWatchParty.js';
import PartyPanel, { PartyReactions } from './PartyPanel.jsx';
import { createPartyTransport, partyDisplayName, partyMemberId } from './watchParty.js';
import {
  DANMAKU_MAX,
  FEED_DOC,
  FEED_MAX,
  REVIEWS_MAX,
  addPostReply,
  createSharedListStore,
  likedByMe,
  prependItem,
  setPostLike,
  sharedItemId
} from './sharedLists.js';
import HoverPreview from './HoverPreview.jsx';
import CommandPalette from './CommandPalette.jsx';
import ShortcutsSheet from './ShortcutsSheet.jsx';
import DeveloperPanel from './profile/DeveloperPanel.jsx';
import { applyPageMeta, pageMetaFor } from './pageMeta.js';
import { LEGAL_DOCS } from '../legal/legalContent.js';
import { openInNewTab, posterHref, setPosterHrefBuilder } from './posterLinks.js';
import { buildAlarmList, nativeAlarmsSupported, scheduleNativeAlarms } from './nativeAlarms.js';
import { SPLASH_SOUND_KEY } from './splashPrefs.js';
import {
  WEB_APK_PATH,
  enterWebFullscreen,
  exitWebFullscreen,
  isWebApp,
  onWebFullscreenExit,
  openComputerVersion,
  rememberWebLanguage
} from './webApp.js';
import { installWebHistory, syncWebHistory } from './webHistory.js';
import { parseWebLocation, webUrlFor } from './webRoutes.js';
import {
  BX_APK_DOWNLOAD_URL,
  BX_APK_VERSION,
  BX_PUBLIC_ORIGIN,
  BX_MANGA_SEARCH_ONLY_TAB,
  BX_MANGA_SERVER_TABS,
  bxRequestJson,
  fetchBxSourceIds,
  fetchMobileAnimeSearch,
  fetchMobileChapterPages,
  fetchMobileEpisodeServers,
  fetchMobileEpisodes,
  fetchMobileMangaChapters,
  fetchMobileMangaList,
  fetchPopularMangaTitles,
  findBxMangaByTitle,
  inferAnimeSource,
  mapBxMangaItem,
  mapShowToMobileAnime,
  resolveMobileEpisodeServer,
  witcherSlug
} from './bxServers.js';

/**
 * BLACK X Mobile (Android APK)
 * Completely independent Smartphone UI inspired by Anime Witcher, elevated with Pure AMOLED Pitch-Black (#000000)
 * Same catalogue, servers and accounts as the website; tabs live in HomeTab/ScheduleTab + this file,
 * Webtoon Reader, and Real-Time Cloud Sync with the BLACK X Website Users & Anime Database.
 *
 * Servers: since v15 every anime episode/server and manga chapter/page request goes through the
 * website API (./bxServers.js), so the app always lists the same servers as the website.
 */

// 1. Anime catalogue index (the same Algolia index the website's BLACK X 1 catalogue reads)
const ALGOLIA_APP_ID = 'QVHT7NPEJG';
const ALGOLIA_API_KEY = 'ce13098070fa521b536571bafbcfc083';
const ALGOLIA_BASE = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes`;

// 2. Shared BLACK X Website Users, Favorites, Watch Progress & Community Cloud Database
const BX_PROJECT = 'spry-oxide-1h7sp';
const BX_DB = 'ai-studio-blackxanime-e47e1ba2-315f-4c3b-8557-71352813f36c';
const BX_KEY = 'AIzaSyD4yG_ljN1S8TfwC33E4Z0o499MYC71eUE';
const BX_SETTINGS_BASE = `https://firestore.googleapis.com/v1/projects/${BX_PROJECT}/databases/${BX_DB}/documents/settings`;
// Community feed, timed comments, reviews: read the latest → change → write only if unchanged since.
const sharedLists = createSharedListStore({ base: BX_SETTINGS_BASE, key: BX_KEY });

const GENRE_CHIPS = [
  { id: 'all', ar: 'الكل', en: 'All', tag: '' },
  { id: 'action', ar: 'أكشن', en: 'Action', tag: 'اكشن' },
  { id: 'comedy', ar: 'كوميدي', en: 'Comedy', tag: 'كوميدي' },
  { id: 'fantasy', ar: 'خيال', en: 'Fantasy', tag: 'خيال' },
  { id: 'adventure', ar: 'مغامرات', en: 'Adventure', tag: 'مغامرات' },
  { id: 'drama', ar: 'دراما', en: 'Drama', tag: 'دراما' },
  { id: 'shounen', ar: 'شونين', en: 'Shounen', tag: 'شونين' },
  { id: 'romance', ar: 'رومانسي', en: 'Romance', tag: 'رومانسي' },
  { id: 'scifi', ar: 'خيال علمي', en: 'Sci-Fi', tag: 'خيال علمي' },
  { id: 'school', ar: 'مدرسي', en: 'School', tag: 'مدرسي' },
  { id: 'supernatural', ar: 'خارق للطبيعة', en: 'Supernatural', tag: 'خارق للطبيعة' },
  { id: 'seinen', ar: 'سينين', en: 'Seinen', tag: 'سينين' },
  { id: 'mystery', ar: 'غموض', en: 'Mystery', tag: 'غموض' },
  { id: 'historical', ar: 'تاريخي', en: 'Historical', tag: 'تاريخي' },
  // Isekai («عالم مختلف»), Ecchi and Harem are hidden from the whole app: see contentFilter.js
  { id: 'superpower', ar: 'قوة خارقة', en: 'Super Power', tag: 'قوة خارقة' },
  { id: 'military', ar: 'عسكري', en: 'Military', tag: 'عسكري' },
  { id: 'sports', ar: 'رياضي', en: 'Sports', tag: 'رياضي' },
  { id: 'thriller', ar: 'تشويق', en: 'Thriller', tag: 'تشويق' },
  { id: 'slice', ar: 'شريحة من الحياة', en: 'Slice of Life', tag: 'شريحة من الحياة' },
  { id: 'horror', ar: 'رعب', en: 'Horror', tag: 'رعب' },
  { id: 'psychological', ar: 'نفسي', en: 'Psychological', tag: 'نفسي' },
  { id: 'gore', ar: 'دموي', en: 'Gore', tag: 'دموي' },
  { id: 'martial', ar: 'فنون قتالية', en: 'Martial Arts', tag: 'فنون قتالية' },
  { id: 'samurai', ar: 'ساموراي', en: 'Samurai', tag: 'ساموراي' },
  { id: 'vampire', ar: 'مصاصي دماء', en: 'Vampire', tag: 'مصاصي دماء' }
];

const RECENT_SEARCHES_KEY = 'bx_mob_recent_searches';

const TOPBAR_TITLES = {
  schedule: { ar: 'جدول الحلقات', en: 'Planning' },
  manga: { ar: 'المانجا', en: 'Manga' },
  community: { ar: 'المجتمع', en: 'Communauté' },
  profile: { ar: 'حسابي', en: 'Profil' }
};

const HOME_GENRES = GENRE_CHIPS.filter((g) => g.id !== 'all').slice(0, 14);

const TYPE_FILTERS = [
  { id: 'all', ar: 'الكل', en: 'All', facet: '' },
  { id: 'tv', ar: 'مسلسلات', en: 'TV Series', facet: 'type:مسلسل' },
  { id: 'movie', ar: 'أفلام', en: 'Movies', facet: 'type:فيلم' },
  { id: 'ova', ar: 'أوفا', en: 'OVA', facet: 'type:اوفا' },
  { id: 'special', ar: 'خاصة', en: 'Specials', facet: 'type:خاصة' },
  { id: 'ona', ar: 'أونا', en: 'ONA', facet: 'type:اونا' }
];

const STATE_FILTERS = [
  { id: 'all', ar: 'الكل', en: 'All', facet: '' },
  { id: 'airing', ar: 'مستمر الآن', en: 'Airing Now', facet: 'details.state:مستمر' },
  { id: 'completed', ar: 'مكتمل', en: 'Completed', facet: 'details.state:مكتمل' },
  { id: 'upcoming', ar: 'قريباً', en: 'Upcoming', facet: 'details.state:لم يتم بثه بعد' }
];

const STUDIO_FILTERS = [
  { id: 'all', ar: 'الكل', en: 'All', facet: '' },
  { id: 'mappa', label: 'MAPPA', facet: 'details.studio:MAPPA' },
  { id: 'ufotable', label: 'ufotable', facet: 'details.studio:ufotable' },
  { id: 'madhouse', label: 'Madhouse', facet: 'details.studio:Madhouse' },
  { id: 'toei', label: 'Toei Animation', facet: 'details.studio:Toei Animation' },
  { id: 'bones', label: 'Bones', facet: 'details.studio:Bones' },
  { id: 'wit', label: 'Wit Studio', facet: 'details.studio:Wit Studio' },
  { id: 'clover', label: 'CloverWorks', facet: 'details.studio:CloverWorks' },
  { id: 'a1', label: 'A-1 Pictures', facet: 'details.studio:A-1 Pictures' },
  { id: 'pierrot', label: 'Studio Pierrot', facet: 'details.studio:Studio Pierrot' },
  { id: 'kyoto', label: 'Kyoto Animation', facet: 'details.studio:Kyoto Animation' },
  { id: 'ig', label: 'Production I.G', facet: 'details.studio:Production I.G' }
];

// Display names of the episode servers (no speed / quality claims: the player shows each
// server's real quality next to its name).
const SERVER_LABELS = {
  PD_DEV: { nameAr: 'BLACK X 1 Ultra', nameEn: 'BLACK X 1 Ultra' },
  PD_NET: { nameAr: 'BLACK X 2 Mirror', nameEn: 'BLACK X 2 Mirror' },
  SF: { nameAr: 'BLACK X 3 Turbo', nameEn: 'BLACK X 3 Turbo' },
  AA: { nameAr: 'BLACK X 4 Cloud', nameEn: 'BLACK X 4 Cloud' },
  PD: { nameAr: 'BLACK X 5 Direct', nameEn: 'BLACK X 5 Direct' },
  MF2: { nameAr: 'BLACK X 6 Pro', nameEn: 'BLACK X 6 Pro' },
  MF: { nameAr: 'BLACK X 7 Plus', nameEn: 'BLACK X 7 Plus' },
  ST: { nameAr: 'BLACK X 8 HD', nameEn: 'BLACK X 8 HD' }
};

/** Scroll to the top at once (html has `scroll-behavior: smooth`, which a tab switch must skip). */
function jumpToTop() {
  try {
    const root = document.documentElement;
    const prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = prev;
  } catch (_) {}
}

function cleanCloudKey(prefix, val) {
  const safe = String(val || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '_');
  return `${prefix}_${safe}`.slice(0, 120);
}

async function queryAlgoliaRaw(indexName, payload = {}) {
  const res = await fetch(`${ALGOLIA_BASE}/${encodeURIComponent(indexName)}/query`, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Algolia ${res.status}`);
  return res.json();
}

/**
 * Every anime list in the app goes through here. The hidden genres (contentFilter.js) are
 * excluded by Algolia itself, so totals and pages stay real. Hits are checked once more (tags
 * and hidden ids): the `recent` index keeps tags on its records but cannot facet on them, and
 * the index could one day spell a tag differently.
 */
async function queryAlgolia(indexName, payload = {}) {
  const res = await queryAlgoliaRaw(indexName, withAlgoliaExclusions(payload));
  if (res && Array.isArray(res.hits)) res.hits = res.hits.filter((hit) => !isHiddenAnime(hit));
  return res;
}

/** One catalogue record by objectID (Algolia getObject), or null. */
async function fetchAnimeRecord(objectID) {
  const res = await fetch(`${ALGOLIA_BASE}/series_fav_count_desc/${encodeURIComponent(objectID)}`, {
    headers: { 'X-Algolia-Application-Id': ALGOLIA_APP_ID, 'X-Algolia-API-Key': ALGOLIA_API_KEY }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Algolia ${res.status}`);
  const hit = await res.json();
  return hit && hit.objectID ? hit : null;
}

/** Shown when a hidden title is reached anyway (old saved entry, other server). */
const hiddenTitleMessage = () => {
  const ar = (localStorage.getItem('bx_mob_lang') || 'ar') === 'ar';
  if (isWebApp()) return ar ? 'العمل ده مش متاح على BLACK X' : 'This title is not available on BLACK X';
  return ar ? 'العمل ده مش متاح في التطبيق' : 'This title is not available in the app';
};

function formatAnimeHit(hit) {
  if (!hit || !hit.objectID) return null;
  const objectID = String(hit.objectID);
  const titleRomaji = hit.name || objectID;
  const titleEn = hit.details?.english_title || titleRomaji;
  const poster =
    hit.aniList_poster?.large ||
    hit.poster?.large ||
    hit.poster_uri ||
    hit.aniList_poster?.medium ||
    hit.poster?.medium ||
    '';
  const banner = hit.cover_uri || hit.aniList_poster?.large || hit.poster?.large || poster;
  const malMean = Number(hit.details?.mal_mean || hit.rating?.rate || 0);
  const rating = malMean > 0 ? (malMean > 10 ? (malMean / 10).toFixed(1) : malMean.toFixed(1)) : '';

  return {
    objectID,
    slug: `aw-${objectID.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    malId: hit.mal_id || null,
    titleRomaji,
    titleEn,
    titleAr: titleRomaji,
    poster,
    banner,
    storyAr: hit.story || hit.story_en || 'مفيش ملخص للعمل ده لسه.',
    storyEn: hit.story_en || hit.story || '',
    tags: Array.isArray(hit.tags) ? hit.tags : [],
    type: hit.type || '',
    state: hit.details?.state || '',
    year: hit.details?.year && hit.details.year !== '0' ? hit.details.year : '',
    season: hit.details?.season && !String(hit.details.season).includes('undefined') ? hit.details.season : '',
    studio: Array.isArray(hit.details?.studio) ? hit.details.studio.join(' • ') : '',
    age: hit.details?.age || '',
    duration: hit.duration || '',
    showTime: hit.show_time || '',
    relatedIds: Array.isArray(hit.related_anime_ids) ? hit.related_anime_ids : [],
    otherNames: Array.isArray(hit.other_names) ? hit.other_names : [],
    views: Number(hit.views || hit.statictes?.fav_count || 0),
    rating,
    youtubeId: hit.youtube_video_id || null
  };
}

/**
 * Dispatch a REAL Android OS Status-Bar & Heads-Up Notification to the user's phone!
 */
export function dispatchPhoneNotification(title, body, notifId = 0) {
  try {
    if (typeof window !== 'undefined' && window.BlackXNativeAuth?.requestNotificationPermission) {
      window.BlackXNativeAuth.requestNotificationPermission();
    }
    if (typeof window !== 'undefined' && window.BlackXNativeAuth?.sendPhoneNotification) {
      window.BlackXNativeAuth.sendPhoneNotification(
        String(title || 'BLACK X'),
        String(body || ''),
        Number(notifId) || Math.floor(Date.now() % 100000)
      );
      return true;
    }
  } catch (_) {}

  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(String(title || 'BLACK X'), {
          body: String(body || ''),
          icon: '/blackx-logo.png'
        });
        return true;
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') {
            new Notification(String(title || 'BLACK X'), {
              body: String(body || ''),
              icon: '/blackx-logo.png'
            });
          }
        });
      }
    }
  } catch (_) {}
  return false;
}

export default function MobileApkApp() {
  // Website (webApp.js): the app interface the website serves on every device.
  const isWeb = isWebApp();
  // The page the address bar asked for when the app started (webRoutes.js), website only.
  const [webStart] = useState(() => (isWeb ? parseWebLocation(window.location.pathname, window.location.search) : null));
  const [lang, setLang] = useState(() => localStorage.getItem('bx_mob_lang') || 'fr');
  const [activeTab, setActiveTab] = useState(() => {
    if (webStart?.kind === 'tab') return webStart.tab;
    if (webStart?.kind === 'profile') return 'profile';
    if (webStart?.kind === 'manga') return 'manga';
    return 'home';
  }); // 'home' | 'catalog' | 'schedule' | 'manga' | 'community' | 'profile'

  // Home & Catalog States
  const [popularList, setPopularList] = useState([]);
  const [latestList, setLatestList] = useState([]);
  const [topRankedList, setTopRankedList] = useState([]);
  const [todayList, setTodayList] = useState([]); // airing today (schedule of this weekday)
  const [moviesList, setMoviesList] = useState([]);
  const [airingList, setAiringList] = useState([]);
  const [homeLoading, setHomeLoading] = useState(true);

  // Catalog Browse & Search States (Multi-Facet: Sort + Type + State + Studio + Genre)
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(null); // real Algolia nbHits / search result count
  const [bxAnimeTotal, setBxAnimeTotal] = useState(null); // website /api/stream/stats
  const [catalogPage, setCatalogPage] = useState(0);
  // Pages Algolia will actually serve (nbPages). The index only pages through its first
  // 1,000 hits (paginationLimitedTo), so this stops there even when nbHits is 7,000+.
  const [catalogPages, setCatalogPages] = useState(0);
  const [catalogSort, setCatalogSort] = useState('series_fav_count_desc');
  const [catalogGenre, setCatalogGenre] = useState(GENRE_CHIPS[0]);
  const [catalogType, setCatalogType] = useState(TYPE_FILTERS[0]);
  const [catalogState, setCatalogState] = useState(STATE_FILTERS[0]);
  const [catalogStudio, setCatalogStudio] = useState(STUDIO_FILTERS[0]);
  const [searchQuery, setSearchQuery] = useState(() => (webStart?.kind === 'tab' && webStart.tab === 'catalog' ? webStart.query || '' : ''));
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [loadingMoreCatalog, setLoadingMoreCatalog] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [playerMoreOpen, setPlayerMoreOpen] = useState(false); // playback settings sheet (full screen)
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter((q) => typeof q === 'string').slice(0, 8) : [];
    } catch (_) {
      return [];
    }
  });

  // Weekly Airing Schedule States
  const [scheduleDay, setScheduleDay] = useState(() => todayScheduleId());
  const [scheduleItems, setScheduleItems] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  // Real next air time per MAL id (airingSchedule.js); empty until /api/anime/schedule answers.
  const [airingMap, setAiringMap] = useState(() => new Map());
  const airingMapRef = useRef(airingMap);
  airingMapRef.current = airingMap;

  // Active Anime Detail & Episode Player States
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [detailTab, setDetailTab] = useState('episodes'); // 'episodes' | 'characters' | 'relations' | 'reviews'
  const [animeEpisodes, setAnimeEpisodes] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [epSearchQuery, setEpSearchQuery] = useState('');
  const [epAscending, setEpAscending] = useState(true);
  const [hideFiller, setHideFiller] = useState(false);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [detailActionsExpanded, setDetailActionsExpanded] = useState(false);
  const [animeCharacters, setAnimeCharacters] = useState([]);
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [relatedAnimes, setRelatedAnimes] = useState([]);
  const [animeReviews, setAnimeReviews] = useState([]);
  const reviewsDocRef = useRef(''); // the reviews document of the title on screen
  const [newReviewText, setNewReviewText] = useState('');
  const newReviewScore = 10; // default score when no pillar was rated

  // Active Episode Video Player Sheet
  const [activeEpisode, setActiveEpisode] = useState(null);
  const [episodeServers, setEpisodeServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [playingVideoUrl, setPlayingVideoUrl] = useState('');
  const [resolvingVideo, setResolvingVideo] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [autoNextEp, setAutoNextEp] = useState(true);
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const [videoFitMode, setVideoFitMode] = useState('cover'); // 'cover' (full 20:9 screen) | 'contain' (16:9) | 'fill'
  const [skipRipple, setSkipRipple] = useState(null); // 'left' | 'right'
  const [videoTouchLocked, setVideoTouchLocked] = useState(false);
  const [videoBrightness, setVideoBrightness] = useState(100);
  const [videoVolume, setVideoVolume] = useState(100);
  const [gestureHud, setGestureHud] = useState(null); // { type: 'brightness' | 'volume', value: number } | null
  const [longPress2x, setLongPress2x] = useState(false);
  const videoRef = useRef(null);
  const gestureStartRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const gestureHudTimerRef = useRef(null);

  // Manga States (served by the website API: the same BLACK X manga servers as the website)
  const [mangaList, setMangaList] = useState([]);
  const [mangaSource, setMangaSource] = useState('all'); // website server id: 'all' | 'bx1' | 'bx2' | 'bx3' | 'bx4' (search only)
  const [mangaFilterType, setMangaFilterType] = useState('ALL'); // 'ALL' | 'MANHWA' | 'MANGA'
  // Quick-search chips of the manga tab: AniList's most popular manga (fetchPopularMangaTitles).
  const [mangaPopularTitles, setMangaPopularTitles] = useState([]);
  const [mangaPage, setMangaPage] = useState(1);
  const [mangaQuery, setMangaQuery] = useState(() => (webStart?.kind === 'tab' && webStart.tab === 'manga' ? webStart.query || '' : ''));
  const [mangaLoading, setMangaLoading] = useState(false);
  const [loadingMoreManga, setLoadingMoreManga] = useState(false);
  const [selectedManga, setSelectedManga] = useState(null);
  const [mangaChapters, setMangaChapters] = useState([]);
  const [mangaChaptersLoading, setMangaChaptersLoading] = useState(false);
  const [mangaChaptersError, setMangaChaptersError] = useState(''); // '' | 'empty' | 'not_found' | 'network'
  const [mangaServers, setMangaServers] = useState([]);
  const [mangaActiveServer, setMangaActiveServer] = useState('');
  const [mangaPagesError, setMangaPagesError] = useState(''); // '' | 'empty' | 'network'
  const [mangaSearchOnlyEnabled, setMangaSearchOnlyEnabled] = useState(false);
  const [episodesError, setEpisodesError] = useState(''); // '' | 'empty' | 'network'
  const mangaOpenSeqRef = useRef(0);
  const chapterReadSeqRef = useRef(0);
  const animeOpenSeqRef = useRef(0);
  const episodeServersSeqRef = useRef(0);
  const serverSelectSeqRef = useRef(0);
  const [activeMangaChapter, setActiveMangaChapter] = useState(null);
  const [mangaPages, setMangaPages] = useState([]);
  const [mangaPagesLoading, setMangaPagesLoading] = useState(false);
  const [readerMode, setReaderMode] = useState('webtoon'); // 'webtoon' | 'page'
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [readerZoom, setReaderZoom] = useState(100);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(0); // 0 | 1 | 2 | 3
  const [readerHudVisible, setReaderHudVisible] = useState(true);
  const [readerEyeFilter, setReaderEyeFilter] = useState('normal'); // 'normal' | 'warm' | 'contrast'
  const [volumeKeyScroll, setVolumeKeyScroll] = useState(true);
  const mangaReaderContainerRef = useRef(null);
  const prefetchedChapterRef = useRef({});
  const [globalBroadcastMsg, setGlobalBroadcastMsg] = useState('');
  const [devBroadcastInput, setDevBroadcastInput] = useState('');
  const [devBroadcastBusy, setDevBroadcastBusy] = useState(false);
  const [mangaHistory, setMangaHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bx_mob_manga_history') || '[]');
    } catch {
      return [];
    }
  });

  // Shared User Auth, Favorites, Watchlist, Watch History, Predictions & Community States
  const [user, setUser] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bx_mob_user') || 'null');
      if (saved) {
        const isDevAcc =
          saved.role === 'developer' ||
          (saved.email || '').toLowerCase() === 'mz0970mmz@gmail.com' ||
          (saved.username || '').toLowerCase() === 'developer' ||
          (saved.username || '').toLowerCase() === 'mz0970mmz';
        if (!isDevAcc && !localStorage.getItem('bx_mob_redeemed_vip_code') && !localStorage.getItem('bx_mob_session_v16')) {
          saved.vipTier = 'free';
          saved.vipStatus = 'Free Tier';
        }
      }
      return saved;
    } catch {
      return null;
    }
  });
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bx_mob_favorites') || '[]');
    } catch {
      return [];
    }
  });
  const [watchlistMap, setWatchlistMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bx_mob_watchlist_map') || '{}');
    } catch {
      return {};
    }
  });
  const [watchHistory, setWatchHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bx_mob_history') || '[]');
    } catch {
      return [];
    }
  });
  // Hidden BLACK X 1 ids (contentFilter.js) for saved entries that carry no genres.
  const [hiddenIds, setHiddenIds] = useState(() => getHiddenIds());
  const [userXp, setUserXp] = useState(() => Number(localStorage.getItem('bx_mob_xp') || 0));
  const [communityPosts, setCommunityPosts] = useState([]);
  const [newPostText, setNewPostText] = useState('');
  const [postCategory, setPostCategory] = useState('discussion'); // 'discussion' | 'recommend' | 'theory' | 'spoiler' | 'review'
  const [postIsSpoiler, setPostIsSpoiler] = useState(false);
  // The anime a new post is about (CommunityTab.jsx postAnimeSnapshot), or null.
  const [postAnime, setPostAnime] = useState(null);
  const [replyingToPostId, setReplyingToPostId] = useState(null);
  const [replyText, setReplyText] = useState('');

  // Profile & Personal Library States
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authUsername, setAuthUsername] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const oauthSessionIdRef = useRef('');
  // v16 state: server session, update banner, player extras, pull-to-refresh ticks
  const [sessionToken, setSessionToken] = useState(() => loadSession()?.token || null);
  const [apkRelease, setApkRelease] = useState(() => readCachedConfig()?.apk || null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [skipSegments, setSkipSegments] = useState([]);
  const [nextEpCountdown, setNextEpCountdown] = useState(null); // { anime, ep }
  const nextEpCountdownRef = useRef(null);
  nextEpCountdownRef.current = nextEpCountdown;
  const [hlsLevels, setHlsLevels] = useState([]);
  const [hlsLevel, setHlsLevel] = useState(-1);
  const [homeRefreshTick, setHomeRefreshTick] = useState(0);
  const [scheduleRefreshTick, setScheduleRefreshTick] = useState(0);
  const [hapticsOn, setHapticsOn] = useState(hapticsEnabled);
  const [splashSoundOn, setSplashSoundOn] = useState(() => localStorage.getItem(SPLASH_SOUND_KEY) === 'on');
  const [dataSaver, dataSaverPref, setDataSaverPref] = useDataSaver();
  const dataSaverRef = useRef(dataSaver);
  dataSaverRef.current = dataSaver;
  const detailsSheetRef = useRef(null);
  const playerPageRef = useRef(null);
  // Latest values for callbacks that run later (timers, native callbacks, sync).
  const refreshDoneRef = useRef(null);
  const latestRef = useRef({});
  latestRef.current = { user, favorites, watchHistory, watchlistMap, selectedAnime, activeEpisode };

  // Global Cloud-Synced VIP Enforcement & Developer Master Switch States
  const [globalVipEnforced, setGlobalVipEnforced] = useState(() => {
    const cached = localStorage.getItem('bx_mob_global_vip_enforced');
    return cached === null ? true : cached === 'true';
  });
  const [cloudVipCodes, setCloudVipCodes] = useState([]);
  const [vipRedeemCode, setVipRedeemCode] = useState('');
  const [vipRedeemBusy, setVipRedeemBusy] = useState(false);
  const [devToggleBusy, setDevToggleBusy] = useState(false);
  const [devGenTier, setDevGenTier] = useState('vip_monarch');
  const [devGenDays, setDevGenDays] = useState(30);
  const devGenUses = 1;
  const [devGenBusy, setDevGenBusy] = useState(false);
  const redeemedVipTier = '';
  const [motionPref, setMotionPref] = useState(() => localStorage.getItem('bx_motion_pref') || 'random');

  // ==================== v4.0 ULTIMATE ENGINE STATES ====================
  // 1. True Offline Vault (Chapters & Episodes saved to local storage / CacheStorage)
  const [offlineChapters, setOfflineChapters] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bx_mob_offline_chapters') || '[]');
    } catch {
      return [];
    }
  });
  const [savingOfflineChapter, setSavingOfflineChapter] = useState(false);

  // 2. Anime Ultra Player v4 (Audio Booster 200% + Bass, A-B Scene Loop, Smart Sleep Timer, Frame Capture)
  const [audioBoostMode, setAudioBoostMode] = useState('normal'); // 'normal' | 'boost150' | 'boost200' | 'voice'
  const [loopPointA, setLoopPointA] = useState(null);
  const [loopPointB, setLoopPointB] = useState(null);
  const [sleepTimerMode, setSleepTimerMode] = useState('off'); // 'off' | 'end_of_ep' | '15' | '30' | '60'
  const [sleepTimerRemainingSec, setSleepTimerRemainingSec] = useState(0);
  const audioCtxRef = useRef(null);
  const audioGainNodeRef = useRef(null);
  const audioFilterNodeRef = useRef(null);
  const audioConnectedVideoRef = useRef(null);

  // 3. Webtoon Studio v4 (Micro Progress Bar + ETA, Seamless Webtoon Stitcher, Visual Panel Bookmarks)
  const [readProgressPct, setReadProgressPct] = useState(0);
  const [seamlessStitch, setSeamlessStitch] = useState(true);
  const [savedPanels, setSavedPanels] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bx_mob_saved_panels') || '[]');
    } catch {
      return [];
    }
  });

  // 4. Privacy (App PIN Lock + Incognito Mode), New Release Radar, & Developer Direct User VIP Grant
  const [incognitoMode, setIncognitoMode] = useState(() => localStorage.getItem('bx_mob_incognito') === 'true');
  const [appPinCode, setAppPinCode] = useState(() => localStorage.getItem('bx_mob_pin_code') || '');
  const [pinLocked, setPinLocked] = useState(() => Boolean(localStorage.getItem('bx_mob_pin_code')));
  const [pinInput, setPinInput] = useState('');
  const [pinSetupInput, setPinSetupInput] = useState('');
  // Small sheets that the back button closes: 'alerts' | 'epOptions' | 'postAnime' | null
  const [appSheet, setAppSheet] = useState(null);
  const [devGrantTarget, setDevGrantTarget] = useState('');
  const [devGrantTier, setDevGrantTier] = useState('vip_monarch');
  const [devGrantDays, setDevGrantDays] = useState(30);
  const [devGrantBusy, setDevGrantBusy] = useState(false);

  // ==================== v5.0 SOVEREIGN ENGINE STATES ====================
  // 1. Live Cloud Watch Party & Timed Scene Comments (Danmaku)
  const [partyPanelOpen, setPartyPanelOpen] = useState(false);
  const [timedComments, setTimedComments] = useState([]);
  const [timedCommentsEnabled, setTimedCommentsEnabled] = useState(true);
  const [newTimedCommentText, setNewTimedCommentText] = useState('');
  const [activeDanmakuComment, setActiveDanmakuComment] = useState(null);

  // 2. Smart DNA Matcher, Mood Filter, & Spin Wheel

  // 3. Pro Subtitle Styler & Background Audio Mode
  const [subStyleMode, setSubStyleMode] = useState('white_lg'); // 'white_lg' | 'yellow_xl' | 'red_bx'
  const [bgAudioMode, setBgAudioMode] = useState(false);
  const backupFileInputRef = useRef(null);

  // ==================== v6.0 GOD-TIER ENGINE STATES ====================
  // 1. Real-Time Anime Visual Enhancer (4K-Feel Shader Presets) & Smart Auto-Skip Intro
  const [visualShaderMode, setVisualShaderMode] = useState('original'); // 'original' | 'upscale4k' | 'amoled_hdr' | 'cinema_imax'
  const [autoSkipIntro, setAutoSkipIntro] = useState(() => localStorage.getItem('bx_mob_autoskip_intro') === 'true');

  // 2. Webtoon Bionic Reader v6 (Touch-Paused Auto-Scroll, Dual-Page Spread, Double-Tap 200% Zoom)
  const [readerTouchPaused, setReaderTouchPaused] = useState(false);
  const [dualPageSpread, setDualPageSpread] = useState(false);

  // 3. Sovereign Titles & 4-Pillar Master Rating (Story / Animation / OST / Characters)
  const [selectedSovereignTitle, setSelectedSovereignTitle] = useState(
    () => stripEmoji(localStorage.getItem('bx_mob_sovereign_title') || '')
  );
  const [revStoryScore, setRevStoryScore] = useState(10);
  const [revAnimScore, setRevAnimScore] = useState(10);
  const [revOstScore, setRevOstScore] = useState(10);
  const [revCharScore, setRevCharScore] = useState(10);

  // 4. Developer Live Command Center v6 (Live Cloud User Inspector + Global Featured Spotlight Pin)
  const [devInspectQuery, setDevInspectQuery] = useState('');
  const [devInspectedUser, setDevInspectedUser] = useState(null);
  const [devInspectBusy, setDevInspectBusy] = useState(false);
  const [globalPinnedRec, setGlobalPinnedRec] = useState(null);
  const [devPinTitleInput, setDevPinTitleInput] = useState('');
  const [devPinNoteInput, setDevPinNoteInput] = useState('');
  const [devPinBusy, setDevPinBusy] = useState(false);

  // ==================== v7.0 APEX & CLEAN OBSIDIAN UI STATES ====================
  const [playerStudioOpen, setPlayerStudioOpen] = useState(false);
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false);
  // Profile hub navigation (profile/ProfileTab.jsx): a stack of sub-pages over the profile
  // root. The top bar shows the page title + a back button; Android back pops one page.
  const [profileStack, setProfileStack] = useState(() => (webStart?.kind === 'profile' && webStart.page ? [webStart.page] : []));
  const profilePage = profileStack[profileStack.length - 1] || 'root';
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const profileScrollMemoRef = useRef(profileStack.map(() => 0)); // scroll position of every page under the top one
  const profileScrollTargetRef = useRef(null); // where the page that mounts next should scroll to
  const openProfilePage = useCallback(
    (id) => {
      haptic('tap');
      const y = typeof window !== 'undefined' ? window.scrollY : 0;
      navigateStack('push', lang === 'ar', () => {
        profileScrollMemoRef.current.push(y);
        profileScrollTargetRef.current = 0;
        setProfileStack((st) => [...st, id]);
      });
    },
    [lang]
  );
  const closeProfilePage = useCallback(() => {
    haptic('tap');
    navigateStack('pop', lang === 'ar', () => {
      profileScrollTargetRef.current = profileScrollMemoRef.current.pop() ?? 0;
      setProfileStack((st) => st.slice(0, -1));
    });
  }, [lang]);
  const resetProfileStack = useCallback((pages = []) => {
    profileScrollMemoRef.current = pages.map(() => 0);
    profileScrollTargetRef.current = 0;
    setProfileStack(pages);
  }, []);
  // Restore the scroll position of the page we came back to (before the transition snapshot).
  useLayoutEffect(() => {
    const y = profileScrollTargetRef.current;
    if (y == null) return;
    profileScrollTargetRef.current = null;
    try {
      window.scrollTo(0, y);
    } catch (_) {
      /* storage or scroll unavailable */
    }
  }, [profilePage, activeTab]);
  // Signing in from the sign-in page closes it. Keyed on the server session, not on `user`:
  // accounts saved by pre-v16 builds have a user but no session and must be able to sign in.
  useEffect(() => {
    if (!sessionToken || !profileStack.includes('signin')) return;
    profileScrollTargetRef.current = profileScrollMemoRef.current.pop() ?? 0;
    setProfileStack((st) => st.filter((pg) => pg !== 'signin'));
  }, [sessionToken, profileStack]);
  const [devSubTab, setDevSubTab] = useState('vip'); // 'vip' | 'users' | 'broadcast' | 'requests' | 'errors' (profile/DeveloperPanel.jsx)
  const [readingBgmMode, setReadingBgmMode] = useState('off'); // 'off' | 'rain' | 'drone' | 'battle'
  const bgmCtxRef = useRef(null);
  const bgmTimerRef = useRef(null);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [userRequestType, setUserRequestType] = useState('anime'); // 'anime' | 'manga' | 'issue'
  const [userRequestText, setUserRequestText] = useState('');
  const [userRequestBusy, setUserRequestBusy] = useState(false);
  const [cloudUserRequests, setCloudUserRequests] = useState([]);

  // ==================== v8.0 GLOBAL LUXURY & NETFLIX/CRUNCHYROLL UI STATES ====================
  const [quickPeekAnime, setQuickPeekAnime] = useState(null);
  const [universalMangaHits, setUniversalMangaHits] = useState([]);

  // ==================== v9.0 SOVEREIGN CINEMA OS & STANDALONE PLAYER STATES ====================
  const [playerMinimized, setPlayerMinimized] = useState(false); // Floating Mini-Player vs Dedicated Standalone Player Page
  const [epLayoutMode, setEpLayoutMode] = useState('cards'); // 'cards' (Crunchyroll Horizontal Cartes) | 'grid' (Fast Number Grid)
  const [epRangeChunk, setEpRangeChunk] = useState(-1); // -1 = All, 0 = 1..50, 1 = 51..100, etc.
  const [storyPreviewAnime, setStoryPreviewAnime] = useState(null); // Fullscreen Vertical Story / Highlight Modal
  const [mangaChSearch, setMangaChSearch] = useState(''); // Search chapters inside Manhwa Series Hub
  const [mangaChAsc, setMangaChAsc] = useState(false); // Sort chapters ascending vs descending
  const pendingAutoPlayEpRef = useRef(null);

  // ==================== v10.0 SLOTH-UI & PRIME LUXURY DESIGN STATES ====================
  const [commandMenuOpen, setCommandMenuOpen] = useState(false); // Image 2 Luxury Rounded Command Menu Card

  // Developer powers come only from a server session created by verified Google
  // sign-in with the developer account (the server re-checks every developer call).
  const isDeveloper = useMemo(() => Boolean(user && user.isDeveloper === true && sessionToken), [user, sessionToken]);

  const userVipTier = useMemo(() => {
    if (isDeveloper) return 'vip_monarch';
    const redeemedLocal = redeemedVipTier || localStorage.getItem('bx_mob_redeemed_vip_tier');
    if (redeemedLocal === 'vip_monarch' || user?.vipTier === 'vip_monarch') return 'vip_monarch';
    if (redeemedLocal === 'vip_basic' || user?.vipTier === 'vip_basic') return 'vip_basic';
    return 'free';
  }, [isDeveloper, user, redeemedVipTier]);

  const showToast = useCallback((msg, icon = 'info') => showToastMessage(msg, icon), []);

  // Top bar: turns solid once the page scrolls, slides away while scrolling down, comes back on scroll up.
  const [pageScrolled, setPageScrolled] = useState(false);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.photoUrl]);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY || 0;
        setPageScrolled(y > 24);
        const dy = y - lastScrollYRef.current;
        if (Math.abs(dy) > 6) {
          setTopbarHidden(dy > 0 && y > 160);
          lastScrollYRef.current = y;
        }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Sync Native Immersive Fullscreen & Landscape Orientation + Volume Key Scroll Interceptor
  useEffect(() => {
    if (isWebApp()) {
      // Phone website: the browser's own full screen (+ landscape where allowed) for the player.
      if (videoFullscreen && activeEpisode) enterWebFullscreen(true);
      else exitWebFullscreen();
      return;
    }
    try {
      if (videoFullscreen && activeEpisode) {
        window.BlackXNativeAuth?.setFullscreen?.(true, true);
      } else if (activeMangaChapter) {
        window.BlackXNativeAuth?.setFullscreen?.(true, false);
      } else {
        window.BlackXNativeAuth?.setFullscreen?.(false, false);
      }
      window.BlackXNativeAuth?.setVolumeKeyScroll?.(Boolean(activeMangaChapter && volumeKeyScroll));
    } catch (_) {}
  }, [videoFullscreen, activeEpisode, activeMangaChapter, volumeKeyScroll]);

  useEffect(() => {
    window.__bxVolumeKeyScroll = (dir) => {
      if (!activeMangaChapter) return;
      if (readerMode === 'page') {
        if (dir === 'down') {
          setCurrentPageIdx((p) => Math.min(mangaPages.length - 1, p + 1));
        } else {
          setCurrentPageIdx((p) => Math.max(0, p - 1));
        }
      } else if (mangaReaderContainerRef.current) {
        const delta = window.innerHeight * 0.72 * (dir === 'down' ? 1 : -1);
        mangaReaderContainerRef.current.scrollBy({ top: delta, behavior: 'smooth' });
      }
    };
    return () => {
      delete window.__bxVolumeKeyScroll;
    };
  }, [activeMangaChapter, readerMode, mangaPages.length]);

  // Pro Video Player Touch Gestures: Left Vertical Swipe = Luminosité, Right Vertical Swipe = Volume, Long Press = 2.0x Vitesse
  const showGestureIndicator = useCallback((type, value) => {
    setGestureHud({ type, value });
    if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
    gestureHudTimerRef.current = setTimeout(() => setGestureHud(null), 1100);
  }, []);

  const handleVideoTouchStart = useCallback(
    (e) => {
      if (videoTouchLocked) return;
      const touch = e.touches?.[0];
      if (!touch) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = (touch.clientX - rect.left) / Math.max(1, rect.width);
      gestureStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        side: relX < 0.42 ? 'left' : relX > 0.58 ? 'right' : 'center',
        startBrightness: videoBrightness,
        startVolume: videoVolume,
        moved: false
      };
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        if (gestureStartRef.current && !gestureStartRef.current.moved && videoRef.current) {
          videoRef.current.playbackRate = 2.0;
          setLongPress2x(true);
        }
      }, 300);
    },
    [videoTouchLocked, videoBrightness, videoVolume]
  );

  const handleVideoTouchMove = useCallback(
    (e) => {
      if (videoTouchLocked || !gestureStartRef.current) return;
      const touch = e.touches?.[0];
      if (!touch) return;
      const dx = touch.clientX - gestureStartRef.current.x;
      const dy = gestureStartRef.current.y - touch.clientY; // positive = swipe up
      if (Math.hypot(dx, dy) > 12) {
        gestureStartRef.current.moved = true;
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
      if (Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx) * 1.25) {
        const deltaPct = Math.round((dy / 180) * 100);
        if (gestureStartRef.current.side === 'left') {
          const nextB = Math.max(15, Math.min(120, gestureStartRef.current.startBrightness + deltaPct));
          setVideoBrightness(nextB);
          try {
            window.BlackXNativeAuth?.setScreenBrightness?.(Math.min(1, nextB / 100));
          } catch (_) {}
          showGestureIndicator('brightness', nextB);
        } else if (gestureStartRef.current.side === 'right') {
          const nextV = Math.max(0, Math.min(100, gestureStartRef.current.startVolume + deltaPct));
          setVideoVolume(nextV);
          if (videoRef.current) {
            videoRef.current.volume = nextV / 100;
            videoRef.current.muted = nextV === 0;
          }
          showGestureIndicator('volume', nextV);
        }
      }
    },
    [videoTouchLocked, showGestureIndicator]
  );

  const handleVideoTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (longPress2x) {
      setLongPress2x(false);
      if (videoRef.current) {
        videoRef.current.playbackRate = playbackSpeed;
      }
    }
    gestureStartRef.current = null;
  }, [longPress2x, playbackSpeed]);

  // Complete Phone Back Button & Gesture Navigation Engine (Never exits the app unexpectedly!)
  const navRef = useRef({});
  const lastBackPressRef = useRef(0);
  useEffect(() => {
    navRef.current = {
      commandMenuOpen,
      appSheet,
      filterSheetOpen,
      playerMoreOpen,
      storyPreviewAnime,
      quickPeekAnime,
      videoFullscreen,
      activeEpisode,
      playerMinimized,
      selectedAnime,
      activeMangaChapter,
      selectedManga,
      profileDepth: profileStack.length,
      signOutConfirmOpen,
      activeTab
    };
  }, [
    commandMenuOpen,
    appSheet,
    filterSheetOpen,
    playerMoreOpen,
    storyPreviewAnime,
    quickPeekAnime,
    videoFullscreen,
    activeEpisode,
    playerMinimized,
    selectedAnime,
    activeMangaChapter,
    selectedManga,
    profileStack,
    signOutConfirmOpen,
    activeTab
  ]);

  // Push a browser history entry whenever the user navigates deeper so WebView gesture back also triggers popstate
  // (APK only: the phone website keeps a single history entry on top, see webHistory.js)
  useEffect(() => {
    if (isWebApp()) return;
    if (
      commandMenuOpen ||
      appSheet ||
      filterSheetOpen ||
      playerMoreOpen ||
      storyPreviewAnime ||
      quickPeekAnime ||
      videoFullscreen ||
      (activeEpisode && !playerMinimized) ||
      selectedAnime ||
      activeMangaChapter ||
      selectedManga ||
      profileStack.length > 0 ||
      signOutConfirmOpen ||
      activeTab !== 'home'
    ) {
      try {
        window.history.pushState({ bxDepth: Date.now() }, '');
      } catch (_) {}
    }
  }, [
    commandMenuOpen,
    appSheet,
    filterSheetOpen,
    playerMoreOpen,
    storyPreviewAnime,
    quickPeekAnime,
    videoFullscreen,
    activeEpisode,
    playerMinimized,
    selectedAnime,
    activeMangaChapter,
    selectedManga,
    profileStack,
    signOutConfirmOpen,
    activeTab
  ]);

  useEffect(() => {
    const handleStepBack = () => {
      const s = navRef.current;
      if (s.commandMenuOpen) {
        setCommandMenuOpen(false);
        return true;
      }
      if (s.appSheet) {
        setAppSheet(null);
        return true;
      }
      if (s.filterSheetOpen) {
        setFilterSheetOpen(false);
        return true;
      }
      if (s.playerMoreOpen) {
        setPlayerMoreOpen(false);
        return true;
      }
      if (s.storyPreviewAnime) {
        setStoryPreviewAnime(null);
        return true;
      }
      if (s.quickPeekAnime) {
        setQuickPeekAnime(null);
        return true;
      }
      if (s.videoFullscreen) {
        setVideoFullscreen(false);
        return true;
      }
      if (s.signOutConfirmOpen) {
        setSignOutConfirmOpen(false);
        return true;
      }
      if (s.activeEpisode && !s.playerMinimized) {
        setActiveEpisode(null);
        setPlayingVideoUrl('');
        return true;
      }
      if (s.selectedAnime) {
        setSelectedAnime(null);
        return true;
      }
      if (s.activeMangaChapter) {
        setAutoScrollSpeed(0);
        setActiveMangaChapter(null);
        return true;
      }
      if (s.selectedManga) {
        setSelectedManga(null);
        return true;
      }
      if (s.activeTab === 'profile' && s.profileDepth > 0) {
        closeProfilePage();
        return true;
      }
      if (s.activeTab && s.activeTab !== 'home') {
        navigateWithMotion(s.activeTab, 'home', lang === 'ar', () => {
          setActiveTab('home');
          jumpToTop();
        });
        return true;
      }
      // Phone website: nothing left to close, the browser's back button leaves the site.
      if (isWebApp()) return false;
      // User is already on Home root: require double back press within 2.2s to exit app
      const now = Date.now();
      if (now - lastBackPressRef.current < 2200) {
        try {
          window.BlackXNativeAuth?.exitApp?.();
        } catch (_) {}
      } else {
        lastBackPressRef.current = now;
        showToast(lang === 'ar' ? 'دوس رجوع تاني عشان تخرج' : 'Press back again to exit BLACK X');
      }
      return true;
    };

    window.__bxHardwareBack = handleStepBack;
    if (isWebApp()) return installWebHistory(handleStepBack);
    const onPopState = () => {
      handleStepBack();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [showToast, lang, closeProfilePage]);

  // Phone website: leaving the browser's full screen (system back, swipe) leaves the player's too.
  useEffect(() => {
    if (!isWebApp() || !videoFullscreen) return undefined;
    return onWebFullscreenExit(() => setVideoFullscreen(false));
  }, [videoFullscreen]);

  // Real-Time Polling of Global Cloud VIP System (`settings/global_vip_system`) across all connected APK & Website instances
  // Shared app config (VIP enforcement, broadcast, pinned pick, latest APK) comes from the
  // website server (CDN-cached): fetched at start, when the app returns to the foreground
  // and every 5 minutes while it is open. v15 read Firestore every 5 seconds.
  const applyAppConfig = useCallback((cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    if (typeof cfg.enforced === 'boolean') {
      setGlobalVipEnforced((prev) => (prev === cfg.enforced ? prev : cfg.enforced));
      localStorage.setItem('bx_mob_global_vip_enforced', String(cfg.enforced));
    }
    if (typeof cfg.broadcastMsg === 'string') {
      setGlobalBroadcastMsg((prev) => (prev === cfg.broadcastMsg ? prev : cfg.broadcastMsg));
    }
    if (cfg.pinnedRec !== undefined) {
      setGlobalPinnedRec((prev) =>
        JSON.stringify(prev || null) === JSON.stringify(cfg.pinnedRec || null) ? prev : cfg.pinnedRec || null
      );
    }
    if (cfg.apk) setApkRelease((prev) => (JSON.stringify(prev || null) === JSON.stringify(cfg.apk) ? prev : cfg.apk));
  }, []);

  useEffect(() => {
    applyAppConfig(readCachedConfig());
    let lastFetch = 0;
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (Date.now() - lastFetch < 30000) return;
      lastFetch = Date.now();
      fetchAppConfig().then(applyAppConfig).catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [applyAppConfig]);

  // Developer Only: Toggle Global VIP Enforcement for ALL users across all APK & Website instances
  const handleDevToggleGlobalVip = useCallback(async () => {
    if (!isDeveloper) return;
    setDevToggleBusy(true);
    try {
      const res = await adminSetEnforced(!globalVipEnforced);
      setGlobalVipEnforced(res.enforced);
      localStorage.setItem('bx_mob_global_vip_enforced', String(res.enforced));
      showToast(
        res.enforced ? 'اتفعّل فرض اشتراك VIP على كل المستخدمين' : 'اتلغى فرض الـ VIP — التطبيق والموقع مفتوحين للكل',
        'shield-check'
      );
    } catch (err) {
      showToast(apiErrorMessage(err, lang), 'alert');
    } finally {
      setDevToggleBusy(false);
    }
  }, [isDeveloper, globalVipEnforced, showToast, lang]);

  // Developer Only: Generate a Cloud VIP Code directly from the Developer Account on Mobile
  const handleDevGenerateVipCode = useCallback(async () => {
    if (!isDeveloper) return;
    setDevGenBusy(true);
    try {
      const days = Number(devGenDays) || 30;
      const priceEgp =
        devGenTier === 'vip_monarch'
          ? days >= 365 ? 1499 : days >= 90 ? 499 : 199
          : days >= 365 ? 799 : days >= 90 ? 249 : 99;
      const res = await adminGenerateCodes({ tier: devGenTier, days, uses: Number(devGenUses) || 1, count: 1, priceEgp });
      const created = Array.isArray(res.codes) ? res.codes : [];
      if (created[0]) {
        setCloudVipCodes((prev) => [...created, ...prev]);
        showToast(`اتولّد الكود: ${created[0].code}`, 'key');
      }
    } catch (err) {
      showToast(apiErrorMessage(err, lang), 'alert');
    } finally {
      setDevGenBusy(false);
    }
  }, [isDeveloper, devGenTier, devGenDays, devGenUses, showToast, lang]);

  // Redeem a VIP Subscription Code (Unlocks VIP Basic / VIP Monarch across App & Website)
  const handleRedeemVipCode = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      const clean = String(vipRedeemCode || '').trim().toUpperCase();
      if (!clean) {
        showToast(lang === 'ar' ? 'اكتب كود اشتراك VIP الأول' : 'Please enter a VIP code');
        return;
      }
      if (!sessionToken) {
        showToast(lang === 'ar' ? 'سجّل الدخول الأول عشان الكود يتسجل على حسابك' : 'Sign in first so the code is saved to your account', 'user');
        return;
      }
      setVipRedeemBusy(true);
      try {
        const res = await redeemVipCode(clean);
        const updatedUser = { ...(user || {}), ...(res.user || {}) };
        setUser(updatedUser);
        localStorage.setItem('bx_mob_user', JSON.stringify(updatedUser));
        setVipRedeemCode('');
        const newStatus = res.user?.vipStatus || (res.tier === 'vip_monarch' ? 'VIP Monarch' : 'VIP Basic');
        haptic('success');
        window.triggerBlackXMotion?.('monarch', 2400, `مبروك! اتفعّل ${newStatus}`, `${newStatus} ACTIVATED`);
        showToast(
          lang === 'ar' ? `مبروك! اتفعّلت باقة ${newStatus} لمدة ${res.days} يوم` : `${newStatus} activated for ${res.days} days!`,
          'check'
        );
      } catch (err) {
        haptic('warning');
        showToast(apiErrorMessage(err, lang), 'x-circle');
      } finally {
        setVipRedeemBusy(false);
      }
    },
    [vipRedeemCode, sessionToken, user, showToast, lang]
  );

  // Developer Only: Envoyer or Clear a Global Cloud Broadcast Banner to ALL users immediately
  const handleDevEnvoyerBroadcast = useCallback(
    async (clearMsg = false) => {
      if (!isDeveloper) return;
      setDevBroadcastBusy(true);
      const nextMsg = clearMsg ? '' : String(devBroadcastInput || '').trim();
      try {
        const res = await adminBroadcast(nextMsg);
        setGlobalBroadcastMsg(res.broadcastMsg || '');
        if (clearMsg) setDevBroadcastInput('');
        showToast(
          nextMsg ? 'اتنشر الإشعار العام — هيوصل لكل الأجهزة خلال دقايق' : 'اتشال الإشعار العام من كل الأجهزة',
          'megaphone'
        );
      } catch (err) {
        showToast(apiErrorMessage(err, lang), 'alert');
      } finally {
        setDevBroadcastBusy(false);
      }
    },
    [isDeveloper, devBroadcastInput, showToast, lang]
  );

  // ==================== v4.0 ULTIMATE CONTROLLERS ====================

  // 1. Developer Direct User VIP Upgrade (Upgrade any username or email directly in Cloud Firestore without code)
  const handleDevDirectGrantUserVip = useCallback(async () => {
    if (!isDeveloper) return;
    const target = String(devGrantTarget || '').trim().toLowerCase();
    if (!target) {
      showToast(lang === 'ar' ? 'اكتب اسم المستخدم أو الإيميل' : 'Enter username or email');
      return;
    }
    setDevGrantBusy(true);
    try {
      const res = await adminSetUserVip(target, devGrantTier, Number(devGrantDays) || 30);
      setDevGrantTarget('');
      showToast(
        lang === 'ar'
          ? `اترقى حساب (${res.user?.username || target}) لـ ${res.user?.vipStatus} لمدة ${devGrantDays} يوم`
          : `Upgraded ${target} to ${res.user?.vipStatus}`,
        'crown'
      );
    } catch (err) {
      showToast(apiErrorMessage(err, lang), 'alert');
    } finally {
      setDevGrantBusy(false);
    }
  }, [isDeveloper, devGrantTarget, devGrantTier, devGrantDays, showToast, lang]);

  // 2. True Offline Vault: Save Manhwa/Manga Chapter for Offline Reading
  const handleSaveChapterOffline = useCallback(async () => {
    if (!activeMangaChapter || !mangaPages.length || savingOfflineChapter) return;
    setSavingOfflineChapter(true);
    showToast(
      lang === 'ar'
        ? `بنحفظ الفصل ${activeMangaChapter.chapter} (${mangaPages.length} صفحة) عشان تقراه من غير نت...`
        : `Saving Ch. ${activeMangaChapter.chapter} (${mangaPages.length} pages) for offline reading...`, 'download'
    );
    try {
      if (window.caches) {
        const cache = await window.caches.open('bx-offline-chapters-v1');
        await Promise.allSettled(
          mangaPages.map((url) =>
            fetch(url, { mode: 'no-cors' }).then((res) => cache.put(url, res))
          )
        );
      }
      const entry = {
        id: activeMangaChapter.id,
        chapter: activeMangaChapter.chapter,
        title: activeMangaChapter.title || `الفصل ${activeMangaChapter.chapter}`,
        source: activeMangaChapter.source,
        mangaId: selectedManga?.objectID || activeMangaChapter.mangaId || 'offline_manga',
        mangaName: selectedManga?.name || 'مانهوا محفوظة',
        poster: selectedManga?.poster?.large || selectedManga?.poster_uri || '',
        pagesCount: mangaPages.length,
        pages: mangaPages,
        savedAt: new Date().toISOString()
      };
      setOfflineChapters((prev) => {
        const next = [entry, ...prev.filter((x) => x.id !== entry.id)].slice(0, 60);
        localStorage.setItem('bx_mob_offline_chapters', JSON.stringify(next));
        return next;
      });
      showToast(
        lang === 'ar'
          ? `الفصل ${activeMangaChapter.chapter} اتحفظ — تقدر تقراه من غير نت`
          : `Chapter ${activeMangaChapter.chapter} saved to Offline Vault!`, 'check'
      );
    } catch (_) {
      showToast(lang === 'ar' ? 'الفصل اتحفظ في التنزيلات' : 'Saved chapter to local vault');
    } finally {
      setSavingOfflineChapter(false);
    }
  }, [activeMangaChapter, mangaPages, savingOfflineChapter, selectedManga, showToast, lang]);

  const handleDeleteOfflineChapter = useCallback(
    (chId) => {
      setOfflineChapters((prev) => {
        const next = prev.filter((x) => x.id !== chId);
        localStorage.setItem('bx_mob_offline_chapters', JSON.stringify(next));
        return next;
      });
      showToast(lang === 'ar' ? 'الفصل اتشال من التنزيلات' : 'Removed from Offline Vault', 'trash');
    },
    [showToast, lang]
  );

  // 3. Visual Panel & Frame Bookmarking
  const handleBookmarkCurrentPanel = useCallback(() => {
    if (!activeMangaChapter || !mangaPages.length) return;
    const targetIdx =
      readerMode === 'page'
        ? currentPageIdx
        : Math.min(
            mangaPages.length - 1,
            Math.max(0, Math.floor((readProgressPct / 100) * mangaPages.length))
          );
    const imgUrl = mangaPages[targetIdx] || mangaPages[0];
    const item = {
      id: `panel_${Date.now()}`,
      type: 'manhwa',
      title: selectedManga?.name || 'Manhwa',
      subtitle: `الفصل ${activeMangaChapter.chapter} • صفحة ${targetIdx + 1}`,
      imageUrl: imgUrl,
      savedAt: new Date().toISOString()
    };
    setSavedPanels((prev) => {
      const next = [item, ...prev].slice(0, 80);
      localStorage.setItem('bx_mob_saved_panels', JSON.stringify(next));
      return next;
    });
    showToast(
      lang === 'ar'
        ? `اتحفظت صفحة ${targetIdx + 1} في لقطاتي`
        : `Saved panel (Page ${targetIdx + 1}) to bookmarks!`, 'bookmark'
    );
  }, [activeMangaChapter, mangaPages, readerMode, currentPageIdx, readProgressPct, selectedManga, showToast, lang]);

  // 4. Anime Ultra Player v4: Audio Booster 200% + Bass / Vocal Clarity EQ
  const handleCycleAudioBooster = useCallback(() => {
    const order = ['normal', 'boost150', 'boost200', 'voice'];
    const nextMode = order[(order.indexOf(audioBoostMode) + 1) % order.length];
    setAudioBoostMode(nextMode);

    try {
      const vid = videoRef.current;
      if (vid) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContextClass();
          }
          if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {});
          }
          if (audioConnectedVideoRef.current !== vid) {
            const source = audioCtxRef.current.createMediaElementSource(vid);
            const filter = audioCtxRef.current.createBiquadFilter();
            const gain = audioCtxRef.current.createGain();
            source.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtxRef.current.destination);
            audioFilterNodeRef.current = filter;
            audioGainNodeRef.current = gain;
            audioConnectedVideoRef.current = vid;
          }
          if (audioGainNodeRef.current && audioFilterNodeRef.current) {
            if (nextMode === 'normal') {
              audioGainNodeRef.current.gain.value = 1.0;
              audioFilterNodeRef.current.type = 'allpass';
              audioFilterNodeRef.current.gain.value = 0;
            } else if (nextMode === 'boost150') {
              audioGainNodeRef.current.gain.value = 1.5;
              audioFilterNodeRef.current.type = 'allpass';
              audioFilterNodeRef.current.gain.value = 0;
            } else if (nextMode === 'boost200') {
              audioGainNodeRef.current.gain.value = 2.0;
              audioFilterNodeRef.current.type = 'lowshelf';
              audioFilterNodeRef.current.frequency.value = 105;
              audioFilterNodeRef.current.gain.value = 6.5;
            } else if (nextMode === 'voice') {
              audioGainNodeRef.current.gain.value = 1.45;
              audioFilterNodeRef.current.type = 'peaking';
              audioFilterNodeRef.current.frequency.value = 1900;
              audioFilterNodeRef.current.Q.value = 1.1;
              audioFilterNodeRef.current.gain.value = 5.5;
            }
          }
        }
      }
    } catch (_) {}

    const labelsAr = {
      normal: 'الصوت: 100% طبيعي',
      boost150: 'مضخم الصوت: 150% عالي',
      boost200: 'مضخم الصوت: 200% أقصى تضخيم + Bass سينمائي',
      voice: 'وضوح الكلام'
    };
    showToast(labelsAr[nextMode] || nextMode);
  }, [audioBoostMode, showToast]);

  // 5. Anime Ultra Player v4: 1-Tap 1080p Frame Capture
  const handleTakeVideoCapture = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !selectedAnime || !activeEpisode) return;
    const curSec = Math.floor(vid.currentTime || 0);
    const mm = Math.floor(curSec / 60);
    const ss = String(curSec % 60).padStart(2, '0');
    let dataUrl = '';

    try {
      const canvas = document.createElement('canvas');
      canvas.width = vid.videoWidth || 1920;
      canvas.height = vid.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `BLACK-X-${selectedAnime.titleEn.replace(/[^a-z0-9]/gi, '_')}-Ep${activeEpisode.number}-${mm}m${ss}s.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (_) {
      dataUrl = selectedAnime.banner || selectedAnime.poster || '';
    }

    const snapItem = {
      id: `snap_${Date.now()}`,
      type: 'anime',
      title: selectedAnime.titleEn,
      subtitle: `${activeEpisode.name} • الدقيقة ${mm}:${ss}`,
      imageUrl: dataUrl || selectedAnime.banner || selectedAnime.poster,
      savedAt: new Date().toISOString()
    };
    setSavedPanels((prev) => {
      const next = [snapItem, ...prev].slice(0, 80);
      localStorage.setItem('bx_mob_saved_panels', JSON.stringify(next));
      return next;
    });
    showToast(
      lang === 'ar'
        ? `اتحفظت لقطة عند ${mm}:${ss} في لقطاتي`
        : `Frame captured at ${mm}:${ss} & saved!`, 'camera'
    );
  }, [selectedAnime, activeEpisode, showToast, lang]);

  // 6. Anime Ultra Player v4: A-B Scene Loop
  const handleCycleAbLoop = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const cur = Math.floor(vid.currentTime || 0);
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (loopPointA === null) {
      setLoopPointA(cur);
      setLoopPointB(null);
      showToast(
        lang === 'ar'
          ? `بداية المشهد عند ${fmt(cur)} — دوس تاني عشان تحدد النهاية`
          : `Loop Point A set (${fmt(cur)}) — Tap again to set B`, 'repeat'
      );
    } else if (loopPointB === null) {
      const endPt = Math.max(loopPointA + 3, cur);
      setLoopPointB(endPt);
      showToast(
        lang === 'ar'
          ? `تكرار المشهد القتالي مفعل (${fmt(loopPointA)} ← ${fmt(endPt)})`
          : `Scene Loop Active (${fmt(loopPointA)} → ${fmt(endPt)})`, 'repeat'
      );
    } else {
      setLoopPointA(null);
      setLoopPointB(null);
      showToast(lang === 'ar' ? 'وقفنا تكرار المشهد' : 'Scene Loop cleared', 'repeat');
    }
  }, [loopPointA, loopPointB, showToast, lang]);

  // 7. Anime Ultra Player v4: Smart Sleep Timer
  const handleCycleSleepTimer = useCallback(() => {
    const modes = ['off', 'end_of_ep', '15', '30', '60'];
    const next = modes[(modes.indexOf(sleepTimerMode) + 1) % modes.length];
    setSleepTimerMode(next);
    if (next === 'off' || next === 'end_of_ep') {
      setSleepTimerRemainingSec(0);
    } else {
      setSleepTimerRemainingSec(Number(next) * 60);
    }
    const labels = {
      off: 'مؤقت النوم: متوقف',
      end_of_ep: 'مؤقت النوم: إيقاف تلقائي عند نهاية الحلقة',
      '15': 'مؤقت النوم: إيقاف بعد 15 دقيقة',
      '30': 'مؤقت النوم: إيقاف بعد 30 دقيقة',
      '60': 'مؤقت النوم: إيقاف بعد 60 دقيقة'
    };
    showToast(labels[next]);
  }, [sleepTimerMode, showToast]);

  useEffect(() => {
    if (sleepTimerRemainingSec <= 0) return;
    const t = setInterval(() => {
      setSleepTimerRemainingSec((prev) => {
        if (prev <= 1) {
          if (videoRef.current) videoRef.current.pause();
          setSleepTimerMode('off');
          showToast('خلص مؤقت النوم — الفيديو وقف', 'moon');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [sleepTimerRemainingSec, showToast]);

  // ==================== v5.0 SOVEREIGN CONTROLLERS ====================

  // 1. Soirée: useWatchParty.js / watchParty.js (v18 — host-only room state, chat with
  //    preconditions, the guest opens the host's episode). The old single-document party lived here.

  // 2. Timed Scene Comments / Danmaku (التعليقات الزمنية التفاعلية على مشاهد الحلقة)
  //    settings/danmaku_<title>_<episode>, written through sharedLists.update (no lost comments).
  const danmakuDocRef = useRef('');
  useEffect(() => {
    if (!selectedAnime?.objectID || !activeEpisode?.docId) {
      setTimedComments([]);
      setActiveDanmakuComment(null);
      return;
    }
    let alive = true;
    const dKey = cleanCloudKey('danmaku', `${selectedAnime.objectID}_${activeEpisode.docId}`);
    danmakuDocRef.current = dKey;
    setTimedComments([]);
    sharedLists
      .read(dKey)
      .then(({ list }) => {
        if (alive) setTimedComments(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selectedAnime?.objectID, activeEpisode?.docId]);

  const handlePostTimedComment = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      if (!selectedAnime || !activeEpisode || !newTimedCommentText.trim()) return;
      const curSec = Math.floor(videoRef.current?.currentTime || 0);
      const text = newTimedCommentText.trim();
      const newComment = {
        id: sharedItemId('tc'),
        sec: curSec,
        author: user?.displayName || 'أوتاكو BLACK X',
        text
      };
      const dKey = cleanCloudKey('danmaku', `${selectedAnime.objectID}_${activeEpisode.docId}`);
      setTimedComments((prev) => prependItem(prev, newComment, DANMAKU_MAX));
      setNewTimedCommentText('');
      setActiveDanmakuComment(newComment);
      try {
        const { list } = await sharedLists.update(dKey, (cur) => prependItem(cur, newComment, DANMAKU_MAX));
        if (danmakuDocRef.current === dKey) setTimedComments(list);
        const nextXp = userXp + 15;
        setUserXp(nextXp);
        localStorage.setItem('bx_mob_xp', String(nextXp));
        const mm = Math.floor(curSec / 60);
        const ss = String(curSec % 60).padStart(2, '0');
        showToast(lang === 'ar' ? `اتحط تعليقك عند ${mm}:${ss} (+15 XP)` : `Comment placed at ${mm}:${ss} (+15 XP)`, 'message');
      } catch (_) {
        if (danmakuDocRef.current === dKey) setTimedComments((prev) => prev.filter((c) => c.id !== newComment.id));
        setActiveDanmakuComment((cur) => (cur && cur.id === newComment.id ? null : cur));
        setNewTimedCommentText((cur) => (cur ? cur : text));
        showToast(lang === 'ar' ? 'التعليق ما اتحطش — اتأكد من النت وجرب تاني' : 'Comment not saved — check your connection', 'alert');
      }
    },
    [selectedAnime, activeEpisode, newTimedCommentText, user, userXp, showToast, lang]
  );

  // 4. Pro Subtitle Styler & Background Audio MediaSession
  const handleCycleSubtitleStyle = useCallback(() => {
    const order = ['white_lg', 'yellow_xl', 'red_bx'];
    const next = order[(order.indexOf(subStyleMode) + 1) % order.length];
    setSubStyleMode(next);
    const labels = {
      white_lg: 'ستايل الترجمة: أبيض نقي سينمائي (كبير)',
      yellow_xl: 'ستايل الترجمة: أصفر احترافي (كبير جداً)',
      red_bx: 'شكل الترجمة: أحمر'
    };
    showToast(labels[next]);
  }, [subStyleMode, showToast]);

  useEffect(() => {
    if (!bgAudioMode || !selectedAnime || !activeEpisode) return;
    try {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: `${selectedAnime.titleEn} - ${activeEpisode.name}`,
          artist: 'BLACK X',
          album: 'BLACK X Cinema',
          artwork: selectedAnime.poster ? [{ src: selectedAnime.poster, sizes: '512x512', type: 'image/jpeg' }] : []
        });
        navigator.mediaSession.setActionHandler('play', () => videoRef.current?.play().catch(() => {}));
        navigator.mediaSession.setActionHandler('pause', () => videoRef.current?.pause());
      }
    } catch (_) {}
    const onVisChange = () => {
      if (document.hidden && bgAudioMode && videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, [bgAudioMode, selectedAnime, activeEpisode]);

  // 5. Developer Revoke User VIP & Delete Cloud VIP Code
  const handleDevRevokeUserVip = useCallback(async () => {
    if (!isDeveloper) return;
    const target = String(devGrantTarget || '').trim().toLowerCase();
    if (!target) {
      showToast('اكتب اسم المستخدم أو الإيميل اللي هيتسحب منه الاشتراك');
      return;
    }
    setDevGrantBusy(true);
    try {
      await adminSetUserVip(target, 'free', 1);
      setDevGrantTarget('');
      showToast(`اتسحب اشتراك VIP من (${target}) ورجع للباقة المجانية`, 'ban');
    } catch (err) {
      showToast(apiErrorMessage(err, lang), 'alert');
    } finally {
      setDevGrantBusy(false);
    }
  }, [isDeveloper, devGrantTarget, showToast, lang]);

  const handleDevDeleteVipCode = useCallback(
    async (codeToDelete) => {
      if (!isDeveloper) return;
      try {
        await adminDeleteCode(codeToDelete);
        setCloudVipCodes((prev) => prev.filter((c) => c.code !== codeToDelete));
        showToast(`اتمسح الكود (${codeToDelete})`, 'trash');
      } catch (err) {
        showToast(apiErrorMessage(err, lang), 'alert');
      }
    },
    [isDeveloper, showToast, lang]
  );

  // 6. 1-Tap Full Vault Backup & Restore (تصدير واستيراد الخزنة الكاملة)
  const handleExportVaultBackup = useCallback(() => {
    try {
      const backupPayload = {
        app: `BLACK X Mobile ${BX_APK_VERSION}`,
        exportedAt: new Date().toISOString(),
        favorites,
        watchlistMap,
        watchHistory,
        mangaHistory,
        offlineChapters,
        savedPanels,
        userXp,
        motionPref
      };
      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BLACK-X-Vault-Backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('اتحفظت النسخة الاحتياطية', 'save');
    } catch (_) {
      showToast('ماقدرناش نصدّر النسخة الاحتياطية');
    }
  }, [favorites, watchlistMap, watchHistory, mangaHistory, offlineChapters, savedPanels, userXp, motionPref, showToast]);

  const handleImportVaultBackup = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.target?.result || '{}'));
          if (Array.isArray(parsed.favorites)) {
            setFavorites(parsed.favorites);
            localStorage.setItem('bx_mob_favorites', JSON.stringify(parsed.favorites));
          }
          if (parsed.watchlistMap && typeof parsed.watchlistMap === 'object') {
            setWatchlistMap(parsed.watchlistMap);
            localStorage.setItem('bx_mob_watchlist_map', JSON.stringify(parsed.watchlistMap));
          }
          if (Array.isArray(parsed.watchHistory)) {
            setWatchHistory(parsed.watchHistory);
            localStorage.setItem('bx_mob_history', JSON.stringify(parsed.watchHistory));
          }
          if (Array.isArray(parsed.mangaHistory)) {
            setMangaHistory(parsed.mangaHistory);
            localStorage.setItem('bx_mob_manga_history', JSON.stringify(parsed.mangaHistory));
          }
          if (Array.isArray(parsed.offlineChapters)) {
            setOfflineChapters(parsed.offlineChapters);
            localStorage.setItem('bx_mob_offline_chapters', JSON.stringify(parsed.offlineChapters));
          }
          if (Array.isArray(parsed.savedPanels)) {
            setSavedPanels(parsed.savedPanels);
            localStorage.setItem('bx_mob_saved_panels', JSON.stringify(parsed.savedPanels));
          }
          if (typeof parsed.userXp === 'number') {
            setUserXp(parsed.userXp);
            localStorage.setItem('bx_mob_xp', String(parsed.userXp));
          }
          showToast('رجّعنا قائمتك وسجل مشاهدتك', 'check');
        } catch (_) {
          showToast('ملف النسخة الاحتياطية مش سليم', 'x-circle');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [showToast]
  );

  // ==================== v6.0 GOD-TIER CONTROLLERS ====================

  // 1. Real-Time Anime Visual Enhancer (4K-Feel Shader Presets)
  const handleCycleVisualShader = useCallback(() => {
    const order = ['original', 'upscale4k', 'amoled_hdr', 'cinema_imax'];
    const next = order[(order.indexOf(visualShaderMode) + 1) % order.length];
    setVisualShaderMode(next);
    const labels = {
      original: 'الصورة: الأصلية',
      upscale4k: 'الصورة: خطوط أوضح',
      amoled_hdr: 'الصورة: تباين أعلى',
      cinema_imax: 'الصورة: ألوان دافية'
    };
    showToast(labels[next]);
  }, [visualShaderMode, showToast]);

  // 2. Fine-Grained 120Hz Webtoon Auto-Scroll Engine (Pauses automatically on touch)
  useEffect(() => {
    if (!activeMangaChapter || readerMode !== 'webtoon' || !autoScrollSpeed || readerTouchPaused) return;
    let rafId;
    const step = () => {
      if (mangaReaderContainerRef.current) {
        mangaReaderContainerRef.current.scrollTop += autoScrollSpeed * 1.35;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [activeMangaChapter, readerMode, autoScrollSpeed, readerTouchPaused]);

  // 3. Developer Live Cloud User Inspector (كشاف المستخدمين السحابي المباشر)
  const handleDevInspectUser = useCallback(async () => {
    if (!isDeveloper) return;
    const q = String(devInspectQuery || '').trim().toLowerCase();
    if (!q) {
      showToast('اكتب اسم المستخدم أو الإيميل');
      return;
    }
    setDevInspectBusy(true);
    try {
      const res = await adminInspectUser(q);
      setDevInspectedUser({ ...(res.user || {}), stats: res.stats || {} });
      showToast(`اتجابت بيانات (${res.user?.username || res.user?.email || q})`, 'search');
    } catch (err) {
      setDevInspectedUser(null);
      showToast(apiErrorMessage(err, lang), 'x-circle');
    } finally {
      setDevInspectBusy(false);
    }
  }, [isDeveloper, devInspectQuery, showToast, lang]);

  // 4. Developer Global Featured Spotlight Pin (تثبيت ترشيح المطور الرسمي في الصفحة الرئيسية للجميع)
  const handleDevPinRecommendation = useCallback(
    async (clearPin = false) => {
      if (!isDeveloper) return;
      setDevPinBusy(true);
      try {
        let nextPin = null;
        if (!clearPin) {
          const qTitle = String(devPinTitleInput || '').trim();
          let matchAnime =
            popularList.find((a) => a.titleEn.toLowerCase().includes(qTitle.toLowerCase())) ||
            airingList.find((a) => a.titleEn.toLowerCase().includes(qTitle.toLowerCase())) ||
            popularList[0];
          if (qTitle) {
            const alg = await queryAlgolia('series', { query: qTitle, hitsPerPage: 1 }).catch(() => null);
            if (alg?.hits?.[0]) {
              matchAnime = formatAnimeHit(alg.hits[0]) || matchAnime;
            }
          }
          if (matchAnime) {
            nextPin = {
              objectID: matchAnime.objectID,
              slug: matchAnime.slug,
              titleEn: matchAnime.titleEn,
              titleAr: matchAnime.titleAr,
              poster: matchAnime.poster,
              banner: matchAnime.banner,
              rating: matchAnime.rating,
              type: matchAnime.type,
              state: matchAnime.state,
              storyAr: matchAnime.storyAr,
              devNote:
                String(devPinNoteInput || '').trim() ||
                'ترشيح إدارة BLACK X الرسمي لليوم — عمل أسطوري لا يفوتكم!',
              pinnedAt: new Date().toISOString()
            };
          }
        }
        const saved = await adminPin(nextPin);
        setGlobalPinnedRec(saved.pinnedRec || null);
        showToast(
          nextPin
            ? `(${nextPin.titleEn}) بقى الترشيح المثبت للكل`
            : 'اتشال الترشيح المثبت', 'pin'
        );
      } catch (_) {
        showToast('ماقدرناش نحدّث الترشيح المثبت');
      } finally {
        setDevPinBusy(false);
      }
    },
    [
      isDeveloper,
      devPinTitleInput,
      devPinNoteInput,
      popularList,
      airingList,
      showToast
    ]
  );

  // ==================== v7.0 APEX & CLEAN OBSIDIAN CONTROLLERS ====================

  // 1. Built-In WebAudio Reading Ambience & Battle BGM Synth
  const stopReadingBgm = useCallback(() => {
    try {
      if (bgmTimerRef.current) {
        clearInterval(bgmTimerRef.current);
        bgmTimerRef.current = null;
      }
      if (bgmCtxRef.current) {
        bgmCtxRef.current.close().catch(() => {});
        bgmCtxRef.current = null;
      }
    } catch (_) {}
  }, []);

  const handleCycleReadingBgm = useCallback(() => {
    const order = ['off', 'drone', 'rain', 'battle'];
    const next = order[(order.indexOf(readingBgmMode) + 1) % order.length];
    stopReadingBgm();
    setReadingBgmMode(next);
    if (next === 'off') {
      showToast('موسيقى القراءة: مقفولة', 'mute');
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      bgmCtxRef.current = ctx;

      if (next === 'drone') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.value = 65.41; // C2 deep monarch drone
        osc2.frequency.value = 98.0; // G2 fifth
        gain.gain.value = 0.045;
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start();
        osc2.start();
        showToast('موسيقى القراءة: هادية', 'orbit');
      } else if (next === 'rain') {
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + white * 0.099046;
          b1 = 0.963 * b1 + white * 0.2965164;
          b2 = 0.57 * b2 + white * 1.0526913;
          output[i] = (b0 + b1 + b2 + white * 0.1848) * 0.04;
        }
        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 950;
        const gain = ctx.createGain();
        gain.gain.value = 0.22;
        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        whiteNoise.start(0);
        showToast('موسيقى القراءة: مطر', 'cloud-rain');
      } else if (next === 'battle') {
        const notes = [110, 130.81, 146.83, 164.81, 146.83, 130.81];
        let step = 0;
        bgmTimerRef.current = setInterval(() => {
          try {
            if (!bgmCtxRef.current) return;
            const o = bgmCtxRef.current.createOscillator();
            const g = bgmCtxRef.current.createGain();
            o.type = 'sawtooth';
            o.frequency.value = notes[step % notes.length];
            step++;
            g.gain.setValueAtTime(0.035, bgmCtxRef.current.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, bgmCtxRef.current.currentTime + 0.32);
            o.connect(g);
            g.connect(bgmCtxRef.current.destination);
            o.start();
            o.stop(bgmCtxRef.current.currentTime + 0.34);
          } catch (_) {}
        }, 380);
        showToast('موسيقى القراءة: حماس', 'swords');
      }
    } catch (_) {}
  }, [readingBgmMode, stopReadingBgm, showToast]);

  useEffect(() => {
    if (!activeMangaChapter && readingBgmMode !== 'off') {
      stopReadingBgm();
      setReadingBgmMode('off');
    }
  }, [activeMangaChapter, readingBgmMode, stopReadingBgm]);

  // 2. Arabic/English TTS Story Narrator
  const handleToggleSpeakText = useCallback(
    (textToRead) => {
      try {
        if (!window.speechSynthesis) {
          showToast('القراءة بالصوت مش مدعومة على الموبايل ده');
          return;
        }
        if (window.speechSynthesis.speaking || ttsSpeaking) {
          window.speechSynthesis.cancel();
          setTtsSpeaking(false);
          showToast('وقفنا قراءة القصة', 'mute');
          return;
        }
        const cleanText = String(textToRead || '').trim();
        if (!cleanText) return;
        const utter = new SpeechSynthesisUtterance(cleanText);
        utter.lang = /[\u0600-\u06FF]/.test(cleanText) ? 'ar-SA' : 'en-US';
        utter.rate = 0.98;
        utter.onend = () => setTtsSpeaking(false);
        utter.onerror = () => setTtsSpeaking(false);
        setTtsSpeaking(true);
        window.speechSynthesis.speak(utter);
        showToast('بنقرا القصة بصوت...', 'volume');
      } catch (_) {
        setTtsSpeaking(false);
      }
    },
    [ttsSpeaking, showToast]
  );

  // 3. User Direct Request Box & Developer Ticket Center
  const handleSubmitUserRequest = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      const clean = String(userRequestText || '').trim();
      if (!clean) {
        showToast('اكتب اسم العمل أو تفاصيل طلبك الأول');
        return;
      }
      setUserRequestBusy(true);
      try {
        await sendDeveloperRequest(userRequestType, clean);
        setUserRequestText('');
        haptic('success');
        showToast('اتبعت طلبك للمطور', 'mail');
      } catch (err) {
        showToast(apiErrorMessage(err, lang), 'alert');
      } finally {
        setUserRequestBusy(false);
      }
    },
    [userRequestText, userRequestType, showToast, lang]
  );

  const handleDevDeleteUserRequest = useCallback(
    async (reqId) => {
      if (!isDeveloper) return;
      try {
        await adminDeleteRequest(reqId);
        setCloudUserRequests((prev) => prev.filter((r) => r.id !== reqId));
        showToast('اتشال الطلب من قائمة المطور', 'check');
      } catch (err) {
        showToast(apiErrorMessage(err, lang), 'alert');
      }
    },
    [isDeveloper, showToast, lang]
  );

  // Developer panel data (codes + requests) — only the server can read them now.
  const loadDevPanel = useCallback(async () => {
    if (!isDeveloper) return;
    try {
      const res = await adminGetVip();
      setCloudVipCodes(Array.isArray(res.codes) ? res.codes : []);
      setCloudUserRequests(Array.isArray(res.userRequests) ? res.userRequests : []);
      if (typeof res.enforced === 'boolean') setGlobalVipEnforced(res.enforced);
      if (typeof res.broadcastMsg === 'string') setGlobalBroadcastMsg(res.broadcastMsg);
      if (res.pinnedRec !== undefined) setGlobalPinnedRec(res.pinnedRec || null);
    } catch (_) {}
  }, [isDeveloper]);

  useEffect(() => {
    if (isDeveloper && activeTab === 'profile') loadDevPanel();
  }, [isDeveloper, activeTab, loadDevPanel]);

  // ==================== v8.0 GLOBAL LUXURY CONTROLLERS ====================

  // 2. Universal Spotlight Search (Simultaneously searches Manhwa when searching in Catalog)
  useEffect(() => {
    const q = String(searchQuery || '').trim();
    if (!q || q.length < 2) {
      setUniversalMangaHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        // Same manga search the website runs (all BLACK X manga servers)
        const hits = await fetchMobileMangaList({ server: 'all', query: q, page: 1 });
        if (cancelled) return;
        setUniversalMangaHits(hits.slice(0, 8));
      } catch (_) {}
    }, 420);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery]);

  // Load Home Screen rows (popular, recent, top, airing today, movies, airing) from the catalogue index.
  // Pull-to-refresh re-runs it (homeRefreshTick) while the current rows stay on screen.
  useEffect(() => {
    let alive = true;
    if (!homeRefreshTick) setHomeLoading(true);
    Promise.all([
      queryAlgolia('series_fav_count_desc', { query: '', hitsPerPage: 24 }).catch(() => ({ hits: [] })),
      // `recent` cannot facet on tags, so hidden titles are dropped from its hits: ask for a few more.
      queryAlgolia('recent', { query: '', hitsPerPage: 30 }).catch(() => ({ hits: [] })),
      queryAlgolia('best_mal_ranked', { query: '', hitsPerPage: 20 }).catch(() => ({ hits: [] })),
      queryAlgolia('series_fav_count_desc', { query: '', facetFilters: [[`show_time:${todayScheduleId()}`]], hitsPerPage: 16 }).catch(() => ({ hits: [] })),
      queryAlgolia('series_fav_count_desc', { query: '', facetFilters: [['type:فيلم']], hitsPerPage: 20 }).catch(() => ({ hits: [] })),
      queryAlgolia('series_fav_count_desc', { query: '', facetFilters: [['details.state:مستمر']], hitsPerPage: 20 }).catch(() => ({ hits: [] }))
    ]).then(([pop, rec, top, today, mov, air]) => {
      if (!alive) return;
      setPopularList((pop.hits || []).map(formatAnimeHit).filter(Boolean));
      setLatestList((rec.hits || []).map(formatAnimeHit).filter(Boolean).slice(0, 20));
      setTopRankedList((top.hits || []).map(formatAnimeHit).filter(Boolean));
      setTodayList((today.hits || []).map(formatAnimeHit).filter(Boolean));
      setMoviesList((mov.hits || []).map(formatAnimeHit).filter(Boolean));
      setAiringList((air.hits || []).map(formatAnimeHit).filter(Boolean));
      setHomeLoading(false);
    }).finally(() => {
      refreshDoneRef.current?.();
      refreshDoneRef.current = null;
    });
    // Real air times for the "airing now" cards (in the background: the rows never wait for it).
    fetchAiringTimes({ force: homeRefreshTick > 0 }).then((map) => {
      if (alive) setAiringMap(map);
    });
    return () => {
      alive = false;
    };
  }, [homeRefreshTick]);


  // Build facetFilters array for Catalog
  const buildCatalogFacets = useCallback(() => {
    const facets = [];
    if (catalogGenre?.tag) facets.push([`tags:${catalogGenre.tag}`]);
    if (catalogType?.facet) facets.push([catalogType.facet]);
    if (catalogState?.facet) facets.push([catalogState.facet]);
    if (catalogStudio?.facet) facets.push([catalogStudio.facet]);
    return facets;
  }, [catalogGenre, catalogType, catalogState, catalogStudio]);

  // Catalogue total, hidden ids and optional servers
  useEffect(() => {
    let alive = true;
    // What the app can actually show: Algolia's total with the hidden genres excluded
    // (so not the website's /api/stream/stats number).
    queryAlgolia('series_fav_count_desc', { query: '', hitsPerPage: 0 })
      .then((res) => {
        const total = Number(res?.nbHits);
        if (alive) setBxAnimeTotal(Number.isFinite(total) && total > 0 ? total : null);
      })
      .catch(() => {});
    // Saved entries (favorites, history, follows) carry no genres: hide them by id. Once a day.
    refreshHiddenIds(queryAlgoliaRaw)
      .then((ids) => {
        if (alive && ids) setHiddenIds(ids);
      })
      .catch(() => {});
    fetchBxSourceIds().then((ids) => {
      if (alive) setMangaSearchOnlyEnabled(ids.has('aniproject'));
    });
    return () => {
      alive = false;
    };
  }, []);

  // Catalog browsing (sort/genre/type/state/studio) reads the same Algolia index as the website's
  // BLACK X 1 catalogue. Typed searches use the website search across every BLACK X anime server.
  useEffect(() => {
    let alive = true;
    const q = searchQuery.trim();
    const t = setTimeout(async () => {
      setCatalogLoading(true);
      try {
        if (q) {
          const items = await fetchMobileAnimeSearch(q);
          if (!alive) return;
          setCatalogItems(items);
          setCatalogTotal(items.length);
          setCatalogPage(0);
          setCatalogPages(0);
          return;
        }
        const body = {
          query: '',
          page: 0,
          hitsPerPage: 48
        };
        const facets = buildCatalogFacets();
        if (facets.length > 0) body.facetFilters = facets;
        const res = await queryAlgolia(catalogSort, body);
        if (!alive) return;
        setCatalogItems((res.hits || []).map(formatAnimeHit).filter(Boolean));
        const total = Number(res.nbHits);
        setCatalogTotal(Number.isFinite(total) && total >= 0 ? total : null);
        setCatalogPage(0);
        setCatalogPages(Number(res.nbPages) || 0);
      } catch (_) {
        if (alive) setCatalogPages(0);
        if (alive && q) {
          setCatalogItems([]);
          setCatalogTotal(0);
        }
      } finally {
        if (alive) setCatalogLoading(false);
      }
    }, q ? 350 : 20);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [catalogSort, buildCatalogFacets, searchQuery]);

  const handleLoadMoreCatalog = async () => {
    // Website search results arrive in a single response; only the catalogue is paged.
    if (loadingMoreCatalog || searchQuery.trim()) return;
    const nextPage = catalogPage + 1;
    // Never ask for a page Algolia cannot serve: past its pagination limit it answers with
    // no hits, which used to leave a "load more" button that did nothing (1000 of 7,009).
    if (nextPage >= catalogPages) return;
    setLoadingMoreCatalog(true);
    try {
      const body = {
        query: '',
        page: nextPage,
        hitsPerPage: 48
      };
      const facets = buildCatalogFacets();
      if (facets.length > 0) body.facetFilters = facets;
      const res = await queryAlgolia(catalogSort, body);
      const more = (res.hits || []).map(formatAnimeHit).filter(Boolean);
      if (more.length) {
        setCatalogItems((prev) => {
          const seen = new Set(prev.map((a) => a.objectID));
          return [...prev, ...more.filter((a) => !seen.has(a.objectID))];
        });
        setCatalogPage(nextPage);
        if (Number(res.nbPages)) setCatalogPages(Number(res.nbPages));
      } else {
        setCatalogPages(nextPage); // nothing past this page
      }
    } catch (_) {
      showToast(lang === 'ar' ? 'مقدرناش نحمّل المزيد — اتأكد من النت وجرّب تاني' : 'Could not load more — check your connection', 'alert');
    } finally {
      setLoadingMoreCatalog(false);
    }
  };

  // Airing schedule of one day: the real air times (AniList via /api/anime/schedule, matched by
  // MAL id — airingSchedule.js) of every show on air, plus the catalogue's shows tagged with
  // that weekday. The on-air list is fetched once per refresh and reused while switching days.
  const scheduleAiringRef = useRef({ tick: -1, items: null });
  useEffect(() => {
    if (activeTab !== 'schedule') return;
    let alive = true;
    setScheduleLoading(true);
    const force = scheduleAiringRef.current.tick !== -1 && scheduleAiringRef.current.tick !== scheduleRefreshTick;
    const airingItemsPromise =
      scheduleAiringRef.current.items && scheduleAiringRef.current.tick === scheduleRefreshTick
        ? Promise.resolve(scheduleAiringRef.current.items)
        : queryAlgolia('series_fav_count_desc', { query: '', facetFilters: [['details.state:مستمر']], hitsPerPage: 100 })
            .then((res) => {
              const list = (res.hits || []).map(formatAnimeHit).filter(Boolean);
              scheduleAiringRef.current = { tick: scheduleRefreshTick, items: list };
              return list;
            })
            .catch(() => []);
    const dayItemsPromise =
      scheduleDay === 'all_airing'
        ? Promise.resolve([])
        : queryAlgolia('series_fav_count_desc', { query: '', facetFilters: [[`show_time:${scheduleDay}`]], hitsPerPage: 60 })
            .then((res) => (res.hits || []).map(formatAnimeHit).filter(Boolean))
            .catch(() => []);
    Promise.all([airingItemsPromise, dayItemsPromise, fetchAiringTimes({ force })])
      .then(([airingItems, dayItems, map]) => {
        if (!alive) return;
        setAiringMap(map);
        setScheduleItems(buildScheduleDay({ dayId: scheduleDay, airingItems, dayItems, map }));
      })
      .catch(() => {
        if (alive) setScheduleItems([]);
      })
      .finally(() => {
        if (alive) setScheduleLoading(false);
        refreshDoneRef.current?.();
        refreshDoneRef.current = null;
      });
    return () => {
      alive = false;
    };
  }, [activeTab, scheduleDay, scheduleRefreshTick]);

  // Hands-free Auto-Scroll for Webtoon Reader
  useEffect(() => {
    // Time-based auto-scroll on requestAnimationFrame: smooth on 60/90/120 Hz screens
    // (a fixed 16 ms timer drifts against the display and stutters).
    if (!activeMangaChapter || autoScrollSpeed === 0) return undefined;
    const pxPerSecond = autoScrollSpeed * 2.2 * 62.5;
    let rafId = 0;
    let last = 0;
    let carry = 0;
    const step = (now) => {
      if (last) {
        carry += (pxPerSecond * Math.min(64, now - last)) / 1000;
        const whole = Math.trunc(carry);
        if (whole) {
          window.scrollBy(0, whole);
          carry -= whole;
        }
      }
      last = now;
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [activeMangaChapter, autoScrollSpeed]);

  // Manga & Manhwa library/search from the website API (same servers and results as the website)
  const fetchMangaPeakPage = useCallback(async (srcMode, qStr, pageNum = 1) => {
    try {
      return await fetchMobileMangaList({ server: srcMode, query: qStr, page: pageNum });
    } catch (_) {
      return [];
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'manga') return;
    let alive = true;
    const t = setTimeout(async () => {
      setMangaLoading(true);
      setMangaPage(1);
      try {
        const list = await fetchMangaPeakPage(mangaSource, mangaQuery, 1);
        if (!alive) return;
        setMangaList(list);
      } catch (_) {
      } finally {
        if (alive) setMangaLoading(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [activeTab, mangaSource, mangaQuery, fetchMangaPeakPage]);

  const handleLoadMoreManga = useCallback(async () => {
    if (loadingMoreManga) return;
    const nextPage = mangaPage + 1;
    setLoadingMoreManga(true);
    try {
      const more = await fetchMangaPeakPage(mangaSource, mangaQuery, nextPage);
      if (more.length > 0) {
        setMangaPage(nextPage);
        setMangaList((prev) => {
          const seen = new Set(prev.map((x) => x.objectID));
          return [...prev, ...more.filter((x) => !seen.has(x.objectID))];
        });
      }
    } catch (_) {
    } finally {
      setLoadingMoreManga(false);
    }
  }, [loadingMoreManga, mangaPage, mangaSource, mangaQuery, fetchMangaPeakPage]);

  // Shared community feed (settings/shared_community_feed, sharedLists.js). A failed load keeps
  // what is on screen: an empty feed would look like every post was deleted.
  const communityLoadedAtRef = useRef(0);
  const feedOpSeqRef = useRef(0);
  const loadCommunityFeed = useCallback(async () => {
    try {
      const { list } = await sharedLists.read(FEED_DOC);
      communityLoadedAtRef.current = Date.now();
      // a post / like on its way keeps its optimistic version until its own write answers
      if (!feedOpSeqRef.current) setCommunityPosts(list);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadCommunityFeed();
  }, [loadCommunityFeed]);

  // Opening the community tab shows what others posted since (at most one read per 30 s).
  useEffect(() => {
    if (activeTab !== 'community') return;
    if (Date.now() - communityLoadedAtRef.current < 30000) return;
    loadCommunityFeed();
  }, [activeTab, loadCommunityFeed]);

  // Sync User Profile, Favorites & Watch History with BLACK X Shared Cloud Firestore
  // Account sync (v16): favorites + history + resume positions + XP go to /api/app/state
  // with the server session, debounced. Pull happens at start, after sign-in and when the
  // app returns to the foreground (v15 wrote Firestore directly and polled it every 8 s).
  const pendingSyncRef = useRef(null);
  const syncTimerRef = useRef(null);
  const syncWaitersRef = useRef([]);
  const flushStateSync = useCallback(async () => {
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = null;
    const pending = pendingSyncRef.current;
    pendingSyncRef.current = null;
    const waiters = syncWaitersRef.current.splice(0);
    if (!pending || !loadSession()) {
      waiters.forEach((resolve) => resolve(false));
      return false;
    }
    try {
      await pushAccountState({
        favorites: pending.favorites,
        progress: pending.progress,
        positions: positionsForSync(),
        xp: Number(localStorage.getItem('bx_mob_xp') || 0)
      });
      waiters.forEach((resolve) => resolve(true));
      return true;
    } catch (err) {
      if (err?.status === 401) setSessionToken(null);
      waiters.forEach((resolve) => resolve(false));
      return false;
    }
  }, []);

  const syncUserStateToCloud = useCallback(
    (u, favs, hist, { immediate = false } = {}) => {
      if (!u || !loadSession()) return Promise.resolve(false);
      pendingSyncRef.current = {
        favorites: Array.isArray(favs) ? favs : latestRef.current.favorites || [],
        progress: Array.isArray(hist) ? hist : latestRef.current.watchHistory || []
      };
      return new Promise((resolve) => {
        syncWaitersRef.current.push(resolve);
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(flushStateSync, immediate ? 0 : 2500);
      });
    },
    [flushStateSync]
  );

  // Merge what the server has into this phone (lists: union, newest first; positions:
  // newest per episode; XP: the highest).
  const applyServerState = useCallback((state) => {
    if (!state || typeof state !== 'object') return;
    if (Array.isArray(state.favorites)) {
      setFavorites((prev) => {
        const map = new Map();
        for (const item of [...state.favorites, ...prev]) {
          const k = item?.objectID || item?.slug;
          if (k && !map.has(k)) map.set(k, item);
        }
        const merged = Array.from(map.values());
        localStorage.setItem('bx_mob_favorites', JSON.stringify(merged));
        return merged;
      });
    }
    if (Array.isArray(state.progress)) {
      setWatchHistory((prev) => {
        const map = new Map();
        const all = [...state.progress, ...prev].sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')));
        for (const item of all) {
          const k = item?.objectID || item?.slug;
          if (k && !map.has(k)) map.set(k, item);
        }
        const merged = Array.from(map.values()).slice(0, 60);
        localStorage.setItem('bx_mob_history', JSON.stringify(merged));
        return merged;
      });
    }
    if (state.positions) mergePositions(state.positions);
    if (Number(state.xp) > 0) {
      setUserXp((prev) => {
        const next = Math.max(prev, Number(state.xp) || 0);
        localStorage.setItem('bx_mob_xp', String(next));
        return next;
      });
    }
  }, []);

  const finishServerLogin = useCallback(
    (res) => {
      if (!res?.token || !res.user) return;
      setSessionToken(res.token);
      const loggedUser = { ...res.user };
      setUser(loggedUser);
      localStorage.setItem('bx_mob_user', JSON.stringify(loggedUser));
      if (res.state) applyServerState(res.state);
      haptic('success');
      // Push back what this phone had before signing in (merged above).
      setTimeout(() => {
        syncUserStateToCloud(loggedUser, latestRef.current.favorites, latestRef.current.watchHistory, { immediate: true });
      }, 900);
    },
    [applyServerState, syncUserStateToCloud]
  );

  // Pull latest cloud state when user is logged in (and keep syncing every 8 seconds with Website)
  const lastPullRef = useRef(0);
  const pullCloudUserState = useCallback(async () => {
    if (!loadSession()) return false;
    lastPullRef.current = Date.now();
    try {
      const res = await fetchMe();
      if (res?.user) {
        setUser((prev) => {
          const next = { ...(prev || {}), ...res.user };
          localStorage.setItem('bx_mob_user', JSON.stringify(next));
          return next;
        });
      }
      if (res?.state) applyServerState(res.state);
      return true;
    } catch (err) {
      if (err?.status === 401) setSessionToken(null);
      return false;
    }
  }, [applyServerState]);

  const handleManualSync = useCallback(async () => {
    if (!sessionToken) {
      setActiveTab('profile');
      resetProfileStack(['signin']);
      showToast(lang === 'ar' ? 'سجّل الدخول عشان حسابك يتزامن مع الموقع' : 'Sign in to sync your account', 'user');
      return;
    }
    const pulled = await pullCloudUserState();
    const pushed = await syncUserStateToCloud(user, latestRef.current.favorites, latestRef.current.watchHistory, { immediate: true });
    showToast(
      pulled || pushed
        ? lang === 'ar' ? 'اتزامن حسابك مع الموقع' : 'Account synced'
        : lang === 'ar' ? 'المزامنة ما نجحتش — اتأكد من النت' : 'Sync failed — check your connection',
      pulled || pushed ? 'check' : 'alert'
    );
  }, [sessionToken, user, pullCloudUserState, syncUserStateToCloud, showToast, lang, resetProfileStack]);

  useEffect(() => {
    if (!sessionToken) return undefined;
    pullCloudUserState();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastPullRef.current > 60000) pullCloudUserState();
      } else {
        flushPositions();
        flushStateSync();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [sessionToken, pullCloudUserState, flushStateSync]);

  // Real Google OAuth 2.0 Sign-In via Firebase IdentityToolkit & Native Android OAuth Bridge
  // NEVER lists or exposes any cloud accounts on the login screen.
  // Google sign-in is accepted only with a Firebase ID token that the SERVER verifies.
  // (v15 also signed people in with just the e-mail returned by the phone's account
  // picker, which any modified client could fake.)
  const completeVerifiedGoogleLogin = useCallback(
    async (idpData) => {
      try {
        if (!idpData?.idToken || idpData.idToken === 'android_system_google_account') {
          showToast(lang === 'ar' ? 'جوجل ما أكدش الدخول — جرّب تاني' : 'Google could not verify the sign-in', 'alert');
          return;
        }
        const res = await loginWithGoogle(idpData.idToken, {
          favorites: latestRef.current.favorites,
          progress: latestRef.current.watchHistory,
          positions: positionsForSync(),
          xp: Number(localStorage.getItem('bx_mob_xp') || 0)
        });
        finishServerLogin(res);
        showToast(
          lang === 'ar' ? `أهلاً ${res.user.displayName} — اتسجل دخولك بجوجل` : `Signed in with Google (${res.user.displayName})`,
          'check'
        );
      } catch (err) {
        showToast(apiErrorMessage(err, lang), 'alert');
      } finally {
        setAuthBusy(false);
      }
    },
    [finishServerLogin, showToast, lang]
  );

  const handleRealGoogleOAuthLogin = useCallback(async () => {
    setAuthBusy(true);
    if (isWebApp()) {
      // Phone website: Google's web popup (Firebase) confirms the account, then the server
      // verifies the token exactly like the APK's (webGoogle.js).
      let web = null;
      try {
        web = await import('./webGoogle.js');
        const idToken = await web.webGoogleIdToken();
        await completeVerifiedGoogleLogin({ idToken });
      } catch (err) {
        showToast(web ? web.webGoogleErrorMessage(err, lang) : lang === 'ar' ? 'ماقدرناش نفتح الدخول بجوجل' : 'Could not open Google sign-in', 'alert');
        setAuthBusy(false);
      }
      return;
    }
    // Google's own sign-in page (in the app's OAuth window) confirms the account; the
    // phone's account picker only pre-selects which account to use.
    const startOAuth = async (loginHint = '') => {
      const continueUri = 'https://spry-oxide-1h7sp.firebaseapp.com/__/auth/handler';
      const createRes = await fetch(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/createAuthUri?key=${BX_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'google.com',
          continueUri,
          authFlowType: 'CODE_FLOW',
          ...(loginHint ? { customParameter: { login_hint: loginHint } } : {})
        })
      });
      const createData = await createRes.json();
      if (!createData?.authUri || !createData?.sessionId) throw new Error('Failed to create Google OAuth URI');
      oauthSessionIdRef.current = createData.sessionId;
      window.__onBlackXGoogleOAuthRedirect = async (redirectUrl) => {
        try {
          const idpRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${BX_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestUri: redirectUrl,
              sessionId: oauthSessionIdRef.current,
              returnSecureToken: true,
              returnIdpCredential: true
            })
          });
          const idpData = await idpRes.json();
          if (idpData?.idToken) {
            await completeVerifiedGoogleLogin(idpData);
          } else {
            showToast(lang === 'ar' ? 'ما قدرناش نكمّل الدخول بجوجل — جرّب تاني' : 'Could not verify Google sign-in', 'alert');
            setAuthBusy(false);
          }
        } catch (_) {
          setAuthBusy(false);
        }
      };
      if (window.BlackXNativeAuth?.startGoogleLogin) {
        window.BlackXNativeAuth.startGoogleLogin(createData.authUri);
      } else {
        window.open(createData.authUri, '_blank', 'width=500,height=680');
        setAuthBusy(false);
      }
    };
    const failed = () => {
      showToast(lang === 'ar' ? 'ماقدرناش نفتح الدخول بجوجل' : 'Could not open Google sign-in', 'alert');
      setAuthBusy(false);
    };
    try {
      window.__onBlackXPhoneGoogleAccountPicked = async (pickedEmail) => {
        const clean = String(pickedEmail || '').trim().toLowerCase();
        try {
          await startOAuth(clean.includes('@') ? clean : '');
        } catch (_) {
          failed();
        }
      };
      window.__onBlackXGoogleOAuthError = (err) => {
        if (String(err || '') === 'picker_unavailable') startOAuth('').catch(failed);
        else setAuthBusy(false);
      };
      if (window.BlackXNativeAuth?.pickPhoneGoogleAccount) {
        window.BlackXNativeAuth.pickPhoneGoogleAccount('');
        return;
      }
      await startOAuth('');
    } catch (_) {
      failed();
    }
  }, [completeVerifiedGoogleLogin, showToast, lang]);

  // Open an Anime Detail Sheet & fetch its episodes, characters/seiyuu, related seasons, and cloud reviews
  const handleOpenAnimeBase = useCallback(async (anime, autoPlayEpNum = null) => {
    if (!anime?.objectID) return;
    if (isHiddenAnime(anime)) {
      showToastMessage(hiddenTitleMessage(), 'info');
      return;
    }
    setSelectedAnime(anime);
    setDetailTab('episodes');
    setEpRangeChunk(-1);
    if (autoPlayEpNum !== null && autoPlayEpNum !== undefined) {
      pendingAutoPlayEpRef.current = { animeId: anime.objectID, epNum: Number(autoPlayEpNum) || 1 };
    } else {
      pendingAutoPlayEpRef.current = null;
      if (!playerMinimized) {
        setActiveEpisode(null);
        setPlayingVideoUrl('');
      }
    }
    setEpSearchQuery('');
    setStoryExpanded(false);
    setEpisodesLoading(true);
    setCharactersLoading(true);
    setAnimeCharacters([]);
    setRelatedAnimes([]);
    setAnimeReviews([]);

    // 1. Fetch Characters & Japanese Voice Actors (Seiyuu) via AniList GraphQL
    fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: `query($s:String){Media(search:$s,type:ANIME){characters(sort:[ROLE,FAVOURITES_DESC],perPage:18){edges{role node{id name{full native}image{large}}voiceActors(language:JAPANESE,sort:FAVOURITES_DESC){name{full}image{large}}}}}}`,
        variables: { s: anime.titleRomaji || anime.titleEn }
      })
    })
      .then((r) => r.json())
      .then((d) => {
        const edges = d?.data?.Media?.characters?.edges || [];
        setAnimeCharacters(
          edges.map((e) => ({
            id: e.node?.id || Math.random(),
            name: e.node?.name?.full || '',
            nativeName: e.node?.name?.native || '',
            role: e.role === 'MAIN' ? 'رئيسي' : 'مساعد',
            image: e.node?.image?.large || '',
            vaName: e.voiceActors?.[0]?.name?.full || '',
            vaImage: e.voiceActors?.[0]?.image?.large || ''
          }))
        );
      })
      .catch(() => {})
      .finally(() => setCharactersLoading(false));

    // 2. Fetch Related / Similar Animes from Algolia
    const firstTag = anime.tags?.[0] || 'اكشن';
    queryAlgolia('series_fav_count_desc', {
      query: '',
      facetFilters: [[`tags:${firstTag}`]],
      hitsPerPage: 12
    })
      .then((r) => {
        const list = (r.hits || [])
          .map(formatAnimeHit)
          .filter((x) => x && x.objectID !== anime.objectID);
        setRelatedAnimes(list);
      })
      .catch(() => {});

    // 3. Reviews of this title (settings/reviews_<slug>, sharedLists.js)
    const revKey = cleanCloudKey('reviews', anime.slug || anime.objectID);
    reviewsDocRef.current = revKey;
    sharedLists
      .read(revKey)
      .then(({ list }) => {
        if (reviewsDocRef.current === revKey) setAnimeReviews(list);
      })
      .catch(() => {});

    // 4. Episodes: the same /api/stream/show list the website's Watch page uses
    const openSeq = ++animeOpenSeqRef.current;
    setAnimeEpisodes([]);
    setEpisodesError('');
    try {
      const { show, episodes } = await fetchMobileEpisodes(anime);
      if (animeOpenSeqRef.current !== openSeq) return;
      // The website's show page can carry genres the card did not (other servers, old entries).
      if (show && isHiddenAnime(show)) {
        setSelectedAnime(null);
        setAnimeEpisodes([]);
        showToastMessage(hiddenTitleMessage(), 'info');
        return;
      }
      setAnimeEpisodes(episodes);
      if (!episodes.length) setEpisodesError('empty');
    } catch (_) {
      if (animeOpenSeqRef.current !== openSeq) return;
      setAnimeEpisodes([]);
      setEpisodesError('network');
    } finally {
      if (animeOpenSeqRef.current === openSeq) setEpisodesLoading(false);
    }
  }, []);

  // Cartes open the details sheet with a shared-element transition from the tapped poster.
  const handleOpenAnime = useCallback(
    (anime, autoPlayEpNum = null) => {
      if (isHiddenAnime(anime)) {
        showToastMessage(hiddenTitleMessage(), 'info');
        return;
      }
      haptic('tap');
      transitionFromTappedPoster(() => {
        handleOpenAnimeBase(anime, autoPlayEpNum);
      });
    },
    [handleOpenAnimeBase]
  );

  const closeDetailsSheet = useCallback(() => {
    const oid = latestRef.current.selectedAnime?.objectID;
    transitionBackToCard(() => {
      setSelectedAnime(null);
      setActiveEpisode(null);
      setPlayingVideoUrl('');
    }, oid);
  }, []);

  // Select and play a server. Servers that still need resolving go through the website's
  // /api/stream/resolve, and a server that cannot be played hands over to the next one.
  const handleSelectServer = useCallback(async (srv, allCandidateServers = []) => {
    if (!srv) return;
    const selectSeq = ++serverSelectSeqRef.current;
    setSelectedServer(srv);
    if (srv.directResolvedUrl) {
      setPlayingVideoUrl(srv.directResolvedUrl);
      setResolvingVideo(false);
      return;
    }
    setResolvingVideo(true);
    const resolveCandidate = async (candidate) => {
      if (candidate.directResolvedUrl) return candidate.directResolvedUrl;
      try {
        const url = await resolveMobileEpisodeServer(candidate);
        if (url) {
          candidate.directResolvedUrl = url;
          candidate.link = url;
        }
        return url;
      } catch (_) {
        return '';
      }
    };
    try {
      const ordered = [srv, ...allCandidateServers.filter((s) => s !== srv)];
      for (const candidate of ordered) {
        const url = await resolveCandidate(candidate);
        if (serverSelectSeqRef.current !== selectSeq) return;
        if (url) {
          setSelectedServer(candidate);
          setPlayingVideoUrl(url);
          return;
        }
      }
      setPlayingVideoUrl('');
    } finally {
      if (serverSelectSeqRef.current === selectSeq) setResolvingVideo(false);
    }
  }, []);

  // Auto-failover if <video> encounters a network/codec error on the current URL
  const handleVideoElementError = useCallback(() => {
    if (!playingVideoUrl) return;
    // 1. If pixeldrain.dev failed, try pixeldrain.net, then pixeldrain.com
    if (playingVideoUrl.includes('pixeldrain.dev/api/file/')) {
      setPlayingVideoUrl(playingVideoUrl.replace('pixeldrain.dev', 'pixeldrain.net'));
      return;
    }
    if (playingVideoUrl.includes('pixeldrain.net/api/file/')) {
      setPlayingVideoUrl(playingVideoUrl.replace('pixeldrain.net', 'pixeldrain.com'));
      return;
    }
    // 2. Otherwise hop to next server in episodeServers
    if (episodeServers.length > 1 && selectedServer) {
      const idx = episodeServers.findIndex(
        (s) => s.name === selectedServer.name && s.quality === selectedServer.quality && s.link === selectedServer.link
      );
      if (idx !== -1 && idx + 1 < episodeServers.length) {
        handleSelectServer(episodeServers[idx + 1], episodeServers);
      }
    }
  }, [playingVideoUrl, episodeServers, selectedServer, handleSelectServer]);

  // ---- v16 player additions -------------------------------------------------------
  const videoErrorRef = useRef(null);
  videoErrorRef.current = handleVideoElementError;
  const hlsCtlRef = useRef(null);
  const hlsActive = useMemo(() => Boolean(playingVideoUrl) && needsHlsJs(playingVideoUrl), [playingVideoUrl]);
  useEffect(() => {
    setHlsLevels([]);
    setHlsLevel(-1);
    if (!hlsActive) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    let cancelled = false;
    attachHls(video, playingVideoUrl, {
      dataSaver: dataSaverRef.current,
      onLevels: (levels) => {
        if (!cancelled) setHlsLevels(levels);
      },
      onFatal: () => {
        if (!cancelled) videoErrorRef.current?.();
      }
    })
      .then((ctl) => {
        if (cancelled) ctl.destroy();
        else hlsCtlRef.current = ctl;
      })
      .catch(() => {
        if (!cancelled) videoErrorRef.current?.();
      });
    return () => {
      cancelled = true;
      hlsCtlRef.current?.destroy();
      hlsCtlRef.current = null;
    };
  }, [hlsActive, playingVideoUrl]);

  const cycleHlsQuality = useCallback(() => {
    const ctl = hlsCtlRef.current;
    if (!ctl || !hlsLevels.length) return;
    const order = [-1, ...[...hlsLevels].sort((a, b) => b.height - a.height).map((l) => l.index)];
    const next = order[(order.indexOf(hlsLevel) + 1) % order.length];
    ctl.setLevel(next);
    setHlsLevel(next);
    const lvl = hlsLevels.find((l) => l.index === next);
    showToast(lang === 'ar' ? `الجودة: ${lvl ? `${lvl.height}p` : 'تلقائي'}` : `Qualité : ${lvl ? `${lvl.height}p` : 'Auto'}`, 'sliders');
  }, [hlsLevels, hlsLevel, showToast, lang]);

  // Reset per-episode player state.
  useEffect(() => {
    setVideoDuration(0);
    setSkipSegments([]);
    setNextEpCountdown(null);
  }, [activeEpisode?.docId, selectedAnime?.objectID]);

  // Real intro/outro timestamps (AniSkip, via the website API) once the duration is known.
  useEffect(() => {
    if (!selectedAnime || !activeEpisode || !videoDuration) return undefined;
    let alive = true;
    fetchSkipTimes({
      malId: selectedAnime.malId,
      title: selectedAnime.titleRomaji || selectedAnime.titleEn,
      episode: activeEpisode.number,
      duration: videoDuration
    }).then((res) => {
      if (alive && Array.isArray(res?.segments)) setSkipSegments(res.segments);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnime?.objectID, activeEpisode?.number, videoDuration]);

  const skipIntroManually = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    haptic('tap');
    const op = skipSegments.find((s) => s.type === 'op');
    if (op && v.currentTime < op.end) {
      v.currentTime = op.end;
      showToast(lang === 'ar' ? 'اتخطت المقدمة' : 'Intro skipped', 'skip-forward');
      return;
    }
    v.currentTime = Math.min((v.duration || v.currentTime + 86) - 1, (v.currentTime || 0) + 85);
    showToast(lang === 'ar' ? 'اتقدّم 85 ثانية' : 'Skipped ahead 85s', 'skip-forward');
  }, [skipSegments, showToast, lang]);

  // Keeps the account copy of the history item in step with the resume position.
  const recordWatchProgress = useCallback(
    (sec, dur) => {
      const anime = latestRef.current.selectedAnime;
      const ep = latestRef.current.activeEpisode;
      if (!anime || !ep || incognitoMode) return;
      setWatchHistory((prev) => {
        const idx = prev.findIndex((x) => x.objectID === anime.objectID);
        if (idx === -1) return prev;
        const item = {
          ...prev[idx],
          episode: ep.number,
          docId: ep.docId,
          position: Math.round(Number(sec) || 0),
          duration: Math.round(Number(dur) || 0),
          updatedAt: new Date().toISOString()
        };
        const next = [item, ...prev.filter((_, i) => i !== idx)];
        localStorage.setItem('bx_mob_history', JSON.stringify(next));
        const u = latestRef.current.user;
        if (u) syncUserStateToCloud(u, latestRef.current.favorites, next);
        return next;
      });
    },
    [incognitoMode, syncUserStateToCloud]
  );

  // Open an Episode: its servers are the same manifest the website's Watch page loads
  const handlePlayEpisode = useCallback(
    async (anime, epObj) => {
      if (!anime || !epObj) return;
      setSelectedAnime(anime);
      setPlayerMinimized(false);
      setActiveEpisode(epObj);
      setEpisodeServers([]);
      setPlayingVideoUrl('');
      setResolvingVideo(true);
      setLoopPointA(null);
      setLoopPointB(null);

      // Save to Watch History & sync with Website Cloud DB (unless Incognito Mode is active)
      if (!incognitoMode) {
        const newHistItem = {
          slug: anime.slug,
          objectID: anime.objectID,
          episode: epObj.number,
          docId: epObj.docId,
          titleEn: anime.titleEn,
          titleAr: anime.titleAr,
          poster: anime.poster,
          // genres (profile "top genres") and the MAL id (real air times) of what was watched
          ...(Array.isArray(anime.tags) && anime.tags.length ? { tags: anime.tags.slice(0, 6) } : {}),
          ...(anime.malId ? { malId: anime.malId } : {}),
          updatedAt: new Date().toISOString()
        };
        setWatchHistory((prev) => {
          const next = [newHistItem, ...prev.filter((x) => x.objectID !== anime.objectID)].slice(0, 50);
          localStorage.setItem('bx_mob_history', JSON.stringify(next));
          if (user) syncUserStateToCloud(user, favorites, next);
          return next;
        });
      }

      const reqSeq = ++episodeServersSeqRef.current;
      try {
        const servers = await fetchMobileEpisodeServers(anime, epObj.number);
        if (episodeServersSeqRef.current !== reqSeq) return;
        setEpisodeServers(servers);
        if (servers.length > 0) {
          // Data saver starts with the lowest quality the servers offer.
          const first = dataSaverRef.current
            ? [...servers].sort((a, b) => (parseInt(a.quality, 10) || 9999) - (parseInt(b.quality, 10) || 9999))[0]
            : servers[0];
          await handleSelectServer(first, servers);
        } else {
          setResolvingVideo(false);
        }
      } catch (_) {
        if (episodeServersSeqRef.current !== reqSeq) return;
        setEpisodeServers([]);
        setResolvingVideo(false);
      }
    },
    [user, favorites, incognitoMode, syncUserStateToCloud, handleSelectServer]
  );

  const playNextFromCountdown = useCallback(() => {
    const pending = nextEpCountdownRef.current;
    setNextEpCountdown(null);
    if (pending?.anime && pending?.ep) handlePlayEpisode(pending.anime, pending.ep);
  }, [handlePlayEpisode]);

  // Download orb on the anime details page. If this episode's stream is
  // already resolved, download it right away; otherwise start the episode and
  // open the Pro Studio sheet, where " تحميل الحلقة MP4" appears once ready.
  const handleSaveOfflineVault = useCallback(
    (anime, epObj) => {
      if (!anime || !epObj) return;
      const isResolvedEpisode =
        Boolean(playingVideoUrl) &&
        activeEpisode &&
        selectedAnime?.objectID === anime.objectID &&
        Number(activeEpisode.number) === Number(epObj.number);
      if (isResolvedEpisode) {
        const link = document.createElement('a');
        link.href = playingVideoUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.download = '';
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
      showToast(
        lang === 'ar'
          ? `بنجهّز الحلقة ${epObj.number}… زرار التنزيل هيظهر في إعدادات المشغل`
          : `Preparing episode ${epObj.number}… the "Download MP4" button will appear in Pro Studio`, 'download'
      );
      handlePlayEpisode(anime, epObj);
      setPlayerStudioOpen(true);
    },
    [playingVideoUrl, activeEpisode, selectedAnime, showToast, lang, handlePlayEpisode]
  );

  // Auto-open Standalone Video Player Page when user tapped " تشغيل الآن" from Home Hero / Continue Watching / Quick Peek
  useEffect(() => {
    if (
      pendingAutoPlayEpRef.current &&
      selectedAnime &&
      selectedAnime.objectID === pendingAutoPlayEpRef.current.animeId &&
      animeEpisodes.length > 0 &&
      !episodesLoading
    ) {
      const targetNum = pendingAutoPlayEpRef.current.epNum;
      pendingAutoPlayEpRef.current = null;
      const targetEp =
        animeEpisodes.find((e) => Number(e.number) === Number(targetNum)) || animeEpisodes[0];
      if (targetEp) {
        handlePlayEpisode(selectedAnime, targetEp);
      }
    }
  }, [selectedAnime, animeEpisodes, episodesLoading, handlePlayEpisode]);

  // Toggle Anime in Favorites (Synced with Website)
  const toggleFavorite = useCallback(
    (anime) => {
      if (!anime) return;
      haptic('toggle');
      setFavorites((prev) => {
        const exists = prev.some((f) => f.objectID === anime.objectID || f.slug === anime.slug);
        let next;
        if (exists) {
          next = prev.filter((f) => f.objectID !== anime.objectID && f.slug !== anime.slug);
          showToast(lang === 'ar' ? 'اتشال من قائمتك' : 'Removed from My List');
        } else {
          next = [
            {
              slug: anime.slug,
              objectID: anime.objectID,
              titleEn: anime.titleEn,
              titleAr: anime.titleAr,
              poster: anime.poster,
              banner: anime.banner,
              rating: anime.rating,
              // the MAL id lets alerts and the schedule use the real air time of a saved title
              ...(anime.malId ? { malId: anime.malId } : {}),
              ...(Array.isArray(anime.tags) && anime.tags.length ? { tags: anime.tags.slice(0, 6) } : {}),
              createdAt: new Date().toISOString()
            },
            ...prev
          ];
          showToast(lang === 'ar' ? 'اتضاف لقائمتك' : 'Added to My List & synced!', 'check');
        }
        localStorage.setItem('bx_mob_favorites', JSON.stringify(next));
        if (user) syncUserStateToCloud(user, next, watchHistory);
        return next;
      });
    },
    [user, watchHistory, syncUserStateToCloud, showToast, lang]
  );

  // Open a manga/manhwa: chapters and servers come from the website API, exactly like the website's
  // library. Nothing falls back to another title: an empty server says so and offers the others.
  const handleOpenManga = useCallback(async (mangaHit, preferredServer = '') => {
    if (!mangaHit) return;
    if (isHiddenManga(mangaHit)) {
      showToastMessage(hiddenTitleMessage(), 'info');
      return;
    }
    const openSeq = ++mangaOpenSeqRef.current;
    setSelectedManga(mangaHit);
    setActiveMangaChapter(null);
    setMangaPages([]);
    setMangaPagesError('');
    setMangaChapters([]);
    setMangaChaptersError('');
    if (!preferredServer) setMangaServers([]);
    setMangaActiveServer(preferredServer || mangaHit.bxServer || '');
    setMangaChaptersLoading(true);
    try {
      let hit = mangaHit;
      if (!hit.bxId) {
        // Entries saved by older builds have no website id: exact-title lookup only.
        const found = await findBxMangaByTitle(hit.name_en || hit.name);
        if (mangaOpenSeqRef.current !== openSeq) return;
        if (!found) {
          setMangaChaptersError('not_found');
          return;
        }
        hit = found;
        setSelectedManga(found);
      }
      const { chapters, availableServers, activeServer } = await fetchMobileMangaChapters(hit, preferredServer);
      if (mangaOpenSeqRef.current !== openSeq) return;
      setMangaServers(availableServers);
      setMangaActiveServer(activeServer || preferredServer || hit.bxServer || '');
      setMangaChapters(chapters);
      if (!chapters.length) setMangaChaptersError('empty');
    } catch (_) {
      if (mangaOpenSeqRef.current === openSeq) setMangaChaptersError('network');
    } finally {
      if (mangaOpenSeqRef.current === openSeq) setMangaChaptersLoading(false);
    }
  }, []);

  const fetchChapterPagesList = useCallback(async (ch) => {
    if (!ch) return [];
    if (prefetchedChapterRef.current[ch.id]?.length) {
      return prefetchedChapterRef.current[ch.id];
    }
    const imgs = ch.source === 'bx' ? await fetchMobileChapterPages(ch) : [];
    if (imgs.length > 0) {
      prefetchedChapterRef.current[ch.id] = imgs;
    }
    return imgs;
  }, []);

  // ==================== v14.0 GLOBAL SELF-HEALING COVER ENGINE & NATIVE PHONE EPISODE RADAR ====================

  // 1. Global Capture-Phase Image Error Auto-Healer (Fixes any missing/403/404 Anime, Manga, or Manhwa cover via AniList HD + /blackx-logo.png)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!window.__bxCoverCache) window.__bxCoverCache = {};

    const handleGlobalImgError = (ev) => {
      const img = ev?.target;
      if (!img || img.tagName !== 'IMG') return;
      // Reader pages are never swapped for a cover: MangaPageImage handles its own retries.
      if (img.dataset?.bxNoHeal === '1') return;
      const curSrc = String(img.getAttribute('src') || '');
      if (curSrc.endsWith('/blackx-logo.png') || img.dataset.bxHealed === 'done') return;

      // Immediately show official BLACK X logo so a broken image icon never appears
      img.src = '/blackx-logo.png';
      img.dataset.bxHealed = 'pending';

      const rawTitle = String(img.getAttribute('alt') || '')
        .replace(/[^\w\s\u0621-\u064A]/g, ' ')
        .trim();
      if (!rawTitle || rawTitle.length < 2 || rawTitle.toLowerCase() === 'black x') {
        img.dataset.bxHealed = 'done';
        return;
      }

      if (window.__bxCoverCache[rawTitle]) {
        img.dataset.bxHealed = 'done';
        img.src = window.__bxCoverCache[rawTitle];
        return;
      }

      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          query: `query($s: String) { Media(search: $s) { coverImage { extraLarge large } } }`,
          variables: { s: rawTitle.split(/\s+/).slice(0, 4).join(' ') }
        })
      })
        .then((r) => r.json())
        .then((d) => {
          const hdUrl = d?.data?.Media?.coverImage?.extraLarge || d?.data?.Media?.coverImage?.large;
          img.dataset.bxHealed = 'done';
          if (hdUrl) {
            window.__bxCoverCache[rawTitle] = hdUrl;
            img.src = hdUrl;
          }
        })
        .catch(() => {
          img.dataset.bxHealed = 'done';
        });
    };

    window.addEventListener('error', handleGlobalImgError, true);
    return () => window.removeEventListener('error', handleGlobalImgError, true);
  }, []);

  // 2. New-episode alerts (episodeAlerts.js) only for titles the user follows (favorites +
  // "watching"/"planned"), checked while the app is open: every 30 minutes (15 when it returns to
  // the foreground), and — using the real air times (airingSchedule.js) — every 10 minutes for 6
  // hours after one of those titles aired in Japan, so its episode is announced soon after it lands.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let cancelled = false;
    let running = false;
    let fullRunAt = lastAlertRun();
    let hotRunAt = 0;
    const HOT_MS = 6 * 3600 * 1000;
    const followedTitles = () => {
      const list = [...(latestRef.current.favorites || [])];
      Object.values(latestRef.current.watchlistMap || {}).forEach((entry) => {
        if (entry && (entry.status === 'watching' || entry.status === 'planned')) list.push(entry);
      });
      return list.filter((t) => !isHiddenAnime(t));
    };
    // Followed titles that aired in the last 6 hours. Right after an episode airs AniList moves
    // to the next one (a week later), so the slot a week before the next airing counts too.
    const recentlyAired = (titles) => {
      const now = Date.now();
      const map = airingMapRef.current;
      return titles.filter((t) => {
        const a = airingFor(t, map);
        if (!a) return false;
        const at = a.airingAt * 1000;
        return [at, at - 7 * 86400 * 1000].some((slot) => now >= slot && now - slot < HOT_MS);
      });
    };
    const run = async (reason) => {
      if (running || cancelled || document.visibilityState === 'hidden') return;
      const titles = followedTitles();
      if (!titles.length) return;
      const hot = recentlyAired(titles);
      const now = Date.now();
      const fullDue = now - fullRunAt >= (reason === 'tick' ? 30 : 15) * 60 * 1000;
      const hotDue = hot.length > 0 && now - Math.max(hotRunAt, fullRunAt) >= 10 * 60 * 1000;
      if (!fullDue && !hotDue) return;
      const hotIds = new Set(hot.map((t) => t.objectID || t.slug));
      const ordered = fullDue ? [...hot, ...titles.filter((t) => !hotIds.has(t.objectID || t.slug))] : hot;
      running = true;
      if (fullDue) fullRunAt = now;
      hotRunAt = now;
      try {
        try {
          window.BlackXNativeAuth?.requestNotificationPermission?.();
        } catch (_) {}
        await checkFollowedTitles({
          titles: ordered,
          fetchEpisodes: async (t) => (await fetchMobileEpisodes(t))?.episodes || [],
          notify: (t, ep) => {
            const ar = (localStorage.getItem('bx_mob_lang') || 'ar') === 'ar';
            const name = t.titleEn || t.titleAr || 'BLACK X';
            dispatchPhoneNotification(
              ar ? `نزلت الحلقة ${ep} من ${name}` : `${name}: episode ${ep} is out`,
              ar ? 'اضغط عشان تتفرج على BLACK X' : 'Tap to watch on BLACK X',
              Math.floor(Date.now() % 90000) + 1000
            );
          }
        });
      } finally {
        running = false;
      }
    };
    const first = setTimeout(() => run('start'), 9000);
    const timer = setInterval(() => run('tick'), 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run('visible');
    };
    document.addEventListener('visibilitychange', onVisible);
    // The air times arrive with the home / schedule data; load them here too for alerts.
    fetchAiringTimes().then((map) => {
      if (!cancelled && map && map.size) setAiringMap((cur) => (cur && cur.size ? cur : map));
    });
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handleReadMangaChapter = useCallback(
    async (ch) => {
      const readSeq = ++chapterReadSeqRef.current;
      setActiveMangaChapter(ch);
      setMangaPagesError('');
      setCurrentPageIdx(0);
      setReadProgressPct(0);
      setAutoScrollSpeed(0);
      const offlineSaved =
        (Array.isArray(ch.pages) && ch.pages.length ? ch.pages : null) ||
        offlineChapters.find((x) => x.id === ch.id)?.pages ||
        prefetchedChapterRef.current[ch.id];
      if (offlineSaved?.length) {
        setMangaPages(offlineSaved);
        setMangaPagesLoading(false);
      } else {
        setMangaPages([]);
        setMangaPagesLoading(true);
      }

      // Save to Manga Reading History (unless Incognito Mode is active)
      if (selectedManga && !incognitoMode) {
        const histEntry = {
          objectID: selectedManga.objectID,
          name: selectedManga.name,
          poster_uri: selectedManga.poster?.large || selectedManga.poster_uri || '',
          genres: Array.isArray(selectedManga.genres) ? selectedManga.genres.slice(0, 8) : [],
          source: selectedManga.source,
          sourceId: selectedManga.sourceId,
          slug: selectedManga.slug,
          postId: selectedManga.postId,
          bxId: selectedManga.bxId,
          bxServer: selectedManga.bxServer,
          mangaId: selectedManga.objectID,
          chapter: ch.chapter,
          chapterId: ch.id,
          lastChapter: ch.chapter,
          lastChapterId: ch.id,
          updatedAt: new Date().toISOString()
        };
        setMangaHistory((prev) => {
          const next = [histEntry, ...prev.filter((x) => x.objectID !== selectedManga.objectID)].slice(0, 50);
          localStorage.setItem('bx_mob_manga_history', JSON.stringify(next));
          return next;
        });
      }

      try {
        if (!offlineSaved?.length) {
          const imgs = await fetchChapterPagesList(ch);
          if (chapterReadSeqRef.current !== readSeq) return;
          setMangaPages(imgs);
          if (!imgs.length) setMangaPagesError('empty');
        }
        // Smart Background Next-Chapter Prefetching (Zero-Wait Transition)
        const chIdx = mangaChapters.findIndex((c) => c.id === ch.id);
        const nextCh = chIdx > 0 ? mangaChapters[chIdx - 1] : null;
        if (nextCh && !prefetchedChapterRef.current[nextCh.id]) {
          setTimeout(async () => {
            try {
              const nextImgs = await fetchChapterPagesList(nextCh);
              nextImgs.slice(0, 5).forEach((url) => {
                const preImg = new Image();
                preImg.src = url;
              });
            } catch (_) {}
          }, 1200);
        }
      } catch (_) {
        if (chapterReadSeqRef.current === readSeq) setMangaPagesError('network');
      } finally {
        if (chapterReadSeqRef.current === readSeq) setMangaPagesLoading(false);
      }
    },
    [selectedManga, mangaChapters, fetchChapterPagesList]
  );


  // Post Review on Selected Anime (Synced to Cloud Firestore)
  const handlePostAnimeReview = useCallback(
    async (e) => {
      e.preventDefault();
      if (!selectedAnime || !newReviewText.trim()) return;
      const avgScore = Number(((revStoryScore + revAnimScore + revOstScore + revCharScore) / 4).toFixed(1));
      const rev = {
        id: sharedItemId('rev'),
        author: user?.displayName || (lang === 'ar' ? 'أوتاكو BLACK X' : 'BLACK X Otaku'),
        sovereignTitle: selectedSovereignTitle,
        role: user?.role || 'user',
        score: avgScore || newReviewScore,
        pillars: {
          story: revStoryScore,
          anim: revAnimScore,
          ost: revOstScore,
          char: revCharScore
        },
        episode: activeEpisode?.number || null,
        text: newReviewText.trim(),
        createdAt: new Date().toISOString(),
        time: lang === 'ar' ? 'الآن' : 'Just now'
      };
      const draftText = newReviewText;
      const revKey = cleanCloudKey('reviews', selectedAnime.slug || selectedAnime.objectID);
      setAnimeReviews((prev) => prependItem(prev, rev, REVIEWS_MAX));
      setNewReviewText('');
      try {
        const { list } = await sharedLists.update(revKey, (cur) => prependItem(cur, rev, REVIEWS_MAX));
        if (reviewsDocRef.current === revKey) setAnimeReviews(list);
        const nextXp = userXp + 25;
        setUserXp(nextXp);
        localStorage.setItem('bx_mob_xp', String(nextXp));
        showToast(lang === 'ar' ? 'اتنشر تقييمك (+25 XP)' : 'Review posted (+25 XP)', 'check');
      } catch (_) {
        if (reviewsDocRef.current === revKey) setAnimeReviews((prev) => prev.filter((r) => r.id !== rev.id));
        setNewReviewText((cur) => (cur ? cur : draftText));
        showToast(lang === 'ar' ? 'التقييم ما اتنشرش — اتأكد من النت وجرب تاني' : 'Review not posted — check your connection', 'alert');
      }
    },
    [
      selectedAnime,
      newReviewText,
      newReviewScore,
      revStoryScore,
      revAnimScore,
      revOstScore,
      revCharScore,
      selectedSovereignTitle,
      activeEpisode,
      user,
      userXp,
      showToast,
      lang
    ]
  );

  // Save Profile Edits & Sync with Cloud Firestore
  const handleSaveProfileEdit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!user) return;
      const patch = {
        displayName: editDisplayName.trim() || user.displayName,
        bio: editBio.trim(),
        photoUrl: editPhotoUrl.trim() || user.photoUrl || ''
      };
      if (!sessionToken) {
        const localUser = { ...user, ...patch };
        setUser(localUser);
        localStorage.setItem('bx_mob_user', JSON.stringify(localUser));
        closeProfilePage();
        showToast(lang === 'ar' ? 'اتحفظ على الموبايل — سجّل الدخول عشان يتزامن' : 'Saved on this phone — sign in to sync', 'check');
        return;
      }
      try {
        const res = await updateAccountProfile(patch);
        const updatedUser = { ...user, ...(res.user || {}) };
        setUser(updatedUser);
        localStorage.setItem('bx_mob_user', JSON.stringify(updatedUser));
        closeProfilePage();
        showToast(lang === 'ar' ? 'اتحدث ملفك الشخصي واتزامن مع الموقع' : 'Profile updated & synced!', 'check');
      } catch (err) {
        showToast(apiErrorMessage(err, lang), 'alert');
      }
    },
    [user, sessionToken, editDisplayName, editBio, editPhotoUrl, showToast, lang, closeProfilePage]
  );

  // Handle Login & Register against Shared BLACK X Cloud Firestore
  // Username/password accounts are checked by the server (bcrypt). v15 compared an
  // unsalted SHA-256 on the phone and let "register" overwrite existing accounts.
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const identifier = (authUsername || authEmail).trim().toLowerCase();
    if (!identifier || !authPassword) {
      showToast(lang === 'ar' ? 'اكتب اسم المستخدم وكلمة المرور' : 'Enter username and password');
      return;
    }
    setAuthBusy(true);
    try {
      const localState = {
        favorites,
        progress: watchHistory,
        positions: positionsForSync(),
        xp: userXp
      };
      const res =
        authMode === 'login'
          ? await loginWithPassword(identifier, authPassword, localState)
          : await registerAccount({
              username: (authUsername || identifier.split('@')[0]).trim().toLowerCase(),
              password: authPassword,
              displayName: authDisplayName.trim(),
              email: authEmail.trim().toLowerCase(),
              state: localState
            });
      finishServerLogin(res);
      setAuthPassword('');
      showToast(
        authMode === 'login'
          ? lang === 'ar' ? `أهلاً بعودتك ${res.user.displayName}!` : `Welcome back ${res.user.displayName}!`
          : lang === 'ar' ? 'اتعمل حسابك واتزامن مع الموقع' : 'Account created & synced!',
        authMode === 'login' ? 'crown' : 'check'
      );
    } catch (err) {
      haptic('warning');
      showToast(apiErrorMessage(err, lang), 'alert');
    } finally {
      setAuthBusy(false);
    }
  };

  // Post Post to Shared Community Feed (with Category, Spoiler Tag, Likes & Replies)
  const myPostKey = user ? String(user.id || user.username || user.email || '') : '';
  const shortDateNow = () => {
    try {
      return new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' });
    } catch (_) {
      return '';
    }
  };
  // Composer: find the anime a post is about (same catalogue search as the search tab).
  const searchAnimeForPost = useCallback(
    (q) =>
      queryAlgolia('series_fav_count_desc', { query: q, hitsPerPage: 8 }).then((res) => (res.hits || []).map(formatAnimeHit).filter(Boolean)),
    []
  );
  // Feed: open the anime a post is about from its catalogue record (fresh, so the page is complete).
  const openPostAnime = useCallback(
    async (snap) => {
      if (!snap?.objectID) return;
      try {
        const hit = await fetchAnimeRecord(snap.objectID);
        if (!hit) throw new Error('missing');
        if (isHiddenAnime(hit)) {
          showToastMessage(hiddenTitleMessage(), 'info');
          return;
        }
        const anime = formatAnimeHit(hit);
        if (anime) handleOpenAnime(anime);
      } catch {
        showToast(lang === 'ar' ? 'مقدرناش نفتح الأنمي ده دلوقتي' : 'Could not open that anime right now', 'alert');
      }
    },
    [handleOpenAnime, showToast, lang]
  );

  // Every change goes through sharedLists.update: applied to the latest list, written only if
  // nobody wrote in between (retried otherwise), so posts / likes / replies of others survive.
  // The screen changes at once and is corrected (or undone, with a toast) by the answer.
  const publishingRef = useRef(false);
  const runFeedChange = useCallback(async (change) => {
    const seq = ++feedOpSeqRef.current;
    try {
      const { list } = await sharedLists.update(FEED_DOC, change);
      if (feedOpSeqRef.current === seq) {
        feedOpSeqRef.current = 0;
        setCommunityPosts(list);
        communityLoadedAtRef.current = Date.now();
      }
      return list;
    } catch (err) {
      if (feedOpSeqRef.current === seq) feedOpSeqRef.current = 0;
      throw err;
    }
  }, []);

  const handlePostPost = async (e) => {
    e.preventDefault();
    const text = newPostText.trim();
    if (!text || publishingRef.current) return;
    if (!user) {
      showToast(lang === 'ar' ? 'سجّل دخولك الأول عشان تنشر' : 'Sign in to post', 'user');
      return;
    }
    const draft = { text: newPostText, spoiler: postIsSpoiler, anime: postAnime };
    const post = {
      id: sharedItemId('post'),
      author: user.displayName || user.username,
      username: user.username || '',
      role: user.role || 'user',
      category: postCategory,
      isSpoiler: postIsSpoiler || postCategory === 'spoiler',
      ...(postAnime ? { anime: postAnime } : {}),
      createdAt: new Date().toISOString(),
      time: shortDateNow(), // older app versions show this text as-is
      text,
      likes: 0,
      likedBy: [],
      replies: []
    };
    publishingRef.current = true;
    setCommunityPosts((prev) => prependItem(prev, post, FEED_MAX));
    setNewPostText('');
    setPostIsSpoiler(false);
    setPostAnime(null);
    haptic('success');
    try {
      await runFeedChange((cur) => prependItem(cur, post, FEED_MAX));
      const nextXp = userXp + 15;
      setUserXp(nextXp);
      localStorage.setItem('bx_mob_xp', String(nextXp));
      showToast(lang === 'ar' ? 'اتنشر البوست (+15 XP)' : 'Posted (+15 XP)', 'check');
    } catch (_) {
      // not saved: take it off the feed and give the text back
      setCommunityPosts((prev) => prev.filter((p) => p.id !== post.id));
      setNewPostText((cur) => (cur ? cur : draft.text));
      setPostIsSpoiler(draft.spoiler);
      setPostAnime((cur) => cur || draft.anime);
      haptic('error');
      showToast(lang === 'ar' ? 'البوست ما اتنشرش — اتأكد من النت وجرب تاني' : 'Not posted — check your connection and try again', 'alert');
    } finally {
      publishingRef.current = false;
    }
  };

  // One like per account (likedBy). The tap decides "liked or not" from what is on screen and
  // that decision (not a toggle) is applied to the latest list, so a retry cannot flip it twice.
  const handleLikePost = useCallback(
    async (postId) => {
      if (!myPostKey) {
        showToast(lang === 'ar' ? 'سجّل دخولك الأول عشان تعمل لايك' : 'Sign in to like posts', 'user');
        return;
      }
      haptic('select');
      const wantLiked = !likedByMe(communityPosts, postId, myPostKey);
      setCommunityPosts((prev) => setPostLike(prev, postId, myPostKey, wantLiked));
      try {
        await runFeedChange((cur) => setPostLike(cur, postId, myPostKey, wantLiked));
      } catch (_) {
        setCommunityPosts((prev) => setPostLike(prev, postId, myPostKey, !wantLiked));
        showToast(lang === 'ar' ? 'اللايك ما اتسجلش — جرب تاني' : 'Like not saved — try again', 'alert');
      }
    },
    [communityPosts, myPostKey, showToast, lang, runFeedChange]
  );

  const handleAddPostReply = useCallback(
    async (postId) => {
      const text = replyText.trim();
      if (!text || !user) return;
      const replyObj = {
        id: sharedItemId('rep'),
        author: user.displayName || user.username,
        // lets account deletion find the person's replies (server/src/routes/apkApp.js)
        username: user.username || '',
        role: user.role || 'user',
        text,
        createdAt: new Date().toISOString(),
        time: (() => {
          try {
            return new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' });
          } catch (_) {
            return '';
          }
        })()
      };
      setCommunityPosts((prev) => addPostReply(prev, postId, replyObj));
      setReplyText('');
      setReplyingToPostId(null);
      try {
        const list = await runFeedChange((cur) => addPostReply(cur, postId, replyObj));
        if (list.some((p) => p.id === postId)) {
          showToast(lang === 'ar' ? 'اتبعت الرد' : 'Reply sent', 'check');
        } else {
          showToast(lang === 'ar' ? 'البوست ده اتشال من المجتمع' : 'That post is no longer in the feed', 'info');
        }
      } catch (_) {
        setCommunityPosts((prev) =>
          prev.map((p) => (p.id === postId && Array.isArray(p.replies) ? { ...p, replies: p.replies.filter((r) => r && r.id !== replyObj.id) } : p))
        );
        setReplyText((cur) => (cur ? cur : text));
        setReplyingToPostId(postId);
        showToast(lang === 'ar' ? 'الرد ما اتبعتش — جرب تاني' : 'Reply not sent — try again', 'alert');
      }
    },
    [replyText, user, showToast, lang, runFeedChange]
  );

  // Details tabs: a tab with nothing to show is not offered (no «الشخصيات (0)»); counts only
  // when there is something to count. Reviews stay, because that tab is where one is written.
  const detailTrailerId = selectedAnime ? selectedAnime.trailer || selectedAnime.youtubeId || '' : '';
  const detailTabs = useMemo(() => {
    const isRtl = lang === 'ar';
    const tabs = [{ id: 'episodes', label: isRtl ? `الحلقات (${animeEpisodes.length})` : `Episodes (${animeEpisodes.length})` }];
    if (charactersLoading) tabs.push({ id: 'characters', label: isRtl ? 'الشخصيات' : 'Casting' });
    else if (animeCharacters.length) tabs.push({ id: 'characters', label: isRtl ? `الشخصيات (${animeCharacters.length})` : `Casting (${animeCharacters.length})` });
    if (detailTrailerId) tabs.push({ id: 'trailer', label: isRtl ? 'التريلر والمشابهة' : 'Bandes-annonces' });
    else if (relatedAnimes.length) tabs.push({ id: 'trailer', label: isRtl ? 'أعمال مشابهة' : 'Titres similaires' });
    tabs.push({
      id: 'reviews',
      label: animeReviews.length ? (isRtl ? `التقييمات (${animeReviews.length})` : `Avis (${animeReviews.length})`) : isRtl ? 'التقييمات' : 'Avis'
    });
    return tabs;
  }, [lang, animeEpisodes.length, charactersLoading, animeCharacters.length, detailTrailerId, relatedAnimes.length, animeReviews.length]);
  useEffect(() => {
    if (!detailTabs.some((t) => t.id === detailTab)) setDetailTab('episodes');
  }, [detailTabs, detailTab]);

  // Options des épisodes sheet: the filler switch only exists when the server marks filler episodes.
  const hasFillerData = useMemo(() => animeEpisodes.some((ep) => ep && ep.filler), [animeEpisodes]);
  const epOptionsCount = (epLayoutMode === 'grid' ? 1 : 0) + (epAscending ? 0 : 1) + (hideFiller && hasFillerData ? 1 : 0);

  // Filtered & sorted episodes inside Anime Detail Sheet (with 50-episode range chunking support)
  const displayedEpisodes = useMemo(() => {
    let list = [...animeEpisodes];
    if (hideFiller) {
      list = list.filter((ep) => !ep.filler);
    }
    if (epSearchQuery.trim()) {
      const q = epSearchQuery.trim().toLowerCase();
      list = list.filter(
        (ep) =>
          String(ep.number).includes(q) ||
          ep.name.toLowerCase().includes(q) ||
          (ep.titleAr || '').toLowerCase().includes(q)
      );
    } else if (epRangeChunk >= 0 && animeEpisodes.length > 50) {
      const start = epRangeChunk * 50;
      list = list.slice(start, start + 50);
    }
    if (!epAscending) list.reverse();
    return list;
  }, [animeEpisodes, hideFiller, epSearchQuery, epAscending, epRangeChunk]);

  // Manga tab: popular titles for the quick-search chips (once per session, cached a day).
  const mangaPopularLoadedRef = useRef(false);
  useEffect(() => {
    if (activeTab !== 'manga' || mangaPopularLoadedRef.current) return;
    mangaPopularLoadedRef.current = true;
    let alive = true;
    fetchPopularMangaTitles(10).then((titles) => {
      if (alive) setMangaPopularTitles(titles);
    });
    return () => {
      alive = false;
    };
  }, [activeTab]);

  // Manga filters (server + type) in the shared filter sheet.
  const MANGA_KIND_FILTERS = useMemo(
    () => [
      { id: 'ALL', ar: 'الكل', en: 'All' },
      { id: 'MANHWA', ar: 'مانهوا كورية وصينية', en: 'Manhwa' },
      { id: 'MANGA', ar: 'مانجا يابانية', en: 'Manga' }
    ],
    []
  );
  const mangaServerTabs = useMemo(
    () => [...BX_MANGA_SERVER_TABS, ...(mangaSearchOnlyEnabled ? [BX_MANGA_SEARCH_ONLY_TAB] : [])],
    [mangaSearchOnlyEnabled]
  );
  const mangaFilterCount = (mangaSource !== 'all' ? 1 : 0) + (mangaFilterType !== 'ALL' ? 1 : 0);
  const mangaFilterSummary = (() => {
    const isRtl = lang === 'ar'; // (the component's isRtl is declared further down)
    const srv = mangaServerTabs.find((t) => t.id === mangaSource) || mangaServerTabs[0];
    const kind = MANGA_KIND_FILTERS.find((k) => k.id === mangaFilterType) || MANGA_KIND_FILTERS[0];
    const parts = [srv ? (isRtl ? srv.ar : srv.en) : ''];
    if (kind.id !== 'ALL') parts.push(isRtl ? kind.ar : kind.en);
    return parts.filter(Boolean).join(' • ');
  })();

  // Filtered & sorted chapters inside Manhwa Series Hub
  const displayedMangaChapters = useMemo(() => {
    let list = [...mangaChapters];
    if (mangaChSearch.trim()) {
      const q = mangaChSearch.trim().toLowerCase();
      list = list.filter(
        (ch) => String(ch.chapter).toLowerCase().includes(q) || String(ch.title || '').toLowerCase().includes(q)
      );
    }
    if (mangaChAsc) {
      list.reverse();
    }
    return list;
  }, [mangaChapters, mangaChSearch, mangaChAsc]);

  const seekVideoBy = (deltaSec) => {
    const v = videoRef.current;
    if (!v) return;
    haptic('tap');
    const dur = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.max(0, Math.min(dur - 1, (v.currentTime || 0) + deltaSec));
  };

  const handleVideoDoubleTap = (side) => {
    if (!videoRef.current) return;
    if (side === 'left') {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
    } else {
      videoRef.current.currentTime = Math.min(
        videoRef.current.duration || 9999,
        videoRef.current.currentTime + 10
      );
    }
    setSkipRipple(side);
    setTimeout(() => setSkipRipple(null), 550);
  };

  // Tab navigation (dock, top-bar picture, "All" links). Switching tabs slides the new
  // page in from the side of the tapped tab (tabMotion.js); the same tab scrolls to top.
  const goToTab = (tabId, after) => {
    const sameTab = activeTab === tabId && !selectedAnime;
    haptic(sameTab ? 'select' : 'tap');
    if (sameTab) {
      setCommandMenuOpen(false);
      if (typeof after === 'function') after();
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (_) {}
      return;
    }
    const apply = () => {
      setCommandMenuOpen(false);
      setSelectedAnime(null);
      setActiveEpisode(null);
      setPlayerMinimized(false);
      setActiveTab(tabId);
      if (typeof after === 'function') after();
      jumpToTop();
    };
    if (selectedAnime || activeEpisode) apply();
    else navigateWithMotion(activeTab, tabId, lang === 'ar', apply);
  };

  // Interface language (Settings). The lang effect updates <html lang/dir>.
  const changeLanguage = (next) => {
    if (next === lang) return;
    haptic('select');
    try {
      localStorage.setItem('bx_mob_lang', next);
    } catch (_) {}
    if (isWebApp()) rememberWebLanguage(next);
    if (typeof document.startViewTransition === 'function') {
      try {
        document.startViewTransition(() => flushSync(() => setLang(next)));
        return;
      } catch (_) {}
    }
    setLang(next);
  };

  // Search: remember the last queries (only real searches the user made on this phone).
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return undefined;
    const t = setTimeout(() => {
      setRecentSearches((prev) => {
        const next = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
        try {
          localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
        } catch (_) {}
        return next;
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (_) {}
  };
  const catalogFilterValue = { sort: catalogSort, type: catalogType, state: catalogState, studio: catalogStudio, genre: catalogGenre };
  const catalogFilterCount = activeFilterCount(catalogFilterValue);
  const applyCatalogFilters = (v) => {
    setCatalogSort(v.sort);
    setCatalogType(v.type);
    setCatalogState(v.state);
    setCatalogStudio(v.studio);
    setCatalogGenre(v.genre);
  };
  const resetCatalogFilters = () =>
    applyCatalogFilters({ sort: SORT_OPTIONS[0].id, type: TYPE_FILTERS[0], state: STATE_FILTERS[0], studio: STUDIO_FILTERS[0], genre: GENRE_CHIPS[0] });

  // Home "All" links open the search tab with the matching order / filter.
  const handleHomeSeeAll = (sortKey, filter) => {
    if (sortKey === 'schedule') {
      goToTab('schedule', () => setScheduleDay(todayScheduleId()));
      return;
    }
    goToTab('catalog', () => {
      setSearchQuery('');
      setCatalogSort(sortKey);
      setCatalogGenre(GENRE_CHIPS[0]);
      setCatalogType(filter === 'movie' ? TYPE_FILTERS.find((t) => t.id === 'movie') : TYPE_FILTERS[0]);
      setCatalogState(filter === 'airing' ? STATE_FILTERS.find((t) => t.id === 'airing') : STATE_FILTERS[0]);
      setCatalogStudio(STUDIO_FILTERS[0]);
    });
  };
  const handleHomeGenre = (genre) => {
    goToTab('catalog', () => {
      setSearchQuery('');
      setCatalogGenre(genre);
      setCatalogType(TYPE_FILTERS[0]);
      setCatalogState(STATE_FILTERS[0]);
      setCatalogStudio(STUDIO_FILTERS[0]);
    });
  };
  const avatarPhoto = user?.photoUrl && !avatarFailed ? user.photoUrl : '';
  const isRtl = lang === 'ar';
  // Entrance class of the visible tab page, decided once when that page mounts.
  const pageKey = `${activeTab}${activeTab === 'profile' ? `:${profilePage}` : ''}${selectedAnime ? ':details' : ''}`;
  const pageClassRef = useRef({ key: '', cls: 'bx-page' });
  if (pageClassRef.current.key !== pageKey) pageClassRef.current = { key: pageKey, cls: pageEnterClass() };
  const pageCls = pageClassRef.current.cls;
  // Overlays that animate out before they unmount.
  const menuPresence = usePresence(commandMenuOpen, 200);
  const peekPresence = usePresence(Boolean(quickPeekAnime), 240);
  const lastPeekRef = useRef(null);
  if (quickPeekAnime) lastPeekRef.current = quickPeekAnime;
  const peekItem = quickPeekAnime || lastPeekRef.current;
  const homeLists = useMemo(
    () => ({ popular: popularList, topRated: topRankedList, airing: airingList, latest: latestList, movies: moviesList, today: todayList }),
    [popularList, topRankedList, airingList, latestList, moviesList, todayList]
  );

  // ---- v16 UI hooks ---------------------------------------------------------------
  useEffect(() => {
    installPointerTracker();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const handlePullRefresh = useCallback(
    () =>
      new Promise((resolve) => {
        refreshDoneRef.current = resolve;
        setTimeout(resolve, 10000);
        if (activeTab === 'home') {
          setHomeRefreshTick((t) => t + 1);
          fetchAppConfig().then(applyAppConfig).catch(() => {});
        } else if (activeTab === 'schedule') {
          setScheduleRefreshTick((t) => t + 1);
        } else if (activeTab === 'community') {
          loadCommunityFeed().finally(resolve);
        } else {
          resolve();
        }
      }),
    [activeTab, applyAppConfig, loadCommunityFeed]
  );

  // Drag the details sheet down to close it; drag the player page down to shrink it to the mini player.
  const ignoreSwipeTarget = useCallback(
    (t) => Boolean(t?.closest?.('[data-bx-video], input, textarea, select, [role="slider"], [data-no-swipe], .bx-mob-scroll')),
    []
  );
  useSwipeDismiss(detailsSheetRef, closeDetailsSheet, {
    enabled: Boolean(selectedAnime) && !(activeEpisode && !playerMinimized),
    ignore: ignoreSwipeTarget
  });
  const minimizePlayer = useCallback(() => setPlayerMinimized(true), []);
  useSwipeDismiss(playerPageRef, minimizePlayer, {
    enabled: Boolean(activeEpisode) && !playerMinimized && !videoFullscreen,
    ignore: ignoreSwipeTarget
  });

  // "Because you watched": titles sharing the genres of the latest watched show.
  const loadSimilarTitles = useCallback(async (seed) => {
    const title = seed?.titleEn || seed?.titleAr || '';
    if (!title) return [];
    const found = await queryAlgolia('series_fav_count_desc', { query: title, hitsPerPage: 3 }).catch(() => null);
    const hit = (found?.hits || []).map(formatAnimeHit).find((x) => x && (x.objectID === seed.objectID || x.titleEn === seed.titleEn));
    const tags = (hit?.tags || []).filter(Boolean).slice(0, 2);
    if (!tags.length) return [];
    const query = (facetFilters) =>
      queryAlgolia('series_fav_count_desc', { query: '', facetFilters, hitsPerPage: 24 })
        .then((r) => (r?.hits || []).map(formatAnimeHit).filter(Boolean))
        .catch(() => []);
    let list = await query(tags.map((t) => [`tags:${t}`]));
    if (list.length < 8 && tags.length > 1) list = [...list, ...(await query([[`tags:${tags[0]}`]]))];
    const seen = new Set();
    return list.filter((x) => x.objectID !== (hit?.objectID || seed.objectID) && !seen.has(x.objectID) && seen.add(x.objectID));
  }, []);
  // Saved lists as shown on screen, without hidden genres (the stored and synced data is untouched).
  const visibleFavorites = useMemo(() => favorites.filter((f) => !isHiddenAnime(f, hiddenIds)), [favorites, hiddenIds]);
  const visibleHistory = useMemo(() => watchHistory.filter((h) => !isHiddenAnime(h, hiddenIds)), [watchHistory, hiddenIds]);
  // The titles new-episode alerts watch: my list + "watching" / "planned" (episodeAlerts.js).
  const followedForAlerts = useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (t) => {
      const id = t?.objectID || t?.slug;
      if (!id || seen.has(id) || isHiddenAnime(t, hiddenIds)) return;
      seen.add(id);
      out.push(t);
    };
    favorites.forEach(add);
    Object.values(watchlistMap || {}).forEach((entry) => {
      if (entry && (entry.status === 'watching' || entry.status === 'planned')) add(entry);
    });
    return out;
  }, [favorites, watchlistMap, hiddenIds]);
  const visibleWatchlist = useMemo(
    () => Object.values(watchlistMap).filter((w) => w && !isHiddenAnime(w, hiddenIds)),
    [watchlistMap, hiddenIds]
  );
  const visibleMangaHistory = useMemo(() => mangaHistory.filter((m) => !isHiddenManga(m)), [mangaHistory]);
  const watchedIds = useMemo(() => watchHistory.map((h) => h.objectID).filter(Boolean), [watchHistory]);

  // ==================== TITLE LOOKUPS (links, watch party, rankings, «ملخصك») ====================
  // A website slug → the app's record: the catalogue (Algolia) record for BLACK X 1 titles, so
  // lists / history / positions use the same objectID as in-app opens; else the server's show.
  const resolveAnimeBySlug = useCallback(async (slug, sourceHint = '') => {
    const source = sourceHint === 'aniproject' ? 'aniproject' : inferAnimeSource({ slug });
    let show = null;
    try {
      const data = await bxRequestJson(`/api/stream/show/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`, { timeoutMs: 20000 });
      show = data?.show || null;
    } catch (_) {
      show = null;
    }
    let anime = null;
    if (source === 'witanime') {
      const title = show ? show.titleRomaji || show.title || show.titleEn : slug.slice(3).replace(/-/g, ' ');
      const pick = (res) => (res?.hits || []).find((h) => witcherSlug(h.objectID) === slug) || null;
      const hit =
        pick(await queryAlgolia('series_fav_count_desc', { query: title, hitsPerPage: 20 }).catch(() => null)) ||
        // Not in the filtered index: a hidden title (its tags make the details refuse it below).
        pick(await queryAlgoliaRaw('series_fav_count_desc', { query: title, hitsPerPage: 20 }).catch(() => null));
      if (hit) anime = formatAnimeHit(hit);
    }
    if (!anime && show) {
      anime = mapShowToMobileAnime({ ...show, slug: show.slug || slug, source });
      if (anime && (isHiddenAnime(show) || show.bxHidden)) anime.bxHidden = true;
    }
    return anime;
  }, []);

  /** Opens the title of a slug (and plays episode `ep`); false when it cannot be shown. */
  const openAnimeBySlug = useCallback(
    async (slug, sourceHint = '', ep = null) => {
      const anime = await resolveAnimeBySlug(slug, sourceHint);
      if (!anime) {
        showToast(isRtl ? 'ماقدرناش نلاقي العمل ده — جرّب البحث' : 'Impossible de trouver ce titre — essayez une recherche', 'search');
        return false;
      }
      if (anime.bxHidden || isHiddenAnime(anime)) {
        showToastMessage(hiddenTitleMessage(), 'info');
        return false;
      }
      handleOpenAnimeBase(anime, ep);
      return true;
    },
    [resolveAnimeBySlug, handleOpenAnimeBase, showToast, isRtl]
  );

  // ==================== WATCH PARTY (useWatchParty.js, PartyPanel.jsx) ====================
  const partyTransport = useMemo(() => createPartyTransport({ base: BX_SETTINGS_BASE, key: BX_KEY }), []);
  const partyMember = useMemo(() => {
    const uid = partyMemberId();
    return { uid, name: partyDisplayName(user, uid, isRtl) };
  }, [user, isRtl]);
  const partyCurrent = useMemo(() => {
    if (!selectedAnime || !activeEpisode) return null;
    const slug = animeSlugOf(selectedAnime);
    if (!slug) return null;
    return {
      slug,
      source: selectedAnime.source || '',
      objectID: selectedAnime.objectID || '',
      title: selectedAnime.titleEn || selectedAnime.titleRomaji || '',
      poster: selectedAnime.poster || '',
      episode: Number(activeEpisode.number ?? activeEpisode.episode) || 1,
      epName: activeEpisode.name || ''
    };
  }, [selectedAnime, activeEpisode]);
  // A guest follows the host: the same title → switch episode, else open the host's title.
  const openPartyContent = useCallback(
    (room) => {
      if (!room) return;
      setPartyPanelOpen(true);
      if (selectedAnime && animeSlugOf(selectedAnime) === room.slug) {
        const ep = animeEpisodes.find((e) => Number(e.number) === Number(room.episode));
        if (ep) {
          setPlayerMinimized(false);
          handlePlayEpisode(selectedAnime, ep);
          return;
        }
      }
      openAnimeBySlug(room.slug, room.source, room.episode);
    },
    [selectedAnime, animeEpisodes, handlePlayEpisode, openAnimeBySlug]
  );
  const party = useWatchParty({
    transport: partyTransport,
    videoRef,
    member: partyMember,
    current: partyCurrent,
    onNavigate: openPartyContent,
    notify: showToast,
    isRtl,
    isWeb
  });
  const partyJoinRef = useRef(party.join);
  partyJoinRef.current = party.join;

  // ==================== COMPUTER EXTRAS (website): cinema mode, preview, quick search, new tabs ====================
  const [theatrePref, setTheatrePref] = useState(() => {
    try {
      return localStorage.getItem('bx_theatre') !== 'off';
    } catch (_) {
      return true;
    }
  });
  const [wideScreen, setWideScreen] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 1200px)').matches));
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(min-width: 1200px)') : null;
    if (!mq) return undefined;
    const on = () => setWideScreen(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const theatreAvailable = isWeb && wideScreen;
  const theatreOn = theatreAvailable && theatrePref;
  const toggleTheatre = useCallback(() => {
    setTheatrePref((v) => {
      const next = !v;
      try {
        localStorage.setItem('bx_theatre', next ? 'on' : 'off');
      } catch (_) {}
      return next;
    });
  }, []);

  const isFavoriteItem = useCallback(
    (item) => Boolean(item) && favorites.some((f) => f.objectID === item.objectID || (item.slug && f.slug === item.slug)),
    [favorites]
  );
  // «شاهد» on the preview: the last episode with a saved position, else episode 1.
  const resumeEpisodeFor = useCallback((item) => {
    const slug = animeSlugOf(item);
    if (!slug) return null;
    let best = null;
    for (const [key, v] of positionEntries()) {
      if (!String(key).startsWith(`${slug}:`)) continue;
      const ep = Number(String(key).slice(slug.length + 1));
      if (ep > 0 && (!best || (Number(v?.at) || 0) > best.at)) best = { ep, at: Number(v?.at) || 0 };
    }
    return best ? best.ep : null;
  }, []);
  const playFromPreview = useCallback((item) => handleOpenAnime(item, resumeEpisodeFor(item) || 1), [handleOpenAnime, resumeEpisodeFor]);

  const searchForPalette = useCallback(async (q) => {
    const res = await queryAlgolia('series_fav_count_desc', { query: q, hitsPerPage: 8 });
    return (res?.hits || []).map(formatAnimeHit).filter(Boolean);
  }, []);
  const appSheetRef = useRef(appSheet);
  appSheetRef.current = appSheet;
  useEffect(() => {
    if (!isWeb) return undefined;
    const onKey = (e) => {
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(t && t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setAppSheet((cur) => (cur === 'palette' ? null : 'palette'));
        return;
      }
      if (e.key === 'Escape' && (appSheetRef.current === 'shortcuts' || appSheetRef.current === 'palette')) {
        setAppSheet(null);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (e.key === '/') {
        e.preventDefault();
        setAppSheet('palette');
      } else if (e.key === '?') {
        e.preventDefault();
        setAppSheet((cur) => (cur === 'shortcuts' ? null : 'shortcuts'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWeb]);

  // Middle click / Ctrl + click on a poster opens its page in a new tab (PosterCard.jsx).
  useEffect(() => {
    if (!isWeb) return undefined;
    setPosterHrefBuilder((item) => {
      if (item?.bxId) {
        const params = new URLSearchParams({ manga: String(item.bxId) });
        if (item.bxServer) params.set('server', String(item.bxServer));
        return `/browse?${params.toString()}`;
      }
      const slug = animeSlugOf(item);
      return slug ? `/show/${encodeURIComponent(slug)}${item?.source === 'aniproject' ? '?source=aniproject' : ''}` : '';
    });
    return () => setPosterHrefBuilder(null);
  }, [isWeb]);

  // ==================== RANKINGS / «ملخصك» (website profile pages) ====================
  const loadRankings = useCallback(async () => {
    const data = await bxRequestJson('/api/anime/rankings', { timeoutMs: 20000 });
    return (Array.isArray(data?.anime) ? data.anime : []).filter((m) => !isHiddenAnime({ tags: m.genres || [] }));
  }, []);
  // An AniList title → its catalogue record: the same MAL id, else the exact same name.
  const openRankedTitle = useCallback(
    async (media) => {
      const names = [media.titleRomaji, media.titleEnglish].filter(Boolean);
      for (const q of names) {
        const res = await queryAlgolia('series_fav_count_desc', { query: q, hitsPerPage: 10 }).catch(() => null);
        const hits = res?.hits || [];
        const lower = q.toLowerCase();
        const hit =
          (media.malId ? hits.find((h) => String(h.mal_id) === String(media.malId)) : null) ||
          hits.find((h) => [h.name, h.details?.english_title].some((n) => n && String(n).toLowerCase() === lower));
        if (hit) {
          handleOpenAnime(formatAnimeHit(hit));
          return;
        }
      }
      showToast(isRtl ? 'مش لاقيين العمل ده على BLACK X — دوّرنا عليه في البحث' : 'Introuvable sur BLACK X — recherche en cours', 'search');
      setSearchQuery(names[0] || '');
      goToTab('catalog');
    },
    [handleOpenAnime, showToast, isRtl] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const openWrappedTitle = useCallback(
    async (t) => {
      if (t?.objectID) {
        const hit = await fetchAnimeRecord(t.objectID).catch(() => null);
        if (hit && !isHiddenAnime(hit)) {
          handleOpenAnime(formatAnimeHit(hit));
          return;
        }
      }
      if (t?.slug) openAnimeBySlug(t.slug);
    },
    [handleOpenAnime, openAnimeBySlug]
  );

  // ==================== APK: air-time reminders while the app is closed (nativeAlarms.js) ====================
  useEffect(() => {
    if (isWeb || !nativeAlarmsSupported()) return undefined;
    // No air times yet (offline, still loading) while titles are followed: keep the reminders
    // the phone already has instead of replacing them with an empty list.
    if (followedForAlerts.length && !(airingMap && airingMap.size)) return undefined;
    const t = setTimeout(() => {
      scheduleNativeAlarms(buildAlarmList({ followed: followedForAlerts, airingMap, isRtl }));
    }, 1500);
    return () => clearTimeout(t);
  }, [isWeb, followedForAlerts, airingMap, isRtl]);

  // ==================== PHONE WEBSITE: address bar, back button, links (webRoutes.js / webHistory.js) ====================
  const webUrl = useMemo(() => {
    if (!isWeb) return '';
    const playerOpen = Boolean(activeEpisode && !playerMinimized);
    const showSlug = selectedAnime ? animeSlugOf(selectedAnime) : '';
    const mangaId = selectedManga?.bxId || '';
    return webUrlFor({
      tab: activeTab,
      catalogQuery: searchQuery,
      profilePage: profileStack[profileStack.length - 1] || '',
      show: showSlug ? { slug: showSlug, source: selectedAnime?.source || '' } : null,
      episode: playerOpen && showSlug ? Number(activeEpisode.number ?? activeEpisode.episode) || null : null,
      manga: mangaId ? { id: mangaId, server: mangaActiveServer || selectedManga.bxServer || '' } : null,
      chapter: mangaId && activeMangaChapter ? activeMangaChapter.chapterId || activeMangaChapter.id || null : null,
      party: playerOpen && party.code ? party.code : ''
    });
  }, [isWeb, activeTab, searchQuery, profileStack, selectedAnime, activeEpisode, playerMinimized, selectedManga, mangaActiveServer, activeMangaChapter, party.code]);
  // Same rule as the APK's history push: anything the back button can close.
  const webDepth =
    commandMenuOpen ||
    appSheet ||
    filterSheetOpen ||
    playerMoreOpen ||
    storyPreviewAnime ||
    quickPeekAnime ||
    videoFullscreen ||
    (activeEpisode && !playerMinimized) ||
    selectedAnime ||
    activeMangaChapter ||
    selectedManga ||
    profileStack.length > 0 ||
    signOutConfirmOpen ||
    activeTab !== 'home'
      ? 1
      : 0;
  useEffect(() => {
    if (isWeb) syncWebHistory(webUrl, webDepth);
  }, [isWeb, webUrl, webDepth]);

  // Page title + description in the browser tab / history list / shared links (pageMeta.js).
  useEffect(() => {
    if (!isWeb) return;
    const ar = lang === 'ar';
    const NO_STORY = 'مفيش ملخص للعمل ده لسه.';
    const story = selectedAnime ? (ar ? selectedAnime.storyAr : selectedAnime.storyEn || selectedAnime.storyAr) : '';
    const legal = activeTab === 'profile' ? LEGAL_DOCS[profilePage] : null;
    applyPageMeta(
      pageMetaFor({
        lang,
        tab: activeTab,
        show: selectedAnime ? { title: selectedAnime.titleEn || selectedAnime.titleRomaji || selectedAnime.titleAr, story: story === NO_STORY ? '' : story } : null,
        manga: selectedManga ? { title: selectedManga.name, story: selectedManga.description || selectedManga.summary || '' } : null,
        profileTitle: profilePage !== 'root' ? profilePageTitle(profilePage, ar) : '',
        profileDescription: legal ? (ar ? legal.introAr : legal.introEn) : ''
      })
    );
  }, [isWeb, lang, activeTab, profilePage, selectedAnime, selectedManga]);

  // Guests on the profile: load Google's web sign-in ahead, so the popup opens right from the tap.
  useEffect(() => {
    if (!isWeb || user || activeTab !== 'profile') return;
    import('./webGoogle.js')
      .then((m) => m.prepareWebGoogle())
      .catch(() => {});
  }, [isWeb, user, activeTab]);

  // Open the title / episode / manga a link points to (once, when the app starts).
  const webDeepLinkDoneRef = useRef(false);
  const webPendingChapterRef = useRef('');
  useEffect(() => {
    if (!webStart || webDeepLinkDoneRef.current) return;
    webDeepLinkDoneRef.current = true;
    const start = webStart;
    const notFound = () =>
      showToast(lang === 'ar' ? 'ماقدرناش نلاقي الصفحة دي — جرّب البحث' : 'We could not find that page — try searching', 'search');
    if (start.kind === 'watch' && start.party) {
      // An invite link: the room decides the title and episode (useWatchParty opens them).
      partyJoinRef.current(start.party).then((ok) => {
        if (ok) return;
        showToast(
          lang === 'ar' ? 'الحفلة دي خلصت أو مش موجودة — فتحنالك الحلقة' : 'That party is over or does not exist — here is the episode',
          'popcorn'
        );
        openAnimeBySlug(start.slug, start.source, start.ep);
      });
    } else if (start.kind === 'show' || start.kind === 'watch') {
      (async () => {
        const anime = await resolveAnimeBySlug(start.slug, start.source);
        if (!anime) {
          notFound();
          return;
        }
        if (anime.bxHidden || isHiddenAnime(anime)) {
          showToastMessage(hiddenTitleMessage(), 'info');
          return;
        }
        handleOpenAnimeBase(anime, start.kind === 'watch' ? start.ep : null);
      })();
    } else if (start.kind === 'manga') {
      (async () => {
        let hit = null;
        try {
          const qs = start.server ? `?server=${encodeURIComponent(start.server)}` : '';
          const data = await bxRequestJson(`/api/content/library/${encodeURIComponent(start.id)}${qs}`, { timeoutMs: 25000 });
          const item = data?.item || null;
          hit = item ? mapBxMangaItem({ ...item, id: item.id || start.id }, start.server || '') : null;
        } catch (_) {
          hit = null;
        }
        if (!hit) {
          notFound();
          return;
        }
        webPendingChapterRef.current = start.chapter || '';
        handleOpenManga(hit, start.server || '');
      })();
    }
  }, [webStart, handleOpenAnimeBase, handleOpenManga, showToast, lang, resolveAnimeBySlug, openAnimeBySlug]);
  // …and the chapter, once the manga's chapters are in.
  useEffect(() => {
    const want = webPendingChapterRef.current;
    if (!want || !mangaChapters.length) return;
    webPendingChapterRef.current = '';
    const ch = mangaChapters.find((c) => c.id === want || c.chapterId === want);
    if (ch) handleReadMangaChapter(ch);
  }, [mangaChapters, handleReadMangaChapter]);

  // ---- Profile hub wiring (ProfileTab.jsx renders, the state and actions live here) ----
  const startProfileEdit = () => {
    if (!user) return;
    setEditDisplayName(user.displayName || '');
    setEditBio(user.bio || '');
    setEditPhotoUrl(user.photoUrl || '');
    openProfilePage('edit');
  };
  const openMangaFromProfile = (entry) => {
    setActiveTab('manga');
    handleOpenManga(entry);
  };
  const readOfflineFromProfile = (och) => {
    setActiveTab('manga');
    setSelectedManga({ name: och.mangaName, poster_uri: och.poster, source: och.source });
    handleReadMangaChapter(och);
  };
  const deleteCapture = (id) => {
    setSavedPanels((prev) => {
      const next = prev.filter((x) => x.id !== id);
      try {
        localStorage.setItem('bx_mob_saved_panels', JSON.stringify(next));
      } catch (_) {
        /* storage or scroll unavailable */
      }
      return next;
    });
  };
  const handleSignOut = () => {
    setSignOutConfirmOpen(false);
    apkSignOut();
    setSessionToken(null);
    setUser(null);
    localStorage.removeItem('bx_mob_user');
    resetProfileStack();
    haptic('success');
    showToast(isRtl ? 'اتسجّل الخروج' : 'Déconnecté', 'logout');
  };
  // Account deletion (profile → privacy & security → delete account; server: /api/app/account/delete).
  const [accountDeleteBusy, setAccountDeleteBusy] = useState(false);
  const handleDeleteAccount = async ({ confirm, password, wipeLocal }) => {
    if (accountDeleteBusy) return;
    setAccountDeleteBusy(true);
    try {
      await apkDeleteAccount({ confirm, password });
      apkSignOut();
      setSessionToken(null);
      setUser(null);
      try {
        localStorage.removeItem('bx_mob_user');
        localStorage.removeItem('bx_mob_redeemed_vip_code');
        if (wipeLocal) {
          ['bx_mob_favorites', 'bx_mob_watchlist_map', 'bx_mob_history', 'bx_mob_manga_history', 'bx_mob_xp'].forEach((k) => localStorage.removeItem(k));
        }
      } catch (_) {
        /* storage unavailable */
      }
      if (wipeLocal) {
        setFavorites([]);
        setWatchlistMap({});
        setWatchHistory([]);
        setMangaHistory([]);
        setUserXp(0);
        clearPositions();
      }
      resetProfileStack();
      haptic('success');
      showToast(isRtl ? 'اتمسح حسابك نهائياً' : 'Votre compte a été supprimé', 'check');
    } catch (err) {
      haptic('error');
      showToast(apiErrorMessage(err, lang), 'alert');
    } finally {
      setAccountDeleteBusy(false);
    }
  };
  const profileSettings = {
    lang,
    onLanguage: changeLanguage,
    dataSaverPref,
    dataSaverActive: dataSaver,
    onDataSaver: (id) => {
      haptic('select');
      setDataSaverPref(id);
    },
    haptics: hapticsOn,
    onHaptics: (on) => {
      setHapticsEnabled(on);
      setHapticsOn(on);
      haptic('select');
    },
    splashSound: splashSoundOn,
    onSplashSound: (on) => {
      try {
        localStorage.setItem(SPLASH_SOUND_KEY, on ? 'on' : 'off');
      } catch (_) {
        /* storage or scroll unavailable */
      }
      setSplashSoundOn(on);
      haptic('select');
    },
    splashTheme: motionPref,
    splashThemes: BLACK_X_MOTION_THEMES,
    onSplashTheme: (m) => {
      haptic('select');
      setMotionPref(m.id);
      try {
        localStorage.setItem('bx_motion_pref', m.id);
      } catch (_) {
        /* storage or scroll unavailable */
      }
    },
    onPreviewSplash: () => window.triggerBlackXMotion?.(motionPref === 'random' ? undefined : motionPref, 4000),
    incognito: incognitoMode,
    onIncognito: (next) => {
      haptic('select');
      setIncognitoMode(next);
      try {
        localStorage.setItem('bx_mob_incognito', String(next));
      } catch (_) {
        /* storage or scroll unavailable */
      }
      showToast(next ? (isRtl ? 'التصفح الخفي شغال' : 'Mode privé activé') : isRtl ? 'التصفح الخفي اتقفل' : 'Mode privé désactivé', 'eye-off');
    },
    pinCode: appPinCode,
    pinInput: pinSetupInput,
    setPinInput: setPinSetupInput,
    onSavePin: () => {
      if (pinSetupInput.length !== 4) {
        showToast(isRtl ? 'اكتب 4 أرقام بالظبط' : 'Saisissez exactement 4 chiffres');
        return;
      }
      setAppPinCode(pinSetupInput);
      try {
        localStorage.setItem('bx_mob_pin_code', pinSetupInput);
      } catch (_) {
        /* storage or scroll unavailable */
      }
      setPinSetupInput('');
      haptic('success');
      showToast(isRtl ? 'اتفعّل قفل التطبيق' : 'Verrouillage activé', 'lock');
    },
    onClearPin: () => {
      setAppPinCode('');
      setPinLocked(false);
      setPinSetupInput('');
      try {
        localStorage.removeItem('bx_mob_pin_code');
      } catch (_) {
        /* storage or scroll unavailable */
      }
      showToast(isRtl ? 'اتلغى قفل التطبيق' : 'Verrouillage désactivé', 'unlock');
    },
    title: selectedSovereignTitle,
    onTitle: (t, locked) => {
      if (locked) {
        haptic('error');
        showToast(
          t.need === 'vip'
            ? isRtl
              ? 'اللقب ده لأعضاء VIP'
              : 'This title is for VIP members'
            : isRtl
            ? 'كمّل الهدف المكتوب تحت اللقب عشان يتفتح'
            : 'Reach the goal under the title to unlock it',
          'lock'
        );
        return;
      }
      haptic('select');
      setSelectedSovereignTitle(t.id);
      try {
        localStorage.setItem('bx_mob_sovereign_title', t.id);
      } catch (_) {
        /* storage or scroll unavailable */
      }
    }
  };
  // Developer panel (developer accounts only) — shown as the profile's "Developer" page.
  const devPanelNode = isDeveloper ? (
    <DeveloperPanel
      isRtl={isRtl}
      dev={{
        tab: devSubTab,
        setTab: setDevSubTab,
        // VIP gate + codes
        enforced: globalVipEnforced,
        toggleBusy: devToggleBusy,
        onToggleEnforced: handleDevToggleGlobalVip,
        codes: cloudVipCodes,
        genTier: devGenTier,
        setGenTier: setDevGenTier,
        genDays: devGenDays,
        setGenDays: setDevGenDays,
        genBusy: devGenBusy,
        onGenerate: handleDevGenerateVipCode,
        onDeleteCode: handleDevDeleteVipCode,
        onCopyCode: (code) => {
          try {
            navigator.clipboard?.writeText(code);
          } catch (_) {
            /* clipboard unavailable */
          }
          showToast(isRtl ? `اتنسخ الكود: ${code}` : `Copié : ${code}`, 'check');
        },
        // members
        grantTarget: devGrantTarget,
        setGrantTarget: setDevGrantTarget,
        grantTier: devGrantTier,
        setGrantTier: setDevGrantTier,
        grantDays: devGrantDays,
        setGrantDays: setDevGrantDays,
        grantBusy: devGrantBusy,
        onGrant: handleDevDirectGrantUserVip,
        onRevoke: handleDevRevokeUserVip,
        inspectQuery: devInspectQuery,
        setInspectQuery: setDevInspectQuery,
        inspectBusy: devInspectBusy,
        inspected: devInspectedUser,
        setInspected: setDevInspectedUser,
        onInspect: handleDevInspectUser,
        onPickForGrant: (u) => {
          setDevGrantTarget(u.email || u.username || '');
          setDevGrantTier('vip_monarch');
          showToast(isRtl ? 'اتحدد في خانة الترقية فوق' : 'Rempli dans le formulaire ci-dessus', 'crown');
        },
        // broadcast + spotlight
        broadcastMsg: globalBroadcastMsg,
        broadcastInput: devBroadcastInput,
        setBroadcastInput: setDevBroadcastInput,
        broadcastBusy: devBroadcastBusy,
        onBroadcast: handleDevEnvoyerBroadcast,
        pinnedRec: globalPinnedRec,
        pinTitle: devPinTitleInput,
        setPinTitle: setDevPinTitleInput,
        pinNote: devPinNoteInput,
        setPinNote: setDevPinNoteInput,
        pinBusy: devPinBusy,
        onPin: handleDevPinRecommendation,
        // requests
        requests: cloudUserRequests,
        onDoneRequest: handleDevDeleteUserRequest
      }}
    />
  ) : null;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`bx-app${dataSaver ? ' bx-datasaver' : ''}`}
      style={{
        minHeight: '100dvh',
        background: '#000000',
        color: '#ffffff',
        fontFamily: "'Cairo', 'Tajawal', 'Inter', system-ui, sans-serif",
        paddingBottom: '86px',
        overflowX: 'hidden',
        WebkitTapHighlightColor: 'transparent',
        userSelect: 'none'
      }}
    >
      <style>{`
        @keyframes bxPulseGlow {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.03); }
        }
        @keyframes bxSlideUp {
          from { opacity: 0; transform: translate3d(0, 28px, 0); }
          to { opacity: 1; transform: none; }
        }
        .bx-mob-scroll::-webkit-scrollbar { display: none; }
        .bx-mob-scroll { -ms-overflow-style: none; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
      `}</style>

      {/* GPU 4K Anime Line-Art Sharpening Convolution Filter */}
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <filter id="bx-sharpen-4k">
            <feConvolveMatrix order="3" kernelMatrix="0 -0.45 0 -0.45 2.8 -0.45 0 -0.45 0" preserveAlpha="true" />
          </filter>
        </defs>
      </svg>

      {/* Top toast (own component: showing one does not re-render the app) */}
      <ToastHost />

      {/* Tirez pour actualiser (home + schedule) */}
      <PullToRefresh
        onRefresh={handlePullRefresh}
        disabled={!(activeTab === 'home' || activeTab === 'schedule') || Boolean(selectedAnime) || Boolean(activeMangaChapter) || commandMenuOpen}
        label={isRtl ? 'اسحب للتحديث' : 'Tirez pour actualiser'}
        releaseLabel={isRtl ? 'سيب للتحديث' : 'Relâchez pour actualiser'}
      />

      {/* App 4-Digit PIN Lock Screen Overlay */}
      {pinLocked && appPinCode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: '#000000',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem'
          }}
        >
          <img
            src="/blackx-logo.png"
            alt="BLACK X"
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '18px',
              border: '1px solid rgba(255,255,255,0.25)',
              marginBottom: '1rem'
            }}
          />
          <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.0625rem', fontWeight: 800 }}>
            <BxIcon name="lock" className="bx-ico-lead" />{isRtl ? 'قفل حماية BLACK X مفعل' : 'Verrouillage PIN BLACK X'}
          </h2>
          <p style={{ margin: '0 0 1.2rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
            {isRtl ? 'أدخل رمز الـ PIN المكون من 4 أرقام لفتح التطبيق:' : 'Saisissez votre code PIN à 4 chiffres :'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: pinInput.length > i ? '#ffffff' : 'transparent',
                  border: '2px solid #ffffff'
                }}
              />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: '0.75rem' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'del', 0, 'ok'].map((k) => (
              <button
                key={String(k)}
                type="button"
                onClick={() => {
                  if (k === 'del') {
                    setPinInput((p) => p.slice(0, -1));
                    return;
                  }
                  if (k === 'ok') {
                    if (pinInput === appPinCode) {
                      setPinLocked(false);
                      setPinInput('');
                    } else {
                      setPinInput('');
                      showToast(isRtl ? 'الـ PIN غلط' : 'PIN incorrect', 'x-circle');
                    }
                    return;
                  }
                  const next = (pinInput + String(k)).slice(0, 4);
                  setPinInput(next);
                  if (next.length === 4) {
                    if (next === appPinCode) {
                      setPinLocked(false);
                      setPinInput('');
                    } else {
                      setTimeout(() => {
                        setPinInput('');
                        showToast(isRtl ? 'الـ PIN غلط' : 'PIN incorrect', 'x-circle');
                      }, 180);
                    }
                  }
                }}
                style={{
                  height: '62px',
                  borderRadius: '18px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#ffffff',
                  fontSize: '1.375rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
                aria-label={k === 'del' ? (isRtl ? 'مسح' : 'Delete') : k === 'ok' ? (isRtl ? 'تأكيد' : 'Confirm') : String(k)}
              >
                {k === 'del' ? <BxIcon name="delete" /> : k === 'ok' ? <BxIcon name="check" /> : k}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* New-episode alerts (AlertsSheet.jsx): how they really work, the followed titles with their
          real air times, and a test notification that says it is a test. */}
      <AlertsSheet
        open={appSheet === 'alerts'}
        onFermer={() => setAppSheet(null)}
        isRtl={isRtl}
        followed={followedForAlerts}
        airingMap={airingMap}
        lastRun={appSheet === 'alerts' ? lastAlertRun() : 0}
        dataSaver={dataSaver}
        onTest={() => {
          haptic('tap');
          const sent = dispatchPhoneNotification(
            isRtl ? 'إشعار تجربة من BLACK X' : 'Notification de test BLACK X',
            isRtl ? 'لو شايف الإشعار ده يبقى الإشعارات شغالة على جهازك.' : 'Si vous voyez ceci, les notifications fonctionnent.',
            Math.floor(Date.now() % 90000) + 1000
          );
          let denied = false;
          try {
            denied = !sent && typeof Notification !== 'undefined' && Notification.permission === 'denied';
          } catch {
            denied = false;
          }
          showToast(
            sent
              ? isRtl
                ? 'اتبعت إشعار التجربة'
                : 'Test notification sent'
              : denied
              ? isRtl
                ? 'الإشعارات مقفولة من إعدادات المتصفح'
                : 'Notifications are blocked in the browser settings'
              : isRtl
              ? 'وافق على إذن الإشعارات وهيوصلك إشعار التجربة'
              : 'Allow notifications and the test will arrive',
            'bell'
          );
        }}
        onOpen={(item) => {
          setAppSheet(null);
          handleOpenAnime(item);
        }}
      />
      {isWeb ? (
        <>
          <CommandPalette
            open={appSheet === 'palette'}
            onFermer={() => setAppSheet(null)}
            isRtl={isRtl}
            dataSaver={dataSaver}
            search={searchForPalette}
            onOpenItem={(item) => handleOpenAnime(item)}
            onOpenItemNewTab={(item) => openInNewTab(posterHref(item))}
            pages={[
              { id: 'home', icon: 'home', label: isRtl ? 'الرئيسية' : 'Accueil', keywords: 'home', run: () => goToTab('home') },
              { id: 'catalog', icon: 'search', label: isRtl ? 'البحث' : 'Rechercher', keywords: 'search catalog', run: () => goToTab('catalog') },
              { id: 'schedule', icon: 'calendar', label: isRtl ? 'جدول الحلقات' : 'Planning', keywords: 'schedule', run: () => goToTab('schedule') },
              { id: 'manga', icon: 'book', label: isRtl ? 'المانجا' : 'Manga', keywords: 'manga manhwa', run: () => goToTab('manga') },
              { id: 'community', icon: 'users', label: isRtl ? 'المجتمع' : 'Communauté', keywords: 'community', run: () => goToTab('community') },
              { id: 'mylist', icon: 'bookmark', label: isRtl ? 'قائمتي' : 'Ma liste', keywords: 'list favorites', run: () => goToTab('profile', () => resetProfileStack(['library'])) },
              { id: 'rankings', icon: 'trophy', label: isRtl ? 'الترتيب' : 'Classement', keywords: 'rankings top', run: () => goToTab('profile', () => resetProfileStack(['rankings'])) },
              { id: 'wrapped', icon: 'sparkles', label: isRtl ? 'ملخصك' : 'Bilan annuel', keywords: 'wrapped year', run: () => goToTab('profile', () => resetProfileStack(['wrapped'])) },
              { id: 'alerts', icon: 'bell', label: isRtl ? 'تنبيهات الحلقات' : 'Alertes épisodes', keywords: 'alerts', run: () => setAppSheet('alerts') },
              { id: 'shortcuts', icon: 'keyboard', label: isRtl ? 'اختصارات الكيبورد' : 'Raccourcis clavier', keywords: 'shortcuts keys', hint: '?', run: () => setAppSheet('shortcuts') },
              { id: 'profile', icon: 'user', label: isRtl ? 'حسابي' : 'Profil', keywords: 'profile account', run: () => goToTab('profile') },
              { id: 'classic', icon: 'monitor', label: isRtl ? 'التصميم القديم للموقع' : 'Site classique', keywords: 'classic old', run: () => openComputerVersion() }
            ]}
          />
          <ShortcutsSheet open={appSheet === 'shortcuts'} onFermer={() => setAppSheet(null)} isRtl={isRtl} />
          <HoverPreview isRtl={isRtl} dataSaver={dataSaver} isFavorite={isFavoriteItem} onPlay={playFromPreview} onToggleFavorite={toggleFavorite} />
        </>
      ) : null}

      {/* Top bar: only the user's picture + the access menu (logo / version / shortcuts live in the menu now) */}
      {!selectedAnime && !activeMangaChapter && (
        <header className={`bx-topbar${pageScrolled ? ' is-solid' : ''}${topbarHidden && !commandMenuOpen && !(activeTab === 'profile' && profilePage !== 'root') ? ' is-hidden' : ''}`}>
          {activeTab === 'profile' && profilePage !== 'root' ? (
            <button type="button" className="bx-round-btn bxp-back" onClick={closeProfilePage} aria-label={isRtl ? 'رجوع' : 'Retour'}>
              <BxIcon name="chevron-left" />
            </button>
          ) : (
            <button
              type="button"
              className={`bx-avatar-btn${activeTab === 'profile' ? ' is-on' : ''}`}
              onClick={() => goToTab('profile', () => resetProfileStack())}
              aria-label={isRtl ? 'حسابي' : 'Mon compte'}
            >
              {avatarPhoto ? (
                <img src={avatarPhoto} alt="" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} />
              ) : user ? (
                <span>{(user.displayName?.[0] || user.username?.[0] || 'X').toUpperCase()}</span>
              ) : (
                <BxIcon name="user" />
              )}
            </button>
          )}
          {activeTab === 'profile' && profilePage !== 'root' ? (
            <h1 className="bx-topbar-title" key={`profile:${profilePage}`}>
              {profilePageTitle(profilePage, isRtl)}
            </h1>
          ) : (
            TOPBAR_TITLES[activeTab] && (
              <h1 className="bx-topbar-title" key={activeTab}>
                {isRtl ? TOPBAR_TITLES[activeTab].ar : TOPBAR_TITLES[activeTab].en}
              </h1>
            )
          )}
          <button
            type="button"
            className="bx-round-btn"
            onClick={() => {
              haptic('tap');
              setCommandMenuOpen(true);
            }}
            aria-label={isRtl ? 'القائمة' : 'Menu'}
            aria-haspopup="dialog"
          >
            <BxIcon name="menu" />
          </button>
        </header>
      )}
      {!selectedAnime && !activeMangaChapter && (activeTab !== 'home' || globalBroadcastMsg) && (
        <div className="bx-topbar-spacer" aria-hidden="true" />
      )}

      {/* Global Real-Time Developer Push Broadcast Banner */}
      {globalBroadcastMsg && (
        <div
          style={{
            padding: '0.52rem 0.9rem',
            background: '#ffffff',
            color: '#000000',
            fontWeight: 700,
            fontSize: '0.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.6rem',
            borderBottom: '1px solid #000000'
          }}
        >
          <span><BxIcon name="megaphone" className="bx-ico-lead" />{globalBroadcastMsg}</span>
        </div>
      )}

      {/* ==================== TAB 1: HOME (HomeTab.jsx) ==================== */}
      {activeTab === 'home' && !selectedAnime && (
        <HomeTab
          pageClassName={pageCls}
          isRtl={isRtl}
          lang={lang}
          dataSaver={dataSaver}
          loading={homeLoading}
          lists={homeLists}
          watchHistory={visibleHistory}
          watchedIds={watchedIds}
          mangaHistory={visibleMangaHistory}
          favorites={visibleFavorites}
          genres={HOME_GENRES}
          airingMap={airingMap}
          apkRelease={isWeb ? null : apkRelease}
          heroPaused={Boolean(selectedAnime) || Boolean(storyPreviewAnime)}
          onOpen={handleOpenAnime}
          onPeek={setQuickPeekAnime}
          onStory={setStoryPreviewAnime}
          onToggleFavorite={toggleFavorite}
          onSeeAll={handleHomeSeeAll}
          onGenre={handleHomeGenre}
          onOpenManga={(mh) => {
            setActiveTab('manga');
            handleOpenManga(mh);
          }}
          onMangaLibrary={() => goToTab('manga')}
          loadSimilar={loadSimilarTitles}
          onClassicSite={isWeb ? openComputerVersion : undefined}
        />
      )}

      {/* ==================== TAB 2: SEARCH (every BLACK X anime server, like the website) ==================== */}
      {activeTab === 'catalog' && !selectedAnime && (
        <main className={`${pageCls} bx-search-page`} style={{ padding: '0.25rem 1rem 1rem' }}>
          <div className="bx-search-bar">
            <BxIcon name="search" />
            <SearchBox
              value={searchQuery}
              onCommit={setSearchQuery}
              placeholder={isRtl ? 'دوّر على أنمي أو فيلم' : 'Rechercher un animé'}
              inputStyle={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#ffffff',
                fontSize: '0.9375rem',
                fontWeight: 600
              }}
            />
            {searchQuery && (
              <button type="button" className="bx-search-clear" onClick={() => setSearchQuery('')} aria-label={isRtl ? 'مسح' : 'Effacer'}>
                <BxIcon name="close" />
              </button>
            )}
          </div>

          <div className="bx-search-tools">
            <button
              type="button"
              className={`bx-chip${catalogFilterCount ? ' is-active' : ''}`}
              onClick={() => {
                haptic('tap');
                setFilterSheetOpen(true);
              }}
            >
              <BxIcon name="sliders" size="1.05em" />
              {isRtl ? 'فلترة' : 'Filtres'}
              {catalogFilterCount ? ` · ${catalogFilterCount}` : ''}
            </button>
            <span className="bx-search-count">
              {Number.isFinite(catalogTotal)
                ? searchQuery.trim()
                  ? isRtl
                    ? `${catalogTotal.toLocaleString()} نتيجة`
                    : `${catalogTotal.toLocaleString()} résultats`
                  : isRtl
                  ? `${catalogTotal.toLocaleString()} عمل`
                  : `${catalogTotal.toLocaleString()} titres`
                : ''}
            </span>
          </div>

          {!searchQuery.trim() && recentSearches.length > 0 && (
            <section className="bx-search-recent">
              <div className="bx-section-head">
                <h2 className="bx-section-title">{isRtl ? 'آخر عمليات البحث' : 'Recherches récentes'}</h2>
                <button type="button" className="bx-see-all" onClick={clearRecentSearches}>
                  {isRtl ? 'مسح' : 'Effacer'}
                </button>
              </div>
              <div className="bx-filter-chips">
                {recentSearches.map((q) => (
                  <button key={q} type="button" className="bx-chip" onClick={() => setSearchQuery(q)}>
                    <BxIcon name="clock" size="1em" />
                    <bdi>{q}</bdi>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Matching manga for the same query */}
          {searchQuery.trim().length >= 2 && universalMangaHits.length > 0 && (
            <section className="bx-search-manga">
              <SectionHead
                title={isRtl ? `مانجا (${universalMangaHits.length})` : `Manga (${universalMangaHits.length})`}
                onMore={() => goToTab('manga', () => setMangaQuery(searchQuery))}
                moreLabel={isRtl ? 'افتح في المانجا' : 'Ouvrir dans Manga'}
                isRtl={isRtl}
              />
              <div className="bx-row bx-mob-scroll">
                {universalMangaHits.map((mh) => (
                  <PosterCard
                    key={`m-${mh.objectID}`}
                    item={{ objectID: `manga-${mh.objectID}`, titleEn: mh.name, poster: mh.poster_uri }}
                    width={96}
                    badge={null}
                    dataSaver={dataSaver}
                    onOpen={() => {
                      setActiveTab('manga');
                      handleOpenManga(mh);
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          <h2 className="bx-section-title" style={{ margin: '1rem 0 0.7rem' }}>
            {searchQuery.trim()
              ? isRtl
                ? 'أنمي'
                : 'Anime'
              : isRtl
              ? (SORT_OPTIONS.find((o) => o.id === catalogSort) || SORT_OPTIONS[0]).ar
              : (SORT_OPTIONS.find((o) => o.id === catalogSort) || SORT_OPTIONS[0]).en}
          </h2>

          {catalogLoading ? (
            <SkeletonGrid count={12} columns={3} padding="0" />
          ) : catalogItems.length === 0 ? (
            <div className="bx-empty">
              <BxIcon name="search" size="2rem" />
              <p>{isRtl ? 'مفيش نتايج. جرّب اسم تاني أو غيّر الفلترة.' : 'Aucun résultat. Essayez un autre nom ou modifiez les filtres.'}</p>
              {catalogFilterCount > 0 && (
                <button type="button" className="bx-btn bx-btn-outline" onClick={resetCatalogFilters}>
                  {isRtl ? 'إلغاء الفلترة' : 'Effacer les filtres'}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="bx-grid bx-stagger">
                {catalogItems.map((item) => (
                  <PosterCard key={item.objectID} item={item} onOpen={handleOpenAnime} onPeek={setQuickPeekAnime} dataSaver={dataSaver} />
                ))}
              </div>

              {!searchQuery.trim() && catalogItems.length > 0 && catalogPage + 1 < catalogPages && (
                <button
                  type="button"
                  className="bx-btn bx-btn-outline bx-btn-block"
                  onClick={handleLoadMoreCatalog}
                  disabled={loadingMoreCatalog}
                  style={{ marginTop: '1.25rem' }}
                >
                  {loadingMoreCatalog ? (
                    <>
                      <BxIcon name="loader" spin />
                      {isRtl ? 'بيحمّل...' : 'Chargement...'}
                    </>
                  ) : Number.isFinite(catalogTotal) ? (
                    isRtl ? (
                      `عرض المزيد (${catalogItems.length.toLocaleString()} من ${catalogTotal.toLocaleString()})`
                    ) : (
                      `Voir plus (${catalogItems.length.toLocaleString()} sur ${catalogTotal.toLocaleString()})`
                    )
                  ) : isRtl ? (
                    'عرض المزيد'
                  ) : (
                    'Voir plus'
                  )}
                </button>
              )}
              {/* The search service pages through the first 1,000 hits of a list only: say so and
                  point to search / sort / filters instead of a button that loads nothing. */}
              {!searchQuery.trim() &&
                !catalogLoading &&
                catalogItems.length > 0 &&
                catalogPage + 1 >= catalogPages &&
                Number.isFinite(catalogTotal) &&
                catalogItems.length < catalogTotal && (
                  <div className="bx-catalog-cap" role="note">
                    <p>
                      {isRtl
                        ? `ظاهر أول ${catalogItems.length.toLocaleString()} من ${catalogTotal.toLocaleString()} عمل. خدمة البحث بتعرض أول ${catalogItems.length.toLocaleString()} بس في كل ترتيب، فعشان توصل للباقي دوّر بالاسم أو غيّر الترتيب والفلترة.`
                        : `Affichering the first ${catalogItems.length.toLocaleString()} of ${catalogTotal.toLocaleString()} titles. The search service lists only the first ${catalogItems.length.toLocaleString()} for each sort, so search by name or change the sort and filters to reach the rest.`}
                    </p>
                    <button
                      type="button"
                      className="bx-btn bx-btn-outline bx-btn-block"
                      onClick={() => {
                        haptic('tap');
                        setFilterSheetOpen(true);
                      }}
                    >
                      <BxIcon name="sliders" />
                      {isRtl ? 'الترتيب والفلترة' : 'Trier & filtrer'}
                    </button>
                  </div>
                )}
            </>
          )}
        </main>
      )}

      {/* ==================== TAB 2.5: AIRING SCHEDULE (ScheduleTab.jsx) ==================== */}
      {activeTab === 'schedule' && !selectedAnime && (
        <ScheduleTab
          pageClassName={pageCls}
          isRtl={isRtl}
          day={scheduleDay}
          onDay={(d) => {
            haptic('select');
            setScheduleDay(d);
          }}
          items={scheduleItems}
          loading={scheduleLoading}
          favorites={visibleFavorites}
          dataSaver={dataSaver}
          onOpen={handleOpenAnime}
          onPeek={setQuickPeekAnime}
          onToggleFavorite={toggleFavorite}
          onAlerts={() => setAppSheet('alerts')}
        />
      )}

      {/* ==================== TAB 3: MANGA & MANHWA (website BLACK X manga servers + FULLSCREEN 120Hz READER) ==================== */}
      {activeTab === 'manga' && !selectedAnime && (
        <MangaTab
          {...{
            activeMangaChapter,
            autoScrollSpeed,
            currentPageIdx,
            dataSaver,
            displayedMangaChapters,
            dualPageSpread,
            handleBookmarkCurrentPanel,
            handleCycleReadingBgm,
            handleLoadMoreManga,
            handleOpenManga,
            handleReadMangaChapter,
            handleSaveChapterOffline,
            handleToggleSpeakText,
            isRtl,
            loadingMoreManga,
            mangaActiveServer,
            mangaChAsc,
            mangaChSearch,
            mangaChapters,
            mangaChaptersError,
            mangaChaptersLoading,
            mangaFilterCount,
            mangaFilterSummary,
            mangaFilterType,
            mangaHistory,
            mangaList,
            mangaLoading,
            mangaPage,
            mangaPages,
            mangaPagesError,
            mangaPagesLoading,
            mangaPopularTitles,
            mangaQuery,
            mangaReaderContainerRef,
            mangaServers,
            mangaSource,
            offlineChapters,
            pageCls,
            prefetchedChapterRef,
            readProgressPct,
            readerEyeFilter,
            readerHudVisible,
            readerMode,
            readerSettingsOpen,
            readerZoom,
            readingBgmMode,
            savingOfflineChapter,
            seamlessStitch,
            selectedManga,
            setActiveMangaChapter,
            setAutoScrollSpeed,
            setCurrentPageIdx,
            setDualPageSpread,
            setFilterSheetOpen,
            setMangaChAsc,
            setMangaChSearch,
            setMangaQuery,
            setReadProgressPct,
            setReaderEyeFilter,
            setReaderHudVisible,
            setReaderMode,
            setReaderSettingsOpen,
            setReaderTouchPaused,
            setReaderZoom,
            setSeamlessStitch,
            setSelectedManga,
            setVolumeKeyScroll,
            showToast,
            ttsSpeaking,
            visibleMangaHistory,
            volumeKeyScroll
          }}
        />
      )}

      {/* ==================== TAB 4: COMMUNITY (CommunityTab.jsx — one feed, shared with the website) ==================== */}
      {activeTab === 'community' && !selectedAnime && (
        <CommunityTab
          pageClassName={pageCls}
          isRtl={isRtl}
          lang={lang}
          dataSaver={dataSaver}
          user={user}
          posts={communityPosts}
          myPostKey={myPostKey}
          draft={newPostText}
          onDraft={setNewPostText}
          category={postCategory}
          onCategory={setPostCategory}
          postAnime={postAnime}
          onPostAnime={setPostAnime}
          onPost={handlePostPost}
          onLike={handleLikePost}
          onReply={handleAddPostReply}
          replyingToPostId={replyingToPostId}
          onReplyingTo={setReplyingToPostId}
          replyText={replyText}
          onReplyText={setReplyText}
          onSignIn={() => goToTab('profile')}
          onNeedSignIn={() => showToast(isRtl ? 'سجّل دخولك الأول عشان ترد' : 'Connectez-vous pour répondre', 'user')}
          pickerOpen={appSheet === 'postAnime'}
          onPickerOpen={(open) => setAppSheet(open ? 'postAnime' : null)}
          searchAnime={searchAnimeForPost}
          onOpenAnime={openPostAnime}
        />
      )}

      {/* ==================== TAB 5: PROFILE HUB (profile/ProfileTab.jsx) ==================== */}
      {activeTab === 'profile' && !selectedAnime && (
        <ProfileTab
          page={profilePage}
          pageClassName={pageCls}
          isRtl={isRtl}
          lang={lang}
          dataSaver={dataSaver}
          extras={{ loadRankings, onOpenRanked: openRankedTitle, onOpenWrappedTitle: openWrappedTitle, onToast: showToast }}
          onOpenPage={openProfilePage}
          onBack={closeProfilePage}
          onSync={handleManualSync}
          account={{
            user,
            sessionToken,
            avatarPhoto,
            onAvatarError: () => setAvatarFailed(true),
            isDeveloper,
            vipTier: userVipTier,
            xp: userXp,
            needsReauth: Boolean(user && !sessionToken),
            onReauth: () => {
              setUser(null);
              localStorage.removeItem('bx_mob_user');
              openProfilePage('signin');
            }
          }}
          auth={{
            mode: authMode,
            setMode: setAuthMode,
            busy: authBusy,
            displayName: authDisplayName,
            setDisplayName: setAuthDisplayName,
            username: authUsername,
            setUsername: setAuthUsername,
            email: authEmail,
            setEmail: setAuthEmail,
            password: authPassword,
            setPassword: setAuthPassword,
            onSubmit: handleAuthSubmit,
            onGoogle: handleRealGoogleOAuthLogin
          }}
          profileEdit={{
            name: editDisplayName,
            setName: setEditDisplayName,
            bio: editBio,
            setBio: setEditBio,
            photo: editPhotoUrl,
            setPhoto: setEditPhotoUrl,
            onSave: handleSaveProfileEdit,
            onOpen: startProfileEdit
          }}
          library={{
            favorites: visibleFavorites,
            watchlist: visibleWatchlist,
            history: visibleHistory,
            mangaHistory: visibleMangaHistory,
            offlineChapters,
            snapshots: savedPanels,
            onOpenAnime: handleOpenAnime,
            onPeek: setQuickPeekAnime,
            onOpenManga: openMangaFromProfile,
            onReadOffline: readOfflineFromProfile,
            onDeleteOffline: handleDeleteOfflineChapter,
            onDeleteCapture: deleteCapture
          }}
          vip={{ code: vipRedeemCode, setCode: setVipRedeemCode, busy: vipRedeemBusy, onRedeem: handleRedeemVipCode }}
          requests={{
            type: userRequestType,
            setType: setUserRequestType,
            text: userRequestText,
            setText: setUserRequestText,
            busy: userRequestBusy,
            onSubmit: handleSubmitUserRequest
          }}
          settings={profileSettings}
          app={{
            version: BX_APK_VERSION,
            release: apkRelease,
            web: isWeb,
            downloadUrl: isWeb ? WEB_APK_PATH : BX_APK_DOWNLOAD_URL,
            catalogTotal: bxAnimeTotal || 0,
            onUpdate: () =>
              showToast(
                isWeb
                  ? isRtl
                    ? 'بينزّل تطبيق BLACK X للأندرويد…'
                    : 'Downloading the BLACK X Android app…'
                  : isRtl
                  ? 'بينزّل آخر نسخة من التطبيق…'
                  : 'Downloading the latest app…',
                'download'
              ),
            onComputer: openComputerVersion
          }}
          backup={{ onExport: handleExportVaultBackup, onImport: handleImportVaultBackup, fileRef: backupFileInputRef }}
          signOut={{ open: signOutConfirmOpen, setOpen: setSignOutConfirmOpen }}
          accountDelete={{ busy: accountDeleteBusy, onDelete: handleDeleteAccount }}
          devPanel={devPanelNode}
          devBadge={cloudUserRequests.length || null}
        />
      )}

      {/* ==================== FULL 4-TAB ANIME STUDIO & 120Hz CINEMA PLAYER SHEET ==================== */}
      {selectedAnime && (
        <div
          ref={detailsSheetRef}
          className="bx-details-sheet"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: '#000000',
            overflowY: 'auto',
            paddingBottom: '90px',
            animation: 'bxSlideUp 0.46s cubic-bezier(0.22, 1, 0.36, 1) backwards'
          }}
        >
          {/* Sticky Top Back Bar */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.65rem 1rem',
              background: 'rgba(0,0,0,0.88)',
              borderBottom: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            <button
              type="button"
              className="bx-icon-btn bx-icon-btn-sm"
              onClick={closeDetailsSheet}
              aria-label={isRtl ? 'رجوع' : 'Retour'}
            >
              <BxIcon name={isRtl ? 'arrow-right' : 'arrow-left'} />
            </button>
            <div
              dir="auto"
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: 'center',
                fontWeight: 700,
                fontSize: '0.9375rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {selectedAnime.titleEn}
            </div>
            <span style={{ width: '40px', flexShrink: 0 }} aria-hidden="true" />
          </div>

          {/* ==================== v9.0 DEDICATED STANDALONE 120Hz CINEMA VIDEO PLAYER PAGE + FLOATING MINI-PLAYER ==================== */}
          {activeEpisode && (
            <div
              ref={playerPageRef}
              className={`bx-player-shell ${videoFullscreen ? 'is-full' : playerMinimized ? 'is-mini' : 'is-page'}${
                theatreOn && !videoFullscreen && !playerMinimized ? ' is-theatre' : ''
              }`}
              style={
                videoFullscreen
                  ? {
                      position: 'fixed',
                      inset: 0,
                      width: '100vw',
                      height: '100vh',
                      zIndex: 9800,
                      background: '#000000',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center'
                    }
                  : playerMinimized
                  ? {
                      position: 'fixed',
                      left: '10px',
                      right: '10px',
                      bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
                      zIndex: 520,
                      background: 'rgba(8, 8, 12, 0.96)',
                      border: '1.5px solid rgba(255, 255, 255, 0.32)',
                      borderRadius: '18px',
                      padding: '0.45rem 0.65rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      boxShadow: '0 20px 48px rgba(0, 0, 0, 0.96)'
                    }
                  : {
                      position: 'fixed',
                      inset: 0,
                      zIndex: 500,
                      background: '#000000',
                      overflowY: 'auto',
                      paddingBottom: '90px',
                      animation: 'bxSlideUp 0.46s cubic-bezier(0.22, 1, 0.36, 1) backwards'
                    }
              }
            >
              {/* Sticky Top Navigation Header for Dedicated Standalone Video Player Page */}
              {!videoFullscreen && !playerMinimized && (
                <div
                  className="bx-player-head"
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 35,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    padding: '0.65rem 0.9rem',
                    background: 'rgba(0,0,0,0.92)',
                    borderBottom: '1px solid rgba(255,255,255,0.12)'
                  }}
                >
                  <button
                    type="button"
                    className="bx-icon-btn bx-icon-btn-sm"
                    aria-label={isRtl ? 'رجوع لصفحة الأنمي' : 'Retour à la série'}
                    onClick={() => {
                      setActiveEpisode(null);
                      setPlayingVideoUrl('');
                      setVideoFullscreen(false);
                    }}
                  >
                    <BxIcon name={isRtl ? 'arrow-right' : 'arrow-left'} />
                  </button>

                  <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                    <div
                      dir="auto"
                      style={{
                        fontWeight: 700,
                        fontSize: '0.9375rem',
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {selectedAnime.titleEn}
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{activeEpisode.name}</div>
                  </div>

                  {sleepTimerMode !== 'off' ? (
                    <button
                      type="button"
                      className="bx-chip bx-sleep-chip"
                      aria-label={isRtl ? 'إلغاء مؤقت النوم' : 'Annuler la minuterie'}
                      title={isRtl ? 'إلغاء مؤقت النوم' : 'Annuler la minuterie'}
                      onClick={() => {
                        setSleepTimerMode('off');
                        setSleepTimerRemainingSec(0);
                        showToast(isRtl ? 'اتلغى مؤقت النوم' : 'Minuterie annulée', 'moon');
                      }}
                    >
                      <BxIcon name="moon" size="1em" />
                      {sleepTimerMode === 'end_of_ep' ? (isRtl ? 'آخر الحلقة' : "Fin de l'épisode") : formatClock(sleepTimerRemainingSec)}
                    </button>
                  ) : null}

                  {theatreAvailable ? (
                    <button
                      type="button"
                      className={`bx-icon-btn bx-icon-btn-sm bx-theatre-btn${theatreOn ? ' is-active' : ''}`}
                      aria-pressed={theatreOn}
                      aria-label={isRtl ? 'وضع السينما (T)' : 'Mode cinéma (T)'}
                      title={isRtl ? 'وضع السينما (T)' : 'Mode cinéma (T)'}
                      onClick={toggleTheatre}
                    >
                      <BxIcon name="cinema" />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="bx-icon-btn bx-icon-btn-sm"
                    aria-label={isRtl ? 'تصغير المشغل' : 'Mini-lecteur'}
                    onClick={() => setPlayerMinimized(true)}
                  >
                    <BxIcon name="chevron-down" />
                  </button>
                </div>
              )}

              <div
                data-bx-video="1"
                className={`bx-video-box ${videoFullscreen ? 'is-full' : playerMinimized ? 'is-mini' : 'is-page'}`}
                onClick={playerMinimized ? () => setPlayerMinimized(false) : undefined}
                onTouchStart={playerMinimized ? undefined : handleVideoTouchStart}
                onTouchMove={playerMinimized ? undefined : handleVideoTouchMove}
                onTouchEnd={playerMinimized ? undefined : handleVideoTouchEnd}
                style={
                  videoFullscreen
                    ? { position: 'relative', width: '100vw', height: '100vh', background: '#000000' }
                    : playerMinimized
                    ? {
                        position: 'relative',
                        width: '112px',
                        height: '64px',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: '#050507',
                        border: '1px solid rgba(255,255,255,0.24)',
                        flexShrink: 0,
                        cursor: 'pointer'
                      }
                    : { position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#050507' }
                }
              >
                {resolvingVideo ? (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ fontSize: playerMinimized ? '1.0625rem' : '1.375rem' }}><BxIcon name="zap" /></div>
                    {!playerMinimized && (
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                        {isRtl
                          ? `بنجهّز التشغيل${selectedServer?.quality ? ` (${selectedServer.quality})` : ''}...`
                          : 'Extracting direct MP4 stream...'}
                      </div>
                    )}
                  </div>
                ) : playingVideoUrl ? (
                  <>
                    <video
                      ref={videoRef}
                      src={hlsActive ? undefined : playingVideoUrl}
                      controls={false}
                      autoPlay
                      playsInline
                      referrerPolicy="no-referrer"
                      onError={handleVideoElementError}
                      onPause={(e) => {
                        const v = e.currentTarget;
                        if (!incognitoMode && v && v.currentTime > 5 && !v.ended) {
                          savePosition(episodeKey(selectedAnime, activeEpisode), v.currentTime, v.duration, { immediate: true });
                          recordWatchProgress(v.currentTime, v.duration);
                        }
                      }}
                      onLoadedMetadata={(e) => {
                        try {
                          const v = e.currentTarget;
                          const dur = Number(v.duration) || 0;
                          setVideoDuration(Number.isFinite(dur) ? Math.round(dur) : 0);
                          const saved = getPosition(episodeKey(selectedAnime, activeEpisode));
                          if (saved && !saved.done && saved.sec > 12 && dur && saved.sec < dur - 20) {
                            v.currentTime = saved.sec;
                            showToast(isRtl ? `كمّلنا من ${formatClock(saved.sec)}` : `Reprise à ${formatClock(saved.sec)}`, 'play');
                          }
                        } catch (_) {}
                      }}
                      onTimeUpdate={(e) => {
                        try {
                          const v = e.currentTarget;
                          const cur = Math.floor(v.currentTime || 0);
                          if (loopPointA !== null && loopPointB !== null && cur >= loopPointB) {
                            v.currentTime = loopPointA;
                            return;
                          }
                          if (timedCommentsEnabled && timedComments.length > 0) {
                            const hit = timedComments.find((tc) => Math.abs(cur - Number(tc.sec || 0)) <= 2);
                            setActiveDanmakuComment(hit || null);
                          } else if (activeDanmakuComment) {
                            setActiveDanmakuComment(null);
                          }
                          if (cur > 5 && cur % 3 === 0 && !incognitoMode) {
                            savePosition(episodeKey(selectedAnime, activeEpisode), cur, v.duration);
                          }
                        } catch (_) {}
                      }}
                      onEnded={(e) => {
                        const dur = Number(e.currentTarget?.duration) || 0;
                        if (!incognitoMode && dur) {
                          savePosition(episodeKey(selectedAnime, activeEpisode), dur, dur, { done: true, immediate: true });
                          recordWatchProgress(dur, dur);
                        }
                        if (sleepTimerMode === 'end_of_ep') {
                          setSleepTimerMode('off');
                          showToast('خلصت الحلقة — وقفنا التشغيل حسب مؤقت النوم', 'moon');
                          return;
                        }
                        if (!autoNextEp) return;
                        const idx = animeEpisodes.findIndex((x) => x.docId === activeEpisode.docId);
                        if (idx !== -1 && idx + 1 < animeEpisodes.length) {
                          // "Next episode in 5…" instead of an instant jump.
                          setNextEpCountdown({ anime: selectedAnime, ep: animeEpisodes[idx + 1] });
                        }
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: videoFullscreen ? videoFitMode : 'contain',
                        background: '#000',
                        filter: [
                          videoBrightness !== 100 ? `brightness(${videoBrightness}%)` : '',
                          visualShaderMode === 'upscale4k'
                            ? 'url(#bx-sharpen-4k) contrast(1.12) saturate(1.15)'
                            : visualShaderMode === 'amoled_hdr'
                            ? 'contrast(1.24) saturate(1.26) brightness(1.04)'
                            : visualShaderMode === 'cinema_imax'
                            ? 'contrast(1.1) saturate(1.08) sepia(0.08)'
                            : ''
                        ]
                          .filter(Boolean)
                          .join(' ') || 'none',
                        pointerEvents: videoTouchLocked ? 'none' : 'auto'
                      }}
                    />
                    {/* BLACK X controls: play/pause, ±10 s, seek bar with intro/outro marks, next, full screen */}
                    {!playerMinimized && (
                      <PlayerControls
                        videoRef={videoRef}
                        sourceKey={playingVideoUrl}
                        isRtl={isRtl}
                        fullscreen={videoFullscreen}
                        locked={videoTouchLocked}
                        title={selectedAnime.titleEn}
                        subtitle={activeEpisode.name}
                        segments={skipSegments}
                        hasNext={(() => {
                          const idx = animeEpisodes.findIndex((x) => x.docId === activeEpisode.docId);
                          return idx !== -1 && idx + 1 < animeEpisodes.length;
                        })()}
                        onSeekBy={handleVideoDoubleTap}
                        onToggleFullscreen={() => setVideoFullscreen((v) => !v)}
                        onToggleTheatre={theatreAvailable && !videoFullscreen ? toggleTheatre : undefined}
                        onNext={() => {
                          const idx = animeEpisodes.findIndex((x) => x.docId === activeEpisode.docId);
                          if (idx !== -1 && idx + 1 < animeEpisodes.length) handlePlayEpisode(selectedAnime, animeEpisodes[idx + 1]);
                        }}
                        onMore={() => {
                          haptic('tap');
                          if (videoFullscreen) {
                            setPlayerMoreOpen(true);
                            return;
                          }
                          setPlayerStudioOpen(true);
                          setTimeout(() => {
                            try {
                              document.getElementById('bx-player-studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            } catch (_) {}
                          }, 60);
                        }}
                        onLock={() => {
                          setVideoTouchLocked(true);
                          showToast(isRtl ? 'اتقفل اللمس عشان مفيش ضغطة غلط' : 'Écran verrouillé', 'lock');
                        }}
                        onUnlock={() => {
                          setVideoTouchLocked(false);
                          showToast(isRtl ? 'اتفتح قفل اللمس' : 'Écran déverrouillé', 'unlock');
                        }}
                      />
                    )}
                    {/* Real intro/outro skip (AniSkip) + next-episode countdown */}
                    {!playerMinimized && (
                      <>
                        <SkipSegmentOverlay
                          videoRef={videoRef}
                          segments={skipSegments}
                          autoSkip={autoSkipIntro}
                          isRtl={isRtl}
                          episodeId={`${selectedAnime?.objectID}:${activeEpisode?.number}`}
                          onOutroSkip={() => {
                            const v = videoRef.current;
                            if (v && v.duration) v.currentTime = Math.max(0, v.duration - 0.25);
                          }}
                        />
                        <NextEpisodeCountdown
                          open={Boolean(nextEpCountdown)}
                          title={nextEpCountdown ? `${isRtl ? 'الحلقة' : 'Épisode'} ${nextEpCountdown.ep.number}` : ''}
                          subtitle={nextEpCountdown?.anime?.titleEn || ''}
                          isRtl={isRtl}
                          onPlay={playNextFromCountdown}
                          onAnnuler={() => setNextEpCountdown(null)}
                        />
                      </>
                    )}
                    {/* Live Luminosité / Volume Gesture HUD */}
                    {gestureHud && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '18%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'rgba(0,0,0,0.85)',
                          border: '1px solid rgba(255,255,255,0.28)',
                          padding: '0.42rem 0.95rem',
                          borderRadius: '999px',
                          fontWeight: 700,
                          fontSize: '0.8125rem',
                          color: '#ffffff',
                          zIndex: 30,
                          pointerEvents: 'none'
                        }}
                      >
                        {gestureHud.type === 'brightness'
                          ? <><BxIcon name="sun" className="bx-ico-lead" />{isRtl ? 'السطوع' : 'Luminosité'}{": "}{gestureHud.value}{"%"}</>
                          : <><BxIcon name="volume" className="bx-ico-lead" />{isRtl ? 'الصوت' : 'Volume'}{": "}{gestureHud.value}{"%"}</>}
                      </div>
                    )}
                    {/* Soirée reactions float over the video for everyone in the room */}
                    {party.code ? <PartyReactions messages={party.messages} /> : null}

                    {/* Long-Press 2.0x Vitesse Boost Badge */}
                    {longPress2x && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '12%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: '#ffffff',
                          color: '#000000',
                          padding: '0.32rem 0.85rem',
                          borderRadius: '999px',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          zIndex: 30,
                          pointerEvents: 'none'
                        }}
                      >
                        <BxIcon name="zap" className="bx-ico-lead" />2.0x {isRtl ? 'سرعة مضاعفة' : 'Avance rapide'}
                      </div>
                    )}
                    {/* Timed Scene Comment (Danmaku) Floating Banner */}
                    {timedCommentsEnabled && activeDanmakuComment && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '18%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          maxWidth: '88%',
                          background: 'rgba(0,0,0,0.82)',
                          border: '1px solid rgba(255,255,255,0.28)',
                          padding: '0.35rem 0.85rem',
                          borderRadius: '999px',
                          fontWeight: 700,
                          fontSize: subStyleMode === 'yellow_xl' ? '0.9375rem' : '0.75rem',
                          color:
                            subStyleMode === 'yellow_xl'
                              ? '#fde047'
                              : subStyleMode === 'red_bx'
                              ? '#ef4444'
                              : '#ffffff',
                          textShadow: '0 2px 6px #000000',
                          zIndex: 28,
                          pointerEvents: 'none',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        <BxIcon name="message" className="bx-ico-lead" />{activeDanmakuComment.author}: {activeDanmakuComment.text}
                      </div>
                    )}
                    {skipRipple && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '42%',
                          [skipRipple === 'left' ? 'left' : 'right']: '12%',
                          background: 'rgba(0,0,0,0.8)',
                          padding: '0.4rem 0.85rem',
                          borderRadius: '999px',
                          fontWeight: 700,
                          fontSize: '0.8125rem'
                        }}
                      >
                        {skipRipple === 'left' ? <><BxIcon name="rewind" className="bx-ico-lead" />{"-10s"}</> : <><BxIcon name="fast-forward" className="bx-ico-lead" />{"+10s"}</>}
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8125rem',
                      color: 'rgba(255,255,255,0.65)'
                    }}
                  >
                    {episodeServers.length === 0
                      ? isRtl
                        ? 'مفيش سيرفر شغال للحلقة دي دلوقتي'
                        : 'No direct stream for this episode on the BLACK X servers right now'
                      : isRtl
                        ? 'تعذّر تشغيل هذا السيرفر — اختر سيرفر آخر من الأسفل'
                        : 'This server could not play — pick another one below'}
                  </div>
                )}
              </div>

              {/* Floating Mini-Player Info & Controls (When playerMinimized is true) */}
              {!videoFullscreen && playerMinimized && (
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div
                    onClick={() => setPlayerMinimized(false)}
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {selectedAnime.titleEn}
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.68)', marginTop: '2px' }}>
                      <BxIcon name="film" className="bx-ico-lead" />{activeEpisode.name} • {isRtl ? 'اضغط للتكبير' : 'Appuyez pour agrandir'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setPlayerMinimized(false)}
                      style={{
                        padding: '0.38rem 0.65rem',
                        borderRadius: '12px',
                        background: '#ffffff',
                        color: '#000000',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      <BxIcon name="fullscreen" className="bx-ico-lead" />{isRtl ? 'فتح' : 'Ouvrir'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveEpisode(null);
                        setPlayingVideoUrl('');
                        setPlayerMinimized(false);
                      }}
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.12)',
                        color: '#ffffff',
                        border: '1px solid rgba(255,255,255,0.22)',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      <BxIcon name="close" />
                    </button>
                  </div>
                </div>
              )}

              {/* Cinema Controls Strip (Fullscreen Button, Fit Mode, Prev/Next Ep, Auto-Next, PiP, Vitesse, Download) */}
              {/* (the computer's cinema mode puts this column beside the video: desktop.css .is-theatre) */}
              {!videoFullscreen && !playerMinimized && (
                <div className="bx-player-side" style={{ padding: '0.65rem 1rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', minWidth: 0 }} dir="auto">
                      {activeEpisode.name} {activeEpisode.titleAr ? `— ${activeEpisode.titleAr}` : ''}
                    </div>
                    <div className="bx-mob-scroll" style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto' }}>
                      {(() => {
                        const idx = animeEpisodes.findIndex((e) => e.docId === activeEpisode.docId);
                        const prevEp = idx > 0 ? animeEpisodes[idx - 1] : null;
                        const nextEp = idx !== -1 && idx + 1 < animeEpisodes.length ? animeEpisodes[idx + 1] : null;
                        return (
                          <>
                            {prevEp && (
                              <button
                                type="button"
                                onClick={() => handlePlayEpisode(selectedAnime, prevEp)}
                                style={{
                                  padding: '0.28rem 0.55rem',
                                  borderRadius: '8px',
                                  background: 'rgba(255,255,255,0.1)',
                                  border: '1px solid rgba(255,255,255,0.2)',
                                  color: '#fff',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                <BxIcon name="skip-back" className="bx-ico-lead" />{isRtl ? 'السابقة' : 'Préc.'}
                              </button>
                            )}
                            {nextEp && (
                              <button
                                type="button"
                                onClick={() => handlePlayEpisode(selectedAnime, nextEp)}
                                style={{
                                  padding: '0.28rem 0.55rem',
                                  borderRadius: '8px',
                                  background: '#ffffff',
                                  border: 'none',
                                  color: '#000',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                <BxIcon name="skip-forward" className="bx-ico-lead" />{isRtl ? 'التالية' : 'Suiv.'}
                              </button>
                            )}
                          </>
                        );
                      })()}

                      <button
                        type="button"
                        className="bx-party-toggle"
                        aria-expanded={partyPanelOpen || Boolean(party.code)}
                        onClick={() => setPartyPanelOpen((v) => !v)}
                        style={{
                          padding: '0.32rem 0.65rem',
                          borderRadius: '8px',
                          background: party.code ? '#ffffff' : 'rgba(255,255,255,0.12)',
                          border: '1px solid rgba(255,255,255,0.24)',
                          color: party.code ? '#000000' : '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          position: 'relative'
                        }}
                      >
                        <BxIcon name="popcorn" className="bx-ico-lead" />
                        {party.code ? party.code : isRtl ? 'حفلة مشاهدة' : 'Soirée'}
                        {party.code && party.unread && !partyPanelOpen ? <span className="bx-party-unread">{party.unread}</span> : null}
                      </button>

                      <button
                        type="button"
                        onClick={() => setPlayerStudioOpen((v) => !v)}
                        style={{
                          padding: '0.32rem 0.72rem',
                          borderRadius: '8px',
                          background: playerStudioOpen ? '#ffffff' : 'rgba(255,255,255,0.14)',
                          border: '1.5px solid #ffffff',
                          color: playerStudioOpen ? '#000000' : '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="sliders" className="bx-ico-lead" />{isRtl ? 'إعدادات المشغل' : 'Paramètres du lecteur'} {playerStudioOpen ? <BxIcon name="chevron-up" /> : <BxIcon name="chevron-down" />}
                      </button>
                    </div>
                  </div>

                  {/* Paramètres du lecteur panel (also opened by the settings button on the video) */}
                  {playerStudioOpen && (
                    <div
                      id="bx-player-studio"
                      style={{
                        marginBottom: '0.65rem',
                        padding: '0.7rem',
                        borderRadius: '12px',
                        background: '#09090d',
                        border: '1px solid rgba(255,255,255,0.2)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: '0.42rem'
                      }}
                    >
                      {hlsLevels.length > 1 && (
                        <button
                          type="button"
                          onClick={cycleHlsQuality}
                          style={{
                            gridColumn: '1 / -1',
                            minHeight: '44px',
                            padding: '0.45rem 0.6rem',
                            borderRadius: '8px',
                            background: hlsLevel === -1 ? 'rgba(255,255,255,0.08)' : '#ffffff',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: hlsLevel === -1 ? '#ffffff' : '#000000',
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          <BxIcon name="sliders" className="bx-ico-lead" />
                          {isRtl ? 'الجودة: ' : 'Qualité : '}
                          {hlsLevel === -1
                            ? isRtl ? `تلقائي${dataSaver ? ' (توفير البيانات)' : ''}` : `Auto${dataSaver ? ' (data saver)' : ''}`
                            : `${hlsLevels.find((l) => l.index === hlsLevel)?.height || ''}p`}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleCycleVisualShader}
                        style={{
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          background: visualShaderMode !== 'original' ? '#ffffff' : 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: visualShaderMode !== 'original' ? '#000000' : '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="sparkles" className="bx-ico-lead" />
                        {isRtl ? 'الصورة: ' : 'Image : '}
                        {visualShaderMode === 'upscale4k'
                          ? isRtl ? 'خطوط أوضح' : 'Contours nets'
                          : visualShaderMode === 'amoled_hdr'
                          ? isRtl ? 'تباين أعلى' : 'Plus de contraste'
                          : visualShaderMode === 'cinema_imax'
                          ? isRtl ? 'ألوان دافية' : 'Couleurs chaudes'
                          : isRtl ? 'أصلية' : 'Original'}
                      </button>

                      <button
                        type="button"
                        onClick={handleCycleAudioBooster}
                        style={{
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          background: audioBoostMode !== 'normal' ? '#ffffff' : 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: audioBoostMode !== 'normal' ? '#000000' : '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="volume" className="bx-ico-lead" />مضخم الصوت:{' '}
                        {audioBoostMode === 'boost200'
                          ? '200% Bass'
                          : audioBoostMode === 'boost150'
                          ? '150%'
                          : audioBoostMode === 'voice'
                          ? 'حوارات'
                          : '100%'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next = !autoSkipIntro;
                          setAutoSkipIntro(next);
                          localStorage.setItem('bx_mob_autoskip_intro', String(next));
                          showToast(next ? 'التخطي التلقائي للمقدمة: مفعل' : 'التخطي التلقائي للمقدمة: متوقف', 'zap');
                        }}
                        style={{
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          background: autoSkipIntro ? '#ffffff' : 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: autoSkipIntro ? '#000000' : '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="zap" className="bx-ico-lead" />تخطي المقدمة: {autoSkipIntro ? 'تلقائي ON' : 'يدوي'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setAutoNextEp((v) => !v)}
                        style={{
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          background: autoNextEp ? '#ffffff' : 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: autoNextEp ? '#000000' : '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="repeat" className="bx-ico-lead" />الحلقة التالية: {autoNextEp ? 'تلقائي ON' : 'OFF'}
                      </button>

                      <button
                        type="button"
                        onClick={handleTakeVideoCapture}
                        style={{
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="camera" className="bx-ico-lead" />التقاط لقطة
                      </button>

                      <button
                        type="button"
                        onClick={handleCycleAbLoop}
                        style={{
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          background: loopPointA !== null ? '#ffffff' : 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: loopPointA !== null ? '#000000' : '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="repeat" className="bx-ico-lead" />تكرار مشهد: {loopPointA === null ? 'A-B' : loopPointB === null ? <>{"A"}<BxIcon name="arrow-right" className="bx-ico-trail" />{"..."}</> : 'A⇄B'}
                      </button>

                      <button
                        type="button"
                        onClick={handleCycleSleepTimer}
                        style={{
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          background: sleepTimerMode !== 'off' ? '#ffffff' : 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: sleepTimerMode !== 'off' ? '#000000' : '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="moon" className="bx-ico-lead" />مؤقت النوم:{' '}
                        {sleepTimerMode === 'off'
                          ? 'إيقاف'
                          : sleepTimerMode === 'end_of_ep'
                          ? 'نهاية الحلقة'
                          : `${Math.ceil(sleepTimerRemainingSec / 60)} د`}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const speeds = [1, 1.25, 1.5, 2, 0.75];
                          const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                          setPlaybackSpeed(next);
                          if (videoRef.current) videoRef.current.playbackRate = next;
                        }}
                        style={{
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="zap" className="bx-ico-lead" />سرعة العرض: {playbackSpeed}x
                      </button>

                      <button
                        type="button"
                        onClick={handleCycleSubtitleStyle}
                        style={{
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="type" className="bx-ico-lead" />ستايل التعليق: {subStyleMode === 'yellow_xl' ? 'أصفر XL' : subStyleMode === 'red_bx' ? 'أحمر BX' : 'أبيض LG'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next = !bgAudioMode;
                          setBgAudioMode(next);
                          showToast(next ? 'الصوت في الخلفية: مفعل' : 'الصوت في الخلفية: متوقف', 'headphones');
                        }}
                        style={{
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          background: bgAudioMode ? '#ffffff' : 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: bgAudioMode ? '#000000' : '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="headphones" className="bx-ico-lead" />صوت بالخلفية: {bgAudioMode ? 'ON' : 'OFF'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          try {
                            if (window.BlackXNativeAuth?.enterPipMode) {
                              window.BlackXNativeAuth.enterPipMode();
                              return;
                            }
                          } catch (_) {}
                          if (videoRef.current?.requestPictureInPicture) {
                            videoRef.current.requestPictureInPicture().catch(() => {});
                          }
                        }}
                        style={{
                          padding: '0.45rem 0.6rem',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: '#fff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="tv" className="bx-ico-lead" />نافذة عائمة
                      </button>

                      {playingVideoUrl && (
                        <a
                          href={playingVideoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          style={{
                            padding: '0.45rem 0.6rem',
                            borderRadius: '8px',
                            background: '#ffffff',
                            color: '#000000',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textDecoration: 'none',
                            textAlign: 'center'
                          }}
                        >
                          <BxIcon name="download" className="bx-ico-lead" />تحميل الحلقة MP4
                        </a>
                      )}
                    </div>
                  )}

                  {/* BLACK X Exclusive Server & Quality Selector Pills */}
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginBottom: '0.35rem' }}>
                    {isRtl
                      ? 'السيرفر'
                      : 'Server'}
                  </div>
                  <div className="bx-mob-scroll" style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                    {episodeServers.map((srv, idx) => {
                      const meta = SERVER_LABELS[srv.name] || {
                        nameAr: `BLACK X ${idx + 1}`,
                        nameEn: `BLACK X ${idx + 1}`
                      };
                      const active = selectedServer === srv;
                      return (
                        <button
                          key={`${srv.name}-${srv.quality}-${idx}`}
                          type="button"
                          onClick={() => handleSelectServer(srv, episodeServers)}
                          style={{
                            padding: '0.45rem 0.8rem',
                            borderRadius: '12px',
                            background: active ? '#ffffff' : '#0d0d12',
                            color: active ? '#000000' : '#ffffff',
                            border: active ? '1.5px solid #ffffff' : '1px solid rgba(255,255,255,0.16)',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer'
                          }}
                        >
                          {srv.label || `${isRtl ? meta.nameAr : meta.nameEn}${srv.quality ? ` • ${srv.quality}` : ''}`}
                        </button>
                      );
                    })}
                  </div>

                  {/* Timed Scene Comment Input Bar (التعليقات الزمنية التفاعلية على مشاهد الحلقة) */}
                  <form
                    onSubmit={handlePostTimedComment}
                    style={{ display: 'flex', gap: '0.4rem', marginTop: '0.55rem', alignItems: 'center' }}
                  >
                    <button
                      type="button"
                      onClick={() => setTimedCommentsEnabled((v) => !v)}
                      style={{
                        padding: '0.45rem 0.6rem',
                        borderRadius: '8px',
                        background: timedCommentsEnabled ? '#ffffff' : 'rgba(255,255,255,0.08)',
                        color: timedCommentsEnabled ? '#000000' : '#ffffff',
                        border: '1px solid rgba(255,255,255,0.2)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer'
                      }}
                    >
                      <BxIcon name="message" className="bx-ico-lead" />{timedCommentsEnabled ? 'ON' : 'OFF'}
                    </button>
                    <input
                      type="text"
                      value={newTimedCommentText}
                      onChange={(e) => setNewTimedCommentText(e.target.value)}
                      placeholder={
                        isRtl
                          ? 'علّق على اللحظة دي...'
                          : 'Comment on this moment...'
                      }
                      style={{
                        flex: 1,
                        padding: '0.45rem 0.7rem',
                        borderRadius: '8px',
                        background: '#08080c',
                        border: '1px solid rgba(255,255,255,0.18)',
                        color: '#ffffff',
                        fontSize: '0.75rem'
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        padding: '0.45rem 0.75rem',
                        borderRadius: '8px',
                        background: '#ffffff',
                        color: '#000000',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      {isRtl ? 'إرسال' : 'Envoyer'}
                    </button>
                  </form>

                  {/* Soirée (PartyPanel.jsx + useWatchParty.js): real rooms, chat, reactions */}
                  {(partyPanelOpen || party.code) && (
                    <PartyPanel
                      party={party}
                      isRtl={isRtl}
                      isWeb={isWeb}
                      canHost={Boolean(partyCurrent)}
                      onFermer={() => setPartyPanelOpen(false)}
                      onToast={showToast}
                    />
                  )}

                  {/* In-Player Quick Episode Switcher Strip inside Dedicated Standalone Video Player Page */}
                  {animeEpisodes.length > 0 && (
                    <div
                      className="bx-ep-strip-box"
                      style={{
                        marginTop: '0.8rem',
                        padding: '0.75rem',
                        borderRadius: '12px',
                        background: '#08080c',
                        border: '1px solid rgba(255,255,255,0.14)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.75rem' }}>
                          {isRtl ? `الحلقات (${animeEpisodes.length})` : `Episodes (${animeEpisodes.length})`}
                        </span>
                      </div>
                      <div className="bx-mob-scroll bx-ep-strip" style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
                        {animeEpisodes.slice(0, 120).map((ep) => {
                          const active = activeEpisode?.docId === ep.docId;
                          return (
                            <button
                              key={`inplayer-${ep.docId}`}
                              type="button"
                              onClick={() => handlePlayEpisode(selectedAnime, ep)}
                              style={{
                                padding: '0.45rem 0.75rem',
                                borderRadius: '12px',
                                background: active ? '#ffffff' : 'rgba(255,255,255,0.08)',
                                color: active ? '#000000' : '#ffffff',
                                border: active ? '1.5px solid #ffffff' : '1px solid rgba(255,255,255,0.16)',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                                flexShrink: 0
                              }}
                            >
                              {active ? <><BxIcon name="play" />{" "}</> : ''}{isRtl ? `ح ${ep.number}` : `E${ep.number}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Nuvio DetailHero — centered logo/title + genres, cinematic gradient, 28px bottom radius */}
          <div style={{ position: 'relative', overflow: 'hidden' }}>
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: 'clamp(420px, 62vh, 560px)',
                overflow: 'hidden',
                borderRadius: '0 0 28px 28px',
                background: '#0d0d0d'
              }}
            >
              <img
                src={selectedAnime.banner || selectedAnime.poster}
                alt={selectedAnime.titleEn}
                style={{
                  viewTransitionName: 'bx-poster',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center 20%',
                  filter: 'brightness(0.78) contrast(1.06)',
                  transform: 'scale(1.08)'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(13,13,13,0.02) 0%, transparent 16%, rgba(13,13,13,0.14) 32%, rgba(13,13,13,0.34) 50%, rgba(13,13,13,0.62) 68%, rgba(13,13,13,0.84) 84%, #0d0d0d 100%)',
                  pointerEvents: 'none'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '0 18px',
                  textAlign: 'center'
                }}
              >
                <h1
                  dir="auto"
                  style={{
                    margin: 0,
                    fontSize: '30px',
                    fontWeight: 300,
                    lineHeight: 1.1,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: '#f5f7f8',
                    textShadow: '0 2px 18px rgba(0,0,0,0.6)',
                    maxWidth: '100%',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {selectedAnime.titleEn}
                </h1>
                {visibleGenres(selectedAnime.tags).length > 0 ? (
                  <div style={{ color: '#b8bec5', fontSize: '13px', fontWeight: 600, letterSpacing: '0.02em' }}>
                    {visibleGenres(selectedAnime.tags).slice(0, 3).join(' • ')}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ position: 'relative', zIndex: 2, padding: '12px 1rem 1rem', background: '#0d0d0d' }}>
              {/* Nuvio DetailMetaInfo: release • runtime • ageBadge • IMDb (yellow) then Réalisateur/Scénariste + synopsis */}
              {(() => {
                const metaRow = [];
                if (selectedAnime.year) metaRow.push(String(selectedAnime.year));
                if (selectedAnime.state) metaRow.push(selectedAnime.state);
                const ageBadge = selectedAnime.ageRating || null;
                const imdb = selectedAnime.rating || null;
                const hasMetaRow = metaRow.length > 0 || ageBadge || (imdb && Number(imdb) > 0);
                return hasMetaRow ? (
                  <div className="nv-detail-meta-row">
                    {metaRow.map((m) => (
                      <span key={m} className="nv-detail-release">{m}</span>
                    ))}
                    {ageBadge ? <span className="nv-detail-age-badge">{ageBadge}</span> : null}
                    {imdb && Number(imdb) > 0 ? (
                      <span className="nv-detail-imdb"><span className="nv-imdb-label">IMDb</span><span className="nv-imdb-val">{imdb}</span></span>
                    ) : null}
                  </div>
                ) : null;
              })()}
              {selectedAnime.director ? (
                <div className="nv-detail-credit">
                  <span className="nv-detail-credit-label">Réalisateur:  </span>
                  <span className="nv-detail-credit-val">{Array.isArray(selectedAnime.director) ? selectedAnime.director.join(', ') : selectedAnime.director}</span>
                </div>
              ) : null}
              {selectedAnime.writer ? (
                <div className="nv-detail-credit">
                  <span className="nv-detail-credit-label">Scénariste:  </span>
                  <span className="nv-detail-credit-val">{Array.isArray(selectedAnime.writer) ? selectedAnime.writer.join(', ') : selectedAnime.writer}</span>
                </div>
              ) : null}

              {/* Nuvio DetailActionButtons — white pill Lire + circular … (secondaries expand) */}
              {(() => {
                const savedHist = watchHistory.find((h) => h.objectID === selectedAnime.objectID);
                const resumeEp = savedHist && animeEpisodes.find((e) => Number(e.number) === Number(savedHist.episode));
                const pos = resumeEp ? getPosition(episodeKey(selectedAnime, resumeEp.number)) : null;
                let targetEp = resumeEp || animeEpisodes[0];
                let playLabel = null;
                if (episodesLoading) playLabel = 'Chargement' + '…';
                else if (resumeEp && pos && pos.done) {
                  const nextEp = animeEpisodes.find((e) => Number(e.number) === Number(resumeEp.number) + 1);
                  if (nextEp) { targetEp = nextEp; playLabel = `Lire S1E${nextEp.number}`; }
                  else playLabel = `Revoir S1E${resumeEp.number}`;
                } else if (resumeEp) {
                  playLabel = `Lire S1E${resumeEp.number}`;
                } else if (targetEp) {
                  playLabel = `Lire S1E${targetEp.number}`;
                } else {
                  playLabel = 'Indisponible';
                }
                const fav = favorites.some((f) => f.objectID === selectedAnime.objectID);
                const isVu = Boolean(pos && pos.done);
                const moreOpen = detailActionsExpanded;
                return (
                  <div className="nv-detail-actions">
                    <div className="nv-detail-pill-row">
                      <button
                        type="button"
                        className="nv-detail-play"
                        disabled={episodesLoading || !targetEp}
                        onClick={() => targetEp && handlePlayEpisode(selectedAnime, targetEp)}
                      >
                        {episodesLoading ? <BxIcon name="loader" size="1.05em" spin /> : <BxIcon name="play" filled size="1.05em" />}
                        <span>{playLabel}</span>
                      </button>
                      <button
                        type="button"
                        className={`nv-detail-more${moreOpen ? ' is-open' : ''}`}
                        aria-expanded={moreOpen}
                        aria-label="Plus d&apos;actions"
                        onClick={() => setDetailActionsExpanded((v) => !v)}
                      >
                        <BxIcon name="more-horiz" size="1.25em" />
                      </button>
                    </div>
                    {moreOpen ? (
                      <div className="nv-detail-secondaries">
                        <button type="button" className={`nv-detail-icon${fav ? ' is-on' : ''}`} onClick={() => toggleFavorite(selectedAnime)} aria-label={fav ? 'Retirer de ma liste' : 'Ajouter à ma liste'}>
                          <BxIcon name={fav ? 'check' : 'plus'} size="1.15em" />
                        </button>
                        <button type="button" className={`nv-detail-icon${isVu ? ' is-on' : ''}`} onClick={() => {
                          // watched toggle: UI only (real watched comes from resumeStore)
                          showToast(isVu ? 'Marqué non vu' : 'Marqué vu', isVu ? 'eye-off' : 'check-circle');
                        }} aria-label={isVu ? 'Marquer non vu' : 'Marquer vu'}>
                          <BxIcon name={isVu ? 'check-circle' : 'check-circle-outline'} size="1.15em" />
                        </button>
                        <button type="button" className="nv-detail-icon" disabled={!animeEpisodes.length} onClick={() => {
                          const h2 = watchHistory.find((h) => h.objectID === selectedAnime.objectID);
                          const t2 = (h2 && animeEpisodes.find((e) => Number(e.number) === Number(h2.episode))) || animeEpisodes[0];
                          if (t2) handleSaveOfflineVault(selectedAnime, t2);
                        }} aria-label="Télécharger">
                          <BxIcon name="download" size="1.15em" />
                        </button>
                        <button type="button" className="nv-detail-icon" onClick={async () => {
                          const url = `${isWeb ? window.location.origin : BX_PUBLIC_ORIGIN}/show/${animeSlugOf(selectedAnime)}`;
                          try { if (navigator.share) { await navigator.share({ title: selectedAnime.titleEn, url }); return; } } catch (_) { return; }
                          try { await navigator.clipboard?.writeText(url); showToast('Lien copié', 'share'); } catch (_) {}
                        }} aria-label="Partager">
                          <BxIcon name="share" size="1.15em" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* Story */}
              {selectedAnime.storyAr && (
                <div className="bx-detail-story" onClick={() => setStoryExpanded((v) => !v)}>
                  <p dir="auto" className={storyExpanded ? 'is-open' : ''}>
                    {selectedAnime.storyAr}
                  </p>
                  <div className="bx-detail-story-foot">
                    <span>{storyExpanded ? (isRtl ? 'أقل' : 'Moins') : isRtl ? 'المزيد' : 'Plus'}</span>
                    <button
                      type="button"
                      className="bx-chip bx-chip-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSpeakText(selectedAnime.storyAr);
                      }}
                    >
                      <BxIcon name={ttsSpeaking ? 'mute' : 'volume'} size="1em" />
                      {ttsSpeaking ? (isRtl ? 'إيقاف' : 'Arrêter') : isRtl ? 'استماع' : 'Écouter'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: '0 1rem 1rem' }}>
            {/* Image 3 Left Underlined Season / Detail Studio Tab Bar */}
            <div
              className="bx-mob-scroll"
              style={{
                display: 'flex',
                gap: '1.15rem',
                overflowX: 'auto',
                marginTop: '0.65rem',
                marginBottom: '0.85rem',
                borderBottom: '1px solid rgba(255,255,255,0.14)'
              }}
            >
              {detailTabs.map((dt) => {
                const active = detailTab === dt.id;
                return (
                  <button
                    key={dt.id}
                    type="button"
                    onClick={() => setDetailTab(dt.id)}
                    style={{
                      padding: '0.55rem 0.2rem',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      background: 'transparent',
                      color: active ? '#ffffff' : 'rgba(255,255,255,0.52)',
                      border: 'none',
                      borderBottom: active ? '2.5px solid #ffffff' : '2.5px solid transparent'
                    }}
                  >
                    {dt.label}
                  </button>
                );
              })}
            </div>

            {/* SUB-TAB 1: EPISODES & DIRECT STREAMING */}
            {detailTab === 'episodes' && (
              <>
                {/* 50-Episode Range Chunk Selector for Long-Running Anime (> 50 episodes) */}
                {animeEpisodes.length > 50 && (
                  <div
                    className="bx-mob-scroll"
                    style={{ display: 'flex', gap: '0.38rem', overflowX: 'auto', marginBottom: '0.55rem', paddingBottom: '0.15rem' }}
                  >
                    <button
                      type="button"
                      onClick={() => setEpRangeChunk(-1)}
                      style={{
                        padding: '0.34rem 0.7rem',
                        borderRadius: '999px',
                        background: epRangeChunk === -1 ? '#ffffff' : 'rgba(255,255,255,0.08)',
                        color: epRangeChunk === -1 ? '#000000' : '#ffffff',
                        border: '1px solid rgba(255,255,255,0.2)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer'
                      }}
                    >
                      {isRtl ? `الكل (${animeEpisodes.length})` : `All (${animeEpisodes.length})`}
                    </button>
                    {Array.from({ length: Math.ceil(animeEpisodes.length / 50) }).map((_, cIdx) => {
                      const startNum = cIdx * 50 + 1;
                      const endNum = Math.min(animeEpisodes.length, (cIdx + 1) * 50);
                      const active = epRangeChunk === cIdx;
                      return (
                        <button
                          key={`chunk-${cIdx}`}
                          type="button"
                          onClick={() => setEpRangeChunk(cIdx)}
                          style={{
                            padding: '0.34rem 0.7rem',
                            borderRadius: '999px',
                            background: active ? '#ffffff' : 'rgba(255,255,255,0.08)',
                            color: active ? '#000000' : '#ffffff',
                            border: '1px solid rgba(255,255,255,0.2)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            cursor: 'pointer'
                          }}
                        >
                          {startNum} - {endNum}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Episode tools: search + one options button (layout, order, filler) */}
                <div className="bx-ep-tools">
                  <label className="bx-ep-search">
                    <BxIcon name="search" size="1em" />
                    <input
                      type="search"
                      inputMode="numeric"
                      value={epSearchQuery}
                      onChange={(e) => setEpSearchQuery(e.target.value)}
                      placeholder={isRtl ? 'ابحث برقم الحلقة' : "Numéro d'épisode"}
                      aria-label={isRtl ? 'ابحث برقم الحلقة' : 'Rechercher un épisode'}
                    />
                  </label>
                  <button
                    type="button"
                    className={`bx-chip${epOptionsCount ? ' is-active' : ''}`}
                    onClick={() => {
                      haptic('tap');
                      setAppSheet('epOptions');
                    }}
                    aria-label={isRtl ? 'خيارات الحلقات' : 'Options des épisodes'}
                  >
                    <BxIcon name="sliders" size="1.05em" />
                    {isRtl ? 'خيارات' : 'Options'}
                    {epOptionsCount ? ` · ${epOptionsCount}` : ''}
                  </button>
                </div>

                {episodesLoading ? (
                  <SkeletonList count={6} thumbWidth={120} thumbHeight={68} padding="0" />
                ) : animeEpisodes.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '1.4rem 1rem',
                      borderRadius: '12px',
                      background: '#0a0a0e',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.75)',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      lineHeight: 1.6
                    }}
                  >
                    <div style={{ marginBottom: '0.7rem' }}>
                      {episodesError === 'network'
                        ? isRtl
                          ? 'تعذّر الاتصال بسيرفرات BLACK X — تأكد من الإنترنت ثم أعد المحاولة.'
                          : 'Could not reach the BLACK X servers — check your connection and retry.'
                        : isRtl
                          ? 'مفيش حلقات متاحة للعمل ده دلوقتي.'
                          : 'No episodes for this title on the BLACK X servers right now.'}
                    </div>
                    <button
                      type="button"
                      onClick={() => selectedAnime && handleOpenAnime(selectedAnime)}
                      style={{
                        padding: '0.5rem 1.1rem',
                        borderRadius: '999px',
                        background: '#ffffff',
                        color: '#000000',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      {isRtl ? <><BxIcon name="retry" className="bx-ico-lead" />{"إعادة المحاولة"}</> : <><BxIcon name="retry" className="bx-ico-lead" />{"Réessayer"}</>}
                    </button>
                  </div>
                ) : epLayoutMode === 'grid' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.45rem' }}>
                    {displayedEpisodes.map((ep) => {
                      const isPlaying = activeEpisode?.docId === ep.docId;
                      // Vu = the saved position reached the end (resumeStore `done`), not "opened once".
                      const epPos = getPosition(episodeKey(selectedAnime, ep.number));
                      const isVu = Boolean(epPos?.done);
                      const epPct = epPos && epPos.dur > 0 && !epPos.done ? Math.min(100, Math.max(3, (epPos.sec / epPos.dur) * 100)) : null;
                      return (
                        <button
                          key={ep.docId}
                          type="button"
                          onClick={() => handlePlayEpisode(selectedAnime, ep)}
                          style={{
                            padding: '0.65rem 0.3rem',
                            borderRadius: '12px',
                            background: isPlaying ? '#ffffff' : isVu ? 'rgba(255,255,255,0.06)' : '#0b0b10',
                            color: isPlaying ? '#000000' : '#ffffff',
                            border: isPlaying
                              ? '1.5px solid #ffffff'
                              : isVu
                              ? '1px solid rgba(255,255,255,0.28)'
                              : '1px solid rgba(255,255,255,0.12)',
                            fontWeight: 700,
                            fontSize: '0.8125rem',
                            textAlign: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <div>{ep.number}</div>
                          {isVu && <div style={{ fontSize: '0.75rem', opacity: 0.72 }}><BxIcon name="check" /></div>}
                          {epPct !== null && (
                            <span className="bx-ep-progress" aria-hidden="true">
                              <span style={{ width: `${epPct}%` }} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {displayedEpisodes.map((ep) => {
                      const isPlaying = activeEpisode?.docId === ep.docId;
                      // Vu = the saved position reached the end (resumeStore `done`), not "opened once".
                      const epPos = getPosition(episodeKey(selectedAnime, ep.number));
                      const isVu = Boolean(epPos?.done);
                      const epPct = epPos && epPos.dur > 0 && !epPos.done ? Math.min(100, Math.max(3, (epPos.sec / epPos.dur) * 100)) : null;
                      return (
                        <div
                          key={ep.docId}
                          className="bx-mob-card"
                          onClick={() => handlePlayEpisode(selectedAnime, ep)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.55rem',
                            borderRadius: '12px',
                            background: isPlaying ? '#ffffff' : '#0a0a0e',
                            color: isPlaying ? '#000000' : '#ffffff',
                            border: isPlaying ? '1.5px solid #ffffff' : '1px solid rgba(255,255,255,0.1)',
                            opacity: isVu && !isPlaying ? 0.78 : 1,
                            cursor: 'pointer'
                          }}
                        >
                          <div
                            style={{
                              position: 'relative',
                              width: '92px',
                              height: '56px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              background: '#111',
                              flexShrink: 0
                            }}
                          >
                            <img
                              src={ep.thumb || selectedAnime.poster}
                              alt={ep.name}
                              loading="lazy"
                          decoding="async"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            {ep.filler && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: '3px',
                                  right: '3px',
                                  background: '#000',
                                  color: '#fff',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  padding: '0.08rem 0.3rem',
                                  borderRadius: '4px'
                                }}
                              >
                                فلر
                              </span>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                              <span dir="auto" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.name}</span>
                              {isVu && (
                                <span style={{ flexShrink: 0, fontSize: '0.75rem', fontWeight: 600, padding: '0.05rem 0.4rem', borderRadius: '8px', background: 'rgba(255,255,255,0.16)' }}>
                                  <BxIcon name="check" className="bx-ico-lead" />
                                  {isRtl ? 'اتشافت' : 'Vu'}
                                </span>
                              )}
                            </div>
                            {epPct !== null && (
                              <span className="bx-ep-progress" aria-label={isRtl ? `اتشاف ${Math.round(epPct)}%` : `${Math.round(epPct)}% regardé`}>
                                <span style={{ width: `${epPct}%` }} />
                              </span>
                            )}
                            {ep.titleAr && (
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  opacity: 0.72,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}
                              >
                                {ep.titleAr}
                              </div>
                            )}
                          </div>
                          <span
                            style={{
                              padding: '0.35rem 0.7rem',
                              borderRadius: '8px',
                              background: isPlaying ? '#000000' : 'rgba(255,255,255,0.1)',
                              color: '#ffffff',
                              fontSize: '0.75rem',
                              fontWeight: 700
                            }}
                          >
                            <BxIcon name="play" />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* SUB-TAB 2: CHARACTERS & JAPANESE VOICE ACTORS (SEIYUU) */}
            {detailTab === 'characters' && (
              charactersLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.6)' }}>
                  {isRtl ? <><BxIcon name="loader" className="bx-ico-lead" />{"بيحمّل الشخصيات..."}</> : <><BxIcon name="loader" className="bx-ico-lead" />{"Loading characters & voice actors..."}</>}
                </div>
              ) : animeCharacters.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.6)' }}>
                  {isRtl ? 'مفيش بيانات عن الشخصيات.' : 'No character data found.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {animeCharacters.map((ch) => (
                    <div
                      key={ch.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.55rem 0.7rem',
                        borderRadius: '12px',
                        background: '#0a0a0e',
                        border: '1px solid rgba(255,255,255,0.12)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <img
                          src={ch.image}
                          alt={ch.name}
                          loading="lazy"
                          decoding="async"
                          style={{ width: '48px', height: '62px', borderRadius: '8px', objectFit: 'cover' }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.8125rem' }}>{ch.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>{ch.role}</div>
                        </div>
                      </div>
                      {ch.vaName && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', textAlign: 'end' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.75rem' }}>{ch.vaName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)' }}><BxIcon name="mic" className="bx-ico-lead" />JP Seiyuu</div>
                          </div>
                          {ch.vaImage && (
                            <img
                              src={ch.vaImage}
                              alt={ch.vaName}
                              loading="lazy"
                          decoding="async"
                              style={{ width: '44px', height: '58px', borderRadius: '8px', objectFit: 'cover' }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {/* SUB-TAB 3: OFFICIAL TRAILER & SIMILAR/RELATED ANIME */}
            {detailTab === 'trailer' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {detailTrailerId ? (
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9375rem', fontWeight: 700 }}>
                      <BxIcon name="film" className="bx-ico-lead" />{isRtl ? 'الإعلان الرسمي' : 'Bande-annonce officielle'}
                    </h4>
                    <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${encodeURIComponent(detailTrailerId)}`}
                        title="Anime Trailer"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        frameBorder="0"
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  </div>
                ) : null}

                {relatedAnimes.length > 0 && <div>
                  <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.9375rem', fontWeight: 700 }}>
                    <BxIcon name="sparkles" className="bx-ico-lead" />{isRtl ? 'من نفس التصنيف' : 'Même genre'}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                    {relatedAnimes.map((rel) => (
                      <div key={rel.objectID} onClick={() => handleOpenAnime(rel)} style={{ cursor: 'pointer' }}>
                        <img
                          src={coverForMode(rel.poster, dataSaver)}
                          alt={rel.titleEn}
                          loading="lazy"
                          decoding="async"
                          style={{ width: '100%', aspectRatio: '2/2.85', borderRadius: '12px', objectFit: 'cover' }}
                        />
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rel.titleEn}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>}
              </div>
            )}

            {/* SUB-TAB 4: CLOUD ANIME REVIEWS & 4-PILLAR MASTER RATINGS */}
            {detailTab === 'reviews' && (
              <div>
                <form
                  onSubmit={handlePostAnimeReview}
                  style={{
                    padding: '0.8rem',
                    borderRadius: '12px',
                    background: '#0a0a0e',
                    border: '1px solid rgba(255,255,255,0.14)',
                    marginBottom: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      <BxIcon name="star" className="bx-ico-lead" />{isRtl ? 'التقييم الرباعي الاحترافي (4-Pillar Rating):' : 'Note en 4 piliers :'}
                    </span>
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '8px',
                        background: '#ffffff',
                        color: '#000000',
                        fontWeight: 700,
                        fontSize: '0.75rem'
                      }}
                    >
                      <BxIcon name="star" className="bx-ico-lead" />{((revStoryScore + revAnimScore + revOstScore + revCharScore) / 4).toFixed(1)} / 10
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', marginBottom: '0.55rem' }}>
                    {[
                      { label: isRtl ? 'القصة' : 'Histoire', val: revStoryScore, set: setRevStoryScore },
                      { label: isRtl ? 'التحريك' : 'Animation', val: revAnimScore, set: setRevAnimScore },
                      { label: isRtl ? 'الموسيقى' : 'OST', val: revOstScore, set: setRevOstScore },
                      { label: isRtl ? 'الشخصيات' : 'Cast', val: revCharScore, set: setRevCharScore }
                    ].map((p, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.35rem 0.55rem',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.14)',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}
                      >
                        <span>{p.label}</span>
                        <select
                          value={p.val}
                          onChange={(e) => p.set(Number(e.target.value))}
                          style={{
                            background: '#000',
                            color: '#fff',
                            border: '1px solid rgba(255,255,255,0.22)',
                            borderRadius: '8px',
                            padding: '0.12rem 0.35rem',
                            fontWeight: 700,
                            fontSize: '0.75rem'
                          }}
                        >
                          {[10, 9, 8, 7, 6, 5].map((s) => (
                            <option key={s} value={s}>
                              {s}/10
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <input
                      type="text"
                      value={newReviewText}
                      onChange={(e) => setNewReviewText(e.target.value)}
                      placeholder={isRtl ? 'اكتب مراجعتك أو رأيك حول هذا الأنمي...' : 'Écrivez votre avis...'}
                      style={{
                        flex: 1,
                        padding: '0.58rem 0.8rem',
                        borderRadius: '12px',
                        background: '#050507',
                        border: '1px solid rgba(255,255,255,0.18)',
                        color: '#fff',
                        fontSize: '0.75rem'
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        padding: '0 0.95rem',
                        borderRadius: '12px',
                        border: 'none',
                        background: '#ffffff',
                        color: '#000000',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      {isRtl ? 'إرسال' : 'Post'}
                    </button>
                  </div>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {animeReviews.map((rv) => (
                    <div
                      key={rv.id}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '12px',
                        background: '#0a0a0e',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem', flexWrap: 'wrap', gap: '0.35rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.8125rem' }}>{rv.author}</span>
                          {rv.sovereignTitle && (
                            <span style={{ fontSize: '0.75rem', padding: '0.08rem 0.42rem', borderRadius: '999px', background: 'rgba(255,255,255,0.12)', fontWeight: 700 }}>
                              {rv.sovereignTitle}
                            </span>
                          )}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.75rem', background: '#fff', color: '#000', padding: '0.08rem 0.45rem', borderRadius: '8px' }}>
                          <BxIcon name="star" className="bx-ico-lead" />{rv.score}/10
                        </span>
                      </div>
                      {rv.pillars && (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.35rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.68)' }}>
                          <span><BxIcon name="book" className="bx-ico-lead" />القصة: {rv.pillars.story}</span>•<span><BxIcon name="zap" className="bx-ico-lead" />التحريك: {rv.pillars.anim}</span>•
                          <span><BxIcon name="music" className="bx-ico-lead" />الموسيقى: {rv.pillars.ost}</span>•<span><BxIcon name="users" className="bx-ico-lead" />الشخصيات: {rv.pillars.char}</span>
                        </div>
                      )}
                      <p style={{ margin: 0, fontSize: '0.9375rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.45 }}>{rv.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== v8.0 NETFLIX QUICK PEEK / INFO BOTTOM SHEET ==================== */}
      {peekPresence.mounted && peekItem && (() => {
        const quickPeekAnime = peekItem;
        return (
        <div
          className={`bx-peek-layer${peekPresence.closing ? ' is-closing' : ''}`}
          onClick={() => setQuickPeekAnime(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9850,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          <div
            className="bx-peek-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '520px',
              borderTopLeftRadius: '18px',
              borderTopRightRadius: '18px',
              background: '#0a0a0f',
              borderTop: '1.5px solid rgba(255,255,255,0.28)',
              padding: '1.15rem 1.1rem 1.8rem',
              boxShadow: '0 -16px 48px rgba(0,0,0,0.95)',
              animation: 'bxSlideUp 0.46s cubic-bezier(0.22, 1, 0.36, 1) backwards'
            }}
          >
            <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
              <img
                src={quickPeekAnime.poster}
                alt={quickPeekAnime.titleEn}
                style={{
                  width: '88px',
                  height: '126px',
                  borderRadius: '12px',
                  objectFit: 'cover',
                  border: '1px solid rgba(255,255,255,0.22)',
                  flexShrink: 0
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <h3 style={{ margin: '0 0 0.3rem', fontSize: '1.0625rem', fontWeight: 800, lineHeight: 1.25 }}>
                    {quickPeekAnime.titleEn}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setQuickPeekAnime(null)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.12)',
                      border: 'none',
                      color: '#ffffff',
                      fontWeight: 700,
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    <BxIcon name="close" />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: '0.45rem' }}>
                  {[quickPeekAnime.rating ? <><BxIcon name="star" className="bx-ico-lead" />{quickPeekAnime.rating}</> : '', quickPeekAnime.type, quickPeekAnime.year]
                    .filter(Boolean)
                    .map((part, partIdx) => (
                      <React.Fragment key={partIdx}>
                        {partIdx > 0 && <span>•</span>}
                        <span>{part}</span>
                      </React.Fragment>
                    ))}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.9375rem',
                    color: 'rgba(255,255,255,0.78)',
                    lineHeight: 1.48,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {quickPeekAnime.storyAr}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0.45rem', marginTop: '0.9rem' }}>
              <button
                type="button"
                onClick={() => {
                  const target = quickPeekAnime;
                  setQuickPeekAnime(null);
                  handleOpenAnime(target, 1);
                }}
                style={{
                  padding: '0.68rem',
                  borderRadius: '12px',
                  background: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  cursor: 'pointer'
                }}
              >
                <BxIcon name="play" className="bx-ico-lead" />{isRtl ? 'تشغيل الآن' : 'Lire maintenant'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = quickPeekAnime;
                  setQuickPeekAnime(null);
                  handleOpenAnime(target);
                }}
                style={{
                  padding: '0.68rem 0.75rem',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.22)',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                <BxIcon name="landmark" className="bx-ico-lead" />{isRtl ? 'الحلقات' : 'Épisodes'}
              </button>
              <button
                type="button"
                onClick={() => toggleFavorite(quickPeekAnime)}
                style={{
                  padding: '0.68rem 0.75rem',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.22)',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                {favorites.some((f) => f.objectID === quickPeekAnime.objectID) ? <BxIcon name="check" /> : <BxIcon name="plus" />}
              </button>
              <button
                type="button"
                onClick={() => handleToggleSpeakText(quickPeekAnime.storyAr || quickPeekAnime.titleEn)}
                style={{
                  padding: '0.68rem 0.75rem',
                  borderRadius: '12px',
                  background: ttsSpeaking ? '#ffffff' : 'rgba(255,255,255,0.1)',
                  color: ttsSpeaking ? '#000000' : '#ffffff',
                  border: '1px solid rgba(255,255,255,0.22)',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                <BxIcon name="volume" />
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ==================== v9.0 FULL-SCREEN VERTICAL STORY / HIGHLIGHT PREVIEW MODAL ==================== */}
      {storyPreviewAnime?.item && (
        <StoryPreview
          {...{
            favorites,
            handleOpenAnime,
            isRtl,
            popularList,
            setStoryPreviewAnime,
            storyPreviewAnime,
            toggleFavorite
          }}
        />
      )}

      {/* Lecture settings (PlayerControls settings button in full screen) */}
      <BottomSheet
        open={playerMoreOpen && Boolean(activeEpisode)}
        onFermer={() => setPlayerMoreOpen(false)}
        title={isRtl ? 'إعدادات التشغيل' : 'Lecture'}
        closeLabel={isRtl ? 'إغلاق' : 'Fermer'}
        layerClassName="bx-sheet-over-player"
      >
        <section className="bx-filter-group">
          <h4>{isRtl ? 'السرعة' : 'Vitesse'}</h4>
          <div className="bx-filter-chips">
            {[0.75, 1, 1.25, 1.5, 2].map((sp) => (
              <button
                key={sp}
                type="button"
                className={`bx-chip${playbackSpeed === sp ? ' is-active' : ''}`}
                aria-pressed={playbackSpeed === sp}
                onClick={() => {
                  setPlaybackSpeed(sp);
                  if (videoRef.current) videoRef.current.playbackRate = sp;
                }}
              >
                {`${sp}x`}
              </button>
            ))}
          </div>
        </section>
        <section className="bx-filter-group">
          <h4>{isRtl ? 'قفز سريع' : 'Saut'}</h4>
          <div className="bx-filter-chips">
            <button type="button" className="bx-chip" onClick={() => seekVideoBy(-600)}>
              {isRtl ? '− 10 دقايق' : '−10 min'}
            </button>
            <button type="button" className="bx-chip" onClick={() => seekVideoBy(600)}>
              {isRtl ? '+ 10 دقايق' : '+10 min'}
            </button>
            <button type="button" className="bx-chip" onClick={skipIntroManually}>
              {skipSegments.some((sg) => sg.type === 'op') ? (isRtl ? 'تخطي المقدمة' : "Passer l'intro") : isRtl ? 'قدّم 85 ثانية' : '+85 s'}
            </button>
          </div>
        </section>
        <section className="bx-filter-group">
          <h4>{isRtl ? 'مقاس الصورة' : "Format d'image"}</h4>
          <div className="bx-filter-chips">
            {[
              ['cover', isRtl ? 'ملء الشاشة' : "Remplir l'écran"],
              ['contain', isRtl ? 'الأصلي' : 'Original'],
              ['fill', isRtl ? 'تمديد' : 'Étirer']
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`bx-chip${videoFitMode === id ? ' is-active' : ''}`}
                aria-pressed={videoFitMode === id}
                onClick={() => setVideoFitMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <section className="bx-filter-group">
          <h4>{isRtl ? 'الصورة والصوت' : 'Picture & sound'}</h4>
          <div className="bx-filter-chips">
            <button type="button" className={`bx-chip${visualShaderMode !== 'original' ? ' is-active' : ''}`} onClick={handleCycleVisualShader}>
              <BxIcon name="wand" size="1em" />
              {visualShaderMode === 'upscale4k'
                ? isRtl ? 'خطوط أوضح' : 'Contours nets'
                : visualShaderMode === 'amoled_hdr'
                ? isRtl ? 'تباين أعلى' : 'Plus de contraste'
                : visualShaderMode === 'cinema_imax'
                ? isRtl ? 'ألوان دافية' : 'Couleurs chaudes'
                : isRtl ? 'الصورة: أصلية' : 'Image : original'}
            </button>
            <button type="button" className={`bx-chip${audioBoostMode !== 'normal' ? ' is-active' : ''}`} onClick={handleCycleAudioBooster}>
              <BxIcon name={audioBoostMode === 'voice' ? 'mic' : 'volume'} size="1em" />
              {audioBoostMode === 'boost200'
                ? isRtl ? 'الصوت 200%' : 'Volume 200%'
                : audioBoostMode === 'boost150'
                ? isRtl ? 'الصوت 150%' : 'Volume 150%'
                : audioBoostMode === 'voice'
                ? isRtl ? 'وضوح الكلام' : 'Voix claires'
                : isRtl ? 'الصوت 100%' : 'Volume 100%'}
            </button>
            <button type="button" className="bx-chip" onClick={handleTakeVideoCapture}>
              <BxIcon name="camera" size="1em" />
              {isRtl ? 'لقطة' : 'Capture'}
            </button>
          </div>
        </section>
      </BottomSheet>

      {/* Search filters (bottom sheet) */}
      <BottomSheet
        open={signOutConfirmOpen}
        onFermer={() => setSignOutConfirmOpen(false)}
        title={isRtl ? 'تسجيل الخروج؟' : 'Se déconnecter?'}
        closeLabel={isRtl ? 'إغلاق' : 'Fermer'}
      >
        <p className="bxp-confirm-text">
          {isRtl
            ? 'قائمتك وسجل مشاهدتك محفوظين على حسابك، وهيفضلوا كمان على الموبايل ده.'
            : 'Your list and history are saved to your account and also stay on this phone.'}
        </p>
        <div className="bxp-confirm-actions">
          <button type="button" className="bx-btn bx-btn-primary bx-btn-block" onClick={handleSignOut}>
            <BxIcon name="logout" />
            {isRtl ? 'تسجيل الخروج' : 'Se déconnecter'}
          </button>
          <button type="button" className="bx-btn bx-btn-ghost bx-btn-block" onClick={() => setSignOutConfirmOpen(false)}>
            {isRtl ? 'إلغاء' : 'Annuler'}
          </button>
        </div>
      </BottomSheet>
      <BottomSheet
        open={appSheet === 'epOptions' && Boolean(selectedAnime)}
        onFermer={() => setAppSheet(null)}
        title={isRtl ? 'خيارات الحلقات' : 'Options des épisodes'}
        closeLabel={isRtl ? 'إغلاق' : 'Fermer'}
        className="bx-ep-options"
      >
        <section className="bx-filter-group">
          <h4>{isRtl ? 'طريقة العرض' : 'Layout'}</h4>
          <div className="bx-seg" role="group">
            <button type="button" className={epLayoutMode === 'cards' ? 'is-on' : ''} aria-pressed={epLayoutMode === 'cards'} onClick={() => setEpLayoutMode('cards')}>
              <BxIcon name="list" className="bx-ico-lead" />
              {isRtl ? 'بطاقات' : 'Cartes'}
            </button>
            <button type="button" className={epLayoutMode === 'grid' ? 'is-on' : ''} aria-pressed={epLayoutMode === 'grid'} onClick={() => setEpLayoutMode('grid')}>
              <BxIcon name="grid" className="bx-ico-lead" />
              {isRtl ? 'أرقام' : 'Numéros'}
            </button>
          </div>
        </section>
        <section className="bx-filter-group">
          <h4>{isRtl ? 'الترتيب' : 'Ordre'}</h4>
          <div className="bx-seg" role="group">
            <button type="button" className={epAscending ? 'is-on' : ''} aria-pressed={epAscending} onClick={() => setEpAscending(true)}>
              {isRtl ? 'من الأولى' : 'Du début à la fin'}
            </button>
            <button type="button" className={!epAscending ? 'is-on' : ''} aria-pressed={!epAscending} onClick={() => setEpAscending(false)}>
              {isRtl ? 'من الأحدث' : "Plus récent d'abord"}
            </button>
          </div>
        </section>
        {hasFillerData ? (
          <section className="bx-filter-group">
            <h4>{isRtl ? 'حلقات الفلر' : 'Épisodes filler'}</h4>
            <div className="bx-seg" role="group">
              <button type="button" className={!hideFiller ? 'is-on' : ''} aria-pressed={!hideFiller} onClick={() => setHideFiller(false)}>
                {isRtl ? 'اعرضها' : 'Afficher'}
              </button>
              <button type="button" className={hideFiller ? 'is-on' : ''} aria-pressed={hideFiller} onClick={() => setHideFiller(true)}>
                {isRtl ? 'اخفيها' : 'Masquer'}
              </button>
            </div>
          </section>
        ) : null}
      </BottomSheet>
      <FilterSheet
        open={filterSheetOpen && activeTab === 'manga' && !selectedAnime && !selectedManga && !activeMangaChapter}
        onFermer={() => setFilterSheetOpen(false)}
        isRtl={isRtl}
        value={{
          server: mangaServerTabs.find((t) => t.id === mangaSource) || mangaServerTabs[0],
          kind: MANGA_KIND_FILTERS.find((k) => k.id === mangaFilterType) || MANGA_KIND_FILTERS[0]
        }}
        defaults={{ server: mangaServerTabs[0], kind: MANGA_KIND_FILTERS[0] }}
        groups={[
          { key: 'server', title: isRtl ? 'السيرفر' : 'Server', items: mangaServerTabs },
          { key: 'kind', title: isRtl ? 'النوع' : 'Type', items: MANGA_KIND_FILTERS }
        ]}
        onApply={(d) => {
          if (d.server?.id && d.server.id !== mangaSource) setMangaSource(d.server.id);
          if (d.kind?.id && d.kind.id !== mangaFilterType) setMangaFilterType(d.kind.id);
        }}
      />
      <FilterSheet
        open={filterSheetOpen && activeTab === 'catalog' && !selectedAnime}
        onFermer={() => setFilterSheetOpen(false)}
        isRtl={isRtl}
        value={catalogFilterValue}
        onApply={applyCatalogFilters}
        types={TYPE_FILTERS}
        states={STATE_FILTERS}
        studios={STUDIO_FILTERS}
        genres={GENRE_CHIPS}
      />

      {/* ==================== ACCESS MENU (opened from the top bar) ==================== */}
      {menuPresence.mounted && (
        <AccessMenu
          {...{
            avatarPhoto,
            bxAnimeTotal,
            goToTab,
            isDeveloper,
            isRtl,
            isWeb,
            menuPresence,
            offlineChapters,
            resetProfileStack,
            setAppSheet,
            setAvatarFailed,
            setCommandMenuOpen,
            user,
            userVipTier,
            visibleFavorites
          }}
        />
      )}

      {/* ==================== BOTTOM DOCK (MobileDock.jsx) — hidden while the player / reader is open ==================== */}
      <MobileDock
        activeTab={selectedAnime ? null : activeTab}
        hidden={Boolean((activeEpisode && !playerMinimized) || videoFullscreen || activeMangaChapter)}
        isRtl={isRtl}
        onSelect={goToTab}
      />

      {/* ==================== GLOBAL MANDATORY VIP SUBSCRIPTION & ACTIVATION GATE (مربوط سحابياً بكل النسخ وبحساب المطور) ==================== */}
      {globalVipEnforced && userVipTier === 'free' && !isDeveloper && (
        <VipGate
          {...{
            authBusy,
            authPassword,
            authUsername,
            handleAuthSubmit,
            handleRealGoogleOAuthLogin,
            handleRedeemVipCode,
            isRtl,
            setAuthPassword,
            setAuthUsername,
            setSessionToken,
            setUser,
            setVipRedeemCode,
            showToast,
            user,
            vipRedeemBusy,
            vipRedeemCode
          }}
        />
      )}
    </div>
  );
}
