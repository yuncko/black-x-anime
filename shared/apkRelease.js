/**
 * Latest BLACK X Mobile APK release.
 *
 * Shared by the server (GET /api/app/config tells installed apps about it) and the
 * APK itself (client/src/mobile/bxServers.js reads its own version from here), so a
 * new build only needs this file and the rebuilt APK in client/public.
 *
 * The APK is installed from the website, not from Google Play, so this banner is
 * the only way users learn that an update exists. Bump `version` (and the notes)
 * whenever a rebuilt APK is committed. `minSupported` marks older builds that can
 * no longer work (they get a non-dismissible banner).
 */
import { PUBLIC_SITE_ORIGIN } from './publicSite.js';

export const APK_RELEASE = Object.freeze({
  version: '18.1',
  minSupported: '15.0',
  url: `${PUBLIC_SITE_ORIGIN}/BLACK-X-Mobile-120Hz.apk`,
  publishedAt: '2026-10-17',
  notesAr: Object.freeze([
    'التطبيق بقى بيكلّم عنوان الموقع الجديد black-x-anime.ai.studio — الدخول والمزامنة رجعوا يشتغلوا',
    'تقدر تمسح حسابك بنفسك: حسابي ← الخصوصية والأمان ← مسح الحساب',
    'البوستات واللايكات والردود مابقتش تضيع لو اتنين كتبوا في نفس اللحظة',
    'سياسة الخصوصية وشروط الاستخدام في حسابي ← عن BLACK X',
    'لوحة المطور اتعملت من جديد وفيها تقارير الأعطال'
  ]),
  notesEn: Object.freeze([
    'The app now talks to the new website address black-x-anime.ai.studio — sign-in and sync work again',
    'You can delete your account yourself: Profile → Privacy & security → Delete account',
    'Posts, likes and replies are no longer lost when two people write at the same moment',
    'Privacy policy and terms of use under Profile → About',
    'Rebuilt developer panel with crash reports'
  ])
});

/** Compares dotted versions numerically: returns -1, 0 or 1. */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
