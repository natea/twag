# pin-quality-eval Specification

## Purpose
TBD - created by archiving change add-pinpolice-weave-eval. Update Purpose after archive.
## Requirements
### Requirement: Pipeline tracing via Weave
The harness SHALL expose the extraction and geocoding steps as Weave-traced operations so every call is observable, and this instrumentation MUST NOT change the behavior or output of the production code paths.

#### Scenario: Geocoding call is traced
- **WHEN** the harness geocodes an address through the Weave-wrapped `geocode_address` op
- **THEN** a trace appears in the configured Weave project capturing the input address and the returned `{lat, lon, confidence}`
- **AND** the returned record is identical to calling the underlying geocoder directly

#### Scenario: Production import without Weave installed
- **WHEN** `twag_clickhouse` is imported in an environment where `weave` is not installed
- **THEN** import succeeds and `geocode_city` / `build_geojson` run unchanged

### Requirement: Evaluation dataset
The harness SHALL build a Weave `Dataset` of labeled events, seeding silver labels from `venues.json` rows with `confidence == 10` and supporting a thin set of hand-verified gold rows with human-provided coordinates.

#### Scenario: Silver labels seeded from cache
- **WHEN** the dataset builder runs against a city's `venues.json`
- **THEN** every row with `confidence == 10` becomes a dataset example whose ground-truth coordinates are that row's `{lat, lon}`

#### Scenario: Gold rows override silver
- **WHEN** a hand-verified gold row exists for an event id
- **THEN** the dataset uses the gold coordinates and marks the row as gold

### Requirement: Geocode distance scorer
The harness SHALL provide a `geocode_distance` scorer that computes the haversine distance between the produced coordinates and the ground-truth coordinates and fails when the distance exceeds 300 meters.

#### Scenario: Pin within tolerance passes
- **WHEN** a produced pin is 120 meters from ground truth
- **THEN** the scorer reports `meters_off ≈ 120` and `pin_ok = true`

#### Scenario: Pin beyond tolerance fails
- **WHEN** a produced pin is 900 meters from ground truth
- **THEN** the scorer reports `pin_ok = false`

### Requirement: In-city bounding-box scorer
The harness SHALL provide an `in_city_bbox` scorer that fails any pin whose coordinates fall outside the active city's bounding box.

#### Scenario: Pin outside the city
- **WHEN** a Boston event geocodes to coordinates in the Atlantic Ocean outside the Boston bbox
- **THEN** the scorer reports `in_bbox = false`

### Requirement: Neighborhood consistency scorer
The harness SHALL provide a `neighborhood_consistency` scorer that fails when the produced coordinates do not agree with the neighborhood stated on the source listing.

#### Scenario: Coordinates disagree with stated neighborhood
- **WHEN** a listing states neighborhood "Back Bay" but the pin falls in Cambridge
- **THEN** the scorer reports the neighborhood as inconsistent

### Requirement: Address hallucination scorer
The harness SHALL provide an LLM-as-judge scorer (`address_not_hallucinated`) that, given the source listing text and the extracted address, determines whether the address is supported by the source, using a deterministic (temperature 0) constrained judgment that is itself traced in Weave.

#### Scenario: Unsupported address flagged
- **WHEN** the extracted address names a street not present or implied in the source listing
- **THEN** the scorer reports `hallucination_free = false`

#### Scenario: Supported address passes
- **WHEN** the extracted address matches the venue named in the source listing
- **THEN** the scorer reports `hallucination_free = true`

### Requirement: Confidence calibration scorer
The harness SHALL record the geocoder's reported confidence alongside each scorer outcome so that the correlation between confidence and pin correctness can be inspected.

#### Scenario: Confidence logged with outcome
- **WHEN** any event is evaluated
- **THEN** its OpenCage `confidence` is logged together with the `pin_ok` result for that event

### Requirement: Multi-model evaluation and leaderboard
The harness SHALL run a `weave.Evaluation` of the address-extraction step across multiple configured models, capturing accuracy (via the scorers), token cost, and latency, and SHALL publish a Weave Leaderboard ranking the models. Configured models that are unavailable MUST be skipped and reported, never silently omitted.

#### Scenario: Three models compared
- **WHEN** the harness is configured with gpt-4o-mini, claude-haiku, and a local model, and all are available
- **THEN** one evaluation runs per model over the shared dataset and a leaderboard ranks all three by the scorers

#### Scenario: Unavailable model is reported
- **WHEN** a configured local model cannot be reached
- **THEN** the harness logs that the model was skipped and continues with the remaining models

