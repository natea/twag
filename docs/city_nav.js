/* StageHopper city switcher — a mobile-only hamburger menu (upper right) that
 * lets you jump between cities / conferences / festivals from any map or
 * gallery page. The selected in-app city is remembered in localStorage
 * ('sh_city') so the homepage can skip the landing menu on the next launch.
 *
 * Desktop (>720px, non-native) is left untouched: nothing is injected and the
 * existing page layout is unchanged.
 *
 * The CITIES array below is the single source of truth for the menu — keep it
 * in sync with the big-button menu in index.html.
 */
(function () {
  var STORAGE_KEY = 'sh_city';

  var CITIES = [
    { id: 'nyc',    label: 'Tech Week NYC',    sub: 'New York · Jun 1–7',      url: './events_map_nyc.html',    remember: true },
    { id: 'boston', label: 'Tech Week Boston', sub: 'Boston · May 26–31',     url: './events_map_boston.html', remember: true },
    { id: 'sf',     label: 'Tech Week SF',     sub: 'Coming soon!',            comingSoon: true },
    { id: 'nola',   label: 'NOLA Jazz Fest',   sub: 'New Orleans',             url: 'https://nolajazzfest.stagehopper.app', external: true, remember: false }
  ];

  // Only inside the iOS/Android Capacitor shell. Mobile web browsers see the
  // normal page (no hamburger) — same as desktop.
  function isNative() {
    return !!(window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform());
  }

  function cityById(id) {
    for (var i = 0; i < CITIES.length; i++) if (CITIES[i].id === id) return CITIES[i];
    return null;
  }

  // Which city does the current page represent (for highlighting the active row)?
  function currentCityId() {
    var p = (location.pathname || '') + ' ' + (location.hostname || '');
    if (p.indexOf('nolajazzfest') !== -1) return 'nola';
    if (p.indexOf('_boston') !== -1) return 'boston';
    if (p.indexOf('_nyc') !== -1) return 'nyc';
    if (p.indexOf('_sf') !== -1) return 'sf';
    return null;
  }

  function go(city) {
    if (!city || city.comingSoon) return;
    try { if (city.remember) localStorage.setItem(STORAGE_KEY, city.id); } catch (e) {}
    location.href = city.url;
  }

  function injectStyles() {
    if (document.getElementById('sh-nav-style')) return;
    var css = [
      '#sh-nav-toggle{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;z-index:1200;width:42px;height:42px;border-radius:50%;border:none;background:rgba(26,26,46,0.82);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;padding:0;box-shadow:0 2px 10px rgba(0,0,0,0.25);}',
      '#sh-nav-toggle span{display:block;width:18px;height:2px;background:#f5ecd9;border-radius:2px;transition:transform .25s,opacity .2s;}',
      'body.sh-nav-open #sh-nav-toggle span:nth-child(1){transform:translateY(6px) rotate(45deg);}',
      'body.sh-nav-open #sh-nav-toggle span:nth-child(2){opacity:0;}',
      'body.sh-nav-open #sh-nav-toggle span:nth-child(3){transform:translateY(-6px) rotate(-45deg);}',
      '#sh-nav-overlay{position:fixed;inset:0;z-index:1190;background:rgba(0,0,0,0.45);opacity:0;pointer-events:none;transition:opacity .25s;}',
      'body.sh-nav-open #sh-nav-overlay{opacity:1;pointer-events:auto;}',
      "#sh-nav-panel{position:fixed;top:0;right:0;bottom:0;z-index:1195;width:min(82vw,320px);background:#f5ecd9;color:#1a1a2e;transform:translateX(106%);transition:transform .28s cubic-bezier(.2,.8,.2,1);padding:calc(env(safe-area-inset-top,0px) + 64px) 0 calc(env(safe-area-inset-bottom,0px) + 24px);box-shadow:-6px 0 24px rgba(0,0,0,0.25);overflow-y:auto;font-family:'Manrope',-apple-system,system-ui,sans-serif;}",
      'body.sh-nav-open #sh-nav-panel{transform:translateX(0);}',
      ".sh-nav-head{font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#3a3a52;padding:0 22px 14px;}",
      '.sh-nav-item{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;background:none;border:none;border-top:1px solid rgba(26,26,46,.12);padding:16px 22px;cursor:pointer;color:#1a1a2e;}',
      '.sh-nav-item:last-child{border-bottom:1px solid rgba(26,26,46,.12);}',
      '.sh-nav-item.active{background:rgba(232,84,62,.12);box-shadow:inset 4px 0 0 #e8543e;}',
      '.sh-nav-item.soon{opacity:.5;cursor:default;}',
      '.sh-nav-label{font-weight:700;font-size:19px;}',
      ".sh-nav-sub{font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#3a3a52;}"
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'sh-nav-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function build() {
    // Only inside the native app. Skip the homepage (its big-button menu IS
    // the switcher) and every browser (desktop + mobile web).
    if (document.body.hasAttribute('data-sh-home')) return;
    if (!isNative()) return;
    if (document.getElementById('sh-nav-toggle')) return;

    injectStyles();

    var cur = currentCityId();

    var btn = document.createElement('button');
    btn.id = 'sh-nav-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Switch event');
    btn.innerHTML = '<span></span><span></span><span></span>';

    var overlay = document.createElement('div');
    overlay.id = 'sh-nav-overlay';

    var panel = document.createElement('nav');
    panel.id = 'sh-nav-panel';
    panel.setAttribute('aria-label', 'Events');

    var html = '<div class="sh-nav-head">Switch event</div>';
    for (var i = 0; i < CITIES.length; i++) {
      var c = CITIES[i];
      var cls = 'sh-nav-item' + (c.id === cur ? ' active' : '') + (c.comingSoon ? ' soon' : '');
      html += '<button type="button" class="' + cls + '" data-id="' + c.id + '"' +
        (c.comingSoon ? ' disabled aria-disabled="true"' : '') + '>' +
        '<span class="sh-nav-label">' + c.label + '</span>' +
        '<span class="sh-nav-sub">' + c.sub + '</span>' +
        '</button>';
    }
    panel.innerHTML = html;

    document.body.appendChild(btn);
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    function close() { document.body.classList.remove('sh-nav-open'); }
    btn.addEventListener('click', function () { document.body.classList.toggle('sh-nav-open'); });
    overlay.addEventListener('click', close);
    panel.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('.sh-nav-item') : null;
      if (!t || t.disabled) return;
      go(cityById(t.getAttribute('data-id')));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
