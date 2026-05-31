/* =================================================================
   quota-gate.js — Drop-in anonymous-session quota gate for any
   bollong.ai free tool. Limits anonymous use to N attempts per
   browser tab, then surfaces a Med Journey AI conversion CTA.

   Design constraints (see memory: project_medvalidator_two_modes):
     - sessionStorage only. Per-tab, ephemeral, never transmitted.
       Preserves any "stores nothing" trust commitment the host
       surface makes — the count never leaves the browser.
     - Tab close = counter resets. Intentional minor friction.
     - Single-purpose: gate anonymous attempts and convert to MJAI.

   Usage:
     <script>
       window.bollongQuotaConfig = {
         toolLabel: 'analyses',     // plural noun for "N free X left"
         toolName:  'MakeVsBuy',    // shown in CTA copy
         upgradeUrl: 'https://app.bollong.ai/upgrade',
       };
     </script>
     <script src="quota-gate.js"></script>

   Then at the top of every paid action handler in the host page:
     if (!window.bollongQuota.attempt()) return;

   `attempt()` returns true/false. On false, the CTA modal is rendered
   automatically. On true, the counter is incremented.

   Other API:
     window.bollongQuota.remaining()  — number of attempts left
     window.bollongQuota.LIMIT        — the configured cap (3)

   This module is intentionally framework-free so it drops into a
   plain HTML page, a Next.js app via <Script>, or anywhere else.
   ================================================================= */
(function (global) {
  var LIMIT = 3;
  var KEY = 'bollong_anon_attempt_count';

  var cfg = global.bollongQuotaConfig || {};
  var TOOL_LABEL  = cfg.toolLabel  || 'analyses';
  var TOOL_NAME   = cfg.toolName   || 'this tool';
  var UPGRADE_URL = cfg.upgradeUrl || 'https://app.bollong.ai/upgrade';

  function getCount() {
    try {
      var raw = global.sessionStorage.getItem(KEY);
      var n = raw ? parseInt(raw, 10) : 0;
      return (isFinite(n) && n > 0) ? n : 0;
    } catch (_e) { return 0; }
  }

  function setCount(n) {
    try { global.sessionStorage.setItem(KEY, String(n)); } catch (_e) {}
  }

  function isExceeded() { return getCount() >= LIMIT; }

  /* Render and inject the conversion CTA modal. Idempotent —
   * re-calling just brings the existing element back to the top of
   * the page rather than stacking duplicates. */
  function showCTA() {
    var existing = document.getElementById('bollong-quota-cta');
    if (existing) { existing.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }

    var overlay = document.createElement('div');
    overlay.id = 'bollong-quota-cta';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(15,20,25,0.55);backdrop-filter:blur(4px);padding:24px;';

    var panel = document.createElement('div');
    panel.style.cssText =
      'max-width:560px;width:100%;background:#fff;border-radius:16px;' +
      'box-shadow:0 24px 72px rgba(15,20,25,0.28);padding:36px 32px;' +
      'font-family:Inter,-apple-system,Segoe UI,system-ui,sans-serif;color:#1B2A4A;' +
      'border:1px solid rgba(37,99,235,0.18);';

    panel.innerHTML =
      '<div style="display:inline-block;padding:4px 10px;background:rgba(37,99,235,0.10);color:#1E40AF;' +
        'border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;' +
        'margin-bottom:16px;">' + LIMIT + ' free ' + TOOL_LABEL + ' used</div>' +
      '<h2 style="font-size:26px;font-weight:700;letter-spacing:-0.015em;color:#1B2A4A;margin:0 0 12px;line-height:1.18;">' +
        'Keep going with Med Journey AI' +
      '</h2>' +
      '<p style="font-size:15px;color:#4B5560;line-height:1.6;margin:0 0 22px;">' +
        'You&rsquo;ve used the ' + LIMIT + ' free ' + TOOL_LABEL + ' this session allows on ' + TOOL_NAME + '. ' +
        'Med Journey AI gives you unlimited use, saved work, downloadable PDF reports, ' +
        'and the full founder workspace &mdash; eight stages from concept through 510(k) clearance, ' +
        'plus EWS early-warning intelligence.' +
      '</p>' +
      '<ul style="list-style:none;padding:0;margin:0 0 24px;display:grid;grid-template-columns:repeat(2,1fr);' +
        'gap:10px;font-size:13.5px;color:#1B2A4A;">' +
        '<li>&#10003;&nbsp;Unlimited ' + TOOL_LABEL + '</li>' +
        '<li>&#10003;&nbsp;Saved work &amp; reports</li>' +
        '<li>&#10003;&nbsp;Downloadable PDF briefs</li>' +
        '<li>&#10003;&nbsp;Pre-Sub &amp; QMS workspaces</li>' +
        '<li>&#10003;&nbsp;Predicate &amp; competitor tracking</li>' +
        '<li>&#10003;&nbsp;EWS risk monitoring</li>' +
      '</ul>' +
      '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
        '<a href="' + UPGRADE_URL + '" style="display:inline-block;padding:13px 26px;background:#1B2A4A;' +
          'color:#fff;border-radius:8px;font-size:14.5px;font-weight:600;text-decoration:none;' +
          'box-shadow:0 2px 8px rgba(27,42,74,0.18);">Start 14-day free trial &rarr;</a>' +
        '<button type="button" id="bollong-quota-dismiss" style="background:transparent;border:none;color:#6B7280;' +
          'font-size:13px;font-family:inherit;cursor:pointer;text-decoration:underline;">' +
          'Maybe later</button>' +
      '</div>' +
      '<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid rgba(37,99,235,0.16);' +
        'font-size:11.5px;color:#6B7280;line-height:1.5;">' +
        'This session&rsquo;s count lives only in your browser tab and isn&rsquo;t sent anywhere. ' +
        'Closing the tab resets the counter. If you&rsquo;d like to keep your work across sessions and devices, ' +
        'a Med Journey AI account is the right call.' +
      '</p>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    /* Close on backdrop click or "Maybe later" — but the gate stays
     * armed; trying another action just re-opens this CTA. */
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    var dismiss = document.getElementById('bollong-quota-dismiss');
    if (dismiss) dismiss.addEventListener('click', function () { overlay.remove(); });
  }

  global.bollongQuota = {
    LIMIT: LIMIT,
    /** Returns the number of attempts remaining in this tab session. */
    remaining: function () { return Math.max(0, LIMIT - getCount()); },
    /** Returns true if the host should proceed; false if blocked. On
     *  block, the CTA modal is rendered automatically. On allow, the
     *  counter is incremented and the new remaining count is returned
     *  on bollongQuota.remaining(). */
    attempt: function () {
      if (isExceeded()) { showCTA(); return false; }
      setCount(getCount() + 1);
      return true;
    },
    /** Optional: render the same CTA on demand (e.g. for a manual
     *  "upgrade" link). */
    showCTA: showCTA,
  };
})(window);
