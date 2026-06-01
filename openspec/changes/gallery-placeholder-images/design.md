## Context

`build_gallery` (in `geojson_export.py`) loops events and, for each non-canceled/fetched one, uses a thumbnail if present, else the Firebase `image`, else `continue`s (counted as `no_image`). That `continue` is the only reason image-less events are absent from the gallery. The gallery front-end (`events_gallery.js`) renders each entry's `image` into a card. This change keeps those events and gives the front-end a way to draw a placeholder.

## Goals / Non-Goals

**Goals:**
- Make the gallery a complete index — no event missing solely for lack of a photo.
- Generate placeholders client-side (no external image, no extra build assets, no layout shift).
- Keep placeholder cards first-class: searchable, filterable, clickable.

**Non-Goals:**
- Sourcing real images for these events (out of scope; a future enhancement could pull an OG image from the RSVP URL).
- Changing how existing image cards look.

## Decisions

### 1. Include image-less events with `has_image: false`
`build_gallery` stops `continue`-ing on no-image; instead it emits the entry with `image: ""` and `has_image: false`. Image entries get `has_image: true`. This is the minimal data contract the front-end needs.
- **Why a flag (not just empty `image`):** explicit is clearer for the renderer and for analytics ("how many events lack photos?").

### 2. Client-side generated placeholder (deterministic)
The renderer builds the placeholder from data already present — title, host, neighborhood — on a background color/gradient derived from a hash of `event_id`, so every card is visually distinct and **stable** across reloads (no flicker, no random). Rendered with CSS/inline SVG in the theme palette; no network request.
- **Why deterministic from event_id:** distinct-but-stable tiles read as intentional design, not "broken image".
- **Why client-side:** zero new build artifacts, and it adapts to the card size responsively.

### 3. Subtle "no photo" affordance, not a scarlet letter
Placeholder cards may carry a small, low-contrast marker (e.g., a tiny camera-off glyph) so the distinction is honest without making these events look second-class.

### 4. Ordering unchanged
Placeholder entries sort by the same (date, start_time, title) key as image entries, so they interleave naturally rather than clumping.

## Risks / Trade-offs

- **A wall of placeholders looks empty** → Mitigation: themed, title-forward tiles read as designed cards; if a day is mostly photo-less it still communicates the events.
- **Gallery JSON grows** → Trade-off: modest size increase; acceptable for completeness (and the map already carries all events).
- **Title-only legibility for long titles** → Mitigation: clamp lines and scale font; show host/neighborhood as secondary text.
