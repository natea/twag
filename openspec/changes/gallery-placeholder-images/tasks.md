## 1. Build step

- [ ] 1.1 In `build_gallery`, stop excluding `no_image` events; emit them with `image: ""` and `has_image: false`
- [ ] 1.2 Add `has_image: true` to entries that have an image; keep the existing (date, start_time, title) sort
- [ ] 1.3 Keep a `no_image` count in the returned counts for reporting (now "included as placeholder" rather than "dropped")

## 2. Front-end placeholder

- [ ] 2.1 In `events_gallery.js`, when `has_image` is false, render a generated placeholder tile instead of an `<img>` (title + host/neighborhood)
- [ ] 2.2 Derive the placeholder background deterministically from `event_id` (stable hash → theme palette color/gradient)
- [ ] 2.3 Add a subtle, non-stigmatizing "no photo" marker

## 3. Styling

- [ ] 3.1 Add placeholder tile CSS in the gallery stylesheet (theme palette, line-clamped title, responsive font sizing, same aspect ratio as image cards)
- [ ] 3.2 Verify no layout shift vs image cards (same dimensions)

## 4. Verify

- [ ] 4.1 Rebuild `boston_gallery.json` / `nyc_gallery.json`; confirm the count rises to include previously-dropped events
- [ ] 4.2 Local browser check: placeholder cards render, are searchable + day-filterable, click through to RSVP, and look intentional (not broken)
- [ ] 4.3 Snapshot/diff: existing image entries unchanged apart from the added `has_image` flag
