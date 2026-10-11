/* app.js — screen stack + global key handling + boot.
 * Screens below the top stay mounted (hidden) so Back restores the exact item. */
var App = (function () {
  'use strict';

  var stack = [];
  var screenSeq = 0;
  var screensEl = null;

  function current() { return stack[stack.length - 1]; }

  function push(name, params) {
    var cur = current();
    if (cur) cur.el.hidden = true;
    var el = document.createElement('div');
    el.className = 'screen';
    screensEl.appendChild(el);
    screenSeq += 1;
    var key = Nav.boundary(el, name + '-' + screenSeq);
    var ctx = { key: key, el: el, lastKey: null, firstKey: null, name: name };
    UI.render(name, el, ctx, params || {});
    stack.push({ name: name, params: params || {}, el: el, ctx: ctx });
    // Move focus into the new screen right away; async loaders must not steal
    // it later (they check ctx.lastKey first).
    setTimeout(function () {
      if (current() && current().ctx === ctx) UI.focusFirst(ctx);
    }, 30);
    Log.log('nav', true, 'push ' + name + ' depth=' + stack.length);
  }

  function replace(name, params) {
    if (stack.length) {
      var top = stack.pop();
      Nav.clearScope(top.el);
      if (top.el.parentNode) top.el.parentNode.removeChild(top.el);
    }
    push(name, params);
  }

  function goBack() {
    if (Player.isOpen()) { Player.close(); return; }
    if (Log.isOpen()) { Log.toggle(); return; }
    if (stack.length <= 1) { TV.exitApp(); return; }
    var top = stack.pop();
    Nav.clearScope(top.el);
    if (top.el.parentNode) top.el.parentNode.removeChild(top.el);
    var cur = current();
    cur.el.hidden = false;
    UI.restore(cur.ctx);
    Log.log('nav', true, 'back to ' + cur.name + ' depth=' + stack.length);
  }

  // Jump to a section, dropping anything stacked above home.
  function navigate(section) {
    while (stack.length > 1) {
      var top = stack.pop();
      Nav.clearScope(top.el);
      if (top.el.parentNode) top.el.parentNode.removeChild(top.el);
    }
    var cur = current();
    if (cur && cur.name === section) {
      if (cur.el.hidden) cur.el.hidden = false;
      UI.restore(cur.ctx);
      return;
    }
    push(section, {});
  }

  function onKey(e) {
    // Red toggles the debug overlay everywhere, including over the player.
    if (TV.is(e, 'Red')) { Log.toggle(); e.preventDefault(); return; }
    // Player owns its keys while open (SN is paused there).
    if (Player.isOpen()) {
      if (Log.isOpen() && TV.is(e, 'Back')) { Log.toggle(); e.preventDefault(); return; }
      if (Player.onKey(e)) e.preventDefault();
      return;
    }
    if (TV.is(e, 'Back')) { e.preventDefault(); goBack(); return; }
    // Arrows + Enter belong to spatial navigation.
  }

  function boot() {
    screensEl = document.getElementById('screens');
    try {
      TV.registerTvKeys();
      TV.blockNativeArrowScroll();
      Nav.init();
    } catch (e) {
      Log.log('boot', false, e.message);
    }
    // Backup-source notice (shown once when the primary is unreachable).
    Source.setOnFallback(function () {
      var n = document.createElement('div');
      n.className = 'fallback-notice';
      n.textContent = 'اتصال به فیلم 2 مدیا برقرار نشد — نمایش منبع جایگزین';
      document.body.appendChild(n);
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 6000);
    });
    Log.log('boot', true, TV.isTizen() ? 'tizen-tv' : 'desktop-browser');
    window.addEventListener('keydown', onKey, true);
    push('home', {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    push: push, replace: replace, goBack: goBack, navigate: navigate,
    current: current
  };
})();
