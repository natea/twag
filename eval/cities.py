"""City constants for the eval harness.

The canonical bounding boxes and neighborhood tables live in the package
(``twag_clickhouse.pin_geometry``) so the export guardrail and the eval share
one source of truth. This module just re-exports them plus a couple of
eval-only helpers.
"""
from __future__ import annotations

from twag_clickhouse.pin_geometry import (  # re-export
    CITY_BBOX,
    NEIGHBORHOOD_BBOX,
    PIN_DISTANCE_THRESHOLD_M,
)

__all__ = ["CITY_BBOX", "NEIGHBORHOOD_BBOX", "PIN_DISTANCE_THRESHOLD_M", "bbox_center"]


def bbox_center(city_slug: str) -> tuple[float, float]:
    """(lat, lon) center of a city's bbox — handy as a fallback in demos."""
    lo_la, lo_lo, hi_la, hi_lo = CITY_BBOX[city_slug]
    return ((lo_la + hi_la) / 2, (lo_lo + hi_lo) / 2)
