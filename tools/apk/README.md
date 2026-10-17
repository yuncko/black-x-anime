# Rebuilding the BLACK X APK

`client/public/BLACK-X-Mobile-120Hz.apk` is a Capacitor shell (`app.blackx.mobile`,
minSdk 22, targetSdk 34) whose whole UI is the Vite build in `assets/public/`.
There is no Gradle project in this repository. To ship new mobile code, rebuild
the web bundle and repack it into the existing shell; the native part (dex files,
resources, manifest, `MainActivity` from `android-native/`) is copied unchanged.

```bash
JAVA=/path/to/java \
APKSIGNER_JAR=/path/to/apksigner.jar \
BX_KEYSTORE=/path/to/blackx-release.p12 \
BX_KEYSTORE_PASS_FILE=/path/to/password.txt \
./tools/apk/build-apk.sh
```

The script:

1. builds the client with `VITE_BUILD_TARGET=apk VITE_API_BASE_URL=$BX_API_BASE` (default
   `https://black-x-anime.ai.studio` = `PUBLIC_SITE_ORIGIN` in `shared/publicSite.js`; up to v18.0
   it was `https://black-x-anime.me`). The APK runs from `https://localhost`, so it must call the
   website explicitly, and installed apps keep the address they were built with. Since v16 that
   target starts from `client/src/main-apk.jsx` (only the mobile UI is bundled);
2. runs `repack-apk.py`: copies every entry of the current APK except
   `assets/public/` and `META-INF/`, adds the new bundle (never the `.apk` itself),
   and zipaligns stored entries to 4 bytes. Android 11+ refuses to install an app
   targeting API 30+ whose `resources.arsc` is not stored and 4-byte aligned, and
   the `apksigner` CLI keeps alignment but does not create it;
3. signs with v1 + v2 + v3 (`apksigner` picks the schemes from minSdk 22);
4. verifies the signature and copies the result over `client/public/BLACK-X-Mobile-120Hz.apk`.

After building, check that `apksigner verify` says `Verifies`, that every stored entry
(especially `resources.arsc`) starts on a 4-byte boundary, and that the native entries
are byte-identical to the previous APK. Then run the real-touch suite on the new APK:
`bash tools/apk/touch-test/run.sh` (see `tools/apk/touch-test/README.md`; it extracts
`assets/public/` from the APK and works in `/tmp`). For a quick look, serve the Vite output
and open it at `http://localhost:<port>/` (the APK build renders the mobile UI everywhere;
`?apk_ui=1` does the same on the normal website build).

## Native changes (v18.0+)

Up to v17.1 only the web bundle changed. v18.0 added native code (air-time reminders while the
app is closed: `EpisodeAlarms` + `MainActivity.scheduleEpisodeAlarms`). There is still no Gradle
project and no D8 here, so the additions are smali (`android-native/smali/`; Java reading copies
in `android-native/src/`) and only the app's own dex and the manifest change:

```bash
JAVA=/path/to/java APKTOOL_JAR=/path/to/apktool.jar PYTHON=/path/to/python-with-androguard \
  tools/apk/patch-native.sh                 # -> /tmp/bx-apk-native/base-native.apk
BASE_APK=/tmp/bx-apk-native/base-native.apk JAVA=… APKSIGNER_JAR=… BX_KEYSTORE=… BX_KEYSTORE_PASS_FILE=… \
  tools/apk/build-apk.sh                    # new web bundle + signature, as before
```

`patch-native.sh` decodes the current APK with apktool, adds the smali class, the bridge method,
the `RECEIVE_BOOT_COMPLETED` permission and the boot receiver, sets `versionCode` / `versionName`
(`VERSION_CODE`, `VERSION_NAME`), rebuilds, and copies **only** `AndroidManifest.xml` and
`classes4.dex` from the rebuilt APK into a copy of the current one (`native_patch.py merge`).
`native_patch.py verify` then checks: same entries, every other entry byte-identical, the version,
permissions and receiver in the manifest, every old method of `classes4.dex` unchanged, the new
methods present; the script also disassembles the result and checks the `@JavascriptInterface`
annotation. Re-running it on an APK that already has the code is a no-op for the smali/manifest
steps. apktool 2.9.3 comes in the npm package `@postar/apktool-node` (`lib/apktool.jar`, with the
aapt2 it needs); `androguard` is on PyPI.

Smali is not type-checked when assembled: keep new native logic in its own class (a broken class
fails only when used, the bridge method catches `Throwable`), mirror it in the Java reading copy,
and have the owner try the feature on a phone before publishing.

## Tools

- Java 17+: any JDK/JRE. Without an Android SDK, the `jdk4py` wheel on PyPI ships a
  runtime (`jdk4py/java-runtime/bin/java`, plus `keytool`).
- `apksigner.jar`: from Android build-tools (`build-tools/<ver>/lib/apksigner.jar`).
  The 2026-10-15 build used the AOSP-built copy shipped in the npm package
  `@postar/apktool-node@0.3.4` (`lib/apksigner.jar`, apksigner 0.9,
  sha256 `eefdd6aed9db9fb849e4c98a50d8741e19d1b674ba6547220bcb9c3ed152123a`); it also
  verified the old v14 APK correctly.

## Signing key

- The release key is **not** in this repository and must never be committed (the repo
  is public). The owner keeps `blackx-release.p12` and its password in a private Google
  Drive folder named «BLACK X — مفتاح توقيع التطبيق (سري — لا تشاركه)».
- Certificate: `CN=BLACK X Mobile, OU=Mobile, O=BLACK X, L=Cairo, ST=Cairo, C=EG`,
  SHA-256 `2b2f63d1a5c633bc8c2e676b82438d671b50f2b517a1b0127ad5c845e0bbc281`, alias `blackx`.
- APK v14 and older were signed with a different key that was never saved, so moving
  from v14 to v15 needs one uninstall + reinstall. Every later build signed with the
  key above installs as a normal update. Signing with any other key breaks updates again.
- Android accepts an update with the same or a higher `versionCode` (30 up to v17.1, 31 since v18.0; v18.1 changed only the web bundle and kept 31).
- After committing a rebuilt APK, bump `version` (and the notes) in `shared/apkRelease.js`: the
  server's `/api/app/config` reports it and installed apps show the update banner.
