/* StageHopper "mobile apps coming soon" teaser.
 *
 * Web-only: a slim dismissible announcement bar at the top of the map /
 * gallery pages that opens a modal with a phone preview and the feature
 * pitch (geolocation + push reminders). Skipped inside the native shell —
 * the apps ARE here there — and remembered via localStorage once dismissed.
 *
 * Loaded after capacitor_bridge.js so window.twagNative is available.
 */
(function () {
  "use strict";

  // Don't show inside the native app.
  if (window.twagNative && window.twagNative.isNative && window.twagNative.isNative()) return;

  var KEY = "stagehopper_app_teaser_dismissed";
  try {
    if (localStorage.getItem(KEY) === "1") return;
  } catch (_) {}

  // --- announcement bar ---
  var bar = document.createElement("div");
  bar.className = "app-teaser-bar";
  bar.innerHTML =
    '<button class="app-teaser-open" type="button">' +
      '<span class="app-teaser-emoji" aria-hidden="true">📱</span>' +
      '<span><strong>iOS app coming soon</strong> — your location on the map + a reminder when your events start. <span class="app-teaser-cta">Learn more</span></span>' +
    '</button>' +
    '<button class="app-teaser-close" type="button" aria-label="Dismiss">×</button>';
  document.body.insertBefore(bar, document.body.firstChild);

  // --- modal ---
  var modal = document.createElement("div");
  modal.className = "app-teaser-modal";
  modal.innerHTML =
    '<div class="app-teaser-card" role="dialog" aria-modal="true" aria-label="StageHopper iOS app coming soon">' +
      '<button class="app-teaser-modal-close" type="button" aria-label="Close">×</button>' +
      '<div class="app-teaser-grid">' +
        '<img class="app-teaser-img" src="./app-teaser.png" alt="StageHopper mobile app preview">' +
        '<div class="app-teaser-copy">' +
          '<div class="app-teaser-kicker">Coming soon</div>' +
          '<h2>StageHopper for iOS</h2>' +
          '<p>The same Tech Week maps you love, now native on your phone:</p>' +
          '<ul>' +
            '<li><span aria-hidden="true">📍</span> <strong>See where you are</strong> — your live location on the map so you know what’s happening right around you.</li>' +
            '<li><span aria-hidden="true">🔔</span> <strong>Never miss a start</strong> — push notifications alert you when an event you saved is about to begin, even with the app closed.</li>' +
          '</ul>' +
          '<p class="app-teaser-foot">Boston &amp; NY Tech Week, in your pocket.</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  function dismiss() {
    try { localStorage.setItem(KEY, "1"); } catch (_) {}
    bar.remove();
    modal.remove();
    if (window.twagTrack) twagTrack("app_teaser_dismissed", {});
  }
  function openModal() {
    modal.classList.add("open");
    if (window.twagTrack) twagTrack("app_teaser_opened", {});
  }
  function closeModal() {
    modal.classList.remove("open");
  }

  bar.querySelector(".app-teaser-open").addEventListener("click", openModal);
  bar.querySelector(".app-teaser-close").addEventListener("click", dismiss);
  modal.querySelector(".app-teaser-modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });
})();
