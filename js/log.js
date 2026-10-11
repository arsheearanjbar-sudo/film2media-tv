/* log.js — on-screen diagnostic log. On the TV there is no console, so each
 * network/playback step reports here; the Red key toggles the overlay. */
var Log = (function () {
  'use strict';
  var lines = [];
  var MAX = 60;
  var overlay = null;

  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function log(step, ok, detail) {
    var text = (detail === undefined || detail === null) ? ''
      : (detail instanceof Error ? detail.message : String(detail));
    lines.push({ at: stamp(), step: step, ok: !!ok, detail: text.slice(0, 180) });
    if (lines.length > MAX) lines = lines.slice(lines.length - MAX);
    if (overlay && !overlay.hidden) render();
    try { if (ok) console.log('[f2m] ' + step + ' ' + text); else console.warn('[f2m] ' + step + ' ' + text); } catch (e) {}
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render() {
    var html = '<div class="dbg-ua">' + esc(navigator.userAgent) + '</div>';
    for (var i = lines.length - 1; i >= 0; i--) {
      var l = lines[i];
      html += '<div class="' + (l.ok ? 'ok' : 'fail') + '">' + esc(l.at) + ' ' +
        (l.ok ? '&#10003;' : '&#10007;') + ' ' + esc(l.step) +
        (l.detail ? ' — ' + esc(l.detail) : '') + '</div>';
    }
    overlay.innerHTML = html;
  }

  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'debug-log';
    overlay.className = 'debug-log';
    overlay.setAttribute('dir', 'ltr');
    overlay.hidden = true;
    document.body.appendChild(overlay);
    return overlay;
  }

  function toggle() {
    ensure();
    overlay.hidden = !overlay.hidden;
    if (!overlay.hidden) render();
    return !overlay.hidden;
  }

  function isOpen() { return !!(overlay && !overlay.hidden); }

  return { log: log, toggle: toggle, isOpen: isOpen, lines: function () { return lines; } };
})();
