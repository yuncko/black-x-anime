import React from 'react';
import BxIcon from './BxIcon.jsx';
import { copyText } from './PartyPanel.jsx';
import { PUBLIC_SITE_ORIGIN } from '../../../shared/publicSite.js';

/**
 * What only the APK or only the website has (2026-10-17). Every line is a feature that
 * exists in that build — nothing promised for later.
 *   'apk' — shown on the website: «ليه تنزل التطبيق؟» + the download button
 *   'web' — shown in the APK: «على الموقع بس» + copy the website address
 */
export const APK_PERKS = [
  {
    icon: 'bell',
    ar: 'تنبيه بميعاد الحلقة والتطبيق مقفول',
    en: 'Air-time reminders while the app is closed',
    subAr: 'للأعمال اللي بتتابعها، في ميعاد العرض الياباني (من إصدار 18.0).',
    subEn: 'For the titles you follow, at the Japanese air time (from version 18.0).'
  },
  {
    icon: 'sun',
    ar: 'السطوع الحقيقي للشاشة',
    en: 'Real screen brightness',
    subAr: 'اسحب لفوق ولتحت على جنب الفيديو والموبايل نفسه بيعلّي ويوطّي السطوع.',
    subEn: 'Swipe on the side of the video and the phone itself gets brighter or dimmer.'
  },
  {
    icon: 'volume',
    ar: 'أزرار الصوت في المانجا',
    en: 'Volume keys in the manga reader',
    subAr: 'بتنزّلك وتطلّعك في الفصل من غير ما تلمس الشاشة.',
    subEn: 'Scroll through a chapter without touching the screen.'
  },
  {
    icon: 'gauge',
    ar: 'أعلى معدل تحديث للشاشة',
    en: 'Highest refresh rate',
    subAr: 'التطبيق بيطلب أعلى معدل يدعمه موبايلك (لحد 120Hz) عشان الحركة تبقى ناعمة.',
    subEn: 'The app asks for the highest rate your phone supports (up to 120 Hz) for smooth motion.'
  },
  {
    icon: 'user',
    ar: 'الدخول بحساب جوجل اللي على الموبايل',
    en: "Sign in with the phone's Google account",
    subAr: 'بتختار حسابك من القايمة من غير نافذة تسجيل.',
    subEn: 'Pick your account from the list, no sign-in window.'
  }
];

export const WEB_PERKS = [
  {
    icon: 'popcorn',
    ar: 'حفلة المشاهدة باللينك',
    en: 'Watch party by link',
    subAr: 'بتبعت لينك الدعوة وصاحبك يدخل على طول من أي متصفح (في التطبيق بالكود).',
    subEn: 'Send the invite link and your friend joins from any browser (by code in the app).'
  },
  {
    icon: 'cinema',
    ar: 'وضع السينما على الكمبيوتر',
    en: 'Cinema mode on a computer',
    subAr: 'الفيديو كبير، والحلقات والشات جنبه في نفس الشاشة.',
    subEn: 'A big video with the episodes and the chat beside it.'
  },
  {
    icon: 'eye',
    ar: 'معاينة بالماوس',
    en: 'Mouse preview',
    subAr: 'وقّف الماوس على أي بوستر يظهرلك ملخصه وزرار التشغيل.',
    subEn: 'Rest the mouse on a poster for its summary and a play button.'
  },
  {
    icon: 'keyboard',
    ar: 'بحث سريع واختصارات',
    en: 'Quick search & shortcuts',
    subAr: 'Ctrl+K للبحث، و«?» لكل الاختصارات، والزرار الوسطاني يفتح الأنمي في تاب جديد.',
    subEn: 'Ctrl+K to search, «?» for every shortcut, middle click opens a title in a new tab.'
  },
  {
    icon: 'trophy',
    ar: 'الترتيب وملخصك السنوي',
    en: 'Rankings and your year',
    subAr: 'أعلى الأعمال تقييمًا، وسنتك على Hearbor بأرقامك الحقيقية في صورة تشاركها.',
    subEn: 'The top-rated titles, and your year on Hearbor with your real numbers as an image.'
  },
  {
    icon: 'monitor',
    ar: 'التصميم القديم للموقع',
    en: 'The classic website',
    subAr: 'الصفحات القديمة لسه موجودة من لينك صغير.',
    subEn: 'The old pages are one small link away.'
  }
];

export default function PlatformPerks({ variant, isRtl, apkUrl = '/HEARBOR-Mobile-120Hz.apk', siteUrl = PUBLIC_SITE_ORIGIN, onToast }) {
  const siteHost = String(siteUrl).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const apk = variant === 'apk';
  const perks = apk ? APK_PERKS : WEB_PERKS;
  return (
    <div className="bx-perks" data-variant={variant}>
      <p className="bxp-lead">
        {apk
          ? isRtl
            ? 'الموقع والتطبيق فيهم نفس الأنميات والحسابات. دي الحاجات اللي التطبيق بيعملها والمتصفح مايقدرش:'
            : 'The website and the app share the same titles and accounts. These are the things only the app can do:'
          : isRtl
          ? 'التطبيق والموقع فيهم نفس الأنميات والحسابات. دي الحاجات اللي هتلاقيها على الموقع بس:'
          : 'The app and the website share the same titles and accounts. These are on the website only:'}
      </p>
      <ul className="bx-perks-list">
        {perks.map((p) => (
          <li key={p.en}>
            <span className="bx-perks-ico">
              <BxIcon name={p.icon} />
            </span>
            <span>
              <strong>{isRtl ? p.ar : p.en}</strong>
              <small>{isRtl ? p.subAr : p.subEn}</small>
            </span>
          </li>
        ))}
      </ul>
      {apk ? (
        <>
          <a className="bx-btn bx-btn-block" href={apkUrl} download>
            <BxIcon name="download" />
            {isRtl ? 'نزّل تطبيق الأندرويد' : 'Download the Android app'}
          </a>
          <p className="bx-perks-note">{isRtl ? 'للأندرويد بس. من نسخة 15 وطالع، الجديدة بتتسطب فوق القديمة.' : 'Android only. From version 15 on, a new version installs over the old one.'}</p>
        </>
      ) : (
        <>
          <button
            type="button"
            className="bx-btn bx-btn-block"
            onClick={async () => {
              const ok = await copyText(siteUrl);
              onToast?.(ok ? (isRtl ? 'اتنسخ لينك الموقع' : 'Website address copied') : siteUrl, ok ? 'check' : 'globe');
            }}
          >
            <BxIcon name="copy" />
            {isRtl ? 'انسخ لينك الموقع' : 'Copy the website address'}
          </button>
          <p className="bx-perks-note">
            {isRtl ? 'افتح ' : 'Open '}
            <bdi dir="ltr">{siteHost}</bdi>
            {isRtl ? ' من أي متصفح بنفس حسابك.' : ' in any browser with the same account.'}
          </p>
        </>
      )}
    </div>
  );
}
