# pin-export-guardrail Specification

## Purpose
TBD - created by archiving change add-pinpolice-weave-eval. Update Purpose after archive.
## Requirements
### Requirement: Opt-in export guardrail
The GeoJSON export SHALL accept an opt-in guardrail flag that is disabled by default, and when disabled the export output MUST be byte-for-byte identical to the current behavior.

#### Scenario: Default export unchanged
- **WHEN** `build_geojson` runs without the guardrail enabled
- **THEN** the produced GeoJSON is identical to the pre-change output

#### Scenario: Guardrail enabled via flag
- **WHEN** the export is invoked with `--guard` (or `guard=True`)
- **THEN** each feature is checked against the guardrail before being written

### Requirement: Flag or drop low-quality pins
When the guardrail is enabled, the export SHALL evaluate each pin with the geometric checks and either drop the feature or tag it as flagged, according to the configured action.

#### Scenario: Out-of-bbox pin is caught
- **WHEN** the guardrail is enabled and a feature's coordinates fall outside the city bounding box
- **THEN** the feature is dropped, or retained with `"pin_flagged": true` in its properties, per the configured action

#### Scenario: Counts are reported
- **WHEN** a guarded export completes
- **THEN** the number of pins flagged or dropped is reported to the operator

### Requirement: Dependency-light enforcement
The guardrail SHALL run using only the shared geometric checks (no Weave, W&B credentials, LLM calls, or network access required), so it can run in CI and offline.

#### Scenario: Guarded export with no credentials
- **WHEN** a guarded export runs in an environment with no `WANDB_API_KEY` and no LLM key
- **THEN** the export completes successfully using only local computation

### Requirement: Single source of truth for "bad pin"
The geometric checks used by the guardrail SHALL be the same `geocode_distance` and `in_city_bbox` logic used by the evaluation harness, so a pin judged bad in eval is judged bad at export.

#### Scenario: Consistent verdict across eval and export
- **WHEN** a pin fails `in_city_bbox` in the evaluation harness
- **THEN** the same pin is caught by the guardrail at export time

