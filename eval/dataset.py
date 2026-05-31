"""Build the evaluation dataset from a city's events + venues cache.

Two row shapes share one builder:

- Silver ground truth = ``venues.json`` rows with ``confidence == 10`` (their
  OpenCage coords are treated as truth for *extraction* eval).
- Gold = hand-verified rows from ``eval/gold/<city>.json`` ({event_id: {lat, lon}})
  which override silver and are marked ``gold=True``.

Each row carries the raw ``listing`` (for extraction + the hallucination judge),
the city's ``neighborhood`` and ``city_slug`` (for the geometric scorers), the
``cached`` pin (for geocode-mode), and ``true_lat``/``true_lon`` when known.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from twag_clickhouse.city import CityConfig, load_city
from twag_clickhouse.nytw import NytwDataset, parse_event_file

GOLD_DIR = Path(__file__).parent / "gold"


def _load_events(city: CityConfig) -> dict[str, dict[str, Any]]:
    dataset = NytwDataset.from_path(city.dataset_path)
    dataset.validate()
    events: dict[str, dict[str, Any]] = {}
    for path in sorted(dataset.events_dir.glob("*.md")):
        ev = parse_event_file(path, dataset.source_dir)
        events[ev["event_id"]] = ev
    return events


def _load_venues(city: CityConfig) -> dict[str, dict[str, Any]]:
    path = Path(city.dataset_path) / "venues.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def load_gold(city: CityConfig) -> dict[str, dict[str, Any]]:
    path = GOLD_DIR / f"{city.slug}.json"
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    # accept either {event_id: {lat, lon}} or {"rows": {...}}
    return data.get("rows", data)


def _listing_of(ev: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": ev.get("title") or "",
        "host": ev.get("host") or "",
        "neighborhood": ev.get("neighborhood") or "",
        "venue_name": ev.get("venue_name") or "",
        "venue_address": ev.get("venue_address") or "",
        "url": ev.get("rsvp_url") or ev.get("public_short_url") or "",
        "description": (ev.get("description") or "")[:1500],
    }


# Which silver confidences qualify as ground truth, by difficulty.
#   clean → only confidence==10 (easy, unambiguous addresses)
#   hard  → 1..9 (the geocoder was uncertain — where extraction phrasing bites)
#   all   → any geocoded row
def _silver_qualifies(confidence: int, difficulty: str) -> bool:
    if difficulty == "hard":
        return 1 <= confidence <= 9
    if difficulty == "all":
        return confidence >= 1
    return confidence == 10  # "clean" (default)


def build_rows(
    city_slug: str,
    *,
    limit: int | None = None,
    require_truth: bool = False,
    difficulty: str = "clean",
) -> list[dict[str, Any]]:
    """Build dataset rows for ``city_slug``.

    If ``require_truth`` is set, only rows with gold or silver ground-truth
    coordinates are returned (used for models-mode, where distance is scored).
    ``difficulty`` selects which silver confidences count as ground truth — use
    ``hard`` to surface model differences on ambiguous addresses.
    """
    city = load_city(city_slug)
    events = _load_events(city)
    venues = _load_venues(city)
    gold = load_gold(city)

    rows: list[dict[str, Any]] = []
    for event_id, ev in events.items():
        venue = venues.get(event_id) or {}
        cached_lat, cached_lon = venue.get("lat"), venue.get("lon")
        confidence = int(venue.get("confidence") or 0)

        # Ground truth: gold always qualifies; silver depends on difficulty.
        true_lat = true_lon = None
        is_gold = False
        if event_id in gold:
            true_lat, true_lon = gold[event_id].get("lat"), gold[event_id].get("lon")
            is_gold = True
        elif cached_lat is not None and _silver_qualifies(confidence, difficulty):
            true_lat, true_lon = cached_lat, cached_lon

        if require_truth and true_lat is None:
            continue

        rows.append(
            {
                "event_id": event_id,
                "listing": _listing_of(ev),
                "city_slug": city.slug,
                "neighborhood": ev.get("neighborhood") or "",
                "cached_lat": cached_lat,
                "cached_lon": cached_lon,
                "confidence": confidence,
                "true_lat": true_lat,
                "true_lon": true_lon,
                "gold": is_gold,
            }
        )
        if limit is not None and len(rows) >= limit:
            break

    return rows


def to_weave_dataset(rows: list[dict[str, Any]], name: str):
    """Wrap rows as a published weave.Dataset (no-op-ish if weave absent)."""
    import weave

    ds = weave.Dataset(name=name, rows=rows)
    weave.publish(ds)
    return ds
