## ADDED Requirements

### Requirement: Detect addressless events
The system SHALL identify events whose `venue_address` is missing or blank — the events currently counted only as `skipped` by the geocoder and dropped as `no_coords` by the export.

#### Scenario: Blank-address event is detected
- **WHEN** an event has an empty `venue_address`
- **THEN** it is included in the addressless set for recovery

#### Scenario: Addressed event is ignored
- **WHEN** an event already has a non-blank `venue_address`
- **THEN** it is not part of the recovery pass

### Requirement: Recover an address via extraction
For each addressless event the system SHALL attempt to recover a venue address using the Pin Police extractor over the listing fields (title, host, neighborhood, description, and scraped body when available), and SHALL geocode any recovered address through the normal geocoding path so existing quality checks still apply.

#### Scenario: Recovered address yields a real pin
- **WHEN** the extractor returns a plausible address for an addressless event and it geocodes inside the city bbox
- **THEN** the event gets those coordinates, marked `source: "recovered"`

#### Scenario: Recovered-but-wrong address is rejected
- **WHEN** a recovered address geocodes outside the city bbox
- **THEN** the coordinates are rejected and the event falls through to the next recovery step

#### Scenario: No LLM key configured
- **WHEN** no extraction model is available
- **THEN** recovery skips extraction and proceeds directly to the neighborhood-centroid fallback

### Requirement: Neighborhood-centroid fallback
When no address can be recovered but the listing has a known neighborhood, the system SHALL place the event at that neighborhood's centroid, marked `approximate: true` / `source: "approximate"`, so it still appears on the map.

#### Scenario: Approximate pin keeps the event visible
- **WHEN** an addressless event has neighborhood "Back Bay" and no recoverable address
- **THEN** it is placed at the Back Bay centroid and marked approximate

### Requirement: Surface unmapped events
Events with neither a recoverable address nor a known neighborhood SHALL remain unmapped but MUST be reported (count + event ids/titles); they MUST NOT be silently dropped.

#### Scenario: Unmapped events are reported, not hidden
- **WHEN** an addressless event has no neighborhood and recovery fails
- **THEN** it is listed in the recovery report with its id and title

#### Scenario: Recovery summary is produced
- **WHEN** a recovery pass completes
- **THEN** it reports counts of recovered, approximate, and unmapped events

### Requirement: Idempotent and cached
The recovery pass SHALL be idempotent — only touching events without coordinates — and SHALL cache recovered/approximate results in `venues.json` so extraction and geocoding run at most once per event.

#### Scenario: Re-run does not re-call the LLM
- **WHEN** the recovery pass runs again after a successful recovery
- **THEN** the cached coordinates are reused and no extraction/geocoding call is made for that event
