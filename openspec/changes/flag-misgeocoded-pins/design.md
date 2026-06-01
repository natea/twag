## Context

`geocode.py` calls OpenCage with a loose `q=<venue_address>` and stores the top result's `{lat, lon, confidence}`. OpenCage sometimes returns a confident-but-wrong hit (e.g., a "Copley Place" match in the wrong town), so `confidence` alone doesn't catch it. Pin Police's `pin_geometry` already provides the geometric truth tests, and the export guardrail (`build_geojson(guard=True)`) already flags out-of-bbox pins. This change closes the loop from *detect* to *repair*.

## Goals / Non-Goals

**Goals:**
- Turn detected mis-geocodes into corrected pins where feasible, and quarantine the rest.
- Keep a human-visible report so bad pins are never silent.
- Reuse the single source of truth (`pin_geometry`); no second copy of the checks.

**Non-Goals:**
- Perfect geocoding. We target gross errors (wrong city/borough), not metre-level accuracy.
- Changing default export output. Repair/quarantine is opt-in behind the guard flag.
- Re-geocoding events that have no address at all (that's `recover-addressless-events`).

## Decisions

### 1. Repair ladder: tightened re-geocode → override → neighborhood centroid
Cheapest, most-correct first. The tightened query appends `, <City>, <ST>` and passes OpenCage `countrycode=us` + a city `bounds` box (derived from `CITY_BBOX`) and `proximity` to the city center — which usually fixes the "right street, wrong town" case. Overrides cover the handful the API can't get. Centroid is the last resort so the event still appears (clearly marked approximate) rather than vanishing.
- **Why not just drop:** a missing event is worse than an approximate one; attendees still learn the event exists and its neighborhood.

### 2. Detection = `pin_verdict`, threshold reuse
A pin is "mis-geocoded" when `in_city_bbox` is false, or (when we have a tightened re-geocode to compare) `geocode_distance` between the stored point and the tightened result exceeds the Pin Police threshold (300 m). Same constants, same functions — no divergence.

### 3. Quarantine marker, default-safe
Repaired pins get `approximate: true` when centroid-derived. Unrepairable pins are either dropped or kept with `pin_flagged: "misgeocoded"` (per `--guard-action`). Un-guarded `build_geojson` stays byte-for-byte identical.

### 4. Visibility via a report
`twag geocode-doctor --city <c>` (and the guarded build) prints counts: `{ok, repaired_requery, repaired_override, approximate, quarantined}` and the list of quarantined events, plus writes a JSON report. Mirrors the Pin Police "no silent caps" principle.

## Risks / Trade-offs

- **Tightened re-geocode still wrong** → Mitigation: verify the re-geocode with `in_city_bbox` before accepting it; otherwise fall through to override/centroid.
- **Neighborhood centroid clusters many pins on one point** → Mitigation: mark `approximate`, render with a distinct style, and small deterministic jitter so they don't perfectly overlap.
- **OpenCage cost/rate limit** → Mitigation: only flagged pins are re-queried; results cached in `venues.json`.
- **Overrides drift as data changes** → Mitigation: overrides keyed by `event_id` + address; ignored if the address no longer matches.
