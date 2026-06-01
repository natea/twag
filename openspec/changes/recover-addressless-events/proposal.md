## Why

129 of Boston's 570 events (e.g. 5 of the "hackathon" matches) have **no `venue_address`**, so `geocode.py` skips them, `build_geojson` drops them as `no_coords`, and they silently vanish from the map — they only survive in the gallery (because they have an image). These aren't mis-placed pins; they have *no pin at all*. An attendee searching the map never learns these events exist. We want to recover a location where possible and, failing that, surface them as approximate/unmapped rather than disappearing them.

## What Changes

- Detect events with a missing/blank `venue_address` (today they're counted only in the geocoder's `skipped` bucket).
- **Recover an address** with the Pin Police extractor (`eval/extractor.extract_address`) run over the listing's title/host/neighborhood/description (and, if available, the scraped Partiful page). If it yields a plausible address, geocode it through the normal path.
- If no address is recoverable, **fall back to the neighborhood centroid**, marked `approximate: true`, so the event still appears on the map in roughly the right area.
- Anything with neither address nor neighborhood is listed in an **"unmapped events" report** (and optionally surfaced in a small on-map/in-gallery "N events without a location" affordance) — never silently dropped.
- Report counts so the size of the gap is visible over time.

## Capabilities

### New Capabilities
- `addressless-event-recovery`: recover, approximate, or explicitly surface events that have no venue address, so they stop disappearing from the map.

### Modified Capabilities
<!-- None — additive. Reuses the Pin Police extractor; doesn't change its requirements. -->

## Impact

- **Code:** `geocode.py` (recovery pass before/after the main geocode loop), `geojson_export.py` (include approximate pins; report unmapped), reuse `eval/extractor.extract_address` and the neighborhood-centroid table (shared with `flag-misgeocoded-pins`).
- **Depends on Pin Police** (the `extract_address` model) being on this branch / merged; degrades to neighborhood-centroid-only if no LLM key is configured.
- **External:** LLM calls only for addressless events (bounded set); OpenCage calls only for recovered addresses; both cached.
- **Data:** `venues.json` rows may gain `source: "recovered"|"approximate"` markers. Default export unchanged unless recovery is enabled.
