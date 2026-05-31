"""Pure-Python geometric pin checks — the single source of truth for "is this
a good map pin?", shared by the Pin Police eval harness (eval/) and the opt-in
GeoJSON export guardrail (geojson_export.build_geojson(guard=True)).

Stdlib only: no Weave, no W&B, no network, no LLM. This keeps the export
guardrail runnable in CI/offline with no credentials.

Bounding boxes are (min_lat, min_lon, max_lat, max_lon). They are deliberately
generous — covering the whole metro a Tech Week realistically spans — so the
checks catch gross errors (ocean, wrong city) without false-flagging legit
fringe venues.
"""
from __future__ import annotations

import math
from typing import Any

# Fail threshold for geocode_distance, in meters.
PIN_DISTANCE_THRESHOLD_M = 300.0

# City metro bounding boxes, keyed by CityConfig.slug.
CITY_BBOX: dict[str, tuple[float, float, float, float]] = {
    # Boston + Cambridge + Somerville + Seaport.
    "boston": (42.22, -71.20, 42.45, -70.98),
    # Manhattan + the Brooklyn/LIC waterfront where Tech Week clusters.
    "nyc": (40.57, -74.05, 40.88, -73.70),
}

# Coarse per-neighborhood bounding boxes for neighborhood_consistency. Keys are
# lowercased; values are (min_lat, min_lon, max_lat, max_lon). Boxes are padded
# generously — this is a sanity check (right-city-wrong-borough), not survey
# data. Unknown neighborhoods are treated as "can't disprove" (consistent).
NEIGHBORHOOD_BBOX: dict[str, dict[str, tuple[float, float, float, float]]] = {
    "boston": {
        "back bay": (42.345, -71.090, 42.356, -71.072),
        "south end": (42.336, -71.082, 42.348, -71.064),
        "seaport": (42.345, -71.052, 42.356, -71.030),
        "fenway": (42.340, -71.105, 42.352, -71.085),
        "beacon hill": (42.355, -71.075, 42.362, -71.062),
        "north end": (42.363, -71.058, 42.372, -71.048),
        "downtown": (42.353, -71.065, 42.363, -71.052),
        "financial district": (42.352, -71.060, 42.360, -71.048),
        "cambridge": (42.355, -71.130, 42.400, -71.070),
        "kendall": (42.360, -71.095, 42.372, -71.075),
        "kendall square": (42.360, -71.095, 42.372, -71.075),
        "harvard square": (42.368, -71.125, 42.378, -71.110),
        "somerville": (42.375, -71.120, 42.410, -71.080),
        "davis square": (42.390, -71.130, 42.402, -71.118),
        "union square": (42.375, -71.100, 42.385, -71.085),
        "allston": (42.350, -71.140, 42.365, -71.115),
        "brighton": (42.340, -71.165, 42.360, -71.135),
        "jamaica plain": (42.300, -71.125, 42.325, -71.100),
        "south boston": (42.330, -71.055, 42.345, -71.020),
        "east boston": (42.365, -71.045, 42.392, -71.010),
    },
    "nyc": {
        "soho": (40.719, -74.006, 40.728, -73.996),
        "tribeca": (40.714, -74.013, 40.722, -74.002),
        "chelsea": (40.740, -74.010, 40.755, -73.994),
        "flatiron": (40.738, -73.996, 40.745, -73.985),
        "midtown": (40.745, -73.995, 40.765, -73.970),
        "downtown": (40.700, -74.020, 40.722, -73.995),
        "chinatown": (40.713, -73.999, 40.720, -73.990),
        "east village": (40.722, -73.992, 40.732, -73.976),
        "west village": (40.730, -74.010, 40.740, -73.998),
        "lower east side": (40.713, -73.990, 40.723, -73.975),
        "upper west side": (40.770, -73.990, 40.800, -73.965),
        "uws": (40.770, -73.990, 40.800, -73.965),
        "upper east side": (40.764, -73.970, 40.790, -73.945),
        "ues": (40.764, -73.970, 40.790, -73.945),
        "manhattan": (40.700, -74.020, 40.880, -73.910),
        "williamsburg": (40.700, -73.970, 40.725, -73.935),
        "brooklyn": (40.570, -74.040, 40.740, -73.855),
    },
}


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points, in meters."""
    radius = 6_371_000.0
    p = math.pi / 180.0
    dlat = (lat2 - lat1) * p
    dlon = (lon2 - lon1) * p
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin(dlon / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def _coords_ok(lat: Any, lon: Any) -> bool:
    return isinstance(lat, (int, float)) and isinstance(lon, (int, float))


def geocode_distance(
    lat: float | None,
    lon: float | None,
    true_lat: float | None,
    true_lon: float | None,
    *,
    threshold_m: float = PIN_DISTANCE_THRESHOLD_M,
) -> dict[str, Any]:
    """Distance between a produced pin and ground truth; pin_ok if within threshold."""
    if not (_coords_ok(lat, lon) and _coords_ok(true_lat, true_lon)):
        return {"meters_off": None, "pin_ok": False, "reason": "missing_coords"}
    d = haversine_m(float(lat), float(lon), float(true_lat), float(true_lon))
    return {"meters_off": round(d, 1), "pin_ok": d <= threshold_m}


def in_city_bbox(lat: float | None, lon: float | None, city_slug: str) -> dict[str, Any]:
    """Whether a pin falls inside its city's metro bounding box."""
    bbox = CITY_BBOX.get(city_slug)
    if bbox is None:
        return {"in_bbox": True, "reason": "no_bbox_for_city"}
    if not _coords_ok(lat, lon):
        return {"in_bbox": False, "reason": "missing_coords"}
    lo_la, lo_lo, hi_la, hi_lo = bbox
    inside = lo_la <= float(lat) <= hi_la and lo_lo <= float(lon) <= hi_lo
    return {"in_bbox": inside}


