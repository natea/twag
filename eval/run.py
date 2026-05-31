"""Pin Police runner.

    uv run python -m eval.run --city boston                # geocode-quality eval (no LLM/API keys)
    uv run python -m eval.run --city boston --mode models  # 3-model extraction comparison + leaderboard

geocode-mode  : evaluates the *already-shipped* pins (from venues.json) with the
                ground-truth-free scorers (in_city_bbox, neighborhood_consistency).
                No OpenCage/LLM calls — runnable immediately. Answers "how many of
                our live pins are out-of-city or in the wrong neighborhood?"

models-mode   : for each configured model, extract a fresh address -> geocode it
                -> score against the cached confidence==10 coords (ground truth)
                with distance + bbox + neighborhood + hallucination + calibration.
                Publishes a Weave Leaderboard ranking the models.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

from . import tracing
from .dataset import build_rows, to_weave_dataset
from .scorers import weave_scorers as S

DEFAULT_MODELS = ["gpt-4o-mini", "claude-haiku-4-5-20251001", "llama3.1"]


def _load_env() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(".env", override=False)
    except Exception:
        pass


def run_geocode_mode(city: str, limit: int | None) -> int:
    """Evaluate shipped pins with ground-truth-free scorers."""
    import weave

    rows = build_rows(city, limit=limit)
    if not rows:
        print(f"No events found for city={city!r}. Did you build the dataset?", file=sys.stderr)
        return 1

    ds = to_weave_dataset(rows, name=f"techweek-pins-{city}")

    @weave.op
    def shipped_pin(cached_lat, cached_lon, confidence, **_) -> dict:
        # The "model" under eval is the pipeline output already in venues.json.
        return {"lat": cached_lat, "lon": cached_lon, "confidence": confidence}

    evaluation = weave.Evaluation(
        dataset=ds,
        scorers=[S.score_in_city_bbox, S.score_neighborhood_consistency],
    )
    results = asyncio.run(evaluation.evaluate(shipped_pin))
    print("\n=== geocode-mode results ===")
    print(_fmt(results))
    return 0


def run_models_mode(city: str, limit: int | None, models: list[str], difficulty: str = "clean") -> int:
    import weave

    from .extractor import AddressExtractor, model_available
    from .tracing import traced_geocode

    rows = build_rows(city, limit=limit, require_truth=True, difficulty=difficulty)
    if not rows:
        print(
            f"No ground-truth rows for difficulty={difficulty!r}. "
            "Run geocode-venues first, or try --difficulty all.",
            file=sys.stderr,
        )
        return 1
    print(f"dataset: {len(rows)} rows (difficulty={difficulty})")

    suffix = "" if difficulty == "clean" else f"-{difficulty}"
    ds = to_weave_dataset(rows, name=f"techweek-pins-truth-{city}{suffix}")
    geocode = traced_geocode()

    available, skipped = [], []
    for m in models:
        (available if model_available(m) else skipped).append(m)
    if skipped:
        print(f"⚠ skipping unavailable models (no key/endpoint): {', '.join(skipped)}")
    if not available:
        print("No extraction models available. Set OPENAI_API_KEY / ANTHROPIC_API_KEY / LOCAL_LLM_BASE_URL.", file=sys.stderr)
        return 1

    scorers = list(S.GEOMETRIC_SCORERS) + [S.AddressHallucinationScorer()]
    eval_rows = ds
    evaluation = weave.Evaluation(dataset=eval_rows, scorers=scorers)

    summaries = {}
    for model_name in available:
        extractor = AddressExtractor(model_name=model_name)

        @weave.op(name=f"extract_then_geocode::{model_name}")
        def pipeline(listing, _ex=extractor, _geo=geocode, **_) -> dict:
            extracted = _ex.predict(listing)
            geo = _geo(extracted["address"])
            return {**geo, **{k: extracted[k] for k in ("model", "latency_ms") if k in extracted}}

        print(f"\n→ evaluating model: {model_name}")
        summaries[model_name] = asyncio.run(evaluation.evaluate(pipeline))
        print(_fmt(summaries[model_name]))

    _publish_leaderboard(city, evaluation, available, difficulty)
    return 0


def _publish_leaderboard(city: str, evaluation, models: list[str], difficulty: str = "clean") -> None:
    try:
        import weave
        from weave.flow import leaderboard
        from weave.trace.ref_util import get_ref

        suffix = "" if difficulty == "clean" else f"-{difficulty}"
        spec = leaderboard.Leaderboard(
            name=f"pin-police-{city}{suffix}",
            description=f"StageHopper address-extraction models ranked by pin quality ({difficulty} addresses).",
            columns=[
                leaderboard.LeaderboardColumn(
                    evaluation_object_ref=get_ref(evaluation).uri(),
                    scorer_name="score_geocode_distance",
                    summary_metric_path="pin_ok.true_fraction",
                ),
            ],
        )
        weave.publish(spec)
        print(f"\n✓ published leaderboard 'pin-police-{city}{suffix}' to Weave")
    except Exception as exc:  # leaderboard SDK surface varies by version
        print(f"\n(leaderboard publish skipped: {exc}); compare models in the Weave UI Evaluations tab")


def _fmt(results) -> str:
    import json

    try:
        return json.dumps(results, indent=2, default=str)
    except Exception:
        return str(results)


def main(argv: list[str] | None = None) -> int:
    _load_env()
    ap = argparse.ArgumentParser(prog="eval.run", description="Pin Police — Weave eval harness")
    ap.add_argument("--city", default="boston", help="City slug (boston|nyc)")
    ap.add_argument("--mode", choices=["geocode", "models"], default="geocode")
    ap.add_argument("--limit", type=int, default=None, help="Cap rows (smoke tests)")
    ap.add_argument("--models", nargs="*", default=DEFAULT_MODELS, help="Extraction models for --mode models")
    ap.add_argument(
        "--difficulty",
        choices=["clean", "hard", "all"],
        default="clean",
        help="models-mode ground-truth pool: clean=confidence10, hard=conf1-9 (models diverge), all=any",
    )
    ap.add_argument("--project", default="stagehopper-pin-police", help="Weave project name")
    args = ap.parse_args(argv)

    if not tracing.init(args.project):
        print("Weave not available/initialized. Install with: uv sync --extra pinpolice", file=sys.stderr)
        return 2
    print(f"Weave initialized → project '{args.project}' (mode={args.mode}, city={args.city})")

    if args.mode == "geocode":
        return run_geocode_mode(args.city, args.limit)
    return run_models_mode(args.city, args.limit, args.models, args.difficulty)


if __name__ == "__main__":
    raise SystemExit(main())
