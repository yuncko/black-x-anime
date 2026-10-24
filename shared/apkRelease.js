/**
 * Latest Hearbor Mobile APK release.
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
  version: '19.0',
  minSupported: '15.0',
  url: `${PUBLIC_SITE_ORIGIN}/HEARBOR-Mobile-120Hz.apk`,
  publishedAt: '2026-10-18',
  notesAr: Object.freeze([
    'واجهة جديدة بالكامل مستوحاة من Nuvio — تصميم عصري موحّد على كل الشاشات',
    'اللغة الافتراضية بقت الفرنسية — كل القوائم والأزرار بالفرنسية',
    'الهيرو الجديد: VISIONQUEST والبحث والاستمرار في المشاهدة ببطاقات أفقية',
    'تفاصيل الأنمي الجديدة: زر Lire الواسع + معلومات IMDb والمخرج',
    'الأداء والتوافق كما هم — نفس الخوادم والحسابات'
  ]),
  notesEn: Object.freeze([
    'Completely new interface inspired by Nuvio — unified modern design on every screen',
    'Default language is now French — all menus and buttons in French',
    'New hero: VISIONQUEST, search and Continue Watching with landscape cards',
    'New anime details: wide Lire button + IMDb and director info',
    'Performance and compatibility unchanged — same servers and accounts'
  ]),
  notesFr: Object.freeze([
    'Nouvelle interface inspirée de Nuvio — design moderne unifié sur tous les écrans',
    'Langue par défaut désormais le français — tous les menus et boutons en français',
    'Nouveau hero : VISIONQUEST, recherche et Continuer à regarder en cartes paysage',
    'Nouveaux détails anime : large bouton Lire + infos IMDb et réalisateur',
    'Performances et compatibilité inchangées — mêmes serveurs et comptes'
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
