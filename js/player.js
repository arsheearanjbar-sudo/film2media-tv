/* player.js — fullscreen player overlay.
 * Engine: webapis.avplay when available (best .mkv support), HTML5 <video> fallback.
 * Remote UX (borrowed pattern): controls auto-hide; Left/Right seek ±10s
 * (fast repeats escalate to 30s/60s, commits 700ms after last press, preview bar);
 * Up/Down show controls; OK toggles pause + shows controls; Back leaves player;
 * 10s next-episode countdown near the end (any key cancels).
 * Subtitles: not needed — site content is hardsubbed. */
var Player = (function () {
  'use strict';

  var HIDE_AFTER_MS = 5000;
  var SEEK_COMMIT_MS = 700;
  var SEEK_BURST_MS = 450;
  var TAIL_S = 25;
  var AUTO_NEXT_S = 10;

  var root = null, videoEl = null;
  var els = {};
  var engine = null;
  var openFlag = false;
  var onCloseCb = null;

  var state = {
    title: '', url: '', next: null,
    time: 0, duration: 0, paused: true, buffering: true,
    controlsVisible: true, seekTarget: null, countdown: null, countdownFrom: 0,
    prepared: false
  };
  var hideTimer = null, seekTimer = null;
  var burst = { n: 0, at: 0, dir: 0 };

  function $(id) { return document.getElementById(id); }

  function clock(s) {
    if (!isFinite(s) || s < 0) return '--:--';
    s = Math.floor(s);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return h ? h + ':' + p(m) + ':' + p(sec) : p(m) + ':' + p(sec);
  }

  function faDigits(s) {
    var fa = '۰۱۲۳۴۵۶۷۸۹';
    return String(s).replace(/[0-9]/g, function (d) { return fa[+d]; });
  }

  /* ------------------------------ engines ------------------------------ */
  function avplayEngine(url, ev) {
    var av = window.webapis.avplay;
    var prepared = false;
    return {
      open: function () {
        try { av.stop(); } catch (e) {}
        try {
          av.open(url);
          av.setDisplayRect(0, 0, 1920, 1080);
          av.setListener({
            onbufferingstart: function () { ev.onBuffering(true); },
            onbufferingprogress: function () {},
            onbufferingcomplete: function () { ev.onBuffering(false); },
            oncurrentplaytime: function (ms) { ev.onTime(ms / 1000); },
            onstreamcompleted: function () { ev.onEnded(); },
            onevent: function (type, data) {
              if (String(type).indexOf('ERROR') >= 0) ev.onError('avplay event ' + type);
            },
            onerror: function (e) { ev.onError('avplay ' + e); }
          });
          av.prepareAsync(function () {
            prepared = true;
            var d = 0;
            try { d = av.getDuration() / 1000; } catch (e) {}
            ev.onDuration(d);
            ev.onReady();
          }, function (err) { ev.onError('prepare: ' + err); });
        } catch (e) { ev.onError('open: ' + e.message); }
      },
      play: function () { try { if (prepared) av.play(); } catch (e) {} },
      pause: function () { try { if (prepared) av.pause(); } catch (e) {} },
      seek: function (sec, done) {
        try {
          av.seekTo(Math.max(0, Math.floor(sec * 1000)),
            function () { if (done) done(true); },
            function () { if (done) done(false); });
        } catch (e) { if (done) done(false); }
      },
      close: function () {
        try { av.stop(); } catch (e) {}
        try { av.close(); } catch (e) {}
      }
    };
  }

  function videoEngine(url, ev) {
    var v = videoEl;
    v.onloadedmetadata = function () { ev.onDuration(v.duration || 0); ev.onReady(); };
    v.ontimeupdate = function () { ev.onTime(v.currentTime || 0); };
    v.onended = function () { ev.onEnded(); };
    v.onerror = function () { ev.onError('video error ' + (v.error ? v.error.code : '?')); };
    v.onwaiting = function () { ev.onBuffering(true); };
    v.onplaying = function () { ev.onBuffering(false); };
    v.onstalled = function () { ev.onBuffering(true); };
    return {
      open: function () { try { v.src = url; v.load(); } catch (e) { ev.onError(e.message); } },
      play: function () { try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} },
      pause: function () { try { v.pause(); } catch (e) {} },
      seek: function (sec, done) { try { v.currentTime = sec; } catch (e) {} if (done) done(true); },
      close: function () {
        try { v.pause(); } catch (e) {}
        v.removeAttribute('src');
        try { v.load(); } catch (e) {}
      }
    };
  }

  /* ------------------------------- UI ---------------------------------- */
  function build() {
    root = document.createElement('div');
    root.id = 'player';
    root.className = 'player';
    root.hidden = true;
    root.innerHTML =
      '<video id="player-video" class="player-video" playsinline></video>' +
      '<div class="player-spinner" id="pl-spinner"><div class="spin"></div><div class="pl-load">در حال بارگذاری…</div></div>' +
      '<div class="player-top" id="pl-top"><div class="pl-title" id="pl-title"></div></div>' +
      '<div class="player-bottom" id="pl-bottom">' +
      '  <div class="pl-times"><span id="pl-cur">--:--</span><span class="pl-sep">/</span><span id="pl-dur">--:--</span></div>' +
      '  <div class="pl-bar"><div class="pl-fill" id="pl-fill"></div><div class="pl-seekmark" id="pl-seekmark"></div></div>' +
      '  <div class="pl-hint">عقب/جلو: ‎۱۰ ثانیه • بالا/پایین: نمایش کنترل • OK: توقف/پخش • بازگشت: خروج</div>' +
      '</div>' +
      '<div class="player-countdown" id="pl-countdown" hidden>' +
      '  <div class="pl-cd-label">قسمت بعد</div>' +
      '  <div class="pl-cd-title" id="pl-cd-title"></div>' +
      '  <div class="pl-cd-timer" id="pl-cd-timer"></div>' +
      '  <div class="pl-cd-hint">برای لغو هر دکمه‌ای بزنید</div>' +
      '</div>' +
      '<div class="player-error" id="pl-error" hidden>' +
      '  <div class="pl-err-title">خطا در پخش</div>' +
      '  <div class="pl-err-msg" id="pl-err-msg"></div>' +
      '  <div class="pl-err-hint">OK: تلاش مجدد • بازگشت: خروج</div>' +
      '</div>';
    document.body.appendChild(root);
    videoEl = $('player-video');
    els = {
      spinner: $('pl-spinner'), top: $('pl-top'), bottom: $('pl-bottom'),
      title: $('pl-title'), cur: $('pl-cur'), dur: $('pl-dur'),
      fill: $('pl-fill'), seekmark: $('pl-seekmark'),
      countdown: $('pl-countdown'), cdTitle: $('pl-cd-title'), cdTimer: $('pl-cd-timer'),
      error: $('pl-error'), errMsg: $('pl-err-msg')
    };
  }

  function showControls() {
    state.controlsVisible = true;
    els.top.hidden = false;
    els.bottom.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideControls, HIDE_AFTER_MS);
  }

  function hideControls() {
    if (state.seekTarget !== null) return; // keep visible while seeking
    state.controlsVisible = false;
    els.top.hidden = true;
    els.bottom.hidden = true;
  }

  function renderProgress() {
    els.cur.textContent = clock(state.time);
    els.dur.textContent = clock(state.duration);
    var pct = state.duration > 0 ? (state.time / state.duration) * 100 : 0;
    els.fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
    if (state.seekTarget !== null && state.duration > 0) {
      els.seekmark.style.display = 'block';
      els.seekmark.style.left = 'auto';
      // RTL bar: fill grows from the right
      els.seekmark.style.right = (Math.min(100, Math.max(0, (state.seekTarget / state.duration) * 100))) + '%';
    } else {
      els.seekmark.style.display = 'none';
    }
  }

  function setSpinner(on) {
    els.spinner.hidden = !on;
  }

  function showError(msg) {
    Log.log('play', false, msg);
    els.errMsg.textContent = msg;
    els.error.hidden = false;
    setSpinner(false);
  }

  function hideError() { els.error.hidden = true; }

  /* ------------------------------ control ------------------------------ */
  function doPlay() {
    hideError();
    engine.play();
    state.paused = false;
    Log.log('play', true, state.url.slice(0, 90));
  }

  function doPause() {
    engine.pause();
    state.paused = true;
  }

  function togglePause() {
    if (state.paused) doPlay(); else doPause();
    showControls();
  }

  function clampT(t) {
    if (!isFinite(state.duration) || state.duration <= 0) return Math.max(0, t);
    return Math.max(0, Math.min(state.duration - 1, t));
  }

  function nudge(dir, base) {
    base = base || 10;
    cancelCountdown();
    var now = Date.now();
    if (now - burst.at < SEEK_BURST_MS && burst.dir === dir) burst.n += 1;
    else burst.n = 0;
    burst.at = now;
    burst.dir = dir;
    var step = base * (burst.n < 4 ? 1 : burst.n < 10 ? 3 : 6);
    var cur = state.seekTarget !== null ? state.seekTarget : state.time;
    state.seekTarget = clampT(cur + dir * step);
    showControls();
    renderProgress();
    Log.log('seek', true, (dir > 0 ? '+' : '') + step + 's -> ' + Math.round(state.seekTarget) + 's');
    clearTimeout(seekTimer);
    seekTimer = setTimeout(commitSeek, SEEK_COMMIT_MS);
  }

  function commitSeek() {
    if (state.seekTarget === null) return;
    var t = state.seekTarget;
    state.seekTarget = null;
    renderProgress();
    engine.seek(t, function (ok) {
      if (ok) { state.time = t; renderProgress(); }
    });
  }

  function cancelCountdown() {
    if (state.countdown !== null) {
      state.countdown = null;
      els.countdown.hidden = true;
      Log.log('countdown', true, 'cancelled');
    }
  }

  function maybeCountdown() {
    if (state.countdown !== null) return;
    state.next = nextOf();
    if (!state.next || !isFinite(state.duration) || state.duration <= 0) return;
    if (state.duration - state.time <= TAIL_S) {
      state.countdown = AUTO_NEXT_S;
      state.countdownFrom = state.time;
      els.cdTitle.textContent = state.next.label || '';
      els.countdown.hidden = false;
      Log.log('countdown', true, 'started for ' + (state.next.label || 'next'));
    }
  }

  function tickCountdown() {
    if (state.countdown === null) return;
    var remain = Math.max(0, Math.ceil(AUTO_NEXT_S - (state.time - state.countdownFrom)));
    els.cdTimer.textContent = faDigits(remain) + ' ثانیه';
    if (remain <= 0) {
      var next = state.next;
      els.countdown.hidden = true;
      state.countdown = null;
      Log.log('countdown', true, 'auto-next');
      playNext(next);
    }
  }

  function playNext(next) {
    if (!next) { close(); return; }
    state.epIndex += 1;
    open({
      url: next.url, title: state.title, label: next.label,
      episodes: state.episodes, epIndex: state.epIndex
    });
  }

  function nextOf() {
    if (!state.episodes) return null;
    var n = state.episodes[state.epIndex + 1];
    return n ? { url: n.url, label: n.label } : null;
  }

  /* ------------------------------- events ------------------------------ */
  function onTime(t) {
    state.time = t;
    renderProgress();
    tickCountdown();
    maybeCountdown();
  }

  function onDuration(d) {
    state.duration = d;
    renderProgress();
  }

  function onReady() {
    state.prepared = true;
    setSpinner(false);
    doPlay();
    showControls();
  }

  function onEnded() {
    var next = nextOf();
    if (next) playNext(next);
    else close();
  }

  function onError(msg) {
    setSpinner(false);
    showError(msg);
  }

  function onBuffering(on) {
    state.buffering = on;
    if (state.prepared) setSpinner(on);
  }

  /* ------------------------------ public ------------------------------- */
  // opts: {url, title, label, episodes:[{label,url}], epIndex}
  function open(opts) {
    if (!root) build();
    closeEngine();
    clearTimeout(hideTimer);
    clearTimeout(seekTimer);
    state = {
      title: opts.title || '', url: opts.url,
      episodes: opts.episodes || null, epIndex: opts.epIndex || 0, next: null,
      time: 0, duration: 0, paused: true, buffering: true,
      controlsVisible: true, seekTarget: null, countdown: null, countdownFrom: 0,
      prepared: false
    };
    burst = { n: 0, at: 0, dir: 0 };
    els.title.textContent = state.title + (opts.label ? ' — ' + opts.label : '');
    els.error.hidden = true;
    els.countdown.hidden = true;
    setSpinner(true);
    showControls();
    renderProgress();

    var useAvplay = !!(window.webapis && window.webapis.avplay);
    videoEl.style.display = useAvplay ? 'none' : 'block';
    var ev = { onTime: onTime, onDuration: onDuration, onReady: onReady, onEnded: onEnded, onError: onError, onBuffering: onBuffering };
    engine = useAvplay ? avplayEngine(opts.url, ev) : videoEngine(opts.url, ev);
    Log.log('engine', true, useAvplay ? 'avplay' : 'html5-video');

    root.hidden = false;
    openFlag = true;
    Nav.pause();
    TV.setScreenSaver(false);
    engine.open();
  }

  function closeEngine() {
    if (engine) { try { engine.close(); } catch (e) {} engine = null; }
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    clearTimeout(hideTimer);
    clearTimeout(seekTimer);
    cancelCountdown();
    closeEngine();
    if (root) root.hidden = true;
    TV.setScreenSaver(true);
    Nav.resume();
    var cb = onCloseCb;
    onCloseCb = null;
    Log.log('player', true, 'closed');
    if (cb) cb();
  }

  function isOpen() { return openFlag; }

  function retry() {
    if (!openFlag) return;
    Log.log('play', true, 'retry');
    open({ url: state.url, title: state.title, episodes: state.episodes, epIndex: state.epIndex });
  }

  // Returns true if the key was consumed.
  function onKey(e) {
    if (!openFlag) return false;
    var kc = e.keyCode;
    if (TV.is(e, 'Red')) return false; // global debug toggle handles it
    if (!els.error.hidden) {
      if (TV.is(e, 'Enter')) { retry(); return true; }
      if (TV.is(e, 'Back')) { close(); return true; }
      return true;
    }
    if (TV.is(e, 'Back')) { close(); return true; }
    if (state.countdown !== null && kc !== 403) cancelCountdown();
    switch (kc) {
      case 37: nudge(-1); return true;   // Left
      case 39: nudge(1); return true;    // Right
      case 38: case 40: showControls(); return true; // Up/Down
      case 13: togglePause(); return true;
      case 415: doPlay(); showControls(); return true;
      case 19: doPause(); showControls(); return true;
      case 10252: togglePause(); return true;
      case 413: close(); return true;    // Stop
      case 417: nudge(1, 30); return true;
      case 412: nudge(-1, 30); return true;
      default: return false;
    }
  }

  function onClose(cb) { onCloseCb = cb; }

  return { open: open, close: close, isOpen: isOpen, onKey: onKey, onClose: onClose };
})();
