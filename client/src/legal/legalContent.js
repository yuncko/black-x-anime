/**
 * Privacy policy and terms of use (2026-10-17), shown by the app interface (profile pages
 * 'policy' / 'terms', links /privacy and /terms) and by the classic website (same paths).
 *
 * Every sentence describes what the code does today. Checked against the code on 2026-10-17:
 *  - guests: settings, lists and history only in localStorage (bx_mob_*);
 *  - accounts (server/src/services/apkAccounts.js, routes/apkApp.js): username, e-mail, display
 *    name, bio, photo, password hash (bcrypt; older accounts SHA-256), Google sign-in keeps
 *    e-mail / name / photo, favourites, progress, positions, xp, VIP tier / code — in Firestore;
 *  - community feed, episode comments, reviews, party rooms: public Firestore documents with the
 *    display name; requests (/api/app/requests) work without an account and keep the name if any;
 *  - rankings votes: one per account, hashed voter id (services/rankingVotes.js);
 *  - crash reports: anonymous (client/src/errorReporter.js, services/errorLog.js);
 *  - no ads, analytics or tracking scripts in the code; Google Fonts on the website only
 *    (the APK bundles its fonts); search queries go to Algolia from the browser;
 *  - incognito stops the watch / reading history; «نسخة احتياطية» exports the lists;
 *  - account deletion (2026-10-17): profile → privacy & security → delete account
 *    (POST /api/app/account/delete): removes the account documents (or empties them while the
 *    phase-1 rules refuse deletes), community posts / replies / likes, rankings votes and
 *    requests; per-title episode comments and reviews stay (nobody can list those documents),
 *    and so do replies written before replies carried a username (2026-10-17);
 *  - hosting: Google Cloud Run through Google AI Studio (shared/publicSite.js), before that Vercel.
 * Change the text when the code changes, and update LEGAL_UPDATED.
 */
import { PUBLIC_SITE_HOST } from '../../../shared/publicSite.js';

export const LEGAL_UPDATED = '2026-10-17';

const SITE = PUBLIC_SITE_HOST;

