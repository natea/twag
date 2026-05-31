"""Address extraction — the unit compared across models.

``extract_address(listing, model)`` asks an LLM to produce a single best-guess
US street address for an event from its raw listing fields. ``AddressExtractor``
wraps this as a ``weave.Model`` so each model variant becomes a comparable
entry in a ``weave.Evaluation`` / Leaderboard, capturing latency and token cost.
"""
from __future__ import annotations

import os
import time
from typing import Any

from .scorers.weave_scorers import _listing_text

try:
    import weave  # type: ignore

    _Model = weave.Model
    _op = weave.op
except Exception:  # pragma: no cover
    def _op(fn=None, **_kw):
        return fn if fn is not None else (lambda f: f)

    class _Model:  # type: ignore
        def __init__(self, **kw):
            for k, v in kw.items():
                setattr(self, k, v)


_PROMPT = (
    "Extract the single best US street address for this event's venue. "
    "Use only what the listing supports; prefer a full 'street, city, ST ZIP' "
    "form. If no address is recoverable, output the venue name and city. "
    "Output ONLY the address on one line, nothing else.\n\nLISTING:\n{listing}\n\nADDRESS:"
)

# Provider inferred from model name prefix.
_OPENAI_PREFIXES = ("gpt-", "o1", "o3", "o4")
_ANTHROPIC_PREFIXES = ("claude-",)


def provider_for(model: str) -> str:
    if model.startswith(_ANTHROPIC_PREFIXES):
        return "anthropic"
    if model.startswith(_OPENAI_PREFIXES):
        return "openai"
    return "local"  # anything else -> Ollama-style local endpoint


def model_available(model: str) -> bool:
    p = provider_for(model)
    if p == "openai":
        return bool(os.getenv("OPENAI_API_KEY"))
    if p == "anthropic":
        return bool(os.getenv("ANTHROPIC_API_KEY"))
    # local: assume an OpenAI-compatible endpoint (e.g. Ollama) is configured.
    return bool(os.getenv("LOCAL_LLM_BASE_URL") or os.getenv("OLLAMA_HOST"))


def _call_model(prompt: str, model: str) -> tuple[str, dict[str, Any]]:
    """Return (text, meta) where meta has prompt/completion tokens if known."""
    p = provider_for(model)
    if p == "openai":
        from openai import OpenAI

        client = OpenAI()
        r = client.chat.completions.create(
            model=model, temperature=0, max_tokens=64,
            messages=[{"role": "user", "content": prompt}],
        )
        usage = r.usage
        return (r.choices[0].message.content or "").strip(), {
            "prompt_tokens": getattr(usage, "prompt_tokens", None),
            "completion_tokens": getattr(usage, "completion_tokens", None),
        }
    if p == "anthropic":
        import anthropic

        client = anthropic.Anthropic()
        r = client.messages.create(
            model=model, temperature=0, max_tokens=64,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in r.content if getattr(b, "type", "") == "text").strip()
        return text, {
            "prompt_tokens": getattr(r.usage, "input_tokens", None),
            "completion_tokens": getattr(r.usage, "output_tokens", None),
        }
    # local OpenAI-compatible endpoint
    from openai import OpenAI

    base = os.getenv("LOCAL_LLM_BASE_URL") or "http://localhost:11434/v1"
    client = OpenAI(base_url=base, api_key=os.getenv("LOCAL_LLM_API_KEY", "ollama"))
    r = client.chat.completions.create(
        model=model, temperature=0, max_tokens=64,
        messages=[{"role": "user", "content": prompt}],
    )
    return (r.choices[0].message.content or "").strip(), {}


@_op
def extract_address(listing: dict, model: str = "gpt-4o-mini") -> dict:
    """Extract a venue address from a raw listing using ``model``.

    Returns ``{address, model, latency_ms, prompt_tokens, completion_tokens}``.
    The returned dict is the input to the geocoder in the models-mode pipeline.
    """
    prompt = _PROMPT.format(listing=_listing_text(listing))
    t0 = time.perf_counter()
    text, meta = _call_model(prompt, model)
    latency_ms = round((time.perf_counter() - t0) * 1000, 1)
    return {
        "address": text.splitlines()[0].strip() if text else "",
        "model": model,
        "latency_ms": latency_ms,
        **meta,
    }


class AddressExtractor(_Model):
    """A weave.Model wrapping one extraction model, so multiple models can be
    compared head-to-head in a single Evaluation + Leaderboard."""

    model_name: str = "gpt-4o-mini"

    @_op
    def predict(self, listing: dict) -> dict:
        return extract_address(listing, self.model_name)
