/* ui.js — screens: home, grid, movie/series detail, quality picker, search, favorites.
 * Every screen is a spatial-nav focus boundary; screens below stay mounted
 * (hidden) so Back restores the exact focused item. */
var UI = (function () {
  'use strict';

  var SECTIONS = [
    { id: 'home', label: 'خانه', glyph: 'خ' },
    { id: 'movies', label: 'فیلم‌ها', glyph: 'ف' },
    { id: 'series', label: 'سریال‌ها', glyph: 'س' },
    { id: 'search', label: 'جستجو', glyph: 'ج' },
    { id: 'favorites', label: 'علاقه‌مندی‌ها', glyph: 'ع' }
  ];

  /* ------------------------------ helpers ------------------------------ */
  function h(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined && html !== null) el.innerHTML = html;
    return el;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Register el as focusable under the screen boundary; remember first/last keys.
  function F(el, ctx, opts) {
    opts = opts || {};
    opts.parent = ctx.key;
    var userFocus = opts.onFocus;
    opts.onFocus = function () {
      ctx.lastKey = el._snKey;
      if (userFocus) userFocus();
    };
    var key = Nav.focusable(el, opts);
    if (!ctx.firstKey) ctx.firstKey = key;
    return key;
  }

  function focusFirst(ctx) {
    if (ctx.firstKey && Nav.exists(ctx.firstKey)) Nav.focus(ctx.firstKey);
  }

  function restore(ctx) {
    var k = ctx.lastKey && Nav.exists(ctx.lastKey) ? ctx.lastKey : ctx.firstKey;
    if (k && Nav.exists(k)) Nav.focus(k);
  }

  /* ------------------------------ rail --------------------------------- */
  // Narrow icon rail on the RIGHT edge (RTL start). Geometric nav moves focus
  // here when pressing Right from content; it widens while focused.
  function buildRail(ctx, current) {
    var rail = h('nav', 'rail');
    var items = [];
    SECTIONS.forEach(function (s) {
      var it = h('div', 'rail-item' + (s.id === current ? ' active' : ''),
        '<span class="rail-glyph">' + s.glyph + '</span>' +
        '<span class="rail-label">' + s.label + '</span>');
      (function (sec) {
        F(it, ctx, {
          onEnter: function () { App.navigate(sec); },
          onFocus: function () { rail.classList.add('open'); },
          onBlur: function () {
            // collapse when focus leaves the rail entirely
            setTimeout(function () {
              var k = Nav.currentKey();
              var inside = false;
              for (var i = 0; i < items.length; i++) {
                if (items[i]._snKey === k) { inside = true; break; }
              }
              if (!inside) rail.classList.remove('open');
            }, 0);
          }
        });
      })(s.id);
      items.push(it);
      rail.appendChild(it);
    });
    return rail;
  }

  /* ------------------------------ cards -------------------------------- */
  function card(item, ctx, onEnter) {
    var el = h('div', 'card focusable-card');
    var img = document.createElement('img');
    img.className = 'card-poster';
    img.setAttribute('alt', '');
    if (item.poster) img.setAttribute('src', item.poster);
    else img.className += ' no-poster';
    var cap = h('div', 'card-caption',
      '<div class="card-name">' + esc(item.title) + '</div>');
    el.appendChild(img);
    el.appendChild(cap);
    F(el, ctx, { onEnter: onEnter });
    return el;
  }

  function shimmerRow(ctx, n, rowTitle) {
    var wrap = h('div', 'row');
    if (rowTitle) wrap.appendChild(h('div', 'row-title', rowTitle));
    var track = h('div', 'row-track scroller');
    for (var i = 0; i < (n || 6); i++) track.appendChild(h('div', 'card shimmer'));
    wrap.appendChild(track);
    return wrap;
  }

  function errorBox(ctx, msg, onRetry) {
    var box = h('div', 'error-box');
    box.appendChild(h('div', 'error-msg', esc(msg)));
    var btn = h('div', 'btn btn-primary', 'تلاش مجدد');
    F(btn, ctx, { onEnter: onRetry });
    box.appendChild(btn);
    return box;
  }

  function sectionHead(text) {
    return h('div', 'screen-title', esc(text));
  }

  /* ------------------------------- home -------------------------------- */
  function renderHome(el, ctx) {
    el.appendChild(buildRail(ctx, 'home'));
    var page = h('div', 'page with-rail');
    el.appendChild(page);
    page.appendChild(sectionHead('فیلم 2 مدیا'));

    var moviesRow = shimmerRow(ctx, 6, 'جدیدترین فیلم‌ها');
    var seriesRow = shimmerRow(ctx, 6, 'جدیدترین سریال‌ها');
    page.appendChild(moviesRow);
    page.appendChild(seriesRow);

    function fillRow(rowWrap, items, type) {
      var track = rowWrap.querySelector('.row-track');
      track.innerHTML = '';
      Nav.clearScope(track);
      items.forEach(function (it) {
        track.appendChild(card(it, ctx, function () {
          App.push(type === 'series' ? 'seriesDetail' : 'movie', { item: it });
        }));
      });
      if (!items.length) track.appendChild(h('div', 'empty-note', 'موردی پیدا نشد'));
    }

    Source.list('movie', 1, 12).then(function (res) {
      fillRow(moviesRow, res.items, 'movie');
      if (!ctx.lastKey) focusFirst(ctx);
      Log.log('home', true, 'movies ' + res.items.length);
    }).catch(function () {
      moviesRow.querySelector('.row-track').innerHTML = '';
      moviesRow.appendChild(h('div', 'empty-note', 'خطا در دریافت فیلم‌ها'));
      Log.log('home', false, 'movies failed');
    });

    Source.list('series', 1, 12).then(function (res) {
      fillRow(seriesRow, res.items, 'series');
      Log.log('home', true, 'series ' + res.items.length);
    }).catch(function () {
      seriesRow.querySelector('.row-track').innerHTML = '';
      seriesRow.appendChild(h('div', 'empty-note', 'خطا در دریافت سریال‌ها'));
      Log.log('home', false, 'series failed');
    });
  }

  /* ------------------------------- grid -------------------------------- */
  function renderGrid(el, ctx, type) {
    var isSeries = type === 'series';
    el.appendChild(buildRail(ctx, isSeries ? 'series' : 'movies'));
    var page = h('div', 'page with-rail');
    el.appendChild(page);
    page.appendChild(sectionHead(isSeries ? 'سریال‌ها' : 'فیلم‌ها'));

    var grid = h('div', 'grid scroller');
    page.appendChild(grid);
    var moreBtn = null;
    var pageNum = 1, totalPages = 1, loading = false;

    function addItems(items) {
      items.forEach(function (it) {
        grid.insertBefore(card(it, ctx, function () {
          App.push(isSeries ? 'seriesDetail' : 'movie', { item: it });
        }), moreBtn);
      });
    }

    function load() {
      if (loading || pageNum > totalPages) return;
      loading = true;
      if (moreBtn) moreBtn.firstChild.textContent = 'در حال بارگذاری…';
      Source.list(type, pageNum, 24).then(function (res) {
        totalPages = res.totalPages;
        addItems(res.items);
        pageNum += 1;
        loading = false;
        if (moreBtn) {
          if (pageNum > totalPages) { moreBtn.style.display = 'none'; }
          else moreBtn.firstChild.textContent = 'نمایش بیشتر';
        }
        if (!ctx.lastKey) focusFirst(ctx);
        Log.log('grid', true, type + ' p' + (pageNum - 1) + ' +' + res.items.length);
      }).catch(function (err) {
        loading = false;
        if (moreBtn) moreBtn.firstChild.textContent = 'تلاش مجدد';
        Log.log('grid', false, type + ' ' + err.message);
      });
    }

    moreBtn = h('div', 'more-btn', '<span>در حال بارگذاری…</span>');
    F(moreBtn, ctx, { onEnter: load });
    grid.appendChild(moreBtn);
    load();
  }

  /* ---------------------------- movie detail ---------------------------- */
  function renderMovie(el, ctx, item) {
    var page = h('div', 'page detail-page scroller');
    el.appendChild(page);

    var head = h('div', 'detail-head');
    var poster = h('div', 'detail-poster');
    if (item.poster) {
      var img = document.createElement('img');
      img.setAttribute('src', item.poster);
      img.setAttribute('alt', '');
      poster.appendChild(img);
    }
    var info = h('div', 'detail-info');
    info.appendChild(h('h1', 'detail-title', esc(item.title)));
    if (item.synopsis) info.appendChild(h('p', 'detail-syn', esc(item.synopsis)));

    var favBtn = h('div', 'btn', '');
    function paintFav() {
      favBtn.innerHTML = Favorites.has(item.id, 'movie')
        ? '★ حذف از علاقه‌مندی‌ها' : '☆ افزودن به علاقه‌مندی‌ها';
    }
    paintFav();
    F(favBtn, ctx, {
      onEnter: function () { Favorites.toggle(item); paintFav(); }
    });
    info.appendChild(favBtn);
    head.appendChild(poster);
    head.appendChild(info);
    page.appendChild(head);

    page.appendChild(sectionHead('کیفیت‌های دانلود'));
    var list = h('div', 'qlist');
    page.appendChild(list);
    list.appendChild(h('div', 'empty-note', 'در حال دریافت لینک‌ها…'));

    Source.movieGroups(item).then(function (groups) {
      list.innerHTML = '';
      Nav.clearScope(list);
      if (!groups.length) {
        list.appendChild(h('div', 'empty-note', 'لینک مستقیمی پیدا نشد'));
        return;
      }
      groups.forEach(function (g) {
        var items = NilfScrape.preferMp4(g.items);
        var label = (g.section ? g.section + ' — ' : '') +
          (g.quality || 'کیفیت نامشخص') +
          (g.encoder ? ' (' + g.encoder + ')' : '');
        var row = h('div', 'qrow',
          '<span class="qrow-play">▶</span><span class="qrow-label">' + esc(label) + '</span>');
        F(row, ctx, {
          onEnter: function () {
            Player.open({ url: items[0].url, title: item.title, label: g.quality });
          }
        });
        list.appendChild(row);
      });
      if (!ctx.lastKey) focusFirst(ctx);
      Log.log('detail', true, 'movie groups ' + groups.length);
    }).catch(function (err) {
      list.innerHTML = '';
      Nav.clearScope(list);
      list.appendChild(errorBox(ctx, 'خطا در دریافت لینک‌ها', function () {
        App.replace('movie', { item: item });
      }));
      if (!ctx.lastKey) focusFirst(ctx);
      Log.log('detail', false, err.message);
    });
  }

  /* ---------------------------- series detail --------------------------- */
  function renderSeries(el, ctx, item) {
    var page = h('div', 'page detail-page scroller');
    el.appendChild(page);

    var head = h('div', 'detail-head');
    var poster = h('div', 'detail-poster');
    if (item.poster) {
      var img = document.createElement('img');
      img.setAttribute('src', item.poster);
      img.setAttribute('alt', '');
      poster.appendChild(img);
    }
    var info = h('div', 'detail-info');
    info.appendChild(h('h1', 'detail-title', esc(item.title)));
    if (item.synopsis) info.appendChild(h('p', 'detail-syn', esc(item.synopsis)));
    var favBtn = h('div', 'btn', '');
    function paintFav() {
      favBtn.innerHTML = Favorites.has(item.id, 'series')
        ? '★ حذف از علاقه‌مندی‌ها' : '☆ افزودن به علاقه‌مندی‌ها';
    }
    paintFav();
    F(favBtn, ctx, { onEnter: function () { Favorites.toggle(item); paintFav(); } });
    info.appendChild(favBtn);
    head.appendChild(poster);
    head.appendChild(info);
    page.appendChild(head);

    var body = h('div', 'series-body');
    page.appendChild(body);
    body.appendChild(h('div', 'empty-note', 'در حال دریافت فصل‌ها و قسمت‌ها…'));

    Source.seriesGroups(item).then(function (groups) {
      body.innerHTML = '';
      Nav.clearScope(body);
      if (!groups.length) {
        body.appendChild(h('div', 'empty-note', 'لینک مستقیمی پیدا نشد'));
        return;
      }
      // group by season, keep quality order inside
      var seasons = [], bySeason = {};
      groups.forEach(function (g) {
        var s = g.season || 'فصل ۱';
        if (!bySeason[s]) { bySeason[s] = []; seasons.push(s); }
        bySeason[s].push(g);
      });
      var tabs = h('div', 'tabs scroller');
      var epsWrap = h('div', 'eps-wrap');
      body.appendChild(tabs);
      body.appendChild(epsWrap);
      var tabKeys = [];

      function showSeason(s) {
        epsWrap.innerHTML = '';
        Nav.clearScope(epsWrap);
        var grid = h('div', 'eps-grid');
        epsWrap.appendChild(grid);
        // episodes = union of items across quality groups (use best-quality group)
        var best = bySeason[s][0];
        best.items.forEach(function (ep, idx) {
          var b = h('div', 'ep-btn', '<span>' + esc(ep.label || ('قسمت ' + (idx + 1))) + '</span>');
          F(b, ctx, {
            onEnter: function () {
              App.push('quality', {
                title: item.title, poster: item.poster,
                season: s, epIndex: idx, groups: bySeason[s]
              });
            }
          });
          grid.appendChild(b);
        });
        var firstEp = grid.querySelector('[data-snk]');
        if (firstEp && !ctx.lastKey) Nav.focus(firstEp._snKey);
      }

      seasons.forEach(function (s, i) {
        var t = h('div', 'tab' + (i === 0 ? ' active' : ''), '<span>' + esc(s) + '</span>');
        F(t, ctx, {
          onEnter: function () {
            var all = tabs.querySelectorAll('.tab');
            for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
            t.classList.add('active');
            showSeason(s);
          }
        });
        tabKeys.push(t);
        tabs.appendChild(t);
      });
      showSeason(seasons[0]);
      if (!ctx.lastKey) focusFirst(ctx);
      Log.log('detail', true, 'series seasons ' + seasons.length);
    }).catch(function () {
      body.innerHTML = '';
      Nav.clearScope(body);
      body.appendChild(errorBox(ctx, 'خطا در دریافت لینک‌ها', function () {
        App.replace('seriesDetail', { item: item });
      }));
      if (!ctx.lastKey) focusFirst(ctx);
    });
  }

  /* ---------------------------- quality picker -------------------------- */
  // params: {title, poster, season, epIndex, groups}
  // For movies the caller passes groups with one item each; for series, groups
  // of the chosen season and the episode index inside them.
  function renderQuality(el, ctx, p) {
    var page = h('div', 'page detail-page scroller');
    el.appendChild(page);
    var head = h('div', 'detail-head slim');
    if (p.poster) {
      var poster = h('div', 'detail-poster small');
      var img = document.createElement('img');
      img.setAttribute('src', p.poster);
      img.setAttribute('alt', '');
      poster.appendChild(img);
      head.appendChild(poster);
    }
    var info = h('div', 'detail-info');
    info.appendChild(h('h1', 'detail-title', esc(p.title)));
    var epLabel = p.episodeLabel || (p.season ? p.season + ' — قسمت ' + (p.epIndex + 1) : '');
    if (epLabel) info.appendChild(h('div', 'detail-sub', esc(epLabel)));
    head.appendChild(info);
    page.appendChild(head);

    page.appendChild(sectionHead('انتخاب کیفیت'));
    var list = h('div', 'qlist');
    page.appendChild(list);

    p.groups.forEach(function (g) {
      var items = NilfScrape.preferMp4(g.items);
      var ep = (p.epIndex !== undefined && p.epIndex !== null) ? items[p.epIndex] : items[0];
      if (!ep) return;
      var label = (g.section ? g.section + ' — ' : '') +
        (g.quality || 'کیفیت نامشخص') +
        (g.encoder ? ' (' + g.encoder + ')' : '');
      var row = h('div', 'qrow',
        '<span class="qrow-play">▶</span><span class="qrow-label">' + esc(label) + '</span>');
      // full episode list of THIS quality, for next-episode chaining
      var eps = items.map(function (it) { return { label: it.label, url: it.url }; });
      var myIdx = (p.epIndex !== undefined && p.epIndex !== null) ? p.epIndex : 0;
      F(row, ctx, {
        onEnter: function () {
          var best = NilfScrape.preferMp4([{ url: ep.url, label: ep.label }])[0];
          Player.open({
            url: best.url, title: p.title,
            label: (p.season ? p.season + ' ' : '') + (ep.label || ''),
            episodes: eps, epIndex: myIdx
          });
        }
      });
      list.appendChild(row);
    });
    if (!ctx.lastKey) focusFirst(ctx);
  }

  /* ------------------------------- search ------------------------------- */
  var KB = {
    fa: [
      ['ا', 'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح'],
      ['خ', 'د', 'ذ', 'ر', 'ز', 'ژ', 'س', 'ش'],
      ['ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق'],
      ['ک', 'گ', 'ل', 'م', 'ن', 'و', 'ه', 'ی'],
      ['آ', 'ئ', 'ء', 'أ', '‌']
    ],
    en: [
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      ['i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'],
      ['q', 'r', 's', 't', 'u', 'v', 'w', 'x'],
      ['y', 'z', "'", '-', '.', ':', '&', '!']
    ],
    num: [
      ['1', '2', '3', '4', '5'],
      ['6', '7', '8', '9', '0']
    ]
  };

  function renderSearch(el, ctx) {
    el.appendChild(buildRail(ctx, 'search'));
    var page = h('div', 'page with-rail');
    el.appendChild(page);
    page.appendChild(sectionHead('جستجو'));

    var query = '';
    var layout = 'fa';
    var qbox = h('div', 'query-box', '<span class="query-text"></span><span class="query-caret">|</span>');
    page.appendChild(qbox);

    var kbWrap = h('div', 'kb-wrap');
    page.appendChild(kbWrap);
    var resultsTitle = h('div', 'row-title', 'نتایج');
    resultsTitle.style.display = 'none';
    page.appendChild(resultsTitle);
    var results = h('div', 'grid scroller search-results');
    page.appendChild(results);

    var searchTimer = null;
    function paintQuery() {
      qbox.querySelector('.query-text').textContent = query;
    }

    function doSearch() {
      clearTimeout(searchTimer);
      if (!query) {
        results.innerHTML = '';
        Nav.clearScope(results);
        resultsTitle.style.display = 'none';
        return;
      }
      searchTimer = setTimeout(function () {
        resultsTitle.style.display = '';
        results.innerHTML = '';
        Nav.clearScope(results);
        results.appendChild(h('div', 'empty-note', 'در حال جستجو…'));
        var q = query;
        Promise.all([Source.search('movie', q), Source.search('series', q)]).then(function (rs) {
          if (q !== query) return; // stale
          results.innerHTML = '';
          Nav.clearScope(results);
          var all = rs[0].concat(rs[1]);
          if (!all.length) results.appendChild(h('div', 'empty-note', 'نتیجه‌ای پیدا نشد'));
          all.forEach(function (it) {
            results.appendChild(card(it, ctx, function () {
              App.push(it.type === 'series' ? 'seriesDetail' : 'movie', { item: it });
            }));
          });
          Log.log('search', true, q + ' -> ' + all.length);
        }).catch(function (err) {
          results.innerHTML = '';
          Nav.clearScope(results);
          results.appendChild(h('div', 'empty-note', 'خطا در جستجو'));
          Log.log('search', false, err.message);
        });
      }, 450);
    }

    function buildKb() {
      kbWrap.innerHTML = '';
      Nav.clearScope(kbWrap);
      var kb = h('div', 'keyboard');
      kb.setAttribute('dir', layout === 'fa' ? 'rtl' : 'ltr');
      KB[layout].forEach(function (row) {
        var r = h('div', 'kb-row');
        row.forEach(function (c) {
          var wide = (c === '‌');
          var key = h('div', 'key' + (wide ? ' wide' : ''), '<span>' + (wide ? 'نیم‌فاصله' : esc(c)) + '</span>');
          F(key, ctx, {
            onEnter: function () { query += c; paintQuery(); doSearch(); }
          });
          r.appendChild(key);
        });
        kb.appendChild(r);
      });
      var r2 = h('div', 'kb-row');
      var actions = [
        { label: 'فاصله', fn: function () { if (query && query.slice(-1) !== ' ') { query += ' '; paintQuery(); doSearch(); } } },
        { label: '⌫', fn: function () { query = query.slice(0, -1); paintQuery(); doSearch(); } },
        { label: 'پاک', fn: function () { query = ''; paintQuery(); doSearch(); } },
        { label: layout === 'fa' ? 'EN' : 'فا', fn: function () { layout = layout === 'fa' ? 'en' : 'fa'; buildKb(); focusKeyByLabel(layout === 'en' ? 'فا' : 'EN'); } },
        { label: layout === 'num' ? 'حروف' : '۱۲۳', fn: function () { layout = layout === 'num' ? 'fa' : 'num'; buildKb(); focusKeyByLabel(layout === 'num' ? 'حروف' : '۱۲۳'); } }
      ];
      actions.forEach(function (a) {
        var key = h('div', 'key wide', '<span>' + esc(a.label) + '</span>');
        F(key, ctx, { onEnter: a.fn });
        r2.appendChild(key);
      });
      kb.appendChild(r2);
      kbWrap.appendChild(kb);
      var first = kbWrap.querySelector('[data-snk]');
      if (first && !ctx.lastKey) Nav.focus(first._snKey);
    }

    // After a layout switch the previously focused key is gone; focus the
    // toggle in its new form (or fall back to the first key).
    function focusKeyByLabel(label) {
      var keys = kbWrap.querySelectorAll('.key');
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].textContent === label && keys[i]._snKey) {
          ctx.lastKey = keys[i]._snKey;
          Nav.focus(keys[i]._snKey);
          return;
        }
      }
      var first = kbWrap.querySelector('[data-snk]');
      if (first) { ctx.lastKey = first._snKey; Nav.focus(first._snKey); }
    }

    buildKb();
  }

  /* ------------------------------ favorites ----------------------------- */
  function renderFavorites(el, ctx) {
    el.appendChild(buildRail(ctx, 'favorites'));
    var page = h('div', 'page with-rail');
    el.appendChild(page);
    page.appendChild(sectionHead('علاقه‌مندی‌ها'));
    var grid = h('div', 'grid scroller');
    page.appendChild(grid);
    var favs = Favorites.all();
    if (!favs.length) {
      grid.appendChild(h('div', 'empty-note', 'هنوز چیزی ذخیره نشده است'));
    }
    favs.forEach(function (it) {
      var wrap = h('div', 'fav-wrap');
      var c = card(it, ctx, function () {
        App.push(it.type === 'series' ? 'seriesDetail' : 'movie', { item: it });
      });
      wrap.appendChild(c);
      var del = h('div', 'fav-del', '<span>حذف ✕</span>');
      F(del, ctx, {
        onEnter: function () {
          Favorites.remove(it.id, it.type);
          App.replace('favorites', {});
        }
      });
      wrap.appendChild(del);
      grid.appendChild(wrap);
    });
    if (!ctx.lastKey) focusFirst(ctx);
  }

  /* ------------------------------ dispatcher ---------------------------- */
  function render(name, el, ctx, params) {
    params = params || {};
    switch (name) {
      case 'home': renderHome(el, ctx); break;
      case 'movies': renderGrid(el, ctx, 'movie'); break;
      case 'series': renderGrid(el, ctx, 'series'); break;
      case 'movie': renderMovie(el, ctx, params.item); break;
      case 'seriesDetail': renderSeries(el, ctx, params.item); break;
      case 'quality': renderQuality(el, ctx, params); break;
      case 'search': renderSearch(el, ctx); break;
      case 'favorites': renderFavorites(el, ctx); break;
      default: renderHome(el, ctx);
    }
  }

  return {
    render: render, restore: restore, focusFirst: focusFirst,
    SECTIONS: SECTIONS
  };
})();
