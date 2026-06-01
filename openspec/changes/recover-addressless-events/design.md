## Context

`geocode.geocode_city` reads `event["venue_address"]`; when it's blank it increments `skipped` and moves on, so the event never gets coordinates and `build_geojson` later drops it (`no_coords`). The address itself comes from an upstream enrichment step that didn't always populate it. Pin Police already has an LLM extractor (`eval/extractor.extract_address`) that turns a raw listing into a best-guess address — exactly what's needed to backfill these.

## Goals / Non-Goals

**Goals:**
- Stop addressless events from silently vanishing from the map.
- Recover a real address when the listing supports one; otherwise place an approximate pin; otherwise list the event explicitly.
- Keep the recovery pass optional and cheap (bounded to addressless events, cached).

**Non-Goals:**
- Fixing wrong coordinates (that's `flag-misgeocoded-pins`).
- Guaranteeing every event gets a precise pin — some listings genuinely have no location.
- Requiring an LLM key: with none configured, recovery degrades to neighborhood-centroid + reporting.

## Decisions

### 1. Recovery ladder: LLM-extracted address → geocode → neighborhood centroid → unmapped
Try to get a *real* address first (extractor over listing fields + scraped body), then geocode it through the existing path (so the mis-geocode guardrail still applies). If extraction yields nothing usable, fall back to the neighborhood centroid (`approximate: true`). If there's no neighborhood either, the event stays unmapped but is reported.
- **Why LLM-first:** a recovered street address gives a real pin; centroid is a coarse fallback.

### 2. Reuse, don't duplicate
Address extraction reuses `eval/extractor.extract_address`; the centroid table is the same one `flag-misgeocoded-pins` introduces. Recovered addresses flow through `geocode.geocode_address`, so they're subject to the same bbox/quality checks — a recovered-but-wrong address gets caught downstream.

### 3. Markers + caching
Recovered pins carry `source: "recovered"`; centroid pins carry `source: "approximate"`. Both are cached in `venues.json` so the LLM/OpenCage calls happen once. The recovery pass is idempotent and only touches rows without coordinates.

### 4. Surface, don't hide
A recovery report lists `{recovered, approximate, unmapped}` counts and the unmapped event ids/titles. Optionally the map/gallery shows a small "N events have no location yet" note so the gap is user-visible, not just in logs.

## Risks / Trade-offs

- **LLM hallucinates an address** → Mitigation: recovered addresses go through the normal geocode + Pin Police bbox check; out-of-bbox results are rejected and demoted to centroid/unmapped.
- **Centroid pins pile up on one point** → Mitigation: `approximate` styling + deterministic jitter (shared with `flag-misgeocoded-pins`).
- **Cost** → Mitigation: only addressless events, cached; no LLM key → skip straight to centroid.
- **Over-mapping low-signal events** → Trade-off: an approximate pin can imply false precision; the `approximate` marker + popup label manage that expectation.

## Open Questions

- Should approximate/unmapped events also be filterable (a "hide approximate" toggle)? Leaning yes, later.
- Is the scraped Partiful body still available at recovery time, or only the markdown frontmatter? Affects extractor recall.
