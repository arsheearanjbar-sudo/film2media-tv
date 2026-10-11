/* api.js — WordPress REST client for nilfgaard.top (fetch-based; Chromium 85+).
 * All responses may start with a UTF-8 BOM, so we parse text manually. */
var Api = (function () {
  'use strict';

  var BASE = 'https://www.nilfgaard.top/wp-json/wp/v2';
  // NOTE: _links must be in _fields or WP strips _embedded (posters) from the response.
  var FIELDS = '_fields=id,slug,title,excerpt,link,featured_media,_links';

  function stripBom(t) {
    return t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t;
  }

  function get(path) {
    Log.log('GET', true, path);
    return fetch(BASE + path).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
      var totalPages = r.headers.get('X-WP-TotalPages');
      return r.text().then(function (t) {
        var data;
        try { data = JSON.parse(stripBom(t)); }
        catch (e) { throw new Error('bad JSON ' + path); }
        return { data: data, totalPages: totalPages ? parseInt(totalPages, 10) : 1 };
      });
    }).catch(function (err) {
      Log.log('GET', false, path + ' :: ' + err.message);
      throw err;
    });
  }

  function posterOf(p) {
    try {
      var m = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
      if (m && m.source_url) return m.source_url;
    } catch (e) {}
    return '';
  }

  function cleanTitle(t) {
    return String(t || '')
      .replace(/^دانلود\s+(فیلم|سریال|انیمه)\s+/, '')
      .replace(/\s*بدون سانسور[\s\S]*$/, '')
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '');
  }

  function norm(p, type) {
    var title = p.title && p.title.rendered ? p.title.rendered : '';
    var excerpt = p.excerpt && p.excerpt.rendered ? p.excerpt.rendered : '';
    return {
      id: p.id,
      type: type, // 'movie' | 'series'
      title: cleanTitle(title),
      rawTitle: title,
      synopsis: NilfScrape.stripTags(excerpt),
      poster: posterOf(p),
      link: p.link
    };
  }

  function list(type, page, perPage) {
    var ep = type === 'series' ? 'series' : 'posts';
    var q = '/' + ep + '?per_page=' + (perPage || 24) + '&page=' + (page || 1) +
      '&' + FIELDS + '&_embed';
    return get(q).then(function (res) {
      return {
        items: res.data.map(function (p) { return norm(p, type); }),
        totalPages: res.totalPages
      };
    });
  }

  function search(type, query) {
    var ep = type === 'series' ? 'series' : 'posts';
    var q = '/' + ep + '?search=' + encodeURIComponent(query) +
      '&per_page=24&' + FIELDS + '&_embed';
    return get(q).then(function (res) {
      return res.data.map(function (p) { return norm(p, type); });
    });
  }

  // Raw page HTML for the download-link scraper.
  function pageHtml(url) {
    Log.log('page', true, url);
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).catch(function (err) {
      Log.log('page', false, url + ' :: ' + err.message);
      throw err;
    });
  }

  // For node tests: pure URL construction, no network.
  function urlFor(type, page, perPage) {
    var ep = type === 'series' ? 'series' : 'posts';
    return BASE + '/' + ep + '?per_page=' + (perPage || 24) + '&page=' + (page || 1) +
      '&' + FIELDS + '&_embed';
  }

  return {
    list: list, search: search, pageHtml: pageHtml,
    cleanTitle: cleanTitle, norm: norm, urlFor: urlFor, BASE: BASE
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Api;
