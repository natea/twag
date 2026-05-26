/* Preserve the current URL hash (e.g. #date=2026-05-28) when switching
 * between Map and Gallery tabs. Intercepts clicks on .tab-nav anchors
 * and rewrites the href to include the live hash at click time, so
 * changing the date on one tab carries through when you switch.
 */
(function () {
  function rewriteOnClick(anchor) {
    anchor.addEventListener("click", function (event) {
      var hash = window.location.hash;
      if (!hash) return;
      var href = anchor.getAttribute("href") || "";
      if (href.indexOf("#") !== -1) return; // already has its own hash, respect it
      event.preventDefault();
      window.location.href = href + hash;
    });
  }

  function init() {
    var links = document.querySelectorAll(".tab-nav a");
    for (var i = 0; i < links.length; i++) rewriteOnClick(links[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
