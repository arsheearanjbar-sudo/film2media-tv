/* test-backup.js — fixture-based tests for js/backup.js (no network).
 * Run: node test/test-backup.js */
var fs = require('fs');
var vm = require('vm');
var assert = require('assert');

// real scrape helpers (pure, no DOM)
var NilfScrape = require(__dirname + '/../js/scrape.js');

var passed = 0;
function ok(name, cond) {
  if (!cond) { console.error('  FAIL: ' + name); process.exit(1); }
  passed++;
  console.log('  PASS: ' + name);
}

// ---- fixtures (shaped like the live CCloud API) ----
var MOVIE = {
  id: 35244, type: 'movie', title: 'Verity',
  description: 'نام فیلم: وریتی',
  image: 'https://server-hi-speed-iran.info/poster.jpg',
  sources: [
    { id: 1, quality: '480 زیرنویس', type: 'mkv', url: 'http://node1/x-480.mkv' },
    { id: 2, quality: '1080 زیرنویس', type: 'mkv', url: 'http://node1/x-1080.mkv' },
    { id: 3, quality: '1080 زیرنویس', type: 'mp4', url: 'http://node1/x-1080.mp4' }
  ]
};
var SEASONS = [
  { id: 1, title: 'فصل اول زیرنویس', episodes: [
    { id: 11, title: 'قسمت 1', sources: [
      { id: 21, quality: '480', type: 'mkv', url: 'http://n/e1-480.mkv' },
      { id: 22, quality: '720', type: 'mp4', url: 'http://n/e1-720.mp4' }
    ]},
    { id: 12, title: 'قسمت 2', sources: [
      { id: 23, quality: '480', type: 'mkv', url: 'http://n/e2-480.mkv' }
    ]}
  ]}
];

function loadBackup(stubs) {
  var sandbox = {
    NilfScrape: NilfScrape,
    Log: { log: function () {} },
    Api: stubs.Api,
    fetch: stubs.fetch,
    Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout,
    encodeURIComponent: encodeURIComponent, JSON: JSON, Object: Object, Array: Array,
    console: console
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/../js/backup.js', 'utf8'), sandbox, { filename: 'backup.js' });
  return { Backup: sandbox.Backup, Source: sandbox.Source };
}

var noNet = function () { throw new Error('network disabled in test'); };

console.log('== Backup.norm / movieGroups (pure) ==');
(function () {
  var R = loadBackup({ Api: {}, fetch: noNet });
  var n = R.Backup.norm(MOVIE, 'movie');
  ok('norm keeps title/poster', n.title === 'Verity' && n.poster.indexOf('poster.jpg') > 0);
  ok('norm namespaced id + backup flag', n.id === 'cc35244' && n.backup === true && n.ccId === 35244);
  ok('norm keeps sources', n.sources.length === 3);

  var groups = R.Backup.movieGroups(n);
  ok('movieGroups: one group per quality', groups.length === 2);
  ok('movieGroups: section marked', groups.every(function (g) { return g.section === 'منبع جایگزین'; }));
  ok('movieGroups: items have label+url', groups.every(function (g) {
    return g.items.every(function (it) { return it.label && it.url; });
  }));
  var g1080 = groups.filter(function (g) { return g.quality === '1080 زیرنویس'; })[0];
  ok('movieGroups: qualities grouped', g1080 && g1080.items.length === 2);
  // mp4 preferred by the shared preferMp4 helper
  var best = NilfScrape.preferMp4(g1080.items)[0];
  ok('preferMp4 picks mp4 first', /\.mp4$/.test(best.url));
})();

console.log('== Backup.seasonsToGroups (pure) ==');
(function () {
  var R = loadBackup({ Api: {}, fetch: noNet });
  var groups = R.Backup.seasonsToGroups(SEASONS);
  ok('series groups: one per quality', groups.length === 2);
  ok('series groups: season label kept', groups.every(function (g) { return g.season === 'فصل اول زیرنویس'; }));
  var g480 = groups.filter(function (g) { return g.quality === '480'; })[0];
  ok('series groups: episodes listed', g480 && g480.items.length === 2 &&
    g480.items[0].label === 'قسمت 1' && g480.items[1].label === 'قسمت 2');
  ok('series groups: empty input safe', R.Backup.seasonsToGroups(null).length === 0);
})();

console.log('== Source facade: sticky fallback ==');
(function () {
  var apiCalls = 0, backupCalls = 0, notices = 0;
  var fakeItems = [{ id: 'cc1', backup: true, title: 'X' }];
  var R = loadBackup({
    Api: { list: function () { apiCalls++; return Promise.reject(new Error('boom')); } },
    fetch: function () {
      backupCalls++;
      return Promise.resolve({
        ok: true,
        text: function () { return Promise.resolve(JSON.stringify(fakeItems.map(function (it) {
          return { id: 1, type: 'movie', title: 'X', image: '', sources: [] };
        }))); }
      });
    }
  });
  R.Source.setOnFallback(function () { notices++; });
  return R.Source.list('movie', 1, 24).then(function (res) {
    ok('fallback list resolves', res.items.length === 1);
    ok('fallback items flagged backup', res.items[0].backup === true);
    ok('notice fired once', notices === 1);
    ok('primary tried once, backup once', apiCalls === 1 && backupCalls === 1);
    return R.Source.list('movie', 2, 24);
  }).then(function () {
    ok('sticky: primary not retried', apiCalls === 1);
    ok('sticky: backup used directly', backupCalls === 2);
    ok('notice not repeated', notices === 1);
  });
})().then(function () {
  console.log('ALL PASS (' + passed + ' assertions)');
}).catch(function (e) {
  console.error('FAIL:', e && e.message);
  process.exit(1);
});
