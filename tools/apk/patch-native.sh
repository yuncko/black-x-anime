#!/usr/bin/env bash
# Native part of the APK (v18.0+): assembles android-native/smali/ into the current APK's own dex
# (classes4.dex) and manifest, keeping every other entry byte-identical, and writes a new base
# APK for build-apk.sh. See tools/apk/README.md ("Native changes").
#
#   JAVA=… APKTOOL_JAR=…/apktool.jar [BASE_APK=…] [VERSION_CODE=31] [VERSION_NAME=18.0] \
#     tools/apk/patch-native.sh            # -> $WORK/base-native.apk
#   BASE_APK=$WORK/base-native.apk … tools/apk/build-apk.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
JAVA="${JAVA:-java}"
APKTOOL_JAR="${APKTOOL_JAR:?set APKTOOL_JAR to apktool.jar (apktool 2.9+)}"
BASE_APK="${BASE_APK:-$ROOT/client/public/HEARBOR-Mobile-120Hz.apk}"
VERSION_CODE="${VERSION_CODE:-31}"
VERSION_NAME="${VERSION_NAME:-18.0}"
WORK="${WORK:-/tmp/bx-apk-native}"
PY="${PYTHON:-python3}"

rm -rf "$WORK" && mkdir -p "$WORK"
cp "$BASE_APK" "$WORK/base.apk"

echo "1/5 decoding the current APK"
"$JAVA" -jar "$APKTOOL_JAR" d -f -q "$WORK/base.apk" -o "$WORK/dec"

echo "2/5 adding android-native/smali (EpisodeAlarms, MainActivity.scheduleEpisodeAlarms, boot receiver)"
"$PY" "$ROOT/tools/apk/native_patch.py" patch "$WORK/dec" "$ROOT/android-native/smali" "$VERSION_CODE" "$VERSION_NAME"

echo "3/5 assembling with apktool"
"$JAVA" -jar "$APKTOOL_JAR" b -q "$WORK/dec" -o "$WORK/rebuilt.apk"

echo "4/5 new base = current APK + rebuilt AndroidManifest.xml and classes4.dex"
"$PY" "$ROOT/tools/apk/native_patch.py" merge "$WORK/base.apk" "$WORK/rebuilt.apk" "$WORK/base-native.apk"

echo "5/5 verifying"
"$PY" "$ROOT/tools/apk/native_patch.py" verify "$WORK/base.apk" "$WORK/base-native.apk"
"$JAVA" -jar "$APKTOOL_JAR" d -f -q -r "$WORK/base-native.apk" -o "$WORK/check"
grep -A 3 '^\.method public scheduleEpisodeAlarms(Ljava/lang/String;)I' "$WORK/check/smali_classes4/app/blackx/mobile/MainActivity.smali" \
  | grep -q 'Landroid/webkit/JavascriptInterface;' && echo "PASS scheduleEpisodeAlarms carries @JavascriptInterface"
test -f "$WORK/check/smali_classes4/app/blackx/mobile/EpisodeAlarms.smali" && echo "PASS EpisodeAlarms disassembles"
cp "$WORK/check/smali_classes4/app/blackx/mobile/MainActivity.smali" "$WORK/MainActivity.check.smali"
echo "done -> $WORK/base-native.apk"
