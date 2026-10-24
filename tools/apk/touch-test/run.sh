#!/usr/bin/env bash
# Real-touch regression suite for the APK UI. Everything is built in $WORK (default
# /tmp/bx-touch): the test browser, a 24-minute test video and the web bundle extracted
# from the APK, so the exact files that ship are the ones tested. See README.md.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
WORK="${WORK:-/tmp/bx-touch}"
APK="${APK:-$ROOT/client/public/HEARBOR-Mobile-120Hz.apk}"

mkdir -p "$WORK"
cp "$HERE/lib.mjs" "$HERE/suite.mjs" "$HERE/package.json" "$WORK/"

if [ ! -d "$WORK/node_modules/puppeteer-core" ]; then
  echo "installing the test browser into $WORK"
  (cd "$WORK" && npm install --no-audit --no-fund --no-package-lock --loglevel=error)
fi

if [ ! -s "$WORK/test.webm" ]; then
  FFMPEG="$(command -v ffmpeg || true)"
  if [ -z "$FFMPEG" ]; then
    [ -x "$WORK/py/bin/python" ] || python3 -m venv "$WORK/py"
    "$WORK/py/bin/pip" install -q imageio-ffmpeg
    FFMPEG="$("$WORK/py/bin/python" -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
  fi
  echo "making a 24-minute test video"
  "$FFMPEG" -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=192x108:rate=2" -t 1440 \
    -c:v libvpx -b:v 60k -deadline realtime -cpu-used 8 -g 20 "$WORK/test.webm"
fi

rm -rf "$WORK/public" "$WORK/apk-x" && mkdir -p "$WORK/public"
unzip -q -o "$APK" 'assets/public/*' -d "$WORK/apk-x"
cp -r "$WORK/apk-x/assets/public/." "$WORK/public/"
echo "testing $(basename "$APK") ($(du -h "$APK" | cut -f1)), web bundle in $WORK/public"

cd "$WORK"
AWS_EXECUTION_ENV="${AWS_EXECUTION_ENV:-AWS_Lambda_nodejs22.x}" BX_REPO="$ROOT" DIST="$WORK/public" VIDEO="$WORK/test.webm" \
  node suite.mjs
