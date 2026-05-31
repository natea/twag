"""Unit tests for the shared geometric pin checks (Pin Police)."""
from __future__ import annotations

from twag_clickhouse import pin_geometry as G


def test_haversine_known_distance():
    # ~1 km north of a Boston point: 0.009 deg lat ≈ 1000 m.
    d = G.haversine_m(42.3601, -71.0589, 42.3601 + 0.009, -71.0589)
    assert 980 < d < 1020


def test_geocode_distance_threshold():
    base_lat, base_lon = 42.3496, -71.0500  # SPIN Boston (gold)
    near = G.geocode_distance(base_lat + 0.0010, base_lon, base_lat, base_lon)  # ~111 m
    assert near["pin_ok"] is True and near["meters_off"] < 300

    far = G.geocode_distance(base_lat + 0.0100, base_lon, base_lat, base_lon)  # ~1.1 km
    assert far["pin_ok"] is False and far["meters_off"] > 300


def test_geocode_distance_missing_coords():
    out = G.geocode_distance(None, None, 42.0, -71.0)
    assert out["pin_ok"] is False and out["reason"] == "missing_coords"


def test_in_city_bbox_in_and_out():
    inside = G.in_city_bbox(42.3601, -71.0589, "boston")
    assert inside["in_bbox"] is True

    # Out in the Atlantic, east of Boston.
    outside = G.in_city_bbox(42.36, -70.40, "boston")
    assert outside["in_bbox"] is False

    nyc_in = G.in_city_bbox(40.7549, -73.9840, "nyc")
    assert nyc_in["in_bbox"] is True


def test_in_city_bbox_unknown_city_passes():
    assert G.in_city_bbox(0.0, 0.0, "atlantis")["in_bbox"] is True


def test_neighborhood_consistency():
    # A Back Bay point agrees with "Back Bay".
    ok = G.neighborhood_consistency(42.350, -71.081, "Back Bay", "boston")
    assert ok["consistent"] is True and ok["checked"] is True

    # A Cambridge point disagrees with a "Back Bay" claim.
    bad = G.neighborhood_consistency(42.373, -71.110, "Back Bay", "boston")
    assert bad["consistent"] is False and bad["checked"] is True

    # Unmapped neighborhood can't be disproved.
    unknown = G.neighborhood_consistency(42.36, -71.06, "Narnia", "boston")
    assert unknown["consistent"] is True and unknown["checked"] is False


def test_pin_verdict_combines_checks():
    good = G.pin_verdict(42.3496, -71.0500, "boston", true_lat=42.3496, true_lon=-71.0500, neighborhood="Seaport")
    assert good["ok"] is True
    assert "in_city_bbox" in good["checks"] and "geocode_distance" in good["checks"]

    ocean = G.pin_verdict(42.36, -70.40, "boston")
    assert ocean["ok"] is False
