# Search across Tech Week events

## Context

Today users find events three ways: panning the map, scrolling the gallery,
or asking the Telegram bot. None of those work for "I remember an event by
Mercury but can't remember which day." A simple text search input would
collapse that whole loop into one keystroke, and since all event metadata
already lives in static JSON we can do it entirely client-side with no new
backend, no API key, no quota.

Branch: `natea/search`, off `main`.

## Approach

Drop a search input into the header of all four city pages (Map + Gallery).
Build a **Fuse.js** index from the existing per-city JSON on page load.
Typing in the box filters the *current view* live (debounced ~120 ms):

- **Map view** — both the GeoJSON source and the sidebar list filter to
  matching events; pins for non-matching events disappear, sidebar rewrites.
- **Gallery view** — tiles filter to matching events.

The search and date filter compose: search narrows further inside the active
date. A small "× clear" affordance resets the search; the URL hash gains a
`q=...` segment so a search is shareable and survives the Map ⇄ Gallery tab
switch (same pattern `tab_nav.js` already uses for `date=`).

### Why Fuse.js

| Option | Size | Fuzzy? | Fits our shape? |
|---|---|---|---|
| Plain `String.includes` | 0 KB | No (typos kill it) | Works but feels primitive |
| **Fuse.js** | ~5 KB gz | Yes (Levenshtein-ish) | ★ matches the static-JSON shape |
| MiniSearch | ~7 KB gz | Yes (BM25) | Heavier, better at long-form text |
| Algolia | external | Yes | Adds a vendor + quota for no benefit |
| Pagefind | ~75 KB | Yes | Geared at HTML pages, not structured data |

Fuse.js is the sweet spot: tiny, no build step, indexes a JS object array in
~30 ms for 1,400 events, and survives typos ("kendell" → Kendall Square,
"meeurcry" → Mercury Vinyl House).

## Behavior

| Action | Result |
|---|---|
| Type "ai" in the search box | Map pins, sidebar, and gallery all filter to events whose title / description / host / neighborhood / venue contains "ai" (fuzzy). Date filter still applies. |
| Type "kendell" | Fuzzy match finds Kendall Square events. |
| Clear search (× icon or Esc) | All view-filters reset to date-only. |
| Switch tabs while searching | New tab opens with the same search query applied (`#date=...&q=...`). |
| Type a query with no matches | Map shows empty pin set with a small "No events match \"foo\" on \[date\]" overlay. Sidebar + gallery show the same empty state. |
| Press Enter in the search box | No-op (the live filter already updates as you type). Could later be used to focus the first result. |

Search is **case-insensitive** and **diacritics-insensitive** (Fuse.js handles
both with default options).

## Indexed fields + weights

Fuse takes a `keys` config with optional weights. Proposed:

```js
keys: [
  { name: "title",        weight: 0.40 },
  { name: "description",  weight: 0.20 },
  { name: "host",         weight: 0.15 },
  { name: "neighborhood", weight: 0.10 },
  { name: "venue_name",   weight: 0.10 },
  { name: "venue_address",weight: 0.05 },
],
threshold: 0.35,     // 0 = exact, 1 = anything; 0.35 is a forgiving sweet spot
ignoreLocation: true, // match anywhere in the field, not just from the start
minMatchCharLength: 2,
```

Tunable later from one place.

## Files to create / modify

### New

- `docs/search.js` — Fuse.js wrapper. Exports:
  - `initSearch({ events, onChange })` — builds the index, wires the input.
  - `applySearch(query)` — public method to set the query (used by hashchange
    handler so cross-tab URLs work).
  - `currentMatches()` — returns the current set of matching `event_id`s.

### Modified

- `docs/events_map_<city>.html` (× 2) — `<input type="search" id="search">`
  inside the header, between `#count` and the credit line. Loads `search.js`
  before `events_map.js`. Loads Fuse from CDN (or vendored — see decisions).
