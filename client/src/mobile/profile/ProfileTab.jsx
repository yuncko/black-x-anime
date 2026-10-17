import React, { useEffect, useMemo, useState } from 'react';
import BxIcon from '../BxIcon.jsx';
import PosterCard from '../PosterCard.jsx';
import SectionHead from '../SectionHead.jsx';
import ScrollRow from '../ScrollRow.jsx';
import { coverForMode } from '../dataSaver.js';
import { POSITIONS_MAX, episodeKey, getPosition, positionEntries, subscribePositions } from '../resumeStore.js';
import { ChoiceRow, Empty, Field, GoogleMark, Group, Row, Segmented, SegmentedRow, SwitchRow } from './ProfileUi.jsx';
import RankingsPage from '../RankingsPage.jsx';
import WrappedPage from '../WrappedPage.jsx';
import PlatformPerks from '../PlatformPerks.jsx';
import LegalDoc from '../../legal/LegalDoc.jsx';
import './profile.css';

/**
 * Profile hub of the app ("You" / "My BLACK X"), APK v17.
 *
 * One root page — identity header, stats, history / my-list rails and grouped rows — and a
 * stack of focused sub-pages (library, history, settings, privacy …) pushed on top of it.
 * The stack lives in MobileApkApp (`profileStack`) so the top bar can show the page title
 * with a back button and the Android back button pops one page at a time.
 * This component only renders; every action and all state come in through props.
 */

const NB = '\u00a0';

