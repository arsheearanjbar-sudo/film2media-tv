/* tv.js — Samsung remote key codes + TV helpers. */
var TV = (function () {
  'use strict';

  var Keys = {
    Back: [10009, 8, 461],        // Return, Backspace, XF86Back
    Enter: [13],
    Left: [37], Up: [38], Right: [39], Down: [40],
    Play: [415], Pause: [19], Stop: [413],
    PlayPause: [10252],
    FastForward: [417], Rewind: [412],
    Red: [403, 82],               // ColorF0Red, 'r' on desktop
    Green: [404], Yellow: [405], Blue: [406]
  };

  function is(e, name) {
    var list = Keys[name] || [];
    for (var i = 0; i < list.length; i++) {
      if (e.keyCode === list[i]) return true;
    }
    return false;
  }

  function isTizen() { return typeof window.tizen !== 'undefined'; }

  // Media and color keys are not delivered to web apps until registered.
  function registerTvKeys() {
    var input = window.tizen && window.tizen.tvinputdevice;
    if (!input || !input.registerKey) return;
    var names = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
      'MediaFastForward', 'MediaRewind', 'MediaTrackNext', 'MediaTrackPrevious',
      'ColorF0Red', 'ColorF0Green', 'ColorF0Yellow', 'ColorF0Blue'];
    for (var i = 0; i < names.length; i++) {
      try { input.registerKey(names[i]); } catch (e) { /* older firmware */ }
    }
  }

  // Scroll areas are real scrollers (GPU); spatial navigation owns the arrows,
  // so the browser's native arrow-scroll is switched off.
  function blockNativeArrowScroll() {
    window.addEventListener('keydown', function (e) {
      if (e.keyCode >= 37 && e.keyCode <= 40) e.preventDefault();
    }, true);
  }

  // The TV starts its screensaver after a few idle minutes, even over video.
  function setScreenSaver(on) {
    var app = window.webapis && window.webapis.appcommon;
    if (!app || !app.setScreenSaver) return;
    try {
      var s = app.AppCommonScreenSaverState;
      app.setScreenSaver(on ? s.SCREEN_SAVER_ON : s.SCREEN_SAVER_OFF);
    } catch (e) { /* not every firmware exposes it */ }
  }

  function exitApp() {
    try {
      var app = window.tizen && window.tizen.application;
      if (app && app.getCurrentApplication) app.getCurrentApplication().exit();
    } catch (e) {}
  }

  return {
    Keys: Keys, is: is, isTizen: isTizen, registerTvKeys: registerTvKeys,
    blockNativeArrowScroll: blockNativeArrowScroll,
    setScreenSaver: setScreenSaver, exitApp: exitApp
  };
})();
