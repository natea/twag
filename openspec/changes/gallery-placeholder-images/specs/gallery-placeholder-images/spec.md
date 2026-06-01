## ADDED Requirements

### Requirement: Include image-less events in the gallery
`build_gallery` SHALL include every non-canceled, successfully-fetched event, including those with no thumbnail or Firebase image. Image-less entries SHALL be emitted with `has_image: false` and an empty `image`; entries with an image SHALL carry `has_image: true`.

#### Scenario: Event without a photo is still listed
- **WHEN** an event is non-canceled and fetched but has no thumbnail and no Firebase image
- **THEN** it appears in `<city>_gallery.json` with `has_image: false`

#### Scenario: Existing image entries unchanged
- **WHEN** an event has an image
- **THEN** its entry is unchanged except for an added `has_image: true`

### Requirement: Render a generated placeholder
The gallery front-end SHALL render a generated placeholder for entries with `has_image: false`, built from the event's own fields (title, host, neighborhood) with no network image request and no layout shift. The placeholder background SHALL be deterministically derived from the `event_id` so each card is distinct and stable across reloads.

#### Scenario: Placeholder card is drawn
- **WHEN** the gallery renders an entry with `has_image: false`
- **THEN** it shows a themed tile with the event title (and host/neighborhood) and no broken-image icon

#### Scenario: Same event renders the same placeholder
- **WHEN** the page is reloaded
- **THEN** the placeholder for a given event_id has the same background as before

### Requirement: Placeholder cards are first-class
Placeholder cards SHALL behave identically to image cards — included in search results, day filtering, and click-through to RSVP — and SHALL sort by the same (date, start time, title) ordering.

#### Scenario: Placeholder card matches a search and day filter
- **WHEN** a placeholder event matches the active query and selected day
- **THEN** it appears in the filtered results like any image card and links to its RSVP URL

### Requirement: Honest, non-stigmatizing marker
Placeholder cards MAY carry a subtle "no photo" affordance, but SHALL NOT visually demote the event (no error styling, no reduced interactivity).

#### Scenario: No-photo marker is subtle
- **WHEN** a placeholder card renders its optional marker
- **THEN** the marker is low-contrast and the card remains fully interactive
