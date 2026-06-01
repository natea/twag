## Why

Some events geocode to the wrong place and still ship as a normal pin. "Beat The Clock Agent Hack @ Wayfair HQ — 4 Copley Place, Boston" lands at (42.15, −71.15) — ~24 km south near Walpole — yet it's counted in search and rendered on the map, just in the wrong spot. That misleads attendees and erodes trust in the core "we make the maps" promise. Pin Police already *detects* these via the geometric checks (`in_city_bbox`, `geocode_distance`), but the guardrail only flags/drops them. We want to **repair** them where possible and **quarantine** the rest, so the map is trustworthy.

## What Changes

- Promote the Pin Police geometric checks (`twag_clickhouse.pin_geometry`) into a **repair step** in the geocoding/export pipeline, not just a flag.
- For each pin that fails `in_city_bbox` (or sits far from a re-geocode of its own address), attempt repair in order:
  1. **Re-geocode with a tightened query** — append the city/state, use OpenCage structured components and a `bounds`/`proximity` hint for the active city.
  2. **Manual override** — apply curated coordinates from `data/<city>-for-agents/venue_overrides.json` if present.
  3. **Neighborhood-centroid fallback** — place at the listing's neighborhood centroid, marked `approximate: true`.
- Anything still failing is **quarantined**: excluded from the map (or kept with `pin_flagged: "misgeocoded"`, per a flag) and listed in a **mis-geocoded report** (CLI summary + JSON).
- Add a `twag geocode-doctor` command (or extend `build-geojson --guard`) that prints the mis-geocoded report so these are visible, not silent.

## Capabilities

### New Capabilities
- `misgeocoded-pin-repair`: detect, repair, and quarantine pins whose coordinates don't match their stated address/city, with a visible quality report.

### Modified Capabilities
<!-- None. Builds on `pin-export-guardrail` detection but adds new requirements rather than changing its behavior. -->

## Impact

- **Code:** `geocode.py` (tightened/repair geocoding helpers), `geojson_export.py` (guard path → repair/quarantine + counts), reuse `pin_geometry` (`in_city_bbox`, `geocode_distance`, `pin_verdict`), new CLI subcommand.
- **Depends on Pin Police** (`pin_geometry` + the export guardrail) being present on this branch / merged to `main`.
- **Data:** optional `data/<city>-for-agents/venue_overrides.json`; `venues.json` rows may gain a `quality`/`approximate` marker. No change to default (un-guarded) export output.
- **External:** extra OpenCage calls only for the small set of flagged pins being repaired (rate-limited, cached).
