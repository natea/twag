## 1. Detect addressless events

- [ ] 1.1 Add `geocode.addressless_events(city)` returning events with blank `venue_address`
- [ ] 1.2 Test it against the Boston dataset (expects the ~129 currently-skipped events)

## 2. Recovery ladder

- [ ] 2.1 Wire `eval/extractor.extract_address` into a `recover_address(event)` helper (lazy import; degrade gracefully with no LLM key)
- [ ] 2.2 Geocode recovered addresses via `geocode.geocode_address`; reject results failing `pin_geometry.in_city_bbox`
- [ ] 2.3 Add neighborhood-centroid fallback (shared table with `flag-misgeocoded-pins`) marking pins `approximate`
- [ ] 2.4 Implement the full ladder: extract → geocode → centroid → unmapped, returning an outcome bucket

## 3. Pipeline + caching

- [ ] 3.1 Add a `twag geocode-recover --city <c>` pass (or extend `geocode-venues --recover`) that runs the ladder only on addressless events and caches results in `venues.json` (`source: recovered|approximate`)
- [ ] 3.2 Make it idempotent — skip events that already have coordinates
- [ ] 3.3 Update `build_geojson` to include `approximate` pins and carry the `source` marker into properties

## 4. Reporting + visibility

- [ ] 4.1 Emit a recovery report (CLI + JSON): counts of recovered / approximate / unmapped + the unmapped event list
- [ ] 4.2 (Optional) surface "N events have no location yet" on the map count line and/or in the gallery

## 5. Tests & docs

- [ ] 5.1 Tests: detection set is correct; recovered-but-out-of-bbox is rejected; centroid fallback fires; re-run hits cache (no LLM call)
- [ ] 5.2 Document the recovery pass and its markers; note the dependency on the Pin Police extractor
