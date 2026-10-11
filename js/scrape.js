/* scrape.js — Nilfgaard (Film2Media) page-HTML parser.
 * Pure ES2017 (no optional chaining, no ??, no template literals issues — all fine),
 * regex-based so it runs identically in plain node (tests) and the old Tizen webkit.
 *
 * parseMovie(html) -> { type:'movie', groups:[ {section, season:null, quality, encoder, items:[{label,url}]} ] }
 * parseSeries(html) -> { type:'series', groups:[ {section, season, quality, encoder, items:[{label,url}]} ] }
 *
 * Only DIRECT file links are collected (.mkv/.mp4 hrefs whose anchor class does NOT
 * contain 'require-login' and whose href is not '#'). require-login / playit links
 * (online playback) and KMPlayer onclick-only anchors are skipped.
 */
var NilfScrape = (function () {
  'use strict';

  var MEDIA_RE = /\.(mkv|mp4)(\?|#|$)/i;

  function stripTags(s) {
    if (!s) return '';
    return String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
      .replace(/&#0?38;/g, '&').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  // Return the first .mkv/.mp4 href inside one anchor-block's attributes,
  // ignoring require-login and '#' hrefs.
  function directUrlFromAnchorAttrs(attrs) {
    if (/require-login/i.test(attrs)) return null;
    var hm = /href\s*=\s*"([^"]+)"/i.exec(attrs);
    if (!hm) return null;
    var href = hm[1];
    if (href === '#' || href === '') return null;
    if (MEDIA_RE.test(href)) return href;
    return null;
  }

  // Collect unique direct media urls (and best label) from an HTML chunk.
  // Returns array of {url, label}.
  function collectDirect(chunk, labelFrom) {
    var out = [];
    var seen = {};
    var re = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(chunk)) !== null) {
      var url = directUrlFromAnchorAttrs(m[1]);
      if (!url || seen[url]) continue;
      seen[url] = true;
      var label = null;
      if (typeof labelFrom === 'function') label = labelFrom(m[2], m[1]);
      else if (labelFrom) label = labelFrom;
      out.push({ url: url, label: label });
    }
    return out;
  }

  function sectionName(chunk) {
    var m = /<p class="title"><span>([^<]*)<\/span><\/p>/i.exec(chunk);
    return m ? stripTags(m[1]) : '';
  }

  function qualityOf(chunk) {
    var m = /<span[^>]*>\s*کیفیت\s*:?\s*<\/span>\s*<span[^>]*>([^<]*)<\/span>/i.exec(chunk);
    return m ? stripTags(m[1]) : '';
  }

  function encoderOf(chunk) {
    var m = /انکودر\s*:?\s*<\/span>\s*([^<]+)/i.exec(chunk);
    return m ? stripTags(m[1]) : '';
  }

  function seasonLabelOf(chunk) {
    var m = /<button[^>]*>([\s\S]*?)<\/button>/i.exec(chunk);
    return m ? stripTags(m[1]) : '';
  }

  function episodeLabelFromPlainAnchor(innerHtml) {
    var t = stripTags(innerHtml);
    // typical: «قسمت 01» — keep as-is
    return t || null;
  }

  function episodeNumFromRequireLogin(attrs) {
    var norm = String(attrs || '').replace(/&#0?38;/g, '&').replace(/&amp;/g, '&');
    var m = /(?:[?&#;]|^)episode=(\d+)/i.exec(norm);
    return m ? (parseInt(m[1], 10) + 1) : null;
  }

  function faNum(n) {
    var fa = '۰۱۲۳۴۵۶۷۸۹';
    return String(n).replace(/[0-9]/g, function (d) { return fa[d]; });
  }

  /* ------------------------------ MOVIE ------------------------------ */
  function parseMovie(html) {
    var groups = [];
    // track section titles in document order
    var sections = [];
    var sr = /<p class="title"><span>([^<]*)<\/span><\/p>/gi, sm;
    while ((sm = sr.exec(html)) !== null) {
      sections.push({ pos: sm.index, name: stripTags(sm[1]) });
    }
    function sectionAt(pos) {
      var name = '';
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].pos < pos) name = sections[i].name;
        else break;
      }
      return name;
    }
    var liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi, m;
    while ((m = liRe.exec(html)) !== null) {
      var body = m[1];
      if (body.indexOf('btn-download') < 0 && body.indexOf('download-list') < 0) continue;
      var items = collectDirect(body, null);
      if (!items.length) continue;
      groups.push({
        section: sectionAt(m.index),
        season: null,
        quality: qualityOf(body),
        encoder: encoderOf(body),
        items: items
      });
    }
    return { type: 'movie', groups: groups };
  }

  /* ------------------------------ SERIES -----------------------------
   * Structure per season:
   *   <div class="download-season ..."><button>فصل اول…</button>
   *     <div class="download-list hardsub">
   *       <p class="title"><span>SECTION</span></p>
   *       <ul>
   *         <li class="bg-body"> …کیفیت: Q …انکودر: E… «مشاهده لینک ها»
   *           <div class="series-downloaditems">
   *             <div class="d-flex"> require-login | KMP-onclick | <a href="….mkv">قسمت 01</a> </div> ×N
   *           </div>
   *         </li> ×per quality
   *       </ul>
   *     </div>
   *   </div>
   */
  function parseSeries(html) {
    var groups = [];
    var seasonChunks = String(html).split('<div class="download-season');
    for (var s = 1; s < seasonChunks.length; s++) {
      var seasonHtml = seasonChunks[s];
      var season = seasonLabelOf(seasonHtml);
      var listChunks = seasonHtml.split('<div class="download-list');
      for (var l = 1; l < listChunks.length; l++) {
        var listHtml = listChunks[l];
        var section = sectionName(listHtml);
        var liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi, m;
        while ((m = liRe.exec(listHtml)) !== null) {
          var liBody = m[1];
          if (liBody.indexOf('series-downloaditems') < 0) continue;
          var quality = qualityOf(liBody);
          var encoder = encoderOf(liBody);
          var epChunks = liBody.split('class="d-flex"');
          var epItems = [];
          for (var e = 1; e < epChunks.length; e++) {
            var epHtml = epChunks[e];
            var reqM = /<a\b([^>]*require-login[^>]*)>/.exec(epHtml);
            var epNum = reqM ? episodeNumFromRequireLogin(reqM[1]) : null;
            var fallback = epNum ? ('قسمت ' + faNum(epNum)) : null;
            var links = collectDirect(epHtml, function (inner) {
              var lbl = episodeLabelFromPlainAnchor(inner);
              return lbl || fallback;
            });
            if (links.length) epItems.push(links[0]);
          }
          if (epItems.length) {
            groups.push({
              section: section, season: season, quality: quality,
              encoder: encoder, items: epItems
            });
          }
        }
      }
    }
    return { type: 'series', groups: groups };
  }

  /* --------------------- preference / helpers ------------------------ */
  var Q_RANK = ['2160', '4k', '1080', '720', '480', '360', 'hdts', 'cam', 'ts'];

  function qualityRank(q) {
    q = String(q || '').toLowerCase();
    for (var i = 0; i < Q_RANK.length; i++) {
      if (q.indexOf(Q_RANK[i]) >= 0) return i;
    }
    return Q_RANK.length;
  }

  // Prefer .mp4 over .mkv within a group's items (compat), keep order otherwise.
  function preferMp4(items) {
    var mp4 = [], mkv = [], other = [];
    items.forEach(function (it) {
      if (/\.mp4(\?|#|$)/i.test(it.url)) mp4.push(it);
      else if (/\.mkv(\?|#|$)/i.test(it.url)) mkv.push(it);
      else other.push(it);
    });
    return mp4.concat(mkv).concat(other);
  }

  function sortGroups(groups) {
    return groups.slice().sort(function (a, b) {
      return qualityRank(a.quality) - qualityRank(b.quality);
    });
  }

  return {
    parseMovie: parseMovie,
    parseSeries: parseSeries,
    preferMp4: preferMp4,
    sortGroups: sortGroups,
    stripTags: stripTags
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NilfScrape;
}
