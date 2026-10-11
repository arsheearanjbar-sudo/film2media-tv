/* Minimal lodash-es subset for @noriginmedia/norigin-spatial-navigation-core.
 * Implements exactly the 10 functions the bundle uses, with lodash-compatible
 * semantics for the call patterns used (arrays/objects, function iteratees).
 * Written fresh for this project. */
var __lodashEs = (function () {
  'use strict';

  function findKey(obj, pred) {
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        if (pred(obj[k], k, obj)) return k;
      }
    }
    return undefined;
  }

  function sortBy(arr, iteratee) {
    var fn = typeof iteratee === 'function'
      ? iteratee
      : function (v) { return v[iteratee]; };
    var mapped = arr.map(function (v, i) { return { v: v, i: i, c: fn(v) }; });
    mapped.sort(function (a, b) {
      if (a.c < b.c) return -1;
      if (a.c > b.c) return 1;
      return a.i - b.i; // stable
    });
    return mapped.map(function (m) { return m.v; });
  }

  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      if (s) for (var k in s) {
        if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k];
      }
    }
    return t;
  }

  function throttle(fn, wait, opts) {
    var leading = !opts || opts.leading !== false;
    var trailing = !!opts && !!opts.trailing;
    var last = 0, timer = null, lastCtx = null, lastArgs = null;
    function invoke() { last = Date.now(); fn.apply(lastCtx, lastArgs); timer = null; }
    function throttled() {
      lastCtx = this; lastArgs = arguments;
      var now = Date.now();
      var remaining = wait - (now - last);
      if (remaining <= 0) {
        if (timer) { clearTimeout(timer); timer = null; }
        invoke();
      } else if (trailing && !timer) {
        timer = setTimeout(invoke, remaining);
      }
    }
    throttled.cancel = function () { if (timer) { clearTimeout(timer); timer = null; } };
    return throttled;
  }

  function debounce(fn, wait, opts) {
    var leading = !!opts && !!opts.leading;
    var trailing = !opts || opts.trailing !== false;
    var timer = null, lastCtx = null, lastArgs = null;
    function invoke() { timer = null; fn.apply(lastCtx, lastArgs); }
    function debounced() {
      lastCtx = this; lastArgs = arguments;
      var callNow = leading && !timer;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; if (trailing) invoke(); }, wait);
      if (callNow) fn.apply(lastCtx, lastArgs);
    }
    debounced.cancel = function () { if (timer) { clearTimeout(timer); timer = null; } };
    debounced.flush = function () { if (timer) { clearTimeout(timer); invoke(); } };
    return debounced;
  }

  function filter(coll, pred) {
    var out = [];
    if (Array.isArray(coll)) {
      for (var i = 0; i < coll.length; i++) {
        if (pred(coll[i], i, coll)) out.push(coll[i]);
      }
    } else {
      for (var k in coll) {
        if (Object.prototype.hasOwnProperty.call(coll, k) && pred(coll[k], k, coll)) out.push(coll[k]);
      }
    }
    return out;
  }

  function first(a) { return (a && a.length) ? a[0] : undefined; }

  function difference(arr) {
    var vals = [];
    for (var i = 1; i < arguments.length; i++) {
      var v = arguments[i];
      if (Array.isArray(v)) vals = vals.concat(v); else vals.push(v);
    }
    return arr.filter(function (x) { return vals.indexOf(x) < 0; });
  }

  function forEach(coll, fn) {
    if (Array.isArray(coll)) {
      for (var i = 0; i < coll.length; i++) fn(coll[i], i, coll);
    } else {
      for (var k in coll) {
        if (Object.prototype.hasOwnProperty.call(coll, k)) fn(coll[k], k, coll);
      }
    }
    return coll;
  }

  function forOwn(obj, fn) {
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        if (fn(obj[k], k, obj) === false) break;
      }
    }
    return obj;
  }

  return {
    findKey: findKey, sortBy: sortBy, assign: assign, throttle: throttle,
    filter: filter, first: first, difference: difference, forEach: forEach,
    debounce: debounce, forOwn: forOwn
  };
})();
