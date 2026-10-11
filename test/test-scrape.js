// Test harness for scrape.js against real page fixtures.
var fs = require('fs');
var NilfScrape = require(__dirname + '/../js/scrape.js');

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS: ' + msg); }
  else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('== movie fixture ==');
var movieHtml = fs.readFileSync('/tmp/nilf_movie.html', 'utf8');
var mv = NilfScrape.parseMovie(movieHtml);
assert(mv.type === 'movie', 'type is movie');
assert(mv.groups.length >= 1, 'extracted >=1 quality group (got ' + mv.groups.length + ')');
var g0 = mv.groups[0];
console.log('  group0:', JSON.stringify({section: g0.section, quality: g0.quality, encoder: g0.encoder, nItems: g0.items.length}));
assert(/\.mkv/i.test(g0.items[0].url), 'first group has direct .mkv url');
assert(!/require-login|playit/.test(JSON.stringify(mv.groups)), 'no require-login/playit links leaked');
var noLoginUrls = mv.groups.every(function (g) {
  return g.items.every(function (it) { return it.url.indexOf('nilfgaard.top') < 0 || /\.mkv|\.mp4/i.test(it.url); });
});
assert(noLoginUrls, 'no login-gated page links in items');
assert(g0.section.length > 0, 'section title captured: "' + g0.section + '"');
assert(g0.quality.length > 0, 'quality label captured: "' + g0.quality + '"');

console.log('== series fixture ==');
var seriesHtml = fs.readFileSync('/tmp/nilf_series_page.html', 'utf8');
var sv = NilfScrape.parseSeries(seriesHtml);
assert(sv.type === 'series', 'type is series');
assert(sv.groups.length === 3, 'one group per quality (got ' + sv.groups.length + ')');
var s0 = sv.groups[0];
console.log('  group0:', JSON.stringify({season: s0.season, section: s0.section, quality: s0.quality, encoder: s0.encoder, nItems: s0.items.length}));
assert(s0.season.indexOf('فصل') >= 0, 'season label captured: "' + s0.season + '"');
assert(s0.items.length >= 2, 'episodes extracted per quality group (got ' + s0.items.length + ')');
assert(s0.items.every(function (it) { return /\.mkv|\.mp4/i.test(it.url); }), 'all episode urls are direct media');
assert(s0.items.every(function (it) { return it.label && it.label.indexOf('قسمت') >= 0; }),
  'episode labels present: ' + s0.items.map(function (i) { return i.label; }).join(', '));
assert(!/require-login|playit/.test(JSON.stringify(sv.groups)), 'no require-login/playit links leaked');

console.log('== preferMp4 / sortGroups ==');
var pref = NilfScrape.preferMp4([{url: 'a.mkv'}, {url: 'b.mp4'}]);
assert(pref[0].url === 'b.mp4', 'mp4 preferred over mkv');
var sorted = NilfScrape.sortGroups([{quality: 'WEB-DL 720p'}, {quality: 'WEB-DL 1080p'}]);
assert(sorted[0].quality === 'WEB-DL 1080p', 'quality sorting works');

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
