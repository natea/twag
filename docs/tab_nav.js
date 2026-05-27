/* Preserve the current URL hash (e.g. #date=2026-05-28&q=ai) when
 * switching between Map and Gallery tabs. Intercepts clicks on .tab-nav
 * anchors and rewrites the href to include the live hash at click time,
 * so the active date AND search query carry through when you switch.
 *
 * Also builds an iOS-style fixed bottom tab bar from the same set of
 * tab links. CSS hides the top .tab-nav on narrow viewports and shows
 * the bottom one. Both use the same hash-preservation handler because
 * the bottom bar is also rendered with class="tab-nav".
 */
(function () {
  // Line-art SVG icons (~22px) for the bottom bar. Stroke uses currentColor
  // so the active state can colorize them via the parent <a>.
  var ICON_MAP =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9 4.5 3 6.75v12.75L9 17.25l6 2.25 6-2.25V4.5l-6 2.25z"/>' +
    '<path d="M9 4.5v12.75M15 6.75V19.5"/>' +
    '</svg>';
  var ICON_GALLERY =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="3"  width="8" height="8" rx="1.5"/>' +
    '<rect x="13" y="3" width="8" height="8" rx="1.5"/>' +
    '<rect x="3" y="13" width="8" height="8" rx="1.5"/>' +
    '<rect x="13" y="13" width="8" height="8" rx="1.5"/>' +
    '</svg>';

  function iconFor(label) {
    var key = (label || "").trim().toLowerCase();
    if (key === "map") return ICON_MAP;
    if (key === "gallery") return ICON_GALLERY;
    // Default placeholder for any future tab (e.g. Schedule).
    return ICON_GALLERY;
  }

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

  function buildBottomBar() {
    if (document.getElementById("bottom-tab-bar")) return;  // already built
    var topNav = document.querySelector(".tab-nav");
    if (!topNav) return;
    var links = topNav.querySelectorAll("a");
    if (!links.length) return;

    var bar = document.createElement("nav");
    bar.id = "bottom-tab-bar";
    bar.className = "tab-nav bottom-tab-bar"; // .tab-nav so rewriteOnClick picks up
    bar.setAttribute("aria-label", "Bottom tab bar");

    for (var i = 0; i < links.length; i++) {
      var src = links[i];
      var label = src.textContent.trim();
      var a = document.createElement("a");
      a.href = src.getAttribute("href");
      if (src.classList.contains("active")) a.classList.add("active");
      a.innerHTML =
        '<span class="bottom-tab-icon">' + iconFor(label) + "</span>" +
        '<span class="bottom-tab-label">' + label + "</span>";
      bar.appendChild(a);
    }
    document.body.appendChild(bar);
  }

  function init() {
    buildBottomBar();
    var links = document.querySelectorAll(".tab-nav a");
    for (var i = 0; i < links.length; i++) rewriteOnClick(links[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
