#!/bin/sh
# Build, sign with the Samsung certificate profile, install on the TV and
# launch with the web inspector.
# Usage: scripts/tv.sh <tv-ip>   (Samsung certificate profile "film2media" must exist)
set -e
TV="${1:?usage: scripts/tv.sh <tv-ip>}"
TIZEN="$HOME/tizen-studio/tools/ide/bin/tizen"
SDB="$HOME/tizen-studio/tools/sdb"
APP_ID="film2media.app"
OUT="$(mktemp -d)"

cd "$(dirname "$0")/.."
./build.sh
# Stage only the shippable files (never .git, the unsigned .wgt, or dev files).
rm -rf "$OUT/app" && mkdir -p "$OUT/app"
cp config.xml index.html icon.png "$OUT/app/"
cp -R css js "$OUT/app/"
# tizen package names the .wgt after the widget <name>; ours is Persian,
# and the installer rejects non-ASCII file names, so rename it.
"$TIZEN" package -t wgt -s film2media -- "$OUT/app" -o "$OUT" >/dev/null
WGT="$(ls "$OUT"/*.wgt | head -1)"
mv "$WGT" "$OUT/film2media-tv.wgt"

# The sdb connection drops between runs, so reconnect every time.
"$SDB" connect "$TV:26101" >/dev/null
"$TIZEN" install -n "$OUT/film2media-tv.wgt" -s "$TV:26101" | grep -E "installed|error|fail" || true
"$SDB" -s "$TV:26101" shell 0 debug "$APP_ID" | tail -1
echo "wgt: $OUT/film2media-tv.wgt"
