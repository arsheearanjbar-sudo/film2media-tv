/* nav.js — vanilla adapter over the vendored @noriginmedia
 * norigin-spatial-navigation-core (window.SpatialNavigation).
 * Each screen is a focus boundary; items register with onEnter/onFocus.
 * No CSS transitions: focus changes are instant; scrollIntoView is manual
 * (instant scrollTop/scrollLeft on the nearest .scroller). */
var Nav = (function () {
  'use strict';

  var SN = null;
  var seq = 0;

  function init() {
    var mod = window.SpatialNavigation;
    if (!mod) throw new Error('SpatialNavigation not loaded');
    // The usable API lives on the singleton instance (mod.SpatialNavigation);
    // the top-level exports are unbound method references.
    SN = mod.SpatialNavigation || mod;
    if (!SN.addFocusable) throw new Error('SpatialNavigation singleton missing');
    SN.init({ rtl: true, throttle: 80, throttleKeypresses: true });
    Log.log('nav', true, 'spatial-navigation init, rtl');
  }

  function newKey(prefix) {
    seq += 1;
    return (prefix || 'f') + '-' + seq;
  }

  function nearestScroller(el) {
    var p = el.parentElement;
    while (p && p !== document.body) {
      if (p.classList && p.classList.contains('scroller')) return p;
      p = p.parentElement;
    }
    return null;
  }

  function reveal(el) {
    var sc = nearestScroller(el);
    if (!sc) return;
    var r = el.getBoundingClientRect();
    var s = sc.getBoundingClientRect();
    if (r.top < s.top) sc.scrollTop -= (s.top - r.top);
    else if (r.bottom > s.bottom) sc.scrollTop += (r.bottom - s.bottom);
    if (r.left < s.left) sc.scrollLeft -= (s.left - r.left);
    else if (r.right > s.right) sc.scrollLeft += (r.right - s.right);
  }

  // Register a DOM element as a focusable item.
  // opts: {key, parent, onEnter, onFocus, onBlur, onArrow(dir)->bool, boundary, saveLast, focusable}
  // NOTE: the lib calls several callbacks unguarded, so every one gets at
  // least a no-op.
  function focusable(el, opts) {
    opts = opts || {};
    var key = opts.key || newKey('f');
    SN.addFocusable({
      focusKey: key,
      node: el,
      parentFocusKey: opts.parent || 'SN:ROOT',
      onEnterPress: function () { if (opts.onEnter) opts.onEnter(); },
      onEnterRelease: function () {},
      onArrowPress: function (dir, details) { if (opts.onArrow) opts.onArrow(dir, details); },
      onArrowRelease: function () {},
      onFocus: function () {
        el.classList.add('focused');
        reveal(el);
        if (opts.onFocus) opts.onFocus();
      },
      onBlur: function () {
        el.classList.remove('focused');
        if (opts.onBlur) opts.onBlur();
      },
      onUpdateFocus: function () {},
      onUpdateHasFocusedChild: function () {},
      isFocusBoundary: !!opts.boundary,
      saveLastFocusedChild: !!opts.saveLast,
      focusable: opts.focusable !== false
    });
    el._snKey = key;
    el.setAttribute('data-snk', '1');
    return key;
  }

  // Register a screen container as a focus boundary.
  function boundary(el, id) {
    return focusable(el, { key: 'screen-' + id, boundary: true, saveLast: true, focusable: false });
  }

  function remove(el) {
    var k = el && el._snKey;
    if (k) {
      try { SN.removeFocusable({ focusKey: k }); } catch (e) {}
      el._snKey = null;
      el.removeAttribute('data-snk');
    }
  }

  // Unregister every focusable inside root (call before re-render/remove).
  function clearScope(root) {
    var els = root.querySelectorAll('[data-snk]');
    for (var i = 0; i < els.length; i++) remove(els[i]);
  }

  function focus(key) {
    try {
      if (SN.doesFocusableExist(key)) SN.setFocus(key);
    } catch (e) { Log.log('nav', false, 'setFocus ' + e.message); }
  }

  function currentKey() {
    try { return SN.getCurrentFocusKey(); } catch (e) { return null; }
  }

  function pause() { try { SN.pause(); } catch (e) {} }
  function resume() { try { SN.resume(); } catch (e) {} }

  function exists(key) {
    try { return SN.doesFocusableExist(key); } catch (e) { return false; }
  }

  return {
    init: init, focusable: focusable, boundary: boundary,
    remove: remove, clearScope: clearScope,
    focus: focus, currentKey: currentKey, exists: exists,
    pause: pause, resume: resume, newKey: newKey
  };
})();
