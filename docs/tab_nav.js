/* Preserve the current URL hash (e.g. #date=2026-05-28) when switching
 * between Map and Gallery tabs. Intercepts clicks on .tab-nav anchors
 * and rewrites the href to include the live hash at click time, so
 * changing the date on one tab carries through when you switch.
 */
(function () {
  function viewOf(href) {
    if (href.indexOf("events_map_") !== -1) return "map";
    if (href.indexOf("events_gallery_") !== -1) return "gallery";
    if (href.indexOf("events_schedule_") !== -1) return "schedule";
    return "other";
  }
  function cityOf(href) {
    var m = href.match(/events_(?:map|gallery|schedule)_([a-z]+)\./);
    return m ? m[1] : "";
  }

  function rewriteOnClick(anchor) {
    anchor.addEventListener("click", function (event) {
      var href = anchor.getAttribute("href") || "";
      if (window.twagTrack) {
        var fromHref = window.location.pathname;
        twagTrack("tab_switched", {
          city: cityOf(href) || cityOf(fromHref),
          from: viewOf(fromHref),
          to: viewOf(href),
        });
      }
      var hash = window.location.hash;
      if (!hash) return;
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
