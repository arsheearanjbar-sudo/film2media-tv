#!/bin/bash
# Build film2media-tv.wgt — validates, vendors spatial-navigation, runs tests, packages.
set -e
cd "$(dirname "$0")"

echo "== 1. node --check =="
for f in js/log.js js/tv.js js/nav.js js/api.js js/scrape.js js/backup.js js/favorites.js js/player.js js/ui.js js/app.js; do
  node --check "$f" && echo "  OK $f"
done

echo "== 2. config.xml well-formed =="
python3 -c "import xml.dom.minidom; xml.dom.minidom.parse('config.xml'); print('  config.xml OK')"

echo "== 3. scrape tests =="
node test/test-scrape.js

echo "== 3b. backup tests =="
node test/test-backup.js

echo "== 4. vendor spatial-navigation =="
mkdir -p js/vendor
{
  echo "/* Built by build.sh — do not edit."
  echo " * lodash-es shim (project code) + @noriginmedia/norigin-spatial-navigation-core"
  echo " * v4.1.2 CJS bundle (MIT, Norigin Media). Exposes window.SpatialNavigation. */"
  cat vendor-src/lodash-shim.js
  echo "(function(){"
  echo "var module={exports:{}};"
  echo "var exports=module.exports;"
  echo "function require(name){ if(name==='lodash-es') return __lodashEs; throw new Error('Cannot require '+name); }"
  # strip the bundle's own 'use strict' prologue line is unnecessary; keep as-is
  cat vendor-src/spatial-navigation-core.cjs
  echo "window.SpatialNavigation = module.exports;"
  echo "})();"
} > js/vendor/spatial-navigation.js
node --check js/vendor/spatial-navigation.js && echo "  OK js/vendor/spatial-navigation.js"
# smoke-test the vendored bundle in node with a DOM stub-free require shim
node -e "
var fs=require('fs');
var src=fs.readFileSync('js/vendor/spatial-navigation.js','utf8');
var window={};
eval(src);
var SN=window.SpatialNavigation;
if(!SN || typeof SN.init!=='function') throw new Error('SpatialNavigation missing');
console.log('  SpatialNavigation loads OK, exports:', Object.keys(SN).slice(0,8).join(',')+'...');
"

echo "== 5. package .wgt =="
rm -f film2media-tv.wgt
# icon.png is a binary asset and may be absent (e.g. CI checkout); zip tolerates that.
ICON_ARG=""
[ -f icon.png ] && ICON_ARG="icon.png"
# shellcheck disable=SC2086
zip -qr film2media-tv.wgt config.xml index.html $ICON_ARG css js -x '*/.*'
ls -la film2media-tv.wgt
echo "BUILD OK"
