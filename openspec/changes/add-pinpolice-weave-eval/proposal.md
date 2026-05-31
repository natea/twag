## Why

StageHopper's whole value is "conference sites don't have maps — we make the maps," yet every pin is the output of a fragile chain: messy Partiful listing → LLM extracts a venue address → OpenCage geocodes it → lat/lon. Nothing today catches when that chain hallucinates an address or drops a pin in the wrong neighborhood (or the Charles River), so quality is invisible and unmeasured. Pin Police makes that failure mode a graded, observable Weave evaluation — and adds a guardrail so bad pins never ship. (Also the most natural fit for the hackathon "Best Use of Weave" prize.)

## What Changes

- Add a new `eval/` harness (new optional `pinpolice` extra) that uses **Weave** to trace and evaluate the address-extraction + geocoding pipeline.
- Wrap the real extraction (`nytw.py`) and geocoding (`geocode.py`) steps as `weave.op` traces so every production call is observable — without changing their behavior.
- Build a **gold Dataset** of labeled Tech Week events, seeding "silver" labels from the `confidence == 10` rows already in `venues.json`, with a thin layer of hand-verified gold rows.
- Add domain **scorers**: `geocode_distance` (haversine vs authoritative coords, fail > 300 m), `in_city_bbox`, `neighborhood_consistency`, `address_not_hallucinated` (LLM-as-judge over the source listing text), and `confidence_calibration`.
- Run a `weave.Evaluation` comparing extraction across **3 models** (gpt-4o-mini, claude-haiku, a local model) for accuracy + cost + latency, and publish a **Weave Leaderboard**.
- Add an **opt-in export-time guardrail** in `geojson_export.py` that flags or drops pins failing `in_city_bbox` or `geocode_distance`, gated behind a flag so default export behavior is unchanged.

## Capabilities

### New Capabilities
- `pin-quality-eval`: Weave-instrumented evaluation of the extraction+geocoding pipeline — op tracing, the gold/silver dataset, the domain scorers, and the multi-model evaluation + leaderboard.
- `pin-export-guardrail`: An opt-in gate in the GeoJSON export that reuses the geometric scorers to flag or drop low-quality pins before they reach the map.

### Modified Capabilities
<!-- None — there are no existing OpenSpec specs; this is the first change. -->

## Impact

- **New code**: `eval/` package (harness, scorers, dataset builder, model adapters, leaderboard publisher). New `eval/README.md`.
- **Touched code (additive, behavior-preserving)**: `src/twag_clickhouse/nytw.py` and `geocode.py` gain `weave.op`-wrappable entry points (or thin wrappers in the harness if signatures aren't import-friendly); `geojson_export.py` gains an opt-in `--guard` path.
- **Dependencies**: new optional extra `pinpolice` adding `weave`, an LLM client for the judge (`openai`/`anthropic`), and any local-model runner; managed via `uv`. No new required runtime deps for the live site/apps.
- **External services / secrets**: requires `WANDB_API_KEY` (Weave), an LLM judge key, and reuses the existing `OPENCAGE_API_KEY`. Eval is a dev/offline workflow — not shipped in the iOS/Android bundle or the web deploy.
- **Data**: reads existing `data/<city>-for-agents/` datasets and `venues.json`; writes a published Weave dataset + eval results (no changes to committed data files).
