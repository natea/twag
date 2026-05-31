"""Weave scorer functions + the LLM-as-judge hallucination scorer.

Each scorer takes the pipeline ``output`` plus dataset columns (Weave matches
by parameter name) and returns a dict of metrics. The geometric scorers wrap
the shared pure-Python checks in ``geometry``; only the hallucination judge
needs an LLM.
"""
from __future__ import annotations

from typing import Any

from . import geometry

try:
    import weave  # type: ignore

    _op = weave.op
    _Scorer = weave.Scorer
except Exception:  # pragma: no cover - allow import without weave for tests
    def _op(fn=None, **_kw):  # type: ignore
        return fn if fn is not None else (lambda f: f)

    class _Scorer:  # type: ignore
        def __init__(self, **kw):
            for k, v in kw.items():
                setattr(self, k, v)


def _xy(output: dict[str, Any]) -> tuple[Any, Any]:
    return output.get("lat"), output.get("lon")


@_op
def score_geocode_distance(output: dict, true_lat: float, true_lon: float) -> dict:
    lat, lon = _xy(output)
    return geometry.geocode_distance(lat, lon, true_lat, true_lon)


@_op
def score_in_city_bbox(output: dict, city_slug: str) -> dict:
    lat, lon = _xy(output)
    return geometry.in_city_bbox(lat, lon, city_slug)


@_op
def score_neighborhood_consistency(output: dict, neighborhood: str, city_slug: str) -> dict:
    lat, lon = _xy(output)
    return geometry.neighborhood_consistency(lat, lon, neighborhood, city_slug)


@_op
def score_confidence_calibration(output: dict, true_lat: float, true_lon: float) -> dict:
    """Log the geocoder's confidence next to the actual pin outcome so the
    confidence signal can be validated (high confidence should mean pin_ok)."""
    lat, lon = _xy(output)
    dist = geometry.geocode_distance(lat, lon, true_lat, true_lon)
    conf = int(output.get("confidence") or 0)
    return {
        "confidence": conf,
        "confidence_high": conf >= 8,
        "pin_ok": bool(dist.get("pin_ok")),
        # True when confidence agrees with reality (both high+ok or both low+bad).
        "calibrated": (conf >= 8) == bool(dist.get("pin_ok")),
    }


class AddressHallucinationScorer(_Scorer):
    """LLM-as-judge: is the extracted address supported by the source listing?

    Deterministic (temperature 0), constrained yes/no. When no LLM client is
    configured the scorer returns ``checked=False`` rather than guessing.
    """

    provider: str = "openai"  # "openai" | "anthropic"
    model: str = "gpt-4o-mini"

    @_op
    def score(self, *, output: dict, listing: dict) -> dict:
        address = (output or {}).get("address") or ""
        verdict = _judge_address_supported(listing, address, self.provider, self.model)
        if verdict is None:
            return {"hallucination_free": None, "checked": False, "reason": "no_llm_client"}
        return {"hallucination_free": verdict, "checked": True}


def _judge_address_supported(
    listing: dict, address: str, provider: str, model: str
) -> bool | None:
    """Return True/False, or None if no client is available."""
    source = _listing_text(listing)
    prompt = (
        "You verify event venue addresses. Given the SOURCE listing text and an "
        "EXTRACTED address, answer strictly 'yes' if the address is supported by "
        "(or clearly implied by) the source, or 'no' if it appears invented or "
        "contradicts the source. Answer with one word: yes or no.\n\n"
        f"SOURCE:\n{source}\n\nEXTRACTED ADDRESS:\n{address}\n\nSupported?"
    )
    text = _llm_oneword(prompt, provider, model)
    if text is None:
        return None
    return text.strip().lower().startswith("y")


def _listing_text(listing: dict) -> str:
    parts = []
    for key in ("title", "host", "neighborhood", "venue_name", "venue_address", "url", "description", "markdown_body"):
        val = listing.get(key)
        if val:
            parts.append(f"{key}: {val}")
    return "\n".join(parts)[:4000]


def _llm_oneword(prompt: str, provider: str, model: str) -> str | None:
    import os

    if provider == "openai" and os.getenv("OPENAI_API_KEY"):
        try:
            from openai import OpenAI

            client = OpenAI()
            resp = client.chat.completions.create(
                model=model,
                temperature=0,
                max_tokens=2,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.choices[0].message.content or ""
        except Exception:
            return None
    if provider == "anthropic" and os.getenv("ANTHROPIC_API_KEY"):
        try:
            import anthropic

            client = anthropic.Anthropic()
            resp = client.messages.create(
                model=model,
                temperature=0,
                max_tokens=2,
                messages=[{"role": "user", "content": prompt}],
            )
            return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        except Exception:
            return None
    return None


GEOMETRIC_SCORERS = [
    score_geocode_distance,
    score_in_city_bbox,
    score_neighborhood_consistency,
    score_confidence_calibration,
]
