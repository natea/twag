# My Schedule: personal event picker with conflicts + travel times

## Context

Today you can browse the Map and Gallery, but every interesting event lives in
your head until you click RSVP. Make that explicit: an **Add+** button beside
RSVP that pins the event to a personal **Schedule** tab. The schedule renders
chronologically, fades out events that have already happened, snaps to the
current moment on load, flags time conflicts in red, and shows the
walk/drive/transit time between consecutive events so the day is realistically
plannable.

No auth backend exists. The picks live in browser storage on the device that
made them — switching from desktop to mobile means starting over. Acceptable
v1 trade-off; an export/import step or QR-code handoff can come later.

Branch: `natea/my-schedule`, off `main`.

## Storage

`localStorage` (not `sessionStorage`). Key per city so Boston and NYC schedules
are independent and don't pollute each other:

```
twag_schedule_boston = ["evtId_1", "evtId_2", ...]
twag_schedule_nyc    = ["evtId_a", "evtId_b", ...]
```

Just the IDs. Full event metadata is read from the city's existing
`<city>.geojson` (which already has title, time, lat/lon, neighborhood, venue,
description, capacity, RSVP). Single source of truth, and if Partiful guest
counts later refresh, the Schedule page auto-reflects it.

Travel-time cache lives alongside:

```
twag_travel_cache = {
  "<from_event_id>|<to_event_id>|walking": {seconds, meters, ts},
  "<from_event_id>|<to_event_id>|driving": {seconds, meters, ts},
  ...
}
```

