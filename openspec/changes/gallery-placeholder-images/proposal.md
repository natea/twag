## Why

`build_gallery` only includes events that have an image (a thumbnail or a Firebase image); everything else is dropped as `no_image`. So an event with a perfectly good title, time, and venue simply doesn't appear in the gallery if its host never uploaded a picture. The gallery should be a complete index of the week — a missing photo shouldn't make an event invisible. Show those events with a generated placeholder instead.

## What Changes

- `build_gallery` includes **every** non-canceled, fetched event — those without an image get an entry flagged `has_image: false` (instead of being skipped).
- `events_gallery.js` renders a **generated placeholder** for image-less entries: a branded tile (paper/vermillion theme) showing the event title, with host/neighborhood, on a deterministic background derived from the `event_id` (so each card is distinct and stable across reloads). No network image, no layout shift.
- Placeholder cards remain fully functional — searchable, day-filterable, and clickable through to RSVP — identical to image cards.
- The gallery count reflects the true total; optionally a subtle marker distinguishes "no photo yet" cards.

## Capabilities

### New Capabilities
- `gallery-placeholder-images`: include image-less events in the gallery with a generated placeholder so the gallery is a complete event index.

### Modified Capabilities
<!-- None — additive. build_gallery's existing image entries are unchanged. -->

## Impact

- **Code:** `geojson_export.build_gallery` (stop excluding `no_image`; emit `has_image` + the fields a placeholder needs), `events_gallery.js` (render placeholder when `has_image` is false), `events_gallery`/gallery CSS (placeholder tile styles).
- **Data:** `docs/<city>_gallery.json` grows to include image-less events; existing entries unchanged in shape aside from an added `has_image` flag.
- **No external services**; no Pin Police dependency. Pure web/build change, ships on `main`.
