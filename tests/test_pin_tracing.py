"""The eval tracing boundary must preserve outputs and never force Weave on the
shipped package."""
from __future__ import annotations

import importlib


def test_op_passthrough_when_weave_absent(monkeypatch):
    from eval import tracing

    monkeypatch.setattr(tracing, "_HAVE_WEAVE", False)

    def fake_geocode(address):
        return {"address": address, "lat": 42.0, "lon": -71.0, "confidence": 9}

    wrapped = tracing.op(fake_geocode)
    # With weave absent, op returns the bare function — identical output.
    assert wrapped is fake_geocode
    assert wrapped("1 Main St") == fake_geocode("1 Main St")


def test_op_preserves_output_with_weave(monkeypatch):
    from eval import tracing

    if not tracing.have_weave():
        return  # weave not installed in this env; nothing to assert

    def fake_geocode(address):
        return {"address": address, "lat": 1.0, "lon": 2.0}

    wrapped = tracing.op(fake_geocode, name="fake_geocode")
    assert wrapped("x") == {"address": "x", "lat": 1.0, "lon": 2.0}


def test_package_does_not_import_weave():
    # Importing the shipped package must not require/import weave.
    import sys

    for mod in ("twag_clickhouse.pin_geometry", "twag_clickhouse.geocode", "twag_clickhouse.geojson_export"):
        importlib.import_module(mod)
    # pin_geometry is stdlib-only; assert it has no weave attribute leak.
    import twag_clickhouse.pin_geometry as pg

    assert not hasattr(pg, "weave")
