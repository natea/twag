# Pin Police — Weave eval for StageHopper's map pins

StageHopper's value is "conference sites don't have maps — we make the maps."
But every pin is the output of a fragile chain: messy Partiful listing → LLM
extracts a venue address → OpenCage geocodes it → lat/lon. **Pin Police** turns
that invisible failure mode into a graded, traced [Weave](https://wandb.ai/site/weave)
evaluation — and ships a guardrail so bad pins never reach the map.

> Built for the hackathon **"Best Use of Weave"** track.

## The 60-second demo

1. **Trace** — run the eval; open the Weave run link. Every geocode/extraction
   call is a trace.
2. **Measure** — the Evaluation summary: *"of 40 live Boston pins, 80% are
   inside the city and 82.5% match their claimed neighborhood."* Quality is now
   a number.
3. **The caught pin** — three Tech Week events list **"4 Copley Place, Back
   Bay"** but geocoded to **(42.15, −71.15)** — ~24 km south of Boston, near
   Walpole. `in_city_bbox` and `neighborhood_consistency` both flag it.
4. **Guardrail** — `twag build-geojson --guard` tags those 7 bad pins
   `pin_flagged`; with `--guard-action drop` they never ship. Same checks as the
   eval (one source of truth).
5. **Leaderboard** (with LLM keys) — `--mode models` compares gpt-4o-mini vs
   claude-haiku vs a local model on accuracy + cost + latency, and publishes a
   Weave Leaderboard → "the cheapest model that still passes."

## Setup

```bash
uv sync --extra pinpolice
```

Secrets go in `.env` (gitignored):

| Var | Needed for | Notes |
|-----|------------|-------|
| `WANDB_API_KEY` | always | Weave tracing/eval |
| `OPENCAGE_API_KEY` | `--mode models` | re-geocoding extracted addresses |
| `OPENAI_API_KEY` | gpt models + hallucination judge | |
| `ANTHROPIC_API_KEY` | claude models | |
| `LOCAL_LLM_BASE_URL` | local model | OpenAI-compatible (e.g. Ollama `http://localhost:11434/v1`) |

## Run

```bash
# geocode-mode (default): evaluate the ALREADY-SHIPPED pins with the
# ground-truth-free scorers. No OpenCage/LLM keys needed — runnable now.
uv run python -m eval.run --city boston --limit 40

# models-mode: extract fresh addresses with N models, geocode, score against
# the confidence==10 coords, and publish a leaderboard. Needs LLM + OpenCage.
uv run python -m eval.run --city boston --mode models \
    --models gpt-4o-mini claude-haiku-4-5-20251001 llama3.1
```

Unavailable models (missing key/endpoint) are **skipped and reported**, never
silently dropped.

## Guardrail (opt-in, dependency-light)

```bash
twag --city boston build-geojson            # default — output unchanged
twag --city boston build-geojson --guard    # flag bad pins (pin_flagged: true)
twag --city boston build-geojson --guard --guard-action drop   # drop them
```

The guardrail uses only `twag_clickhouse.pin_geometry` (stdlib) — no Weave, no
W&B credentials, no network — so it runs in CI/offline.

## How it works

| File | Role |
|------|------|
| `twag_clickhouse/pin_geometry.py` | **Canonical** geometric checks (haversine, bbox, neighborhood, verdict). Shared by eval + guardrail. |
| `eval/tracing.py` | Wraps prod functions with `weave.op` at the boundary — the shipped package never imports Weave. |
| `eval/extractor.py` | `extract_address` + `AddressExtractor(weave.Model)` — the unit compared across models. |
| `eval/dataset.py` | Builds the dataset: silver labels (`confidence==10`) + hand gold (`eval/gold/<city>.json`). |
| `eval/scorers/geometry.py` | Re-exports the package checks. |
| `eval/scorers/weave_scorers.py` | `weave.op` scorers + `AddressHallucinationScorer` (LLM-as-judge). |
| `eval/run.py` | Orchestrates both modes + leaderboard. |

### Scorers

- `geocode_distance` — haversine vs ground truth; fail > 300 m.
- `in_city_bbox` — pin must fall in the city metro box.
- `neighborhood_consistency` — pin must agree with the listing's neighborhood.
- `address_not_hallucinated` — LLM judge: is the address supported by the source?
- `confidence_calibration` — does OpenCage confidence actually predict correctness?

### Why two modes (no circular ground truth)

- **geocode-mode** judges shipped pins with checks that need *no* ground truth
  (`in_city_bbox`, `neighborhood_consistency`) — so grading the geocoder against
  its own output is impossible.
- **models-mode** grades a *fresh* model-extracted address against the cached
  high-confidence coordinate, which a different process produced.
