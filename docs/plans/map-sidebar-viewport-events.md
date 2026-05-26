# Map view sidebar: list of events in view, with expanded detail for selection

## Context

The Map tab today shows clustered pins on Mapbox, with a popup that appears
only after clicking an individual pin. There's no peripheral-vision way to see
*what* is in the area you're looking at — you have to click pin-by-pin. A
sidebar that lists events whose pin is currently in the viewport, with an
expanded card for the selected event, makes the map immediately scannable:
pan to a neighborhood, see the list rewrite itself, click a row to read more.

Goal:

- Side-by-side with the map, render a scrollable list of every event currently
  visible in the viewport (after `date` filter + clustering's underlying points).
- Selecting a row expands its detail in place (description, time, venue, host,
  capacity, RSVP) and highlights / opens the popup on the map.
- Selecting a pin on the map highlights and scrolls the matching row into view.
- List + map share a single selection state.

Branch: `natea/map-sidebar`, off `main`.

## Behavior

| Action | Result |
|---|---|
| Map loads | Sidebar lists every event with a pin inside the initial viewport, in the same chronological order the gallery uses. |
| User pans or zooms the map | `moveend` (debounced ~150 ms) recomputes "in view" and rewrites the list. |
| User changes the date chip | Underlying GeoJSON filter changes; sidebar re-derives "in view" from the new feature set. |
| User clicks a row | That event becomes "selected": row expands in place, map opens the corresponding pin's popup, map pans to center it (no zoom-in — keeps neighborhood context). |
| User clicks a pin on the map | Same selected state, scroll the row into view, expand it. |
| User clicks the cluster | Existing behavior: zoom in. Sidebar updates after zoom completes. |
| Mobile (≤ 640 px wide) | Sidebar becomes a bottom drawer with the same content; map gets the top portion. |

## Files to change

### New

- **`docs/events_map_sidebar.js`** — sidebar component: builds the DOM,
  subscribes to `map.on('moveend', …)` and the existing date-change refresh,
  queries rendered features, renders rows, manages selection state, and
  exposes a `selectEvent(eventId)` hook that the map's click handler can call.

### Modified

- **`docs/events_map.css`** — new layout: a flex row containing the map
  (`flex: 1`) and a fixed-width sidebar (`width: 360px`) below the header /
  tab nav / date picker. Mobile breakpoint at 640 px switches to column with
  the sidebar pinned as a drawer at the bottom.
- **`docs/events_map.js`** — small additions:
  1. After `map.on('load', …)` finishes building layers, instantiate the
     sidebar and wire `selectEvent` / pin-click handlers to it.
  2. Change the pin-click handler so it both opens the popup *and* notifies
     the sidebar to expand the matching row.
  3. The existing `refresh()` (called on date change) now also notifies the
     sidebar to recompute "in view" from the new filtered feature set.
- **`docs/events_map_boston.html`** and **`docs/events_map_nyc.html`** —
  add a `<div id="sidebar"></div>` next to `<div id="map"></div>` and load
  `events_map_sidebar.js` before `events_map.js`.

### Reused existing code

- `formatHumanDate` / `escapeHtml` / `popupHtml` helpers in
  `docs/events_map.js`. Sidebar's row + expanded card reuses `popupHtml` for
  the expanded body so the detail content is consistent with the map popup.
- The gallery already shows the same fields with a hover overlay — keep the
  visual treatment close so the two views feel like the same site.

## How "events in view" is computed

Mapbox exposes `map.queryRenderedFeatures(bbox, { layers: [...] })`. We can
query both the `unclustered-point` and `clusters` layers, then expand each
cluster to its underlying features via
`source.getClusterLeaves(clusterId, Infinity, 0, callback)`. Deduplicate by
`event_id`, sort by `start_time`, render.

Alternative: skip clusters entirely and query only `unclustered-point`. That
means events hidden inside clusters at low zoom don't appear in the sidebar.
Cleaner code, worse UX. Defaulting to "expand clusters" but the choice is
worth confirming with the user.

## Selection state

A single `selectedEventId` lives on the sidebar module. Setting it:

1. Marks the matching `.sidebar-row` with `aria-selected="true"` and applies
   an expanded layout (description block visible).
2. Calls `map.flyTo({ center: [lon, lat], speed: 1.4, curve: 1 })` and opens
   the existing popup. (Use `flyTo` not `setCenter` so it feels intentional.)
3. Scrolls the row into view if needed
   (`row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })`).

Clearing selection (clicking the map background or a different row) collapses
the previous row.

## Mobile layout

Below 640 px:

- Sidebar becomes a bottom sheet, ~45% of viewport height, with a small drag
  affordance and a tap-to-expand-to-full state. Map fills the rest above.
- Selection still works, but `flyTo` accounts for the visible map area
  (offset so the selected pin lands in the top half, not under the sheet).

Skipping a full drag-to-resize gesture for v1 — just two states (collapsed
header + scrollable rows, vs. expanded full-screen list). Drag-resize is a
polish item.

## Decisions

1. **Clusters expanded** — the sidebar lists every event whose pin is in the
   viewport, including events still merged into a cluster at the current zoom.
   Implementation uses `source.getClusterLeaves(clusterId, Infinity, 0, cb)`
   for each cluster in `queryRenderedFeatures` results, dedupes by `event_id`.
2. **Thumbnails desktop-only** — each row shows a 64 px square thumb from
   `docs/<city>/thumbs/<event_id>.jpg`. On mobile (≤ 640 px) the row collapses
   to text-only so more events fit in the bottom-sheet drawer. Implemented
   via a `@media (max-width: 640px)` rule that sets `.sidebar-row-thumb`
   `display: none`.
3. **Rich detail card** — selected row expands to show the hero image (full-
   width thumb from the same `docs/<city>/thumbs/` source), full description
   (untruncated), capacity badges ("X going / Y spots left"), host, venue
   address, and a prominent RSVP button. Card scrolls internally if the
   description is long.
4. **No pan on map-pin click** — clicking a pin opens the popup and expands
   the matching sidebar row, but does *not* move the map. (Clicking a sidebar
   row still calls `flyTo` since the user may have a pin far from the current
   center — same reasoning is asymmetric on purpose.)
5. **Applies to both cities** — Boston + NYC share `events_map.js`, so this
   lands for both automatically.

## Verification

1. Local — `python3 -m http.server` in `docs/`, open Boston map:
   - Sidebar lists events on default date 2026-05-26.
   - Pan to Seaport — list rewrites to Seaport events only.
   - Pan back — list updates again, no flicker, no duplicate rows.
   - Click a sidebar row — map pans, popup opens, row expands.
   - Click a pin — same selected state, sidebar row scrolls into view.
   - Resize browser to mobile width — sidebar becomes bottom sheet.
2. Date change — switch to May 28, confirm both map and sidebar re-filter and
   recompute "in view."
3. NYC parity — repeat smoke test on `events_map_nyc.html`.
4. Performance — pan/zoom shouldn't drop frames on a phone. If `getClusterLeaves`
   gets called for many clusters per `moveend`, batch the callbacks and only
   re-render once. Debounce at 150 ms.

## Out of scope

- Search box / text filter (could be a follow-up).
- Saving favorites / "going" state — TWAG doesn't have an account system here.
- Routing or "events near me" — same reasoning as the original map plan.
- Sidebar on the gallery page. The gallery already *is* a list view; adding
  a viewport-filter sidebar there doesn't add anything.
