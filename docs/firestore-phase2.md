# المرحلة 2 لحماية الحسابات — الخطوات بالعربي

المرحلة 2 بتقفل بيانات الحسابات (`settings/user_*` و`settings/email_*`) ومستند الـ VIP
(`settings/global_vip_system`) قدام المتصفحات والتطبيقات، ويبقى السيرفر بس اللي يقراها ويكتبها.
الكود جاهز من v16؛ الخطوات دي بتتعمل من حسابك انت، بالترتيب ده:

1. **مفتاح الخدمة في Vercel.** Firebase console ← ⚙️ Project settings ← تبويب
   **Service accounts** ← **Generate new private key** (هينزل ملف JSON).
   في Vercel ← المشروع ← **Settings ← Environment Variables** ← أضف متغير اسمه
   `FIREBASE_SERVICE_ACCOUNT` (Production) والقيمة = محتوى ملف الـ JSON كله.
   ماتحطش الملف في الريبو وماتبعتوش في أي شات. بعدين اعمل **Redeploy**.
2. **اتأكد إنه شغال.** افتح الموقع (أو التطبيق من v18.1) بحساب المطور ← حسابي ← **لوحة المطور** ← تبويب
   **الأخطاء** ← سطر «حماية الحسابات (المرحلة 2)» لازم يقول «مفتاح الخدمة شغال».
   (أو افتح `https://black-x-anime.me/api/health` ولازم تلاقي `"firestoreAuth": "service_account"`.)
   لو مكتوب أي حاجة تانية (`api_key` / `invalid_key` / `error`) ← وقّف هنا وراجع الخطوة 1.
3. **بلّغ أصحاب النسخ القديمة.** من لوحة المطور ← **البث** ← انشر إشعار زي
   «حدّث التطبيق من الموقع — النسخة القديمة هتقف قريب».
4. **استنى** لحد ما أغلب الناس يحدّثوا لـ v16 أو أحدث (من كام يوم لأسبوعين).
5. **انشر القواعد.** Firebase console ← **Firestore Database** ← قاعدة البيانات
   `ai-studio-blackxanime-e47e1ba2-315f-4c3b-8557-71352813f36c` ← تبويب **Rules** ← امسح
   اللي موجود والصق محتوى ملف `firestore.rules.phase2` ← **Publish**. وبعدها انسخه فوق
   `firestore.rules` في الريبو.
6. **جرّب.** تسجيل دخول، حساب جديد، الدخول بجوجل، تفعيل كود VIP، لوحة المطور، ومزامنة
   مكان الوقوف في الحلقات — على التطبيق والموقع. و`/api/app/config` لازم يفضل بيرد.

بعد الخطوة 5: نسخ التطبيق 15.1 وأقدم مش هتقدر تسجّل دخول أو تزامن أو تفعّل أكواد.
حفلات المشاهدة والتعليقات والتقييمات وبوستات المجتمع هتفضل شغالة في كل النسخ.
تقييمات صفحة الترتيب (`settings/ranking_votes`) وتقارير الأخطاء (`settings/error_log_*`)
بيكتبهم السيرفر بس، فبعد المرحلة 2 محتاجين مفتاح الخدمة (الخطوة 1) عشان يشتغلوا.

**الرجوع في حالة مشكلة:** انشر محتوى `firestore.rules` (المرحلة 1) تاني من نفس صفحة Rules.

---

# Firestore `settings/*` — phase 2 checklist (APK v16)

Phase 2 closes the account mirror (`settings/user_*`, `settings/email_*`) and the
VIP document (`settings/global_vip_system`) to browsers and apps. The code for it
shipped with APK v16; these steps are done by the project owner, in this order.

1. **Service account on Vercel.** Firebase console → Project settings → Service
   accounts → *Generate new private key*. In Vercel → Project → Settings →
   Environment Variables add `FIREBASE_SERVICE_ACCOUNT` (Production) with the JSON
   file contents (or its base64). Never commit it or paste it in a chat. Redeploy.
2. **Check it works.** `https://black-x-anime.me/api/health` must show
   `"firestoreAuth": "service_account"`. Anything else (`api_key`, `invalid_key`,
   `error`) → stop here.
3. **Tell old apps to update.** From the developer panel (website or APK v16) send a
   broadcast such as «حدّث التطبيق من الموقع — النسخة القديمة هتقف قريب». APK ≤ 15.1
   show the broadcast; v16+ also shows its own update banner.
4. **Wait** until most users run v16 (a few days to two weeks).
5. **Publish the rules.** Firebase console → Firestore → database
   `ai-studio-blackxanime-e47e1ba2-315f-4c3b-8557-71352813f36c` → Rules → paste
   `firestore.rules.phase2` → Publish. Then copy it over `firestore.rules` in the repo.
6. **Verify.** Login, register, Google sign-in, VIP code, developer panel and
   watch progress sync in APK v16 and on the website; `/api/app/config` still answers.

What changes for old builds after step 5: APK ≤ 15.1 can no longer sign in, sync or
redeem VIP codes (their VIP gate falls back to the last cached state). Watch parties,
timed comments, reviews and the community feed keep working everywhere.

Rankings votes (`settings/ranking_votes`) and crash reports (`settings/error_log_*`) are
written by the server only, so after step 5 they need the service account from step 1.
Step 2 can also be checked in the app: developer panel → «الأخطاء» → «حماية الحسابات (المرحلة 2)».

Rollback: re-publish `firestore.rules` (phase 1) in the console.
