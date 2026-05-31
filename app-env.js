/* =============================================================
   app-env.js — environment convention for the Bollong.AI ecosystem
   See C:/Projects/OPERATIONS.md for the full spec.

   Drop into a static HTML page with:
     <script src="app-env.js"></script>
   at the very top of <head>, BEFORE any other script.

   Behaviour:
   - Detects env (URL ?env=… > sessionStorage > hostname default)
   - For dev/test: monkey-patches localStorage so all reads/writes are
     transparently prefixed with the env name. live is unprefixed.
   - Renders a coloured top banner (dev=blue, test=amber, live=none)
   - Exposes window.appEnv = { current, purge, switch }
   ============================================================= */
(function () {
  'use strict';
  if (window.appEnv) return; // idempotent

  /* ---- 1. Detect env ---- */
  function detectEnv() {
    var u = new URLSearchParams(location.search);
    var fromUrl = u.get('env');
    var valid = function (e) { return e === 'dev' || e === 'test' || e === 'live'; };
    if (valid(fromUrl)) {
      try { sessionStorage.setItem('app-env', fromUrl); } catch (e) {}
      return fromUrl;
    }
    try {
      var fromSess = sessionStorage.getItem('app-env');
      if (valid(fromSess)) return fromSess;
    } catch (e) {}
    var h = location.hostname || '';
    if (h === 'localhost' || h === '127.0.0.1' || h.indexOf('192.168.') === 0) return 'dev';
    if (h.indexOf('.vercel.app') !== -1 || h.indexOf('-staging.') !== -1) return 'test';
    return 'live';
  }
  var ENV = detectEnv();
  var PREFIX = (ENV === 'live') ? '' : (ENV + ':');

  /* ---- 2. Namespace localStorage transparently ---- */
  if (PREFIX) {
    try {
      var ls = window.localStorage;
      var origGet = ls.getItem.bind(ls);
      var origSet = ls.setItem.bind(ls);
      var origRm  = ls.removeItem.bind(ls);
      // Wrap only the read/write methods. length/key/clear keep raw access.
      Object.defineProperty(ls, 'getItem',    { value: function (k) { return origGet(PREFIX + k); }, configurable: true });
      Object.defineProperty(ls, 'setItem',    { value: function (k, v) { return origSet(PREFIX + k, v); }, configurable: true });
      Object.defineProperty(ls, 'removeItem', { value: function (k) { return origRm(PREFIX + k); }, configurable: true });
    } catch (e) { /* private mode or sandboxed */ }
  }

  /* ---- 3. Banner ---- */
  var STYLES = {
    dev:  { bg: '#1E5FBF', fg: '#fff', label: 'DEV — local workspace, throwaway data' },
    test: { bg: '#D97706', fg: '#fff', label: 'TEST — manual QA, safe to purge' },
    live: { bg: '',        fg: '',     label: '' },
  };
  function renderBanner() {
    if (ENV === 'live') return;
    if (document.getElementById('app-env-banner')) return;
    var style = STYLES[ENV];
    var bar = document.createElement('div');
    bar.id = 'app-env-banner';
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:99999;' +
      'background:' + style.bg + ';color:' + style.fg + ';' +
      'font:600 11px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;' +
      'letter-spacing:.06em;text-transform:uppercase;text-align:center;' +
      'padding:5px 14px;display:flex;align-items:center;gap:14px;justify-content:center;' +
      'box-shadow:0 1px 0 rgba(0,0,0,.06)';
    bar.innerHTML =
      '<span>' + style.label + '</span>' +
      '<span style="opacity:.6;font-weight:500;text-transform:none;letter-spacing:0">' +
        ' · switch: ' +
        '<a href="?env=dev"  style="color:inherit;text-decoration:underline">dev</a> · ' +
        '<a href="?env=test" style="color:inherit;text-decoration:underline">test</a> · ' +
        '<a href="?env=live" style="color:inherit;text-decoration:underline">live</a>' +
      '</span>' +
      '<button id="app-env-purge" style="margin-left:auto;background:rgba(255,255,255,.18);color:inherit;border:1px solid rgba(255,255,255,.4);border-radius:4px;padding:3px 10px;font:inherit;cursor:pointer">Purge ' + ENV + ' data</button>';
    var attach = function () {
      if (!document.body) { setTimeout(attach, 20); return; }
      document.body.appendChild(bar);
      // Nudge page content down so the banner doesn't cover anything
      document.body.style.paddingTop = (parseFloat(getComputedStyle(document.body).paddingTop) || 0) + bar.offsetHeight + 'px';
      var btn = document.getElementById('app-env-purge');
      if (btn) btn.onclick = function () {
        var n = window.appEnv.purge();
        alert('Purged ' + n + ' key' + (n === 1 ? '' : 's') + ' from ' + ENV + ' storage.');
      };
    };
    attach();
  }

  /* ---- 4. Public API ---- */
  window.appEnv = {
    current: function () { return ENV; },
    prefix:  function () { return PREFIX; },
    /* Wipe every localStorage key matching this env's prefix.
       For 'live', wipes ONLY keys without any of the dev:/test: prefixes,
       so dev/test data on the same browser is left alone. */
    purge: function () {
      var ls = window.localStorage;
      var doomed = [];
      for (var i = 0; i < ls.length; i++) {
        var k = ls.key(i);
        if (!k) continue;
        if (ENV === 'live') {
          if (k.indexOf('dev:') !== 0 && k.indexOf('test:') !== 0) doomed.push(k);
        } else {
          if (k.indexOf(PREFIX) === 0) doomed.push(k);
        }
      }
      // Use raw removeItem (we wrapped it; bypass via __proto__'s descriptor)
      var rawRm = Object.getOwnPropertyDescriptor(Storage.prototype, 'removeItem').value.bind(ls);
      doomed.forEach(function (k) { rawRm(k); });
      return doomed.length;
    },
    switch: function (e) {
      if (e !== 'dev' && e !== 'test' && e !== 'live') return;
      try { sessionStorage.setItem('app-env', e); } catch (err) {}
      location.search = '?env=' + e;
    },
  };

  /* Bootstrap the banner after DOM is ready (or now if it already is).
     Skip if `window.__appEnvSkipBanner = true` was set before this script loaded
     (Next.js / React apps use that to render the banner via a React component). */
  function maybeRenderBanner() {
    if (window.__appEnvSkipBanner) return;
    renderBanner();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeRenderBanner);
  } else {
    maybeRenderBanner();
  }
})();
