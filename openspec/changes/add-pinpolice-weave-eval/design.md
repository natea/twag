## Context

The pin pipeline today is three stages:

1. **Extraction / resolve** — an enrichment step turns a raw Partiful listing (title, host, neighborhood, URL, scraped body) into a `venue_address` string, stored in each `events/*.md` frontmatter (`nytw.parse_event_file` reads it back out).
2. **Geocoding** — `geocode.geocode_city()` reads `event["venue_address"]`, calls OpenCage via `_opencage_request()` (1 req/sec free tier), and writes `{lat, lon, confidence}` per event into `data/<city>-for-agents/venues.json`.
3. **Export** — `geojson_export.build_geojson()` joins events + `venues.json` into the map's GeoJSON features.

There is no measurement of stage 1/2 quality. Bad addresses and miss-geocodes silently become wrong pins. We already have latent ground-truth signal: OpenCage `confidence == 10` rows and each listing's stated `neighborhood`. Constraints: this is a `uv`/`src`-layout Python project; the eval is a developer/offline workflow and must NOT add required dependencies to the shipped web/native bundle; OpenCage and LLM calls cost money and are rate-limited.

## Goals / Non-Goals

**Goals:**
- Observe every extraction + geocoding call as a Weave trace, with zero behavior change to production code paths.
- Quantify pin quality with domain-specific scorers and a labeled dataset, so "is the map correct?" becomes a number.
- Compare extraction models on accuracy + cost + latency and publish a Weave Leaderboard to drive a real model choice.
- Provide an opt-in export guardrail that stops the worst pins from shipping, reusing the same geometric checks.

**Non-Goals:**
- Re-architecting the scraper/enrichment or geocoder. We instrument and evaluate, not rewrite.
- Shipping Weave/W&B into the iOS/Android bundle or the GitHub Pages site. Eval stays in `eval/` behind an optional extra.
- Achieving a large hand-labeled dataset. A thin gold set + silver labels is sufficient for the hack-day scope.
- Auto-correcting addresses. The guardrail flags/drops; it does not re-extract.

## Decisions

### 1. Isolate the harness in `eval/`, wrap prod functions with `weave.op` at the boundary
Rather than decorating production functions in `src/` (which would couple `twag_clickhouse` imports to `weave`), the harness imports the real functions and wraps them: `traced_geocode = weave.op(geocode.geocode_address)`. Production keeps working with no `weave` installed.
- **Why over decorating in-place:** keeps `weave`/`wandb` strictly optional and out of the shipped package; the trace boundary lives with the eval that needs it.
- **Additive shim:** add one public, import-friendly wrapper `geocode.geocode_address(address: str) -> dict` around the existing private `_opencage_request`/`_result_to_record`, so the op has a clean signature. This is behavior-preserving (the existing `geocode_city` can call it too, or stay as-is).
- **Extraction op:** define `eval/extractor.py:extract_address(listing: dict) -> str` that calls an LLM on the raw listing fields — this is the unit we compare across models.

### 2. Dataset: silver from `confidence == 10`, thin gold by hand
Build a `weave.Dataset("techweek-pins")` whose rows carry `{listing, gold_address?, true_lat, true_lon, neighborhood}`.
- **Silver rows:** every `venues.json` row with `confidence == 10` — treat its OpenCage `{lat, lon}` as ground truth for *extraction* eval (does a model-produced address re-geocode near the known-good point?).
- **Gold rows:** ~30–40 hand-verified events with human lat/lon, used to evaluate the *geocoder itself* without circularity.
- **Why:** gives volume cheaply (silver) while keeping an unbiased core (gold). Avoids the trap of grading the geocoder against its own output.

### 3. Scorers: pure-Python geometric ops + one LLM-judge class
- `geocode_distance(output, true_lat, true_lon)` → haversine meters; `pin_ok = meters < 300`.
- `in_city_bbox(output)` → point inside the city bounding box (per-city constant).
- `neighborhood_consistency(output, neighborhood)` → reverse-geocode (or bbox-of-neighborhood lookup) agrees with the claimed neighborhood.
- `address_not_hallucinated` → `weave.Scorer` subclass calling a low-temp LLM judge: "is this address supported by the source listing text? yes/no."
- `confidence_calibration(output)` → records OpenCage confidence alongside pass/fail so we can validate the confidence signal.
- **Why this split:** the geometric scorers are dependency-light and reusable by the guardrail at export time (no LLM/Weave needed there); only the eval pulls in the LLM judge.

### 4. Model comparison via `weave.Model` + Leaderboard
`AddressExtractor(weave.Model)` holds `model_name` and a `@weave.op predict(listing)`. Instantiate for `gpt-4o-mini`, `claude-haiku`, and a configurable local model; run one `weave.Evaluation` per model over the shared dataset; publish a `weave.flow.leaderboard` ranking by the scorers + log token cost/latency.
- **Why:** the Leaderboard + side-by-side Evaluation compare view is the demo, and it produces an actionable "cheapest model that passes" result. The local model is optional and degrades to a 2-model run if unavailable.

### 5. Guardrail is opt-in and Weave-free
Add a `--guard` flag (CLI + `build_geojson(..., guard=False)`); when set, each feature is checked with the geometric scorers and either dropped or tagged `"pin_flagged": true` in its properties. Default export is byte-for-byte unchanged.
- **Why:** export runs in CI/offline and must not require W&B credentials or network LLM calls. Reusing the pure scorers keeps one source of truth for "what is a bad pin."

## Risks / Trade-offs

- **Circular ground truth** (grading the geocoder against OpenCage's own coords) → Mitigation: silver rows evaluate *extraction* quality only; the geocoder is judged against the hand gold set.
- **OpenCage rate limit / cost** (1 req/sec, free tier) → Mitigation: reuse the existing `venues.json` cache, keep the dataset small, and never re-geocode silver ground-truth coords.
- **LLM judge nondeterminism / cost** → Mitigation: temperature 0, constrained yes/no output, all judge calls traced in Weave for audit; judge runs only in eval, not export.
- **Optional-dep leakage** (weave/wandb breaking prod imports) → Mitigation: all Weave imports live under `eval/`; the `geocode_address` shim and guardrail scorers use only stdlib.
- **Local model unavailable on hack-day hardware** → Mitigation: model list is config-driven; harness skips missing models and logs which were dropped (no silent truncation).
- **Small gold set → noisy metrics** → Trade-off accepted for hack-day scope; metrics are directional, and the Weave UI makes per-row failures inspectable.

## Migration Plan

Purely additive. Deploy = land `eval/` + optional `pinpolice` extra + the off-by-default `--guard` flag. No data migration. Rollback = remove `eval/`, drop the optional extra, and delete the `geocode_address` shim + `guard` parameter (guardrail is off by default, so nothing depends on it).

## Open Questions

- Which local model is available at the venue (Ollama `llama3.x`? something else)? Defaults to "skip if absent."
- Neighborhood consistency: reverse-geocode each point (more OpenCage calls) vs. a static neighborhood-bbox table? Leaning static table to avoid extra API spend.
- Guardrail default action: drop vs. flag-and-keep. Leaning flag-and-keep (`pin_flagged`) so the map can still show them with a warning style.