def neighborhood_consistency(
    lat: float | None,
    lon: float | None,
    neighborhood: str | None,
    city_slug: str,
    *,
    pad_deg: float = 0.01,
) -> dict[str, Any]:
    """Whether a pin agrees with the listing's stated neighborhood.

    Unknown/unmapped neighborhoods can't be disproved, so they return consistent.
    The neighborhood box is padded (~1 km) to avoid edge false-flags.
    """
    table = NEIGHBORHOOD_BBOX.get(city_slug, {})
    key = (neighborhood or "").strip().lower()
    bbox = table.get(key)
    if bbox is None:
        return {"consistent": True, "checked": False, "reason": "neighborhood_unmapped"}
    if not _coords_ok(lat, lon):
        return {"consistent": False, "checked": True, "reason": "missing_coords"}
    lo_la, lo_lo, hi_la, hi_lo = bbox
    inside = (
        (lo_la - pad_deg) <= float(lat) <= (hi_la + pad_deg)
        and (lo_lo - pad_deg) <= float(lon) <= (hi_lo + pad_deg)
    )
    return {"consistent": inside, "checked": True}


def pin_verdict(
    lat: float | None,
    lon: float | None,
    city_slug: str,
    *,
    true_lat: float | None = None,
    true_lon: float | None = None,
    neighborhood: str | None = None,
) -> dict[str, Any]:
    """Combined geometric verdict used by the export guardrail. A pin is `ok`
    when it's inside the city bbox AND (if ground truth is available) within the
    distance threshold. Neighborhood consistency is advisory (reported, not
    fatal) because the neighborhood table is coarse."""
    bbox = in_city_bbox(lat, lon, city_slug)
    checks: dict[str, Any] = {"in_city_bbox": bbox}
    ok = bool(bbox.get("in_bbox"))

    if true_lat is not None and true_lon is not None:
        dist = geocode_distance(lat, lon, true_lat, true_lon)
        checks["geocode_distance"] = dist
        ok = ok and bool(dist.get("pin_ok"))

    if neighborhood:
        checks["neighborhood_consistency"] = neighborhood_consistency(
            lat, lon, neighborhood, city_slug
        )

    return {"ok": ok, "checks": checks}