- `docs/events_gallery_<city>.html` (× 2) — same input + script tag.
- `docs/events_map.css` — styling for the search input + a small empty-state
  message overlay.
- `docs/events_map.js` — filter the GeoJSON source by both date *and* current
  search-match set. Listen for search-change events and re-render. Update
  the count text to "N events on \[date\] matching \"query\"" when a query
  is active.
- `docs/events_map_sidebar.js` — the sidebar's `compute()` already filters
  by `queryRenderedFeatures`, so once the map source is filtered the sidebar
  automatically reflects it. No code change needed.
- `docs/events_gallery.js` — same composition: filter by `event_date` AND
  search-match set. Count + empty state updated.
- `docs/tab_nav.js` — extend the hash-preservation logic to also carry
  `q=...` across tab clicks (today it only carries `date=...`).

### Reused

- The existing JSON shapes (`<city>.geojson` for map, `<city>_gallery.json`
  for gallery). Already include `title`, `description`, `host`,
  `neighborhood`, `venue_name`, `venue_address` per feature/event.
- `formatHumanDate`, `escapeHtml`, the date-picker chip behavior.

## Decisions to confirm before implementing

1. **Fuse via CDN or vendored?** — CDN (e.g.
   `https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.basic.min.js`) is
   one line of HTML; vendoring the file under `docs/vendor/fuse.basic.min.js`
   avoids any third-party request and keeps GitHub Pages self-contained.
   Recommendation: **vendor it.** The file is tiny, immutable, and the site
   already serves only its own assets.
2. **URL `?q=` vs `#q=`** for the search query? Hash matches the existing
   `#date=…` convention and doesn't trigger a server-side request on
   navigation, but isn't crawlable. Query string is crawlable but causes a
   page reload when changed via `location.search =`. Recommendation: **hash**
   (`#date=2026-05-28&q=ai`), consistent with the date filter.
3. **Search-as-you-type or debounced?** — debounced (~120 ms) keeps the
   layout from thrashing on fast typers and is the norm. Recommendation:
   debounce.
4. **Header layout** on mobile — adding a search field to the already-busy
   header. Recommendation: full-width input below the date picker on mobile;
   inline (next to count) on desktop.
5. **Surface Telegram bot for unmatched searches?** — when no events match,
   show "Try asking the bot: \[link to Twagbot with query pre-filled\]"?
   Cute but adds scope. Recommendation: skip for v1.

## Verification

1. `cd docs && python3 -m http.server 8085` and open Boston map.
2. Type "ai" — pins, sidebar, and tile counts all drop to AI-themed events;
   sidebar list rewrites.
3. Type "kendell" (typo) — still finds Kendall Square events thanks to
   fuzzy matching.
4. Clear with Esc — all events back.
5. Type "ai" on Map, click Gallery tab — gallery loads with the same "ai"
   filter applied (URL hash carried query through).
6. Change the date chip while searching — pins/tiles refilter to AI events
   on the new date.
7. Empty state — type "xqxqxq" and confirm the "no matches" message
   appears in all three surfaces.

## Performance notes

- Indexing 1,400 NYC events takes ~30 ms on a mid-range phone. Done once
  on page load.
- Each keystroke triggers a debounced Fuse search; for the full NYC set
  Fuse returns under 10 ms.
- Map source `setData` and gallery innerHTML rebuild are the dominant cost
  (~50–100 ms). Acceptable.

## Out of scope

- Server-side search. The static site doesn't need it.
- Search within the Telegram bot. Already supported by the existing
  natural-language agent.
- Faceted filters (host = X, neighborhood = Y, capacity > Z). Could ride on
  top of Fuse later if we wanted; not v1.
- Search history / autocomplete suggestions. Could be a future polish.

## Estimated effort

- ~half a day for the basic version (input + Fuse index + filter wiring
  across map + sidebar + gallery + hash carryover).
- Another hour or two for mobile layout polish and empty-state copy.