Cached forever (event venues don't move during the week). Cleared if the user
hits a "Clear schedule" button (a small affordance on the Schedule page).

## UI: Add+ button

Three places to surface the action:

1. **Map popup** (in `popupHtml` inside `events_map.js`) — small `+ Add` button
   next to the orange RSVP button. Toggles between `+ Add` and `✓ Added`.
2. **Sidebar expanded card** (in `events_map_sidebar.js`) — same button, same
   toggle, in the expanded detail.
3. **Gallery overlay** (desktop only) — added to the hover overlay next to the
   "Tap to RSVP →" cue. Mobile gallery tiles tap-through to RSVP, so the
   gallery's mobile UX gets no Add+. Map view (with the popup) is the mobile
   add path.

All three call a shared `toggleScheduled(eventId)` helper from a new
`docs/schedule_store.js` module so the logic lives in one place.

## UI: Schedule tab

Tab nav gets a third entry alongside Map / Gallery:

```
Map | Gallery | Schedule (3)
```

The trailing `(3)` is a live count of how many events are currently saved. It
listens to `storage` events too, so adding from Map updates the Gallery's tab
nav in another open tab.

New per-city HTML pages:

- `docs/events_schedule_boston.html`
- `docs/events_schedule_nyc.html`

These reuse the same header / tab-nav / date-picker structure as the existing
pages.

## Schedule page layout

Day sections, each with a header (`Tuesday, May 26`) and a vertical timeline
of the saved events for that day. Within a day:

```
┌────────────────────────────────────────────┐
│ 9:00am — Founders Breakfast                │  past (grey)
│ High Street Place Food Hall · Downtown     │
│ [Remove]                                   │
└────────────────────────────────────────────┘
        ↓ 12 min walk · 0.6 mi  (•) bus 25 min  🚗 6 min
┌────────────────────────────────────────────┐
│ 11:00am — Connecting with MIT Sloan's …    │  past (grey)
└────────────────────────────────────────────┘
        ↓ 18 min walk · 0.9 mi
┌────────────────────────────────────────────┐ ── now ──────
│ 2:00pm — Hard-Tech Innovation              │  upcoming
│ (CONFLICT in red — overlaps with next)     │  ← red border
└────────────────────────────────────────────┘
┌────────────────────────────────────────────┐
│ 2:30pm — Cracking Founder-Led Marketing    │  upcoming, conflict
└────────────────────────────────────────────┘
```

### "Past" greying
- Compare `event.end_iso` (UTC) to `Date.now()`.
- If end is in the past → grey text + reduced opacity, "Remove" still works.
- Travel-time card between two past events also grey, smaller.

### "Now" indicator + scroll-into-view
- A `<div class="now-indicator">` is injected between the last past event and
  the first present/future event on the active day.
- On page load: `now-indicator.scrollIntoView({ block: "start" })`.
- If everything saved is in the future, anchor scrolls to the first event.
- If everything is in the past, anchor scrolls to the bottom.

### Conflicts
- Two events conflict if `(a.start_iso, a.end_iso)` overlaps
  `(b.start_iso, b.end_iso)`.
- Pairwise check within each day's saved list. Mark both with
  `.schedule-conflict` (red left border + light red fill). A small "conflict"
  badge sits next to the time.

### Empty state
"No events saved yet. Add events from the Map or Gallery and they'll show up
here in chronological order." with two button links back to Map and Gallery.

### Per-row Remove
`Remove` button on each row calls the store's `toggleScheduled(eventId)`. The
row animates out (CSS opacity) and the day section disappears if empty.

## Travel times between consecutive events

For every adjacent pair of saved events *on the same day*:

- **Walking** + **Driving**: fetched via Mapbox Directions API. Mapbox's free
  tier covers 100,000 requests/profile/month — well above our worst case
  (~20 events × 2 modes per device per week).
- **Transit**: **Mapbox does NOT support public transit**. Two options:
  1. Skip transit inline; render a small "🚇 Transit on Google Maps" link
     that deep-links to Google Maps directions in transit mode using the two
     lat/lons. Zero API cost. No login. Pre-decision recommendation.
  2. Use Google Maps Directions API for transit. Requires billing, credit-
     card on file, key restrictions. Heavyweight for a free week site.

Endpoint pattern (Mapbox):

```
GET https://api.mapbox.com/directions/v5/mapbox/<profile>/{lon1},{lat1};{lon2},{lat2}
    ?access_token=<TWAG_MAPBOX_TOKEN>&overview=false&geometries=geojson
```

`<profile>` ∈ {`walking`, `driving`, `cycling`}.

Results cached in `localStorage` (key shape above), since pairs are stable.
Cache populated on first render; UI shows a "—" placeholder until the fetch
resolves, then fills in.

Display per pair:

```
↓ 12 min walk · 0.6 mi   🚗 6 min   🚇 Transit ↗
```

Clicking 🚇 opens Google Maps in a new tab.

## Files to create / modify

### New

- `docs/schedule_store.js` — shared module: `getScheduled(citySlug)`,
  `toggleScheduled(citySlug, eventId)`, `removeScheduled(...)`,
  `subscribeToChanges(callback)` (wraps `storage` event). Travel-time cache
  helpers (`getCachedRoute`, `setCachedRoute`).
- `docs/events_schedule.js` — schedule page logic: load saved IDs, fetch the
  city's geojson, group by day, sort, compute conflicts, render rows, render
  travel cards, fetch + cache Mapbox routes, wire Remove buttons, anchor to
  "now."
- `docs/events_schedule_boston.html`, `docs/events_schedule_nyc.html` —
  per-city schedule pages. Static; mostly inline `SCHEDULE_CONFIG` with
  city slug + geojson URL + Tech Week date range.

### Modified

- `docs/events_map.js` — `popupHtml` adds an `+ Add` / `✓ Added` button next
  to the RSVP link. Wires to `toggleScheduled`.
- `docs/events_map_sidebar.js` — same button in the expanded card.
- `docs/events_gallery.js` — Add+ button in the hover overlay (desktop only).
- `docs/events_map.css` — styles for the Add+ button, schedule rows, day
  headers, travel cards, conflict treatment, "now" indicator, past-event
  greying, empty state.
- `docs/events_map_<city>.html`, `docs/events_gallery_<city>.html` — tab nav
  gains a third `<a>` to the new schedule page; loads `schedule_store.js`
  before the page-specific JS so the Add+ buttons can call into it.

### Reused

- `formatHumanDate`, `weekdayShort`, `escapeHtml` from `events_map.js` /
  `events_gallery.js`. Schedule page imports the small subset it needs (or
  copies; current pages share via global functions, fine).
- `popupHtml` rendering — schedule rows use the same vocabulary (title, time,
  venue, host, RSVP).
- The existing `<city>.geojson` files are the data source.

## Mobile considerations

- **Schedule tab in nav** wraps cleanly with three items at ≤ 640 px (the
  date-chip mobile abbreviations already proved the layout pattern).
- **Travel-card layout** stacks vertically on mobile (`↓ 12 min walk · 0.6 mi`
  on one line, `🚗 6 min` next, `🚇 Transit ↗` next).
- **No thumbnails in schedule rows** — schedule is a focused planning view,
  matches the recent "hide thumbnails on mobile gallery" decision.

## Decisions to confirm before implementing

1. **Storage**: `localStorage` (persists across browser restarts). Alternative
   is `sessionStorage` (clears when the tab closes). Recommendation:
   `localStorage` — Tech Week spans 6 days, no one wants to rebuild their
   schedule every morning.
2. **Transit**: skip inline, deep-link out to Google Maps. Mapbox doesn't do
   transit; Google does but costs money. The "🚇 Transit ↗" link is zero-cost
   and uses the user's existing Google Maps app.
3. **Add+ on gallery mobile**: skip — gallery on mobile is a tap-to-RSVP grid.
   Adding requires the Map view (popup) on phones. Confirming this is OK.
4. **Tab nav badge**: show count after "Schedule" (e.g. `Schedule (3)`). Pure
   polish; happy to drop if you'd prefer the cleaner 3-tab look.
5. **Pinned events with `fetch_status != ok`**: events whose Partiful page
   404'd at crawl time have no description / time. If a user somehow added one
   anyway (shouldn't happen via the Add+ button since stub events are filtered
   out of the geojson), the schedule page renders the saved title + an
   apology. Edge case; can skip.

## Verification

1. Add 3 events from the Map (popup + sidebar both wire correctly).
2. Add 1 event from the Gallery overlay (desktop).
3. Open the Schedule tab — all 4 events sorted chronologically, day grouped,
   page scrolled to the first non-past event.
4. Manually set the clock to a Tech Week date, verify "now" indicator lands
   correctly and past events are greyed.
5. Add two events with overlapping times — both rows turn red, conflict
   badge appears.
6. Travel cards populate within 1–2 seconds (Mapbox round trip), then load
   instantly on subsequent visits (cache).
7. Click 🚇 Transit — opens Google Maps in a new tab with the right origin /
   destination / mode=transit.
8. Click Remove — row disappears; if it was the last in a day, the day header
   disappears too.
9. Open the schedule page in a second browser tab on the same device — adding
   an event in the Map tab updates the Schedule tab's count badge live.
10. Open the page on a different device — schedule is empty, as expected.

## Out of scope (deliberate)

- Cross-device sync. No auth, no backend.
- Calendar export (.ics). Could be a one-button follow-up if requested.
- Notifications / reminders. Browser push needs HTTPS + service worker +
  user permission; out of v1 scope.
- Rebuilding any of this for the Telegram bot. The bot doesn't have a notion
  of a user's schedule, and adding one would require a real database.
