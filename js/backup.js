/* backup.js — CCloud fallback data source (best-effort).
 *
 * If nilfgaard.top is unreachable, the app falls back to the public CCloud
 * API (key embedded in the open-source code3-dev/CCloud app). The key is
 * third-party and may be rotated — every call is wrapped in try/catch with
 * host fallback and timeouts, and the app keeps working (degraded) if the
 * backup is dead too.
 *
 * Backup exposes the same interface as api.js (list/search/norm) plus group
 * builders that emit EXACTLY the shapes js/scrape.js produces, so ui.js only
 * talks to the Source facade below and barely notices the switch. */
var Backup = (function () {
  'use strict';

  var KEY = '4F5A9C3D9A86FA54EACEDDD635185';
  var HOSTS = [
    'https://server-hi-speed-iran.info',
    'https://hostinnegar.com',
    'https://windowsdiba.info'
  ];
  var TIMEOUT_MS = 8000;
  var PAGE_SIZE = 30; // fixed by the API

  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (!done) { done = true; reject(new Error('timeout')); }
      }, ms || TIMEOUT_MS);
      p.then(function (v) {
        if (!done) { done = true; clearTimeout(t); resolve(v); }
      }, function (e) {
        if (!done) { done = true; clearTimeout(t); reject(e); }
      });
    });
  }

  function stripBom(t) {
    return t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t;
  }

  // GET path from each host in order; resolves with parsed JSON.
  function get(path) {
    Log.log('GET', true, '[backup] ' + path);
    var chain = Promise.reject(new Error('backup unreachable'));
    HOSTS.forEach(function (h) {
      chain = chain.catch(function () {
        return withTimeout(fetch(h + path).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })).then(function (t) {
          try { return JSON.parse(stripBom(t)); }
          catch (e) { throw new Error('bad JSON'); }
        });
      });
    });
    return chain.catch(function (err) {
      Log.log('GET', false, '[backup] ' + path + ' :: ' + err.message);
      throw err;
    });
  }

  // Normalize a CCloud item to the api.js item shape.
  // type: 'movie' | 'series'. CCloud ids are namespaced ('cc…') so they can
  // never collide with WordPress ids (e.g. in favorites).
  function norm(m, type) {
    return {
      id: 'cc' + m.id,
      type: type,
      title: m.title || '',
      rawTitle: m.title || '',
      synopsis: String(m.description || '').replace(/\r/g, ''),
      poster: m.image || '',
      link: '',
      backup: true,
      ccId: m.id,
      sources: m.sources || []
    };
  }

  function list(type, page, perPage) {
    var ep = type === 'series' ? 'serie' : 'movie';
    var p = '/api/' + ep + '/by/filtres/0/created/' + (page || 1) + '/' + KEY;
    return get(p).then(function (data) {
      var arr = Array.isArray(data) ? data : [];
      var pg = page || 1;
      return {
        items: arr.map(function (m) { return norm(m, type); }),
        // No total-page info from the API: offer "more" iff the page was full.
        totalPages: arr.length >= PAGE_SIZE ? pg + 1 : pg
      };
    });
  }

  function search(type, query) {
    var p = '/api/search/' + encodeURIComponent(query) + '/' + KEY;
    return get(p).then(function (data) {
      var posters = (data && data.posters) || [];
      var want = type === 'series' ? 'serie' : 'movie';
      return posters
        .filter(function (m) { return m.type === want; })
        .map(function (m) { return norm(m, type); });
    });
  }

  /* ---- group builders: emit scrape.js group shapes ----
   * movie:  [{section, quality, encoder, items:[{label,url}]}]
   * series: [{season, section, quality, encoder, items:[{label,url}]}]  */

  function movieGroups(item) {
    var byQ = {};
    (item.sources || []).forEach(function (s) {
      if (!s || !s.url) return;
      var q = s.quality || 'نامشخص';
      if (!byQ[q]) byQ[q] = [];
      byQ[q].push({ label: q + ' (' + String(s.type || '').toUpperCase() + ')', url: s.url });
    });
    var groups = Object.keys(byQ).map(function (q) {
      return { section: 'منبع جایگزین', quality: q, encoder: '', items: byQ[q] };
    });
    return NilfScrape.sortGroups(groups);
  }

  // Pure: seasons payload -> scrape.js series group shapes.
  function seasonsToGroups(seasons) {
    var groups = [];
    (Array.isArray(seasons) ? seasons : []).forEach(function (sea) {
      var byQ = {};
      (sea.episodes || []).forEach(function (ep) {
        (ep.sources || []).forEach(function (s) {
          if (!s || !s.url) return;
          var q = s.quality || 'نامشخص';
          if (!byQ[q]) byQ[q] = [];
          byQ[q].push({ label: ep.title || 'قسمت', url: s.url });
        });
      });
      Object.keys(byQ).forEach(function (q) {
        groups.push({
          season: sea.title || '', section: 'منبع جایگزین',
          quality: q, encoder: '', items: byQ[q]
        });
      });
    });
    return NilfScrape.sortGroups(groups);
  }

  function seriesGroups(ccId) {
    return get('/api/season/by/serie/' + ccId + '/' + KEY).then(seasonsToGroups);
  }

  // Cross-source rescue: find this title in the backup catalogue (used when the
  // primary list works but the detail page scrape fails).
  function rescueGroups(item) {
    return search(item.type, item.title).then(function (hits) {
      if (!hits.length) throw new Error('no backup match');
      if (item.type === 'series') return seriesGroups(hits[0].ccId);
      return movieGroups(hits[0]);
    });
  }

  return {
    list: list, search: search, norm: norm,
    movieGroups: movieGroups, seriesGroups: seriesGroups, seasonsToGroups: seasonsToGroups,
    rescueGroups: rescueGroups, HOSTS: HOSTS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Backup;

/* ---------------------------------------------------------------------------
 * Source facade — primary (nilfgaard.top) with sticky backup fallback.
 * ui.js talks ONLY to Source; it never touches Api or Backup directly.
 * ------------------------------------------------------------------------- */
var Source = (function () {
  'use strict';

  var PRIMARY_TIMEOUT = 8000; // ~8s before giving up on the primary
  var mode = 'primary';       // 'primary' | 'backup' (sticky for the session)
  var notified = false;
  var onFallback = null;      // set by app.js: shows the fallback notice

  function isBackup() { return mode === 'backup'; }

  function engageBackup(reason) {
    if (mode !== 'backup') {
      mode = 'backup';
      Log.log('source', false, 'primary failed (' + reason + ') — backup engaged');
    }
    if (!notified) {
      notified = true;
      try { if (onFallback) onFallback(); } catch (e) {}
    }
  }

  // Race the primary call against the timeout. On failure, engage the backup
  // and rethrow so the caller falls through to it. Takes a thunk so the
  // primary request is never even started once we are in backup mode.
  function attempt(makePromise) {
    if (mode === 'backup') return Promise.reject(new Error('backup mode'));
    var promise;
    try { promise = makePromise(); }
    catch (e) { return Promise.reject(e); }
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (!done) { done = true; reject(new Error('timeout')); }
      }, PRIMARY_TIMEOUT);
      promise.then(function (v) {
        if (!done) { done = true; clearTimeout(t); resolve(v); }
      }, function (e) {
        if (!done) { done = true; clearTimeout(t); reject(e); }
      });
    }).catch(function (err) {
      engageBackup(err && err.message);
      throw err;
    });
  }

  function list(type, page, perPage) {
    return attempt(function () { return Api.list(type, page, perPage); }).catch(function () {
      return Backup.list(type, page, perPage);
    });
  }

  function search(type, query) {
    return attempt(function () { return Api.search(type, query); }).catch(function () {
      return Backup.search(type, query);
    });
  }

  // Detail groups for a MOVIE item (scrape.js group shape, sorted).
  function movieGroups(item) {
    if (item.backup) {
      try { return Promise.resolve(Backup.movieGroups(item)); }
      catch (e) { return Promise.reject(e); }
    }
    return attempt(function () {
      return Api.pageHtml(item.link).then(function (html) {
        return NilfScrape.sortGroups(NilfScrape.parseMovie(html).groups);
      });
    }).catch(function () {
      // Page scrape failed (primary list worked): try the backup catalogue.
      return Backup.rescueGroups(item);
    });
  }

  // Detail groups for a SERIES item (scrape.js series group shape, sorted).
  function seriesGroups(item) {
    if (item.backup) {
      return Backup.seriesGroups(item.ccId);
    }
    return attempt(function () {
      return Api.pageHtml(item.link).then(function (html) {
        return NilfScrape.sortGroups(NilfScrape.parseSeries(html).groups);
      });
    }).catch(function () {
      return Backup.rescueGroups(item);
    });
  }

  return {
    list: list, search: search,
    movieGroups: movieGroups, seriesGroups: seriesGroups,
    isBackup: isBackup,
    setOnFallback: function (fn) { onFallback = fn; }
  };
})();
