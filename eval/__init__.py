"""Pin Police — a Weave-instrumented evaluation harness for StageHopper's
event address-extraction + geocoding pipeline.

This package is a developer/offline tool. It is NOT shipped in the web or
native app bundle. Install its dependencies with:

    uv sync --extra pinpolice

Then run an evaluation:

    uv run python -m eval.run --city boston            # geocode-quality eval (no LLM key needed)
    uv run python -m eval.run --city boston --mode models   # 3-model extraction comparison

See eval/README.md for details.
"""
