/* favorites.js — localStorage-backed favorites list. */
var Favorites = (function () {
  'use strict';
  var KEY = 'f2m_favs_v1';

  function all() {
    try {
      var raw = window.localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function save(arr) {
    try { window.localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function has(id, type) {
    return all().some(function (f) { return f.id === id && f.type === type; });
  }

  function add(item) {
    var arr = all();
    if (!has(item.id, item.type)) {
      arr.unshift({
        id: item.id, type: item.type, title: item.title, poster: item.poster, link: item.link,
        // backup-source items carry their playable data (no page to re-scrape)
        backup: !!item.backup, ccId: item.ccId, sources: item.sources
      });
      save(arr);
    }
  }

  function remove(id, type) {
    save(all().filter(function (f) { return !(f.id === id && f.type === type); }));
  }

  function toggle(item) {
    if (has(item.id, item.type)) { remove(item.id, item.type); return false; }
    add(item);
    return true;
  }

  function clear() { save([]); }

  return { all: all, has: has, add: add, remove: remove, toggle: toggle, clear: clear };
})();
