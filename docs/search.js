/* TWAG client-side fuzzy search.
 *
 * Builds a Fuse.js index over the events array passed in, wires the
 * #search input (debounced ~120 ms), and notifies the caller whenever
 * the matching set changes. The query is mirrored to the URL hash as
 * `q=...` so search state survives tab switches (tab_nav.js carries
 * the full hash across).
 *
 * Usage from events_map.js / events_gallery.js:
 *
 *   const search = initSearch({
 *     events: fullGeoJson.features.map(f => f.properties),  // map case
 *     onChange: () => refresh(),                            // re-filter views
 *   });
 *   // Inside refresh(): use search.currentMatchIds() (Set<string>)
 *   // to intersect with the date-filtered set.
 */

(function () {
  if (typeof Fuse === "undefined") {
    console.warn("[search] Fuse.js not loaded; search disabled.");
    return;
  }

  const FUSE_OPTIONS = {
    keys: [
      { name: "title",         weight: 0.40 },
      { name: "description",   weight: 0.20 },
      { name: "host",          weight: 0.15 },
      { name: "neighborhood",  weight: 0.10 },
      { name: "venue_name",    weight: 0.10 },
      { name: "venue_address", weight: 0.05 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
  };

  function parseQueryFromHash() {
    const raw = (window.location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(raw);
    return params.get("q") || "";
  }

  function setQueryInHash(query) {
    const raw = (window.location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(raw);
    if (query) params.set("q", query);
    else params.delete("q");
    const next = params.toString();
    window.location.hash = next;
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      if (t !== null) clearTimeout(t);
      t = setTimeout(() => { t = null; fn.apply(null, args); }, ms);
    };
  }

  window.initSearch = function (config) {
    const events = config.events || [];
    const onChange = config.onChange || (() => {});
    const input = document.getElementById("search");
    if (!input) {
      console.warn("[search] #search input not found; skipping init.");
      return { currentMatchIds: () => null, applyQuery: () => {} };
    }

    const fuse = new Fuse(events, FUSE_OPTIONS);
    let currentQuery = "";
    let currentMatchSet = null; // null = no query active, all events match

    function recompute() {
      const q = currentQuery.trim();
      if (!q) {
        currentMatchSet = null;
        return;
      }
      const results = fuse.search(q);
      currentMatchSet = new Set(results.map((r) => r.item.event_id));
    }

    function applyQuery(query, opts) {
      opts = opts || {};
      currentQuery = String(query || "");
      if (input.value !== currentQuery) input.value = currentQuery;
      recompute();
      if (opts.fromUser !== false) setQueryInHash(currentQuery);
      onChange();
    }

    const debouncedApply = debounce(() => applyQuery(input.value), 120);
    input.addEventListener("input", debouncedApply);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        applyQuery("");
        input.blur();
      }
    });

    // Initialise from the URL hash (carried over from a sibling tab).
    const initial = parseQueryFromHash();
    if (initial) {
      input.value = initial;
      applyQuery(initial, { fromUser: false });
    }

    // Stay in sync if the hash changes (e.g. arrived via tab_nav.js).
    window.addEventListener("hashchange", () => {
      const next = parseQueryFromHash();
      if (next !== currentQuery) {
        applyQuery(next, { fromUser: false });
      }
    });

    return {
      currentMatchIds: () => currentMatchSet,   // Set<event_id> | null
      currentQuery: () => currentQuery,
      applyQuery,
    };
  };
})();
