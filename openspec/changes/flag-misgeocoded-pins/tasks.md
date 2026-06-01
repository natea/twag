## 1. Detection (reuse Pin Police)

- [ ] 1.1 Add `geocode.find_misgeocoded(city)` that scans `venues.json` and returns rows failing `pin_geometry.in_city_bbox` (and, where a tightened re-geocode exists, `geocode_distance` > 300 m)
- [ ] 1.2 Unit-test detection against the Copley Place fixture (out-of-bbox → flagged; a known-good pin → not flagged)

## 2. Repair ladder

- [ ] 2.1 Add `geocode.geocode_tightened(address, city)` — appends city/state and passes OpenCage `countrycode`, `bounds` (from `CITY_BBOX`), and `proximity` (city center)
- [ ] 2.2 Support `data/<city>-for-agents/venue_overrides.json` ({event_id: {lat, lon, note}}), ignored when the stored address no longer matches
- [ ] 2.3 Add neighborhood-centroid fallback (centroid table per city; deterministic small jitter) marking the pin `approximate: true`
- [ ] 2.4 Implement `repair_pin(event)` applying the ladder and returning the outcome bucket

## 3. Export integration + quarantine

- [ ] 3.1 Extend `build_geojson` guard path to repair then quarantine (drop or `pin_flagged: "misgeocoded"`) using the ladder
- [ ] 3.2 Carry `approximate` into feature properties; keep default (un-guarded) output byte-for-byte identical (snapshot test)

## 4. Reporting + CLI

- [ ] 4.1 Add `twag geocode-doctor --city <c>` printing the bucket counts + quarantined list and writing a JSON report
- [ ] 4.2 Include the same counts in the guarded `build-geojson` output

## 5. Map rendering

- [ ] 5.1 Style `approximate` pins distinctly (e.g., hollow/dashed marker) and label them "approximate location" in the popup
- [ ] 5.2 (Optional) add a tiny "N approximate / M hidden" note to the map count line

## 6. Tests & docs

- [ ] 6.1 Tests: repair ladder picks the right bucket; quarantine omits/flags correctly; report counts reconcile with totals
- [ ] 6.2 Document the overrides file + `geocode-doctor` in the repo docs
