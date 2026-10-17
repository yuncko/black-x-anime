#!/usr/bin/env bash
# Rebuild + sign client/public/BLACK-X-Mobile-120Hz.apk with the current web code.
# See tools/apk/README.md for the tools and the signing key (never commit the key).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
JAVA="${JAVA:-java}"
APKSIGNER_JAR="${APKSIGNER_JAR:?set APKSIGNER_JAR to apksigner.jar (Android build-tools)}"
BX_KEYSTORE="${BX_KEYSTORE:?set BX_KEYSTORE to the BLACK X release keystore (.p12)}"
BX_KEYSTORE_PASS_FILE="${BX_KEYSTORE_PASS_FILE:?set BX_KEYSTORE_PASS_FILE to the file holding its password}"
BASE_APK="${BASE_APK:-$ROOT/client/public/BLACK-X-Mobile-120Hz.apk}"
WORK="${WORK:-/tmp/bx-apk-build}"
DIST="$WORK/dist"

rm -rf "$WORK" && mkdir -p "$WORK"
cp "$BASE_APK" "$WORK/base.apk"

echo "1/4 building the web bundle for the APK"
# The website the APK talks to (shared/publicSite.js). Installed apps keep the address they were
# built with, so change it only together with PUBLIC_SITE_ORIGIN.
BX_API_BASE="${BX_API_BASE:-https://black-x-anime.ai.studio}"
(cd "$ROOT" && VITE_BUILD_TARGET=apk VITE_API_BASE_URL="$BX_API_BASE" \
  npx vite build client --outDir "$DIST" --emptyOutDir --logLevel warn)

echo "2/4 repacking assets/public into the Capacitor shell"
python3 "$ROOT/tools/apk/repack-apk.py" "$WORK/base.apk" "$DIST" "$WORK/unsigned.apk"

echo "3/4 signing (v1 + v2 + v3; apksigner keeps the zip alignment)"
"$JAVA" -jar "$APKSIGNER_JAR" sign \
  --ks "$BX_KEYSTORE" --ks-type PKCS12 --ks-key-alias blackx \
  --ks-pass "file:$BX_KEYSTORE_PASS_FILE" \
  --out "$WORK/signed.apk" "$WORK/unsigned.apk"

echo "4/4 verifying"
"$JAVA" -jar "$APKSIGNER_JAR" verify --verbose --print-certs "$WORK/signed.apk" | grep -E "Verifies|Verified using|certificate DN|certificate SHA-256"

cp "$WORK/signed.apk" "$ROOT/client/public/BLACK-X-Mobile-120Hz.apk"
echo "done -> client/public/BLACK-X-Mobile-120Hz.apk ($(du -h "$WORK/signed.apk" | cut -f1))"
