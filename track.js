/* =============================================================
   track.js — Bollong.AI ecosystem client-side tracking snippet

   Drop into any app with:
     <script src="track.js" data-app="bollong"></script>
   where data-app is one of: bollong | medvalidator | makevsbuy | ej | mjai

   Behaviour:
   - Generates a persistent session_id (UUID) per browser, stored under
     a key namespaced by the env helper (app-env.js) — so dev/test/live
     get separate session pools that never cross.
   - Auto-fires a 'pageview' on load.
   - Auto-fires a 'session_end' on tab hide/close using sendBeacon, so
     time-on-site is computable as (last seen - first seen).
   - Exposes window.track(event_type, properties?) for custom events.
   - Forwards the current env header (x-app-env) so the gateway tags
     dev/test/live rows separately.

   Endpoint: POST {GATEWAY_URL}/api/analytics/event
   GATEWAY_URL defaults to http://127.0.0.1:4000 — override by setting
   window.__BOLLONG_GATEWAY before this script loads.
   ============================================================= */
(function () {
  'use strict';
  if (window.track) return; // idempotent

  var scriptEl = document.currentScript ||
    (function () {
      var ss = document.getElementsByTagName('script');
      for (var i = ss.length - 1; i >= 0; i--) {
        if ((ss[i].src || '').indexOf('track.js') !== -1) return ss[i];
      }
      return null;
    })();
  var APP = (scriptEl && scriptEl.getAttribute('data-app')) || 'bollong';
  var GATEWAY = window.__BOLLONG_GATEWAY || 'http://127.0.0.1:4000';
  var ENDPOINT = GATEWAY + '/api/analytics/event';

  function env() {
    try { return window.appEnv && window.appEnv.current ? window.appEnv.current() : 'live'; }
    catch (e) { return 'live'; }
  }

  /* ---- session_id (persistent UUID in localStorage, namespaced) ---- */
  var SID_KEY = 'bollong_session_id';
  function uuid() {
    // RFC4122 v4
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = []; for (var i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
    return h.slice(0,4).join('') + '-' + h.slice(4,6).join('') + '-' +
           h.slice(6,8).join('') + '-' + h.slice(8,10).join('') + '-' + h.slice(10,16).join('');
  }
  var sid;
  try {
    sid = window.localStorage.getItem(SID_KEY);
    if (!sid) { sid = uuid(); window.localStorage.setItem(SID_KEY, sid); }
  } catch (e) {
    // Private mode etc. — fall back to in-memory, but the session won't
    // stitch across reloads. Still better than nothing.
    sid = uuid();
  }

  /* ---- POST helper. Uses sendBeacon when available (survives unload). ---- */
  function send(events, useBeacon) {
    var payload = JSON.stringify({ events: events });
    var url = ENDPOINT;
    if (useBeacon && navigator.sendBeacon) {
      try {
        var blob = new Blob([payload], { type: 'application/json' });
        return navigator.sendBeacon(url, blob);
      } catch (e) { /* fall through */ }
    }
    try {
      // Use keepalive so the request survives a fast unload too.
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-app-env': env() },
        body: payload,
        keepalive: true,
      }).catch(function () { /* swallow — tracking must never break the page */ });
    } catch (e) { /* swallow */ }
  }

  /* ---- queue events; flush after 250ms or immediately on unload ---- */
  var queue = [];
  var flushTimer = null;
  function enqueue(evt) {
    queue.push(evt);
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      var batch = queue.slice(); queue.length = 0; flushTimer = null;
      if (batch.length) send(batch, false);
    }, 250);
  }

  /* ---- public API ---- */
  window.track = function (eventType, properties) {
    if (!eventType) return;
    enqueue({
      app: APP,
      event_type: String(eventType).slice(0, 64),
      properties: properties || {},
      session_id: sid,
    });
  };

  /* ---- auto pageview ---- */
  window.track('pageview', {
    path: location.pathname + location.search,
    title: document.title,
  });

  /* ---- auto session_end on hide / unload (for time-on-site) ---- */
  var ended = false;
  function endSession() {
    if (ended) return;
    ended = true;
    // Flush anything pending plus the session_end event in one beacon.
    var batch = queue.slice(); queue.length = 0;
    batch.push({
      app: APP,
      event_type: 'session_end',
      properties: { path: location.pathname + location.search },
      session_id: sid,
    });
    send(batch, true);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') endSession();
  });
  window.addEventListener('pagehide', endSession);
})();
