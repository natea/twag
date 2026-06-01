## ADDED Requirements

### Requirement: Detect mis-geocoded pins
The system SHALL identify a pin as mis-geocoded when its coordinates fall outside the active city's bounding box, or when they sit farther than the Pin Police distance threshold (300 m) from a tightened re-geocode of the same address. Detection MUST reuse `twag_clickhouse.pin_geometry` (`in_city_bbox`, `geocode_distance`) rather than a separate implementation.

#### Scenario: Out-of-city pin is detected
- **WHEN** an event addressed "4 Copley Place, Boston" is stored at (42.15, −71.15), outside the Boston bbox
- **THEN** it is classified as mis-geocoded

#### Scenario: In-bbox, address-consistent pin is not flagged
- **WHEN** a pin is inside the city bbox and within 300 m of a re-geocode of its address
- **THEN** it is classified as ok and left unchanged

### Requirement: Repair ladder
For each mis-geocoded pin the system SHALL attempt repair in order — (1) re-geocode with a tightened query (city/state appended, city bounds + proximity hint), (2) apply a curated override from `venue_overrides.json`, (3) fall back to the neighborhood centroid marked `approximate` — and stop at the first step that yields an in-bbox result.

#### Scenario: Tightened re-geocode fixes a wrong-town hit
- **WHEN** the tightened re-geocode of a mis-geocoded address returns coordinates inside the city bbox
- **THEN** the pin is updated to those coordinates and marked repaired (requery)

#### Scenario: Override wins when the API can't
- **WHEN** a re-geocode still fails but `venue_overrides.json` has coordinates for that event
- **THEN** the override coordinates are used and the pin is marked repaired (override)

#### Scenario: Centroid fallback keeps the event on the map
- **WHEN** neither re-geocode nor override yields an in-bbox pin, and the listing has a known neighborhood
- **THEN** the pin is placed at the neighborhood centroid with `approximate: true`

### Requirement: Quarantine the unrepairable
When no repair step yields an acceptable location, the system SHALL quarantine the pin — excluding it from the map or retaining it with `pin_flagged: "misgeocoded"` per the configured guard action — and MUST NOT silently ship it at the wrong coordinates.

#### Scenario: Unrepairable pin is quarantined
- **WHEN** a pin cannot be repaired and the guard action is "drop"
- **THEN** the feature is omitted from the exported GeoJSON and recorded in the report

### Requirement: Mis-geocoded report
The system SHALL produce a visible report (CLI summary + JSON) of the repair outcomes — counts of ok, repaired-by-requery, repaired-by-override, approximate, and quarantined — and the list of quarantined events. Coverage limits MUST NOT be silent.

#### Scenario: Operator sees the breakdown
- **WHEN** a guarded build or `geocode-doctor` run completes
- **THEN** it prints the per-bucket counts and lists every quarantined event id and title

### Requirement: Default export unchanged
With repair/quarantine disabled (no guard flag), the exported GeoJSON SHALL be byte-for-byte identical to the pre-change output.

#### Scenario: Un-guarded export is unaffected
- **WHEN** `build_geojson` runs without the guard/repair flag
- **THEN** its output matches the previous behavior exactly