export const LEGAL_DOCS = {
  policy: {
    path: '/privacy',
    titleAr: 'سياسة الخصوصية',
    titleEn: 'Privacy policy',
    introAr:
      `الصفحة دي بتشرح البيانات اللي BLACK X (الموقع ${SITE} وتطبيق الأندرويد) بيحتفظ بيها، وليه، ومين بيشوفها، وإزاي تتحكم فيها.`,
    introEn:
      `This page explains what data BLACK X (the website ${SITE} and the Android app) keeps, why, who can see it and how you control it.`,
    sections: [
      {
        hAr: 'من غير حساب',
        hEn: 'Without an account',
        ar: [
          'تقدر تستخدم BLACK X من غير حساب. ساعتها إعداداتك وقائمتك وسجل مشاهدتك بيتحفظوا على جهازك بس (في تخزين المتصفح أو التطبيق)، وبيتمسحوا لو مسحت بيانات المتصفح أو التطبيق.'
        ],
        en: [
          'You can use BLACK X without an account. Your settings, list and watch history then stay on your device only (browser or app storage) and are gone when you clear that storage.'
        ]
      },
      {
        hAr: 'لما تعمل حساب',
        hEn: 'When you create an account',
        ar: [
          'اسم المستخدم والإيميل والاسم اللي بيظهر، والنبذة وصورة البروفايل لو حطيتهم.',
          'كلمة المرور: بنحتفظ بنسخة مشفّرة منها (hash) مش الكلمة نفسها. لو دخلت بجوجل بناخد من جوجل إيميلك واسمك وصورتك بس، ومش بنعرف كلمة سر جوجل.',
          'قائمتك وسجل مشاهدتك ومكان وقوفك في كل حلقة ونقاطك، عشان يتزامنوا بين أجهزتك.',
          'حالة اشتراك VIP والكود اللي فعّلته.',
          'البيانات دي متخزنة في Google Firebase (Cloud Firestore).'
        ],
        en: [
          'Your username, e-mail, display name, and the bio and profile photo if you add them.',
          'Your password is kept only as a hash, never the password itself. With Google sign-in we receive your e-mail, name and photo from Google, never your Google password.',
          'Your list, watch history, where you stopped in each episode and your points, so they sync between your devices.',
          'Your VIP status and the code you redeemed.',
          'This data is stored in Google Firebase (Cloud Firestore).'
        ]
      },
      {
        hAr: 'اللي بتنشره بيبان للناس',
        hEn: 'What you post is public',
        ar: [
          'البوستات والردود والإعجابات في المجتمع، وتعليقات الحلقات، والتقييمات والمراجعات بتظهر لكل زوار BLACK X ومعاها اسمك الظاهر. رسايل حفلة المشاهدة بتظهر للي في الغرفة. ماتكتبش فيها أي بيانات شخصية.'
        ],
        en: [
          'Community posts, replies and likes, episode comments, ratings and reviews are visible to every BLACK X visitor together with your display name. Watch-party messages are visible to the people in the room. Do not put personal information in them.'
        ]
      },
      {
        hAr: 'الطلبات والبلاغات',
        hEn: 'Requests and reports',
        ar: ['اللي بتكتبه في «اطلب أنمي أو مانهوا»، ومعاه اسمك لو داخل بحسابك، بيوصل للمطور بس.'],
        en: ['What you write in “Request a title”, with your name if you are signed in, is seen by the developer only.']
      },
      {
        hAr: 'تقييمات صفحة الترتيب',
        hEn: 'Rankings votes',
        ar: [
          'صوت واحد لكل حساب. بنخزن الصوت مع رمز ثابت متولّد من حسابك بطريقة ماتترجعش (مش اسمك ولا إيميلك)، عشان لو قيّمت تاني صوتك يتغير بدل ما يتحسب مرتين.'
        ],
        en: [
          'One vote per account. A vote is stored with a fixed one-way code made from your account (not your name or e-mail), so voting again replaces your vote instead of counting twice.'
        ]
      },
      {
        hAr: 'تقارير الأخطاء',
        hEn: 'Error reports',
        ar: [
          'لو صفحة وقعت عندك بيتبعت تقرير مجهول فيه: رسالة الخطأ، ومكانه في الكود، والصفحة (من غير باقي الرابط)، ونوع المتصفح والجهاز، ونسخة الموقع أو التطبيق. من غير حساب ولا إيميل ولا عنوان IP. التقارير بتتجمع كل يوم وبيشوفها المطور بس.'
        ],
        en: [
          'When a page crashes, an anonymous report is sent with: the error message, where it happened in the code, the page (without the rest of the link), the browser and device type, and the website or app version. No account, e-mail or IP address. Reports are grouped per day and only the developer sees them.'
        ]
      },
      {
        hAr: 'الخدمات اللي بنعتمد عليها',
        hEn: 'Services we rely on',
        ar: [
          'Google Cloud Run (عن طريق Google AI Studio): استضافة الموقع والسيرفر (وقبل كده Vercel). زي أي استضافة، بيسجّل بيانات تقنية عن الطلبات (زي عنوان IP ونوع المتصفح) عشان يشغّل الخدمة ويحميها.',
          'Google Firebase: تخزين الحسابات ومحتوى المجتمع، وتسجيل الدخول بجوجل.',
          'Algolia: البحث في الأنمي؛ اللي بتكتبه في البحث بيتبعت لـ Algolia.',
          'مصادر بيانات الأنمي (زي AniList): البوسترات والمعلومات ممكن تتحمل من سيرفراتهم مباشرة.',
          'سيرفرات الفيديو: الحلقات بتشتغل من سيرفرات تشغيل خارجية مش تبع BLACK X. وانت بتتفرج ممكن جهازك يتصل بيها مباشرة، وبعضها ممكن يعرض إعلانات أو يستخدم الكوكيز حسب سياسته هو.',
          'Google Fonts (على الموقع بس): الخطوط بتتحمل من جوجل.'
        ],
        en: [
          'Google Cloud Run (through Google AI Studio) hosts the website and the server (Vercel did before). Like any host, it logs technical request data (such as IP address and browser type) to run and protect the service.',
          'Google Firebase stores accounts and community content, and runs Google sign-in.',
          'Algolia powers anime search; what you type in search is sent to Algolia.',
          'Anime databases (such as AniList): posters and details may load straight from their servers.',
          'Video servers: episodes play from external servers that BLACK X does not run. While you watch, your device may connect to them directly, and some may show ads or use cookies under their own policies.',
          'Google Fonts (website only): fonts are loaded from Google.'
        ]
      },
      {
        hAr: 'اللي مش بنعمله',
        hEn: 'What we do not do',
        ar: ['BLACK X نفسه مش بيعرض إعلانات، ومفيهوش أدوات تتبّع أو تحليلات إعلانية، ومش بنبيع بياناتك لحد.'],
        en: ['BLACK X itself shows no ads, has no tracking or advertising analytics, and does not sell your data.']
      },
      {
        hAr: 'تحكّمك في بياناتك',
        hEn: 'Your controls',
        ar: [
          'تعدّل اسمك وصورتك ونبذتك من «تعديل الملف».',
          'تصدّر نسخة من قائمتك وسجلك من «نسخة احتياطية».',
          '«التصفح الخفي» في «الخصوصية والأمان» بيوقف تسجيل سجل المشاهدة والقراءة.',
          'مسح الحساب: من «الخصوصية والأمان» ← «مسح الحساب». بيتمسح حسابك (اسم المستخدم والإيميل وكلمة المرور)، وقائمتك وسجلك ومكان وقوفك ونقاطك واشتراك VIP اللي على السيرفر، وبوستاتك وردودك وإعجاباتك في المجتمع، وتقييماتك في صفحة الترتيب، وطلباتك للمطور. تعليقات الحلقات والمراجعات اللي على صفحات الأنمي، والردود اللي اتكتبت قبل 17 أكتوبر 2026، بتفضل باسمك الظاهر — لو عاوزها تتشال ابعت «بلاغ» بمكانها. اللي محفوظ على جهازك بيتمسح لو اخترت كده وانت بتمسح الحساب، أو لما تمسح بيانات المتصفح أو التطبيق.'
        ],
        en: [
          'Edit your name, photo and bio in “Edit profile”.',
          'Export a copy of your list and history in “Backup”.',
          '“Incognito mode” in “Privacy & security” stops recording your watch and reading history.',
          'Deleting your account: “Privacy & security” → “Delete account”. It deletes your account (username, e-mail and password), your list, history, resume points, points and VIP kept on the server, your community posts, replies and likes, your rankings votes and your requests to the developer. Episode comments and reviews on anime pages, and replies written before 17 October 2026, stay under your display name — send a “Report” with where they are if you want them removed. What is stored on your device is deleted if you choose so while deleting the account, or when you clear the browser or app storage.'
        ]
      },
      {
        hAr: 'التعديلات والتواصل',
        hEn: 'Changes and contact',
        ar: [
          'لو السياسة اتغيرت هنعدّل الصفحة دي وتاريخ آخر تحديث اللي فوق.',
          'للتواصل: «اطلب أنمي أو مانهوا» ← «بلاغ» في صفحة حسابي (مش لازم تسجّل دخول).'
        ],
        en: [
          'If this policy changes, this page and the date at the top are updated.',
          'Contact: “Request a title” → “Report” on your profile page (no sign-in needed).'
        ]
      }
    ]
  },
  terms: {
    path: '/terms',
    titleAr: 'شروط الاستخدام',
    titleEn: 'Terms of use',
    introAr: 'باستخدامك BLACK X (الموقع والتطبيق) انت موافق على الشروط دي.',
    introEn: 'By using BLACK X (the website and the app) you agree to these terms.',
    sections: [
      {
        hAr: 'الخدمة',
        hEn: 'The service',
        ar: [
          'BLACK X بيجمعلك معلومات الأنمي والمانجا ومواعيدها وروابط المشاهدة والقراءة من مصادر خارجية، ومعاها مجتمع للنقاش.',
          'الخدمة بتتقدم زي ما هي، وممكن تقف أو تتغير أو تبطّأ في أي وقت، مثلاً لما سيرفر خارجي يقع.'
        ],
        en: [
          'BLACK X gathers anime and manga information, schedules, and watch and read links from external sources, with a community for discussion.',
          'The service is provided as is and may stop, change or slow down at any time, for example when an external server is down.'
        ]
      },
      {
        hAr: 'حسابك',
        hEn: 'Your account',
        ar: ['انت مسؤول عن حسابك وكلمة المرور. ماتستخدمش حساب حد تاني، وماتعملش حسابات كتير عشان تتحايل على القواعد (زي التقييمات).'],
        en: ['You are responsible for your account and password. Do not use someone else’s account or create several accounts to get around the rules (such as votes).']
      },
      {
        hAr: 'قواعد المجتمع',
        hEn: 'Community rules',
        ar: [
          'ممنوع: الشتيمة والتنمر والكراهية، وأي محتوى جنسي، ونشر بيانات شخصية لأي حد، والإعلانات والسبام والروابط المضرة، وأي حاجة مخالفة للقانون.',
          'ممكن نمسح أي محتوى بيخالف القواعد دي، أو نوقف الحساب اللي بينشره.'
        ],
        en: [
          'Not allowed: insults, bullying and hate, any sexual content, sharing anyone’s personal information, ads, spam and harmful links, and anything illegal.',
          'We may remove content that breaks these rules, or suspend the account posting it.'
        ]
      },
      {
        hAr: 'اشتراك VIP',
        hEn: 'VIP',
        ar: [
          'الاشتراك بيتفعّل بكود بيتسجّل على حسابك لمدة الكود، ولكل كود عدد مرات استخدام محدد.',
          'الأسعار بالجنيه المصري ومكتوبة في صفحة VIP، والدفع مش بيتم جوه الموقع أو التطبيق.',
          'مميزات VIP هي اللي مكتوبة في صفحة VIP. VIP مش بيضيف جودة أو سيرفر مش موجود عند المصدر.'
        ],
        en: [
          'VIP is activated with a code that is saved to your account for the code’s duration; each code has a set number of uses.',
          'Prices are in Egyptian pounds and shown on the VIP page; payment does not happen inside the website or the app.',
          'VIP gives what the VIP page lists. It does not add a quality or a server that the source does not have.'
        ]
      },
      {
        hAr: 'الحقوق',
        hEn: 'Rights',
        ar: [
          'أسماء الأعمال والصور والعلامات التجارية ملك أصحابها.',
          'لو انت صاحب حقوق في محتوى ظاهر على BLACK X وعاوزه يتشال، ابعتلنا من «اطلب أنمي أو مانهوا» ← «بلاغ» بتفاصيل المحتوى ورابطه، وهنراجع الطلب.'
        ],
        en: [
          'Titles, images and trademarks belong to their owners.',
          'If you hold rights to content shown on BLACK X and want it removed, send the details and the link through “Request a title” → “Report” and we will review the request.'
        ]
      },
      {
        hAr: 'المواقع الخارجية',
        hEn: 'External sites',
        ar: ['مشغلات الفيديو والروابط الخارجية مش تبع BLACK X، ومحتواها وإعلاناتها مسؤولية أصحابها.'],
        en: ['Video players and external links are not run by BLACK X; their content and ads are their owners’ responsibility.']
      },
      {
        hAr: 'حدود المسؤولية',
        hEn: 'Liability',
        ar: ['في حدود اللي يسمح بيه القانون، BLACK X مش مسؤول عن أي ضرر ناتج عن استخدام الخدمة أو عن توقفها.'],
        en: ['To the extent the law allows, BLACK X is not liable for any damage caused by using the service or by it being unavailable.']
      },
      {
        hAr: 'التعديلات والتواصل',
        hEn: 'Changes and contact',
        ar: [
          'ممكن نعدّل الشروط دي؛ التاريخ اللي فوق بيوضح آخر تعديل، واستمرارك في الاستخدام معناه إنك موافق.',
          'للتواصل: «اطلب أنمي أو مانهوا» ← «بلاغ» في صفحة حسابي.'
        ],
        en: [
          'These terms may change; the date at the top shows the last change, and continuing to use BLACK X means you accept it.',
          'Contact: “Request a title” → “Report” on your profile page.'
        ]
      }
    ]
  }
};

export function legalDoc(id) {
  return LEGAL_DOCS[id] || null;
}