export const PROFILE_PAGES = {
  library: { ar: 'قائمتي', en: 'My list' },
  history: { ar: 'سجل المشاهدة', en: 'Watch history' },
  manga: { ar: 'سجل القراءة', en: 'Reading history' },
  offline: { ar: 'محفوظ بدون نت', en: 'Saved offline' },
  snapshots: { ar: 'لقطاتي', en: 'Snapshots' },
  edit: { ar: 'تعديل الملف', en: 'Edit profile' },
  vip: { ar: 'BLACK X VIP', en: 'BLACK X VIP' },
  titles: { ar: 'اللقب', en: 'Title' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
  splash: { ar: 'شاشة البداية', en: 'Splash screen' },
  privacy: { ar: 'الخصوصية والأمان', en: 'Privacy & security' },
  requests: { ar: 'اطلب أنمي أو مانهوا', en: 'Request a title' },
  backup: { ar: 'نسخة احتياطية', en: 'Backup' },
  signin: { ar: 'تسجيل الدخول', en: 'Sign in' },
  developer: { ar: 'لوحة المطور', en: 'Developer' },
  // legal (2026-10-17; links /privacy and /terms — 'privacy' above is the settings page)
  policy: { ar: 'سياسة الخصوصية', en: 'Privacy policy' },
  terms: { ar: 'شروط الاستخدام', en: 'Terms of use' },
  // website only (2026-10-17)
  rankings: { ar: 'الترتيب', en: 'Rankings' },
  wrapped: { ar: 'ملخصك', en: 'Your year' },
  apkperks: { ar: 'ليه تنزل التطبيق؟', en: 'Why the app?' },
  // APK only
  webperks: { ar: 'على الموقع بس', en: 'Website only' }
};

export function profilePageTitle(page, isRtl) {
  const t = PROFILE_PAGES[page];
  return t ? (isRtl ? t.ar : t.en) : '';
}

/** Titles shown next to the name in reviews. The stored value stays the Arabic id. */
export const PROFILE_TITLES = [
  { id: 'صياد الرتبة S', en: 'S-Rank Hunter', icon: 'swords' },
  { id: 'سيد الظلال', en: 'Shadow Monarch', icon: 'moon', need: 'watch', goal: 3 },
  { id: 'حكيم المانهوا', en: 'Manhwa Sage', icon: 'book', need: 'read', goal: 2 },
  { id: 'جامع المفضلات', en: 'Collector', icon: 'bookmark', need: 'fav', goal: 3 },
  { id: 'عراف الأرينا', en: 'Arena Oracle', icon: 'sparkles', need: 'xp' },
  { id: 'نجم BLACK X', en: 'BLACK X Star', icon: 'star', need: 'vip' }
];

export function profileTitleLabel(id, isRtl) {
  const t = PROFILE_TITLES.find((x) => x.id === id);
  if (!t) return id || '';
  return isRtl ? t.id : t.en;
}

function vipLabel(tier, isDeveloper, isRtl) {
  if (isDeveloper) return isRtl ? 'المطور' : 'Developer';
  if (tier === 'vip_monarch') return isRtl ? 'باقة الملك' : 'Monarch';
  if (tier === 'vip_basic') return isRtl ? 'الباقة الأساسية' : 'Basic';
  return isRtl ? 'مجاني' : 'Free';
}

function isNewerVersion(latest, current) {
  const a = String(latest || '').split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(current || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

// Western digits in both languages, like every other number in the app ("الحلقة 5").
function fmt(n) {
  const v = Number(n) || 0;
  try {
    return v.toLocaleString('en-US');
  } catch {
    return String(v);
  }
}

function timeAgo(iso, isRtl) {
  const at = Date.parse(iso || '');
  if (!Number.isFinite(at)) return '';
  const min = Math.floor(Math.max(0, Date.now() - at) / 60000);
  if (min < 1) return isRtl ? 'دلوقتي' : 'now';
  if (min < 60) return isRtl ? `من ${min}${NB}د` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return isRtl ? `من ${hr}${NB}س` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return isRtl ? 'امبارح' : 'yesterday';
  if (day === 2) return isRtl ? 'من يومين' : '2d ago';
  if (day < 7) return isRtl ? `من ${day} أيام` : `${day}d ago`;
  try {
    return new Date(at).toLocaleDateString(isRtl ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function dayBucket(iso) {
  const at = Date.parse(iso || '');
  if (!Number.isFinite(at)) return 'older';
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  if (at >= t0) return 'today';
  if (at >= t0 - 86400000) return 'yesterday';
  if (at >= t0 - 6 * 86400000) return 'week';
  return 'older';
}

const BUCKETS = [
  ['today', 'النهارده', 'Today'],
  ['yesterday', 'امبارح', 'Yesterday'],
  ['week', 'الأسبوع ده', 'This week'],
  ['older', 'أقدم', 'Earlier']
];

/** Real progress of a history entry: the resume store first, the synced fields second. */
function historyProgress(h) {
  const ep = Number(h?.episode) || 0;
  const pos = ep ? getPosition(episodeKey(h, ep)) : null;
  let sec = pos?.sec;
  let dur = pos?.dur;
  let done = Boolean(pos?.done);
  if (!(dur > 0) && Number(h?.duration) > 0) {
    sec = Number(h.position) || 0;
    dur = Number(h.duration);
    done = sec / dur >= 0.92;
  }
  const pct = dur > 0 ? Math.min(100, Math.max(2, (sec / dur) * 100)) : null;
  const leftMin = dur > 0 && !done ? Math.max(1, Math.ceil((dur - sec) / 60)) : null;
  return { ep, pct: done ? 100 : pct, leftMin, done };
}

function episodeLine(h, isRtl) {
  const { ep, leftMin, done } = historyProgress(h);
  let line = ep ? (isRtl ? `الحلقة${NB}${ep}` : `Episode${NB}${ep}`) : '';
  if (done) line += isRtl ? ` •${NB}خلصت` : ` •${NB}finished`;
  else if (leftMin) line += isRtl ? ` •${NB}فاضل${NB}${leftMin}${NB}د` : ` •${NB}${leftMin}${NB}min${NB}left`;
  return line;
}

/**
 * Watch stats from what this device / account really recorded: the saved playback positions
 * (resume store: the newest 120 episodes) and the genres of the titles in the history.
 * Nothing is estimated: an episode counts as finished at 90 %, time is the seconds reached.
 */
function watchStats(history) {
  let finished = 0;
  let seconds = 0;
  let episodes = 0;
  for (const [, v] of positionEntries()) {
    const sec = Math.max(0, Number(v?.sec) || 0);
    const dur = Math.max(0, Number(v?.dur) || 0);
    if (!sec && !v?.done) continue;
    episodes += 1;
    seconds += dur > 0 ? Math.min(sec, dur) : sec;
    if (v?.done || (dur > 0 && sec / dur >= 0.9)) finished += 1;
  }
  const counts = new Map();
  for (const h of Array.isArray(history) ? history : []) {
    for (const t of Array.isArray(h?.tags) ? h.tags.slice(0, 6) : []) {
      const k = String(t || '').trim();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  const topGenres = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  return { finished, seconds, episodes, topGenres };
}

function durationText(totalSec, isRtl) {
  const min = Math.floor((Number(totalSec) || 0) / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (isRtl) return h ? `${fmt(h)}${NB}س${m ? ` ${m}${NB}د` : ''}` : `${m}${NB}د`;
  return h ? `${fmt(h)}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

function WatchStats({ history, isRtl }) {
  const stats = watchStats(history);
  if (!stats.episodes) return null;
  return (
    <section className="bxp-watchstats" aria-label={isRtl ? 'إحصائيات المشاهدة' : 'Watch stats'}>
      <h3 className="bxp-watchstats-title">{isRtl ? 'إحصائيات المشاهدة' : 'Watch stats'}</h3>
      <div className="bxp-watchstats-grid">
        <div>
          <strong>{fmt(stats.finished)}</strong>
          <span>{isRtl ? 'حلقة كمّلتها' : 'Episodes finished'}</span>
        </div>
        <div>
          <strong>{durationText(stats.seconds, isRtl)}</strong>
          <span>{isRtl ? 'وقت المشاهدة' : 'Time watched'}</span>
        </div>
        <div>
          <strong>{fmt(stats.episodes)}</strong>
          <span>{isRtl ? 'حلقة بدأتها' : 'Episodes started'}</span>
        </div>
      </div>
      {stats.topGenres.length ? (
        <p className="bxp-watchstats-genres">
          <span>{isRtl ? 'أكتر تصنيفات بتتفرجها:' : 'Your top genres:'}</span>
          {stats.topGenres.map((g) => (
            <span key={g} className="bxp-pill">
              {g}
            </span>
          ))}
        </p>
      ) : null}
      <p className="bxp-watchstats-note">
        {isRtl
          ? `محسوبة من مواضع التشغيل المحفوظة (آخر ${POSITIONS_MAX} حلقة) على الجهاز ده وحسابك.`
          : `Counted from the saved playback positions (latest ${POSITIONS_MAX} episodes) on this device and your account.`}
      </p>
    </section>
  );
}

/** Re-render when a playback position changes (resume store). */
function usePositionsTick() {
  const [, setTick] = useState(0);
  useEffect(() => subscribePositions(() => setTick((t) => t + 1)), []);
}

function Thumb({ src, dataSaver, progress, wide = false }) {
  return (
    <span className={`bxp-thumb${wide ? ' is-wide' : ''}`} aria-hidden="true">
      {src ? <img src={coverForMode(src, dataSaver)} alt="" loading="lazy" decoding="async" draggable={false} /> : <BxIcon name="image" />}
      {Number.isFinite(progress) && progress > 0 ? (
        <span className="bxp-thumb-progress">
          <span style={{ width: `${progress}%` }} />
        </span>
      ) : null}
    </span>
  );
}

function Avatar({ user, photo, onError, size = 'lg', vip }) {
  const initial = (user?.displayName?.[0] || user?.username?.[0] || 'X').toUpperCase();
  return (
    <span className={`bxp-avatar is-${size}${vip ? ' is-vip' : ''}`}>
      {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={onError} /> : user ? <span>{initial}</span> : <BxIcon name="user" size="1.5em" />}
    </span>
  );
}

/* ================================================================== root */

function RootPage(props) {
  const { isRtl, dataSaver, account, auth, library, settings, app, profileEdit, onOpenPage, onSync, signOut, devBadge } = props;
  const { user, avatarPhoto, onAvatarError, isDeveloper, vipTier, xp, needsReauth, onReauth } = account;
  usePositionsTick();
  const isVip = vipTier !== 'free' || isDeveloper;
  const tierLabel = vipLabel(vipTier, isDeveloper, isRtl);
  const hasUpdate = !app.web && isNewerVersion(app.release?.version, app.version);

  const historyRail = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const h of library.history) {
      const id = h?.objectID || h?.slug;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(h);
      if (out.length >= 12) break;
    }
    return out;
  }, [library.history]);
  const favRail = useMemo(() => library.favorites.slice(0, 12), [library.favorites]);

  const counts = {
    favorites: library.favorites.length,
    history: library.history.length,
    manga: library.mangaHistory.length,
    offline: library.offlineChapters.length,
    snapshots: library.snapshots.length
  };

  return (
    <>
      {needsReauth ? (
        <div className="bxp-note" role="note">
          <span className="bxp-note-ico" aria-hidden="true">
            <BxIcon name="shield-check" />
          </span>
          <div className="bxp-note-main">
            <strong>{isRtl ? 'سجّل الدخول تاني مرة واحدة' : 'Sign in once more'}</strong>
            <span>
              {isRtl
                ? 'الدخول بقى عن طريق سيرفر الموقع عشان أمان حسابك. بياناتك على الموبايل محفوظة وهتتزامن بعد الدخول.'
                : 'Sign-in now goes through the website server for your security. Your data on this phone is kept and syncs after signing in.'}
            </span>
            <button type="button" className="bx-btn bx-btn-primary bx-btn-sm" onClick={onReauth}>
              {isRtl ? 'سجّل الدخول' : 'Sign in'}
            </button>
          </div>
        </div>
      ) : null}

      {user ? (
        <header className={`bxp-hero${isVip ? ' is-vip' : ''}`}>
          <Avatar user={user} photo={avatarPhoto} onError={onAvatarError} vip={isVip} />
          <h2 className="bxp-name" dir="auto">
            {user.displayName || user.username}
          </h2>
          <div className="bxp-meta">
            {user.username ? (
              <span className="bxp-handle" dir="ltr">
                @{user.username}
              </span>
            ) : null}
            {isVip ? (
              <span className="bxp-pill is-solid">
                <BxIcon name="crown" size="0.95em" />
                {isDeveloper ? tierLabel : 'VIP'}
              </span>
            ) : null}
            {settings.title ? (
              <span className="bxp-pill">
                <BxIcon name="medal" size="0.95em" />
                {profileTitleLabel(settings.title, isRtl)}
              </span>
            ) : null}
          </div>
          {user.bio ? (
            <p className="bxp-bio" dir="auto">
              {user.bio}
            </p>
          ) : null}
          <div className="bxp-hero-actions">
            <button type="button" className="bx-btn bx-btn-ghost" onClick={profileEdit.onOpen}>
              <BxIcon name="pencil" />
              {isRtl ? 'تعديل الملف' : 'Edit profile'}
            </button>
            <button type="button" className="bx-btn bx-btn-ghost" onClick={onSync}>
              <BxIcon name="refresh" />
              {isRtl ? 'مزامنة' : 'Sync'}
            </button>
          </div>
          <div className="bxp-stats">
            <button type="button" onClick={() => onOpenPage('library')}>
              <strong>{fmt(counts.favorites)}</strong>
              <span>{isRtl ? 'في قائمتي' : 'My list'}</span>
            </button>
            <button type="button" onClick={() => onOpenPage('history')}>
              <strong>{fmt(counts.history)}</strong>
              <span>{isRtl ? 'اتفرجت عليه' : 'Watched'}</span>
            </button>
            <div>
              <strong>{fmt(xp)}</strong>
              <span>XP</span>
            </div>
          </div>
        </header>
      ) : (
        <header className="bxp-hero is-guest">
          <Avatar user={null} />
          <h2 className="bxp-name">{isRtl ? 'سجّل دخولك في BLACK X' : 'Sign in to BLACK X'}</h2>
          <p className="bxp-bio">
            {isRtl
              ? 'قائمتك وسجل مشاهدتك هيتحفظوا على حسابك ويتزامنوا مع الموقع.'
              : 'Keep your list and history on your account, in sync with the website.'}
          </p>
          <div className="bxp-hero-cta">
            <button type="button" className="bx-btn bx-btn-primary bx-btn-block" disabled={auth.busy} onClick={auth.onGoogle}>
              {auth.busy ? <BxIcon name="loader" /> : <GoogleMark />}
              {isRtl ? 'الدخول بحساب Google' : 'Continue with Google'}
            </button>
            <button type="button" className="bx-btn bx-btn-ghost bx-btn-block" onClick={() => onOpenPage('signin')}>
              <BxIcon name="user" />
              {isRtl ? 'الدخول باسم المستخدم' : 'Use a username'}
            </button>
          </div>
        </header>
      )}

      {historyRail.length ? (
        <section className="bxp-rail">
          <SectionHead title={isRtl ? 'سجل المشاهدة' : 'History'} isRtl={isRtl} onMore={() => onOpenPage('history')} />
          <ScrollRow label={isRtl ? 'سجل المشاهدة' : 'History'}>
            {historyRail.map((h) => {
              const { pct } = historyProgress(h);
              return (
                <PosterCard
                  key={h.objectID || h.slug}
                  item={{ ...h, objectID: h.objectID || h.slug, rating: '' }}
                  width={112}
                  dataSaver={dataSaver}
                  subtitle={episodeLine(h, isRtl)}
                  progress={pct}
                  onOpen={() => library.onOpenAnime(h)}
                  onPeek={library.onPeek}
                />
              );
            })}
          </ScrollRow>
        </section>
      ) : null}

      <WatchStats history={library.history} isRtl={isRtl} />

      {favRail.length ? (
        <section className="bxp-rail">
          <SectionHead title={isRtl ? 'قائمتي' : 'My list'} isRtl={isRtl} onMore={() => onOpenPage('library')} />
          <ScrollRow label={isRtl ? 'قائمتي' : 'My list'}>
            {favRail.map((f) => (
              <PosterCard
                key={f.objectID || f.slug}
                item={{ ...f, objectID: f.objectID || f.slug }}
                width={112}
                dataSaver={dataSaver}
                onOpen={() => library.onOpenAnime(f)}
                onPeek={library.onPeek}
              />
            ))}
          </ScrollRow>
        </section>
      ) : null}

      <Group title={isRtl ? 'مكتبتي' : 'Library'}>
        <Row icon="bookmark" label={isRtl ? 'قائمتي' : 'My list'} value={fmt(counts.favorites)} onClick={() => onOpenPage('library')} />
        <Row icon="clock" label={isRtl ? 'سجل المشاهدة' : 'Watch history'} value={fmt(counts.history)} onClick={() => onOpenPage('history')} />
        <Row icon="book" label={isRtl ? 'سجل القراءة' : 'Reading history'} value={fmt(counts.manga)} onClick={() => onOpenPage('manga')} />
        <Row icon="download" label={isRtl ? 'محفوظ بدون نت' : 'Saved offline'} value={fmt(counts.offline)} onClick={() => onOpenPage('offline')} />
        <Row icon="camera" label={isRtl ? 'لقطاتي' : 'Snapshots'} value={fmt(counts.snapshots)} onClick={() => onOpenPage('snapshots')} />
      </Group>

      <Group title={isRtl ? 'العضوية' : 'Membership'}>
        <Row icon="crown" label="BLACK X VIP" value={tierLabel} onClick={() => onOpenPage('vip')} />
        {user ? (
          <Row
            icon="medal"
            label={isRtl ? 'اللقب' : 'Title'}
            value={settings.title ? profileTitleLabel(settings.title, isRtl) : isRtl ? 'من غير' : 'None'}
            onClick={() => onOpenPage('titles')}
          />
        ) : null}
      </Group>

      {app.web ? (
        <Group title={isRtl ? 'على الموقع' : 'On the website'}>
          <Row icon="trophy" label={isRtl ? 'الترتيب' : 'Rankings'} sub={isRtl ? 'أعلى الأعمال تقييمًا' : 'The top-rated titles'} onClick={() => onOpenPage('rankings')} />
          <Row icon="sparkles" label={isRtl ? 'ملخصك' : 'Your year'} sub={isRtl ? 'سنتك على BLACK X بأرقامك الحقيقية' : 'Your year on BLACK X, real numbers'} onClick={() => onOpenPage('wrapped')} />
        </Group>
      ) : null}

      <Group title={isRtl ? 'التطبيق' : 'App'}>
        <Row
          icon="settings"
          label={isRtl ? 'الإعدادات' : 'Settings'}
          sub={isRtl ? 'اللغة، توفير البيانات، الاهتزاز، شاشة البداية' : 'Language, data saver, haptics, splash'}
          onClick={() => onOpenPage('settings')}
        />
        <Row
          icon="shield"
          label={isRtl ? 'الخصوصية والأمان' : 'Privacy & security'}
          value={settings.pinCode ? (isRtl ? 'القفل شغال' : 'Locked') : settings.incognito ? (isRtl ? 'تصفح خفي' : 'Incognito') : ''}
          onClick={() => onOpenPage('privacy')}
        />
      </Group>

      <Group title={isRtl ? 'المساعدة' : 'Support'}>
        <Row icon="send" label={isRtl ? 'اطلب أنمي أو مانهوا' : 'Request a title'} onClick={() => onOpenPage('requests')} />
        <Row icon="save" label={isRtl ? 'نسخة احتياطية' : 'Backup'} sub={isRtl ? 'صدّر بياناتك أو استرجعها من ملف' : 'Export or restore your data'} onClick={() => onOpenPage('backup')} />
        {app.web ? (
          <>
            {/* Phone website: nothing to update; offer the Android app and the computer pages instead. */}
            <Row
              icon="smartphone"
              label={isRtl ? 'تطبيق الأندرويد' : 'Android app'}
              sub={isRtl ? 'ليه تنزله؟ وزرار التحميل' : 'Why get it, and the download'}
              value={`v${app.version}`}
              onClick={() => onOpenPage('apkperks')}
            />
            <Row
              icon="monitor"
              label={isRtl ? 'التصميم القديم للموقع' : 'Classic website'}
              sub={isRtl ? 'الصفحات القديمة (الروايات، متجر الإطارات…)' : 'The old pages (novels, frame shop…)'}
              onClick={app.onComputer}
            />
          </>
        ) : (
          <>
          <Row
            icon="globe"
            label={isRtl ? 'على الموقع بس' : 'Website only'}
            sub={isRtl ? 'حفلة المشاهدة باللينك، وضع السينما، الترتيب…' : 'Party links, cinema mode, rankings…'}
            onClick={() => onOpenPage('webperks')}
          />
          <Row
            icon="smartphone"
            label={isRtl ? 'تحديث التطبيق' : 'App update'}
            sub={hasUpdate ? (isRtl ? `فيه إصدار جديد v${app.release.version}` : `v${app.release.version} is available`) : isRtl ? 'عندك آخر إصدار' : 'You are up to date'}
            value={`v${app.version}`}
            badge={hasUpdate ? (isRtl ? 'جديد' : 'New') : null}
            href={app.downloadUrl}
            onClick={app.onUpdate}
          />
          </>
        )}
      </Group>

      <Group title={isRtl ? 'عن BLACK X' : 'About'}>
        <Row icon="file" label={isRtl ? 'سياسة الخصوصية' : 'Privacy policy'} onClick={() => onOpenPage('policy')} />
        <Row icon="scroll" label={isRtl ? 'شروط الاستخدام' : 'Terms of use'} onClick={() => onOpenPage('terms')} />
      </Group>

      {isDeveloper ? (
        <Group title={isRtl ? 'المطور' : 'Developer'}>
          <Row icon="wrench" label={isRtl ? 'لوحة المطور' : 'Developer panel'} badge={devBadge || null} onClick={() => onOpenPage('developer')} />
        </Group>
      ) : null}

      {user ? (
        <div className="bxp-group">
          <div className="bxp-list">
            <Row icon="logout" label={isRtl ? 'تسجيل الخروج' : 'Sign out'} chevron={false} className="bxp-signout" onClick={() => signOut.setOpen(true)} />
          </div>
        </div>
      ) : null}

      <p className="bxp-foot">
        <span dir="ltr">{app.web ? 'BLACK X · black-x-anime.me' : `BLACK X · v${app.version}`}</span>
        {app.catalogTotal > 0 ? (
          <>
            {' · '}
            <span>{isRtl ? `${fmt(app.catalogTotal)} أنمي` : `${fmt(app.catalogTotal)} anime`}</span>
          </>
        ) : null}
      </p>
    </>
  );
}

/* ============================================================ library pages */

function LibraryPage({ isRtl, dataSaver, library }) {
  const [filter, setFilter] = useState('favorites');
  const lists = useMemo(
    () => ({
      favorites: library.favorites,
      watching: library.watchlist.filter((w) => w.status === 'watching'),
      completed: library.watchlist.filter((w) => w.status === 'completed'),
      planned: library.watchlist.filter((w) => w.status === 'planned')
    }),
    [library.favorites, library.watchlist]
  );
  const chips = [
    ['favorites', isRtl ? 'المفضلة' : 'Favorites'],
    ['watching', isRtl ? 'بتابعه' : 'Watching'],
    ['completed', isRtl ? 'خلصته' : 'Completed'],
    ['planned', isRtl ? 'هتشوفه' : 'Plan to watch']
  ];
  const items = lists[filter] || [];
  return (
    <>
      <div className="bx-row bxp-chips" role="tablist" aria-label={isRtl ? 'القوائم' : 'Lists'}>
        {chips.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`bx-chip${filter === id ? ' is-active' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
            <span className="bxp-chip-count">{fmt(lists[id].length)}</span>
          </button>
        ))}
      </div>
      {items.length ? (
        <div className="bx-grid bxp-grid">
          {items.map((it) => (
            <PosterCard
              key={it.objectID || it.slug}
              item={{ ...it, objectID: it.objectID || it.slug }}
              dataSaver={dataSaver}
              onOpen={() => library.onOpenAnime(it)}
              onPeek={library.onPeek}
            />
          ))}
        </div>
      ) : (
        <Empty
          icon={filter === 'favorites' ? 'bookmark' : filter === 'completed' ? 'check-circle' : filter === 'planned' ? 'clock' : 'play'}
          title={filter === 'favorites' ? (isRtl ? 'قائمتك لسه فاضية' : 'Your list is empty') : isRtl ? 'القائمة دي فاضية' : 'Nothing here yet'}
          text={
            filter === 'favorites'
              ? isRtl
                ? 'دوس على «قائمتي» في صفحة أي أنمي عشان يتحفظ هنا.'
                : 'Tap “My list” on any anime page to save it here.'
              : isRtl
              ? 'غيّر حالة أي أنمي من صفحته وهيظهر هنا.'
              : 'Set a status on any anime page and it shows up here.'
          }
        />
      )}
    </>
  );
}

function HistoryPage({ isRtl, dataSaver, library }) {
  usePositionsTick();
  const groups = useMemo(() => {
    const by = {};
    for (const h of library.history) {
      const b = dayBucket(h.updatedAt);
      (by[b] = by[b] || []).push(h);
    }
    return BUCKETS.filter(([id]) => by[id]?.length).map(([id, ar, en]) => ({ id, title: isRtl ? ar : en, items: by[id] }));
  }, [library.history, isRtl]);
  if (!library.history.length) {
    return (
      <Empty
        icon="clock"
        title={isRtl ? 'مفيش سجل مشاهدة لسه' : 'No watch history yet'}
        text={isRtl ? 'الحلقات اللي هتتفرج عليها هتظهر هنا عشان تكمّلها بسهولة.' : 'Episodes you watch show up here so you can pick up where you left off.'}
      />
    );
  }
  return groups.map((g) => (
    <Group key={g.id} title={g.title}>
      {g.items.map((h) => {
        const { pct } = historyProgress(h);
        return (
          <Row
            key={h.objectID || h.slug}
            className="bxp-media-row"
            media={<Thumb src={h.poster} dataSaver={dataSaver} progress={pct} />}
            label={h.titleEn || h.titleAr || h.slug}
            sub={episodeLine(h, isRtl)}
            value={timeAgo(h.updatedAt, isRtl)}
            onClick={() => library.onOpenAnime(h)}
          />
        );
      })}
    </Group>
  ));
}

function MangaHistoryPage({ isRtl, dataSaver, library }) {
  if (!library.mangaHistory.length) {
    return (
      <Empty
        icon="book"
        title={isRtl ? 'مفيش سجل قراءة لسه' : 'No reading history yet'}
        text={isRtl ? 'الفصول اللي هتقراها في المانجا والمانهوا هتظهر هنا.' : 'Manga and manhwa chapters you read show up here.'}
      />
    );
  }
  return (
    <Group>
      {library.mangaHistory.map((mh) => {
        const ch = mh.chapter ?? mh.lastChapter;
        return (
          <Row
            key={mh.objectID || mh.mangaId || mh.name}
            className="bxp-media-row"
            media={<Thumb src={mh.poster_uri || mh.poster} dataSaver={dataSaver} />}
            label={mh.name}
            sub={ch != null && ch !== '' ? (isRtl ? `الفصل${NB}${ch}` : `Chapter${NB}${ch}`) : ''}
            value={timeAgo(mh.updatedAt, isRtl)}
            onClick={() => library.onOpenManga(mh)}
          />
        );
      })}
    </Group>
  );
}

function OfflinePage({ isRtl, library }) {
  if (!library.offlineChapters.length) {
    return (
      <Empty
        icon="download"
        title={isRtl ? 'مفيش فصول محفوظة' : 'No saved chapters'}
        text={isRtl ? 'دوس «حفظ بدون نت» جوه أي فصل مانجا عشان تقراه من غير إنترنت.' : 'Tap “Save offline” inside any chapter to read it without internet.'}
      />
    );
  }
  return (
    <Group footer={isRtl ? 'الفصول محفوظة على الموبايل ده بس.' : 'Chapters are stored on this phone only.'}>
      {library.offlineChapters.map((och) => (
        <div key={och.id} className="bxp-row bxp-media-row bxp-row-split">
          <button type="button" className="bxp-row-hit" onClick={() => library.onReadOffline(och)}>
            <Thumb src={och.poster} />
            <span className="bxp-row-main">
              <span className="bxp-row-label" dir="auto">
                {och.mangaName}
              </span>
              <span className="bxp-row-sub">
                {isRtl ? `الفصل${NB}${och.chapter} • ${och.pagesCount}${NB}صفحة` : `Chapter${NB}${och.chapter} • ${och.pagesCount}${NB}pages`}
              </span>
            </span>
          </button>
          <button type="button" className="bxp-row-action" aria-label={isRtl ? 'مسح الفصل' : 'Delete chapter'} onClick={() => library.onDeleteOffline(och.id)}>
            <BxIcon name="trash" />
          </button>
        </div>
      ))}
    </Group>
  );
}

function SnapshotsPage({ isRtl, library }) {
  if (!library.snapshots.length) {
    return (
      <Empty
        icon="camera"
        title={isRtl ? 'مفيش لقطات لسه' : 'No snapshots yet'}
        text={isRtl ? 'دوس «لقطة» في المشغل أو «حفظ لقطة» في قارئ المانهوا.' : 'Tap “Snapshot” in the player or “Save panel” in the reader.'}
      />
    );
  }
  return (
    <div className="bxp-shots">
      {library.snapshots.map((sp) => (
        <figure key={sp.id} className="bxp-shot">
          <img src={sp.imageUrl} alt={sp.title || ''} loading="lazy" decoding="async" />
          <figcaption>
            <span className="bxp-shot-text">
              <strong dir="auto">{sp.title}</strong>
              {sp.subtitle ? <span dir="auto">{sp.subtitle}</span> : null}
            </span>
            <button type="button" className="bxp-row-action" aria-label={isRtl ? 'مسح اللقطة' : 'Delete snapshot'} onClick={() => library.onDeleteSnapshot(sp.id)}>
              <BxIcon name="trash" />
            </button>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/* ============================================================ account pages */

function EditPage({ isRtl, account, profileEdit, onBack }) {
  const { user } = account;
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = profileEdit.photo.trim();
  useEffect(() => setPhotoFailed(false), [photo]);
  if (!user) return null;
  return (
    <form className="bxp-form" onSubmit={profileEdit.onSave}>
      <div className="bxp-edit-avatar">
        <Avatar user={{ ...user, displayName: profileEdit.name || user.displayName }} photo={photo && !photoFailed ? photo : ''} onError={() => setPhotoFailed(true)} />
      </div>
      <Field label={isRtl ? 'الاسم' : 'Name'}>
        <input className="bxp-input" type="text" maxLength={40} value={profileEdit.name} onChange={(e) => profileEdit.setName(e.target.value)} dir="auto" autoComplete="nickname" />
      </Field>
      <Field label={isRtl ? 'نبذة عنك' : 'Bio'} hint={`${profileEdit.bio.length}/160`}>
        <textarea className="bxp-input" rows={3} maxLength={160} value={profileEdit.bio} onChange={(e) => profileEdit.setBio(e.target.value)} dir="auto" />
      </Field>
      <Field label={isRtl ? 'رابط الصورة' : 'Photo URL'} hint={isRtl ? 'لينك صورة مباشر يبدأ بـ https' : 'A direct https image link'}>
        <input className="bxp-input" type="url" inputMode="url" dir="ltr" placeholder="https://" value={profileEdit.photo} onChange={(e) => profileEdit.setPhoto(e.target.value)} />
      </Field>
      <div className="bxp-actions">
        <button type="submit" className="bx-btn bx-btn-primary bx-btn-block">
          <BxIcon name="check" />
          {isRtl ? 'حفظ' : 'Save'}
        </button>
        <button type="button" className="bx-btn bx-btn-ghost bx-btn-block" onClick={onBack}>
          {isRtl ? 'إلغاء' : 'Cancel'}
        </button>
      </div>
      <p className="bxp-hint">{account.sessionToken ? (isRtl ? 'التعديل بيتزامن مع الموقع.' : 'Changes sync with the website.') : isRtl ? 'هيتحفظ على الموبايل ده لحد ما تسجّل الدخول.' : 'Saved on this phone until you sign in.'}</p>
    </form>
  );
}

function VipPage({ isRtl, account, vip, onOpenPage }) {
  const { user, sessionToken, isDeveloper, vipTier } = account;
  const isVip = vipTier !== 'free' || isDeveloper;
  return (
    <>
      <section className={`bxp-vip-card${isVip ? ' is-on' : ''}`}>
        <span className="bxp-vip-ico" aria-hidden="true">
          <BxIcon name="crown" size="1.5em" />
        </span>
        <strong>BLACK X VIP</strong>
        <span className="bxp-vip-tier">{vipLabel(vipTier, isDeveloper, isRtl)}</span>
        <span className="bxp-vip-sub">
          {isVip
            ? isRtl
              ? 'اشتراكك متفعّل على حسابك.'
              : 'Your membership is active on your account.'
            : isRtl
            ? 'عندك كود اشتراك؟ فعّله هنا وهيتسجل على حسابك.'
            : 'Have a membership code? Redeem it here and it is saved to your account.'}
        </span>
      </section>
      {user && sessionToken ? (
        <form className="bxp-form" onSubmit={vip.onRedeem}>
          <Field label={isRtl ? 'كود التفعيل' : 'Activation code'}>
            <input
              className="bxp-input bxp-code"
              type="text"
              dir="ltr"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="BX-XXXX-XXXX"
              value={vip.code}
              onChange={(e) => vip.setCode(e.target.value.toUpperCase())}
            />
          </Field>
          <button type="submit" className="bx-btn bx-btn-primary bx-btn-block" disabled={vip.busy}>
            {vip.busy ? <BxIcon name="loader" /> : <BxIcon name="key" />}
            {isRtl ? 'تفعيل الكود' : 'Redeem code'}
          </button>
        </form>
      ) : (
        <Empty
          icon="user"
          title={isRtl ? 'سجّل دخولك الأول' : 'Sign in first'}
          text={isRtl ? 'الكود بيتسجل على حسابك، فلازم تكون داخل بحسابك.' : 'Codes are saved to your account, so you need to be signed in.'}
          action={
            <button type="button" className="bx-btn bx-btn-primary" onClick={() => onOpenPage('signin')}>
              {isRtl ? 'سجّل الدخول' : 'Sign in'}
            </button>
          }
        />
      )}
    </>
  );
}

function TitlesPage({ isRtl, account, library, settings }) {
  const isVip = account.vipTier !== 'free' || account.isDeveloper;
  const progress = {
    watch: library.history.length,
    read: library.mangaHistory.length,
    fav: library.favorites.length
  };
  return (
    <Group footer={isRtl ? 'اللقب بيظهر جنب اسمك في تقييماتك.' : 'Your title appears next to your name in reviews.'}>
      {PROFILE_TITLES.map((t) => {
        let sub = isRtl ? 'متاح للكل' : 'Open to everyone';
        let locked = false;
        if (t.goal) {
          const have = Math.min(progress[t.need], t.goal);
          locked = have < t.goal;
          const unit = t.need === 'watch' ? (isRtl ? 'حلقات' : 'episodes') : t.need === 'read' ? (isRtl ? 'فصول' : 'chapters') : isRtl ? 'في قائمتي' : 'saved';
          sub = `${fmt(have)}/${fmt(t.goal)} ${unit}`;
        } else if (t.need === 'xp') {
          sub = `${fmt(account.xp)} XP`;
        } else if (t.need === 'vip') {
          locked = !isVip;
          sub = isRtl ? 'لأعضاء VIP' : 'For VIP members';
        }
        const selected = settings.title === t.id;
        return (
          <ChoiceRow
            key={t.id}
            icon={t.icon}
            label={isRtl ? t.id : t.en}
            sub={sub}
            selected={selected}
            locked={locked && !selected}
            onSelect={() => settings.onTitle(t, locked)}
          />
        );
      })}
    </Group>
  );
}

function SignInPage({ isRtl, auth, onOpenPage }) {
  const register = auth.mode === 'register';
  return (
    <form className="bxp-form" onSubmit={auth.onSubmit}>
      <button type="button" className="bx-btn bx-btn-primary bx-btn-block" disabled={auth.busy} onClick={auth.onGoogle}>
        {auth.busy ? <BxIcon name="loader" /> : <GoogleMark />}
        {isRtl ? 'الدخول بحساب Google' : 'Continue with Google'}
      </button>
      <div className="bxp-divider">
        <span>{isRtl ? 'أو باسم المستخدم' : 'or with a username'}</span>
      </div>
      <Segmented
        block
        ariaLabel={isRtl ? 'نوع الدخول' : 'Sign-in type'}
        options={[
          ['login', isRtl ? 'دخول' : 'Sign in'],
          ['register', isRtl ? 'حساب جديد' : 'New account']
        ]}
        value={auth.mode}
        onChange={auth.setMode}
      />
      {register ? (
        <Field label={isRtl ? 'الاسم اللي هيظهر' : 'Display name'}>
          <input className="bxp-input" type="text" dir="auto" autoComplete="nickname" value={auth.displayName} onChange={(e) => auth.setDisplayName(e.target.value)} />
        </Field>
      ) : null}
      <Field label={isRtl ? 'اسم المستخدم أو الإيميل' : 'Username or email'}>
        <input className="bxp-input" type="text" dir="ltr" autoCapitalize="none" autoComplete="username" value={auth.username} onChange={(e) => auth.setUsername(e.target.value)} />
      </Field>
      {register ? (
        <Field label={isRtl ? 'الإيميل' : 'Email'}>
          <input className="bxp-input" type="email" dir="ltr" autoComplete="email" value={auth.email} onChange={(e) => auth.setEmail(e.target.value)} />
        </Field>
      ) : null}
      <Field label={isRtl ? 'كلمة السر' : 'Password'}>
        <input className="bxp-input" type="password" dir="ltr" autoComplete={register ? 'new-password' : 'current-password'} value={auth.password} onChange={(e) => auth.setPassword(e.target.value)} />
      </Field>
      <button type="submit" className="bx-btn bx-btn-primary bx-btn-block" disabled={auth.busy}>
        {auth.busy ? <BxIcon name="loader" /> : null}
        {register ? (isRtl ? 'إنشاء الحساب' : 'Create account') : isRtl ? 'دخول' : 'Sign in'}
      </button>
      <p className="bxp-hint">{isRtl ? 'نفس حسابك على موقع BLACK X — قائمتك وسجلك بيتزامنوا بين الاتنين.' : 'The same account as the BLACK X website — your list and history sync between both.'}</p>
      <p className="bxp-hint bxp-consent">
        {isRtl ? 'لما تدخل أو تعمل حساب تبقى موافق على ' : 'By signing in or creating an account you agree to the '}
        <button type="button" className="bxp-link" onClick={() => onOpenPage('terms')}>
          {isRtl ? 'شروط الاستخدام' : 'Terms of use'}
        </button>
        {isRtl ? ' و' : ' and the '}
        <button type="button" className="bxp-link" onClick={() => onOpenPage('policy')}>
          {isRtl ? 'سياسة الخصوصية' : 'Privacy policy'}
        </button>
        .
      </p>
    </form>
  );
}

/* ============================================================ app pages */

function SettingsPage({ isRtl, settings, onOpenPage }) {
  const theme = settings.splashThemes.find((m) => m.id === settings.splashTheme);
  return (
    <>
      <Group title={isRtl ? 'عام' : 'General'}>
        <SegmentedRow
          icon="globe"
          label={isRtl ? 'اللغة' : 'Language'}
          sub={isRtl ? 'لغة القوائم والأزرار' : 'Menus and buttons'}
          ariaLabel={isRtl ? 'اللغة' : 'Language'}
          options={[
            ['ar', 'عربي'],
            ['en', 'English']
          ]}
          value={settings.lang}
          onChange={settings.onLanguage}
        />
      </Group>
      <Group
        title={isRtl ? 'المشاهدة والبيانات' : 'Playback & data'}
        footer={
          isRtl
            ? `«تلقائي» بيمشي مع توفير البيانات في أندرويد ومع النت البطيء، و«على الداتا» كمان لما تكون على باقة الموبايل.${settings.dataSaverActive ? ' التوفير شغال دلوقتي.' : ''}`
            : `“Auto” follows Android's Data Saver and slow connections; “Mobile data” also turns it on over mobile data.${settings.dataSaverActive ? ' Data saver is active now.' : ''}`
        }
      >
        <SegmentedRow
          icon="gauge"
          label={isRtl ? 'توفير البيانات' : 'Data saver'}
          sub={isRtl ? 'صور أصغر وجودة بث أقل' : 'Smaller images, lower stream quality'}
          ariaLabel={isRtl ? 'توفير البيانات' : 'Data saver'}
          options={[
            ['auto', isRtl ? 'تلقائي' : 'Auto'],
            ['cellular', isRtl ? 'على الداتا' : 'Mobile data'],
            ['on', isRtl ? 'شغال' : 'On'],
            ['off', isRtl ? 'مقفول' : 'Off']
          ]}
          value={settings.dataSaverPref}
          onChange={settings.onDataSaver}
        />
      </Group>
      <Group title={isRtl ? 'التفاعل' : 'Feel'}>
        <SwitchRow
          icon="smartphone"
          label={isRtl ? 'اهتزاز خفيف مع اللمس' : 'Haptic feedback'}
          sub={isRtl ? 'مع التنقل والتشغيل والمفضلة' : 'On navigation, play and favorites'}
          checked={settings.haptics}
          onChange={settings.onHaptics}
        />
        <SwitchRow
          icon="volume"
          label={isRtl ? 'صوت شاشة البداية' : 'Splash sound'}
          sub={isRtl ? 'مقفول من الأول' : 'Off by default'}
          checked={settings.splashSound}
          onChange={settings.onSplashSound}
        />
        <Row
          icon="film"
          label={isRtl ? 'شاشة البداية' : 'Splash screen'}
          value={theme ? splashName(theme, isRtl) : ''}
          onClick={() => onOpenPage('splash')}
        />
      </Group>
    </>
  );
}

function splashName(m, isRtl) {
  return String(isRtl ? m.nameAr : m.nameEn).replace(/^\d+\.\s*/, '');
}

function SplashPage({ isRtl, settings }) {
  return (
    <>
      <Group footer={isRtl ? 'الحركة اللي بتظهر لما التطبيق يفتح.' : 'The animation shown when the app opens.'}>
        {settings.splashThemes.map((m) => (
          <ChoiceRow
            key={m.id}
            icon={m.iconName}
            label={splashName(m, isRtl)}
            sub={isRtl ? m.subAr : m.subEn}
            selected={settings.splashTheme === m.id}
            onSelect={() => settings.onSplashTheme(m)}
          />
        ))}
      </Group>
      <button type="button" className="bx-btn bx-btn-ghost bx-btn-block" onClick={settings.onPreviewSplash}>
        <BxIcon name="play" />
        {isRtl ? 'معاينة' : 'Preview'}
      </button>
    </>
  );
}

function PrivacyPage({ isRtl, settings }) {
  const hasPin = Boolean(settings.pinCode);
  return (
    <>
      <Group title={isRtl ? 'المشاهدة' : 'Watching'}>
        <SwitchRow
          icon="eye-off"
          label={isRtl ? 'التصفح الخفي' : 'Incognito mode'}
          sub={isRtl ? 'الحلقات والفصول مش هتتسجل في السجل' : 'Episodes and chapters are not saved to history'}
          checked={settings.incognito}
          onChange={settings.onIncognito}
        />
      </Group>
      <Group
        title={isRtl ? 'قفل التطبيق' : 'App lock'}
        footer={isRtl ? 'الرمز بيتطلب كل ما التطبيق يفتح.' : 'The PIN is asked every time the app opens.'}
      >
        <Row icon={hasPin ? 'lock' : 'unlock'} label={isRtl ? 'رمز PIN' : 'PIN lock'} value={hasPin ? (isRtl ? 'شغال' : 'On') : isRtl ? 'مقفول' : 'Off'} />
      </Group>
      <form
        className="bxp-form"
        onSubmit={(e) => {
          e.preventDefault();
          settings.onSavePin();
        }}
      >
        <Field label={hasPin ? (isRtl ? 'رمز جديد (4 أرقام)' : 'New PIN (4 digits)') : isRtl ? 'اختار رمز من 4 أرقام' : 'Choose a 4-digit PIN'}>
          <input
            className="bxp-input bxp-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            dir="ltr"
            autoComplete="off"
            value={settings.pinInput}
            onChange={(e) => settings.setPinInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          />
        </Field>
        <div className="bxp-actions is-row">
          <button type="submit" className="bx-btn bx-btn-primary" disabled={settings.pinInput.length !== 4}>
            {hasPin ? (isRtl ? 'تغيير الرمز' : 'Change PIN') : isRtl ? 'تفعيل القفل' : 'Turn on lock'}
          </button>
          {hasPin ? (
            <button type="button" className="bx-btn bx-btn-outline" onClick={settings.onClearPin}>
              {isRtl ? 'إلغاء القفل' : 'Remove lock'}
            </button>
          ) : null}
        </div>
      </form>
    </>
  );
}

function RequestsPage({ isRtl, requests }) {
  const placeholder =
    requests.type === 'issue'
      ? isRtl
        ? 'اكتب المشكلة أو سؤالك…'
        : 'Describe the problem or your question…'
      : isRtl
      ? 'اسم العمل، ولو تعرف السنة أو الموسم اكتبهم…'
      : 'The title, plus the year or season if you know it…';
  return (
    <form className="bxp-form" onSubmit={requests.onSubmit}>
      <Segmented
        block
        ariaLabel={isRtl ? 'نوع الطلب' : 'Request type'}
        options={[
          ['anime', isRtl ? 'أنمي' : 'Anime'],
          ['manga', isRtl ? 'مانهوا' : 'Manhwa'],
          ['issue', isRtl ? 'بلاغ' : 'Report']
        ]}
        value={requests.type}
        onChange={requests.setType}
      />
      <Field label={requests.type === 'issue' ? (isRtl ? 'رسالتك' : 'Your message') : isRtl ? 'اسم الأنمي أو المانهوا' : 'Title'}>
        <textarea className="bxp-input" rows={4} maxLength={500} dir="auto" placeholder={placeholder} value={requests.text} onChange={(e) => requests.setText(e.target.value)} />
      </Field>
      <button type="submit" className="bx-btn bx-btn-primary bx-btn-block" disabled={requests.busy || !requests.text.trim()}>
        {requests.busy ? <BxIcon name="loader" /> : <BxIcon name="send" />}
        {isRtl ? 'إرسال' : 'Send'}
      </button>
      <p className="bxp-hint">{isRtl ? 'الطلب بيوصل للمطور على طول.' : 'Your request goes straight to the developer.'}</p>
    </form>
  );
}

function BackupPage({ isRtl, backup }) {
  return (
    <>
      <p className="bxp-lead">
        {isRtl
          ? 'احفظ قائمتك وسجل المشاهدة واللقطات والفصول المحفوظة في ملف واحد، واسترجعهم على أي موبايل.'
          : 'Save your list, history, snapshots and offline chapters in one file and restore them on any phone.'}
      </p>
      <input ref={backup.fileRef} type="file" accept=".json,application/json" onChange={backup.onImport} hidden />
      <Group>
        <Row icon="save" label={isRtl ? 'تصدير نسخة' : 'Export backup'} sub={isRtl ? 'ملف JSON على الموبايل' : 'A JSON file on your phone'} onClick={backup.onExport} />
        <Row icon="folder" label={isRtl ? 'استرجاع من ملف' : 'Restore from file'} sub={isRtl ? 'بيستبدل بياناتك الحالية باللي في الملف' : 'Replaces your current data with the file'} onClick={() => backup.fileRef.current?.click()} />
      </Group>
    </>
  );
}

/* ================================================================== shell */

export default function ProfileTab(props) {
  const { page = 'root', pageClassName = 'bx-page', devPanel } = props;
  let body;
  switch (page) {
    case 'library':
      body = <LibraryPage {...props} />;
      break;
    case 'history':
      body = <HistoryPage {...props} />;
      break;
    case 'manga':
      body = <MangaHistoryPage {...props} />;
      break;
    case 'offline':
      body = <OfflinePage {...props} />;
      break;
    case 'snapshots':
      body = <SnapshotsPage {...props} />;
      break;
    case 'edit':
      body = <EditPage {...props} />;
      break;
    case 'vip':
      body = <VipPage {...props} />;
      break;
    case 'titles':
      body = <TitlesPage {...props} />;
      break;
    case 'settings':
      body = <SettingsPage {...props} />;
      break;
    case 'splash':
      body = <SplashPage {...props} />;
      break;
    case 'privacy':
      body = <PrivacyPage {...props} />;
      break;
    case 'requests':
      body = <RequestsPage {...props} />;
      break;
    case 'backup':
      body = <BackupPage {...props} />;
      break;
    case 'signin':
      body = <SignInPage {...props} />;
      break;
    case 'developer':
      body = devPanel || null;
      break;
    case 'policy':
    case 'terms': {
      const other = page === 'policy' ? 'terms' : 'policy';
      body = (
        <LegalDoc
          id={page}
          lang={props.isRtl ? 'ar' : 'en'}
          showTitle={false}
          footer={
            <Group>
              <Row
                icon={other === 'terms' ? 'scroll' : 'file'}
                label={profilePageTitle(other, props.isRtl)}
                onClick={() => props.onOpenPage(other)}
              />
            </Group>
          }
        />
      );
      break;
    }
    case 'rankings':
      body = <RankingsPage isRtl={props.isRtl} dataSaver={props.dataSaver} loadRankings={props.extras?.loadRankings} onOpenRanked={props.extras?.onOpenRanked} />;
      break;
    case 'wrapped':
      body = (
        <WrappedPage
          isRtl={props.isRtl}
          user={props.account?.user}
          watchHistory={props.library?.history}
          mangaHistory={props.library?.mangaHistory}
          favorites={props.library?.favorites}
          dataSaver={props.dataSaver}
          onOpenTitle={props.extras?.onOpenWrappedTitle}
          onToast={props.extras?.onToast}
        />
      );
      break;
    case 'apkperks':
      body = <PlatformPerks variant="apk" isRtl={props.isRtl} apkUrl={props.app?.downloadUrl} onToast={props.extras?.onToast} />;
      break;
    case 'webperks':
      body = <PlatformPerks variant="web" isRtl={props.isRtl} onToast={props.extras?.onToast} />;
      break;
    default:
      body = <RootPage {...props} />;
  }
  return (
    <main key={page} className={`${pageClassName} bxp${page === 'root' ? ' is-root' : ' is-sub'}`} data-page={page}>
      {body}
    </main>
  );
}
