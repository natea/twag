## 1. Project setup

- [x] 1.1 Add an optional `pinpolice` extra in `pyproject.toml` (`weave`, `openai`, `anthropic`; keep out of the default/runtime deps) and lock with `uv`
- [x] 1.2 Create the `eval/` package skeleton (`eval/__init__.py`, `eval/README.md`) documenting required env vars: `WANDB_API_KEY`, an LLM judge key, existing `OPENCAGE_API_KEY`
- [x] 1.3 Add per-city constants module `eval/cities.py` with bounding boxes for Boston and NYC (and a neighborhood→bbox table for the consistency scorer)

## 2. Instrument the pipeline (behavior-preserving)

- [x] 2.1 Add public shim `geocode.geocode_address(address: str) -> dict` wrapping the existing `_opencage_request`/`_result_to_record`; confirm `geocode_city` output is unchanged
- [x] 2.2 Add `eval/tracing.py` that wraps `geocode_address` (and the extractor) with `weave.op` only when `weave` is importable; verify `twag_clickhouse` still imports with `weave` absent
- [x] 2.3 Implement `eval/extractor.py:extract_address(listing: dict) -> str` (LLM extraction over title/host/neighborhood/url/body) as the unit under comparison

## 3. Build the evaluation dataset

- [x] 3.1 Implement `eval/dataset.py` to read a city's `venues.json` and emit silver rows for `confidence == 10` (ground truth = that row's lat/lon)
- [x] 3.2 Support a hand-curated gold file (`eval/gold/<city>.json`) that overrides/extends silver rows and marks them gold; seed ~30–40 verified rows
- [x] 3.3 Assemble rows into a `weave.Dataset("techweek-pins")` and `weave.publish` it

## 4. Scorers

- [x] 4.1 Implement pure-Python `eval/scorers/geometry.py`: `haversine`, `geocode_distance` (fail > 300 m), `in_city_bbox` — no Weave/LLM imports (reused by the guardrail)
- [x] 4.2 Wrap the geometric scorers as `weave.op` scorer functions for use in `weave.Evaluation`
- [x] 4.3 Implement `neighborhood_consistency` scorer using the static neighborhood-bbox table
- [x] 4.4 Implement `AddressHallucinationScorer(weave.Scorer)` LLM judge (temperature 0, yes/no), traced in Weave
- [x] 4.5 Implement `confidence_calibration` scorer that logs OpenCage confidence alongside `pin_ok`

## 5. Multi-model evaluation + leaderboard

- [x] 5.1 Implement `AddressExtractor(weave.Model)` with config-driven `model_name` and a `@weave.op predict(listing)`
- [x] 5.2 Capture token cost + latency per model run
- [x] 5.3 Run one `weave.Evaluation` per configured model over the shared dataset; skip-and-report unavailable models (e.g. missing local model)
- [x] 5.4 Publish a `weave.flow.leaderboard` ranking models by the scorers; add a `eval/run.py` entrypoint (`uv run python -m eval.run --city boston`)

## 6. Export guardrail (opt-in, dependency-light)

- [x] 6.1 Add `guard: bool = False` to `geojson_export.build_geojson(...)` and a `--guard` flag to the `geojson` CLI subcommand
- [x] 6.2 When enabled, evaluate each feature with `eval/scorers/geometry.py` and drop or tag (`"pin_flagged": true`) per a configurable action
- [x] 6.3 Report counts of flagged/dropped pins; assert default (unguarded) output is byte-for-byte identical via a snapshot test

## 7. Tests & verification

- [x] 7.1 Unit tests: haversine correctness, `geocode_distance` 300 m threshold, `in_city_bbox` in/out cases, neighborhood mismatch
- [x] 7.2 Test that wrapping with `weave.op` preserves geocode output, and that import works without `weave` installed
- [x] 7.3 Snapshot test: unguarded `build_geojson` output unchanged; guarded run drops/flags a known bad pin
- [x] 7.4 Smoke-run the full eval against Boston with a tiny dataset; confirm traces, an evaluation, and a leaderboard appear in Weave

## 8. Demo & docs

- [x] 8.1 Capture a "caught a bad pin" example: a hallucinated/out-of-bbox pin shown on the map, then flagged by the guardrail
- [x] 8.2 Write `eval/README.md` run instructions + a short demo script (traces → eval compare view → leaderboard → guardrail before/after) for the "Best Use of Weave" pitch
