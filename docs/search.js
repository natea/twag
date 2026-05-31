/* StageHopper client-side fuzzy search.
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

  function parseScopeFromHash() {
    const raw = (window.location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(raw);
    return params.get("scope") === "day" ? "day" : "all";
  }

  function setScopeInHash(scope) {
    const raw = (window.location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(raw);
    if (scope === "day") params.set("scope", "day");
    else params.delete("scope");  // "all" is default; keep URL clean
    window.location.hash = params.toString();
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      if (t !== null) clearTimeout(t);
      t = setTimeout(() => { t = null; fn.apply(null, args); }, ms);
    };
  }

  // "Wed, May 27" style label from a YYYY-MM-DD date.
  function _shortDateLabel(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
    });
  }

  window.initSearch = function (config) {
    const events = config.events || [];
    const onChange = config.onChange || (() => {});
    const citySlug = config.citySlug || "";
    const view = config.view || "";
    const getActiveDate = config.getActiveDate || (() => "");
    const input = document.getElementById("search");
    if (!input) {
      console.warn("[search] #search input not found; skipping init.");
      return { currentMatchIds: () => null, applyQuery: () => {} };
    }

    const fuse = new Fuse(events, FUSE_OPTIONS);
    let currentQuery = "";
    let currentMatchSet = null;   // null = no query active, all events match
    let currentMatchOrder = null; // array of event_ids in Fuse-relevance order
    let currentScope = parseScopeFromHash();  // "all" | "day"
    let lastTrackedQuery = "";
    let scopeUi = null;   // populated by buildScopeUi() below

    function recompute() {
      const q = currentQuery.trim();
      if (!q) {
        currentMatchSet = null;
        currentMatchOrder = null;
        return;
      }
      const results = fuse.search(q);
      currentMatchOrder = results.map((r) => r.item.event_id);
      currentMatchSet = new Set(currentMatchOrder);
    }

    // Track "settled" queries — fires after the user pauses typing for
    // ~700ms, deduped against the previous tracked query so we don't
    // capture every intermediate keystroke.
    const trackSettledSearch = debounce(() => {
      const q = currentQuery.trim();
      if (!q || q === lastTrackedQuery) return;
      lastTrackedQuery = q;
      if (window.twagTrack) {
        twagTrack("search_performed", {
          city: citySlug,
          view: view,
          query: q,
          query_length: q.length,
          match_count: currentMatchSet ? currentMatchSet.size : 0,
        });
      }
    }, 700);

    function applyQuery(query, opts) {
      opts = opts || {};
      currentQuery = String(query || "");
      if (input.value !== currentQuery) input.value = currentQuery;
      recompute();
      if (opts.fromUser !== false) setQueryInHash(currentQuery);
      onChange();
      if (opts.fromUser !== false) trackSettledSearch();
    }

    const debouncedApply = debounce(() => applyQuery(input.value), 120);
    input.addEventListener("input", debouncedApply);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        applyQuery("");
        input.blur();
      }
    });

    buildScopeUi();

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

    // Build the segmented toggle UI right after the #search input.
    // Two buttons: "All days" (default) | "<active day short>".
    function buildScopeUi() {
      const existing = document.getElementById("search-scope");
      if (existing) existing.remove();
      const wrap = document.createElement("div");
      wrap.id = "search-scope";
      wrap.className = "search-scope";
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", "Search scope");
      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = "search-scope-btn";
      allBtn.dataset.scope = "all";
      allBtn.textContent = "All days";
      const dayBtn = document.createElement("button");
      dayBtn.type = "button";
      dayBtn.className = "search-scope-btn";
      dayBtn.dataset.scope = "day";
      const dayLabel = _shortDateLabel(getActiveDate()) || "This day";
      // Two labels: the full "Tue, May 26" for desktop, a compact "This day"
      // for mobile. CSS picks one based on viewport width so the toggle
      // never gets truncated next to the search input.
      dayBtn.innerHTML =
        `<span class="scope-btn-long">${dayLabel}</span>` +
        `<span class="scope-btn-short">This day</span>`;
      wrap.appendChild(allBtn);
      wrap.appendChild(dayBtn);
      input.insertAdjacentElement("afterend", wrap);
      allBtn.addEventListener("click", () => setScope("all"));
      dayBtn.addEventListener("click", () => setScope("day"));
      scopeUi = { wrap, allBtn, dayBtn };
      reflectScopeUi();
    }

    function reflectScopeUi() {
      if (!scopeUi) return;
      scopeUi.allBtn.classList.toggle("active", currentScope === "all");
      scopeUi.dayBtn.classList.toggle("active", currentScope === "day");
      // Refresh the day-button label in case the active date changed.
      // Keep both the long and short spans so the CSS swap still works.
      const dayLabel = _shortDateLabel(getActiveDate()) || "This day";
      scopeUi.dayBtn.innerHTML =
        `<span class="scope-btn-long">${dayLabel}</span>` +
        `<span class="scope-btn-short">This day</span>`;
    }

    function setScope(scope, opts) {
      opts = opts || {};
      const next = scope === "day" ? "day" : "all";
      if (next === currentScope) {
        reflectScopeUi();
        return;
      }
      currentScope = next;
      if (opts.fromUser !== false) {
        setScopeInHash(currentScope);
        if (window.twagTrack) {
          twagTrack("search_scope_changed", {
            city: citySlug,
            view: view,
            scope: currentScope,
            has_query: !!currentQuery.trim(),
          });
        }
      }
      reflectScopeUi();
      onChange();
    }

    // Hashchange handler picks up scope changes that arrive via tab nav.
    window.addEventListener("hashchange", () => {
      const nextScope = parseScopeFromHash();
      if (nextScope !== currentScope) {
        currentScope = nextScope;
        onChange();
      }
    });

    return {
      currentMatchIds: () => currentMatchSet,      // Set<event_id> | null
      currentMatchOrder: () => currentMatchOrder,  // string[] | null (relevance-ranked)
      currentQuery: () => currentQuery,
      currentScope: () => currentScope,            // "all" | "day"
      setScope,
      applyQuery,
      refreshScopeLabel: reflectScopeUi,           // call after activeDate changes
    };
  };
})();
