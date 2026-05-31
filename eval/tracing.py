"""Weave tracing boundary.

We wrap production functions with ``weave.op`` *here*, at the eval boundary,
rather than decorating them in ``src/`` — so the shipped ``twag_clickhouse``
package never imports Weave. If Weave isn't installed (or init fails), the
wrappers degrade to the bare functions and everything still runs.
"""
from __future__ import annotations

import os
from typing import Any, Callable

try:  # Weave is an optional (pinpolice) dependency.
    import weave  # type: ignore
    _HAVE_WEAVE = True
except Exception:  # pragma: no cover - exercised in the weave-absent path
    weave = None  # type: ignore
    _HAVE_WEAVE = False


_INITED = False


def have_weave() -> bool:
    return _HAVE_WEAVE


def init(project: str = "stagehopper-pin-police") -> bool:
    """Initialize Weave once. Returns True if tracing is active.

    Reads WANDB_API_KEY from the environment (loaded from .env by callers).
    Safe to call when Weave is absent — returns False.
    """
    global _INITED
    if not _HAVE_WEAVE:
        return False
    if _INITED:
        return True
    weave.init(project)
    _INITED = True
    return True


def op(fn: Callable[..., Any], name: str | None = None) -> Callable[..., Any]:
    """Wrap a callable as a weave.op when Weave is available; else return as-is."""
    if not _HAVE_WEAVE:
        return fn
    return weave.op(fn, name=name) if name else weave.op(fn)


def traced_geocode() -> Callable[..., Any]:
    """The geocoder (twag_clickhouse.geocode.geocode_address), Weave-wrapped."""
    from twag_clickhouse.geocode import geocode_address

    return op(geocode_address, name="geocode_address")
