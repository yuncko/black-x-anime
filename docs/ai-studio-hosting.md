# BLACK X على Google AI Studio — الخطوات بالعربي

الموقع من 17 أكتوبر 2026 شغال على **https://black-x-anime.ai.studio** (Google AI Studio بينشره على
Cloud Run). black-x-anime.me كان على Vercel واتوقف («This deployment is temporarily paused»).

## 1. لازم: مفتاح JWT_SECRET (من غيره مفيش أي تسجيل دخول)

لو فتحت `https://black-x-anime.ai.studio/api/health` ولقيت `"authentication":"unavailable"` يبقى
المفتاح ده ناقص — وساعتها الدخول بجوجل بيفتح نافذة جوجل وتقفل من غير ما يدخل، والدخول باسم المستخدم
بيقول «تسجيل الدخول مش شغال على السيرفر لسه».

1. افتح التطبيق في AI Studio ← ⚙️ **Settings** ← **Secrets**.
2. ضيف Secret اسمه بالظبط `JWT_SECRET`، وقيمته كلام عشوائي طويل (40 حرف ورقم على الأقل — من مولّد
   كلمات السر في كروم أو أي مدير كلمات سر). ماتكتبهوش في أي شات وماتحطهوش في الريبو.
3. دوس **Publish** تاني عشان النسخة المنشورة تاخد المفتاح.
4. افتح `/api/health` تاني: لازم يبقى `"authentication":"ok"`.

لو غيّرت المفتاح بعد كده، كل الناس هيتعمل لهم خروج مرة واحدة ويدخلوا تاني عادي.

اختياري (المرحلة 2 من حماية الحسابات): Secret اسمه `FIREBASE_SERVICE_ACCOUNT` بنفس الطريقة —
التفاصيل في `docs/firestore-phase2.md`.

## 2. الدخول بجوجل والعناوين

جوجل بيسمح بالدخول من العناوين المسجلة في Firebase بس. يوم 17 أكتوبر 2026 القايمة كان فيها
`black-x-anime.ai.studio` وعناوين المعاينة بتاعة AI Studio (`ais-dev-…run.app`، `ais-pre-…`).
لو نشرت باسم جديد: Firebase console ← **Authentication** ← **Settings** ← **Authorized domains** ←
**Add domain** ← اكتب العنوان من غير `https://`.

## 3. تحديث الكود من GitHub

بعد ما الشغل يتدمج في `main`: AI Studio ← ⚙️ ← **GitHub** ← **Pull**، وبعدين **Publish**.

- ⚠️ **ماتعملش «Force push» من AI Studio للريبو أبداً** — بيمسح اللي على `main` ويحط نسخة AI Studio
  المعدّلة مكانه.
- ماتخليش وكيل AI Studio يغيّر `firestore.rules` أو `firebase-applet-config.json` أو مشروع Firebase.
  لازم يفضل المشروع `spry-oxide-1h7sp` وقاعدة البيانات `ai-studio-blackxanime-e47e1ba2-…` — هي اللي
  فيها حسابات الناس، والتطبيق بيقرا منها.
- بعد كل Publish جرّب: الصفحة الرئيسية، حلقة، `/api/health`، والدخول بجوجل.

## 4. التطبيق (APK)

- نسخ التطبيق لحد v18.0 بتكلّم black-x-anime.me (المتوقف): الدخول والمزامنة والتحديث واقفين فيها،
  وماينفعش يوصلها إشعار تحديث. لازم الناس تنزّل v18.1 بنفسها — من الموقع الجديد أو من لينك الدرايف.
- v18.1 بيكلّم black-x-anime.ai.studio. لو العنوان اتغيّر تاني، لازم نسخة APK جديدة.
- اتأكد إن `https://black-x-anime.ai.studio/BLACK-X-Mobile-120Hz.apk` بينزّل الملف (حوالي 4.6 ميجا).
  لو لأ، AI Studio ممكن يكون ساب الملف الكبير وهو بيستورد الريبو — ابعت لينك الدرايف لحد ما يتحل.

## 5. الحدود

النشر المجاني (Starter Tier) ليه حدود (عدد تطبيقين، منطقة واحدة، وحدود استهلاك). تشغيل الفيديو بيعدّي
على السيرفر وبيستهلك باندويدث كتير — نفس السبب اللي وقّف Vercel. تابع الاستهلاك من AI Studio / Google
Cloud، ولو قرّب يخلص فكّر في خطة مدفوعة قبل ما يقف.

---

# BLACK X on Google AI Studio (English summary)

- Live site since 2026-10-17: `https://black-x-anime.ai.studio` (AI Studio → Cloud Run). The Vercel
  deployment behind black-x-anime.me is paused.
- **Required secret:** `JWT_SECRET` (random, 32+ characters) in AI Studio → Settings → Secrets, then
  Publish again. Without it `/api/health` reports `authentication: unavailable` and every sign-in fails
  (`/api/app/auth/*` answer 503 `auth_unavailable`; the Google popup opens and closes). Optional:
  `FIREBASE_SERVICE_ACCOUNT` (phase 2).
- Firebase Authorized domains already list `black-x-anime.ai.studio` and the AI Studio preview hosts
  (checked 2026-10-17 through `identitytoolkit.googleapis.com/v1/projects?key=…`).
- Code updates: merge to `main`, then AI Studio → Settings → GitHub → Pull → Publish. Never force-push
  from AI Studio to the repository; keep the Firebase project / database and `firestore.rules` as they
  are.
- APKs up to v18.0 call black-x-anime.me and cannot reach the new host; v18.1 is built against
  `shared/publicSite.js` (`tools/apk/build-apk.sh`, `BX_API_BASE`).
