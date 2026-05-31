"""Export guardrail: default output unchanged; guarded run flags/drops bad pins.

These tests run against the real Boston dataset if present, and always restore
the original docs/<city>.geojson so the working tree is left untouched.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from twag_clickhouse.city import load_city
from twag_clickhouse.geojson_export import _geojson_path, build_geojson

BOSTON = load_city("boston")
_HAS_DATA = (Path(BOSTON.dataset_path) / "venues.json").is_file()
pytestmark = pytest.mark.skipif(not _HAS_DATA, reason="Boston dataset not present")


def _with_restored_geojson(fn):
    path = _geojson_path(BOSTON)
    original = path.read_bytes() if path.is_file() else None
    try:
        return fn()
    finally:
        if original is not None:
            path.write_bytes(original)


def test_unguarded_output_is_unchanged():
    path = _geojson_path(BOSTON)

    def body():
        build_geojson(BOSTON)  # default
        first = path.read_bytes()
        build_geojson(BOSTON)  # idempotent
        second = path.read_bytes()
        return first, second

    first, second = _with_restored_geojson(body)
    assert first == second
    # Default export must not introduce guardrail bookkeeping.
    import json

    meta = json.loads(first)["metadata"]["counts"]
    assert "flagged" not in meta and "dropped" not in meta


def test_guarded_flag_keeps_all_and_reports_counts():
    def body():
        r0 = build_geojson(BOSTON)
        r1 = build_geojson(BOSTON, guard=True, guard_action="flag")
        return r0, r1

    r0, r1 = _with_restored_geojson(body)
    assert "flagged" in r1["counts"] and "dropped" in r1["counts"]
    assert "flagged" not in r0["counts"]
    # flag mode keeps every mapped pin; flagged is a subset of mapped.
    assert r1["counts"]["mapped"] == r0["counts"]["mapped"]
    assert 0 <= r1["counts"]["flagged"] <= r1["counts"]["mapped"]


def test_guarded_drop_removes_bad_pins():
    def body():
        r0 = build_geojson(BOSTON)
        r1 = build_geojson(BOSTON, guard=True, guard_action="drop")
        return r0, r1

    r0, r1 = _with_restored_geojson(body)
    # drop mode: mapped + dropped (relative to flag baseline) reconciles.
    assert r1["counts"]["dropped"] >= 0
    assert r1["counts"]["mapped"] + r1["counts"]["dropped"] == r0["counts"]["mapped"]
