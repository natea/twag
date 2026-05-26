# Event map view (cluster events by day on a Boston map)

## Context

TWAG currently surfaces events as text bullets in Telegram. For a Tech Week
attendee, the more useful question is often spatial: *"Where are most things
happening Wednesday afternoon? Is it worth being in Kendall or Seaport?"* A
clustered map of one day's events answers that in a glance and makes a single
neighborhood walk legible.

The bot can't render an interactive map inline (Telegram has no native map
view for arbitrary points), so the deliverable is a hostable static web page
the bot links to with the right day pre-selected.

## Library + service choices

| Concern             | Choice                         | Why                                                                                 |
|---------------------|--------------------------------|-------------------------------------------------------------------------------------|
| Map library         | **Mapbox GL JS**               | Native GeoJSON clustering (~40 lines), vector tiles look sharp on mobile, free at our scale (~1k loads/Tech Week vs 50k/mo free), no credit card required. |
| Geocoder            | **OpenCage**                   | 2,500 req/day free, **permanent storage allowed**, no CC, OSM-backed. 593 addresses fits one day's free tier with 4× headroom. |
| Tile basemap        | Mapbox Streets (Mapbox default) | Bundled with GL JS at no extra config.                                              |
| Hosting             | **GitHub Pages** off this repo  | Static HTML + GeoJSON; deploy on push to `main`. Restrict Mapbox token by referrer. |

### Why not Leaflet?
Leaflet is excellent and fully free, but vector-tile rendering in Mapbox GL JS
is noticeably crisper on phones, and clustering is built in (no separate
`Leaflet.markercluster` plugin). Both options work; the cost difference is
zero either way. Going with Mapbox for the front-end quality on the medium
that matters (mobile Telegram in-app browser).

### Why not Mapbox geocoding?
Mapbox temporary geocoding is free but forbids storing the results — we'd
have to re-geocode at every deploy. Permanent geocoding is $5/1k ($3 for
593 addresses, one-time). OpenCage's free tier *explicitly allows permanent
storage* and is enough at this scale, so we never have to pay anything.
Both are OSM-backed at the root; accuracy on Boston/Cambridge street
addresses with ZIPs will be comparable.

## Architecture

```
events/*.md  ──▶  geocode_venues.py (one-off)  ──▶  venues.json (event_id → lat/lon)
                            │                          ├─ committed to repo
                            ▼                          │
                    OpenCage Geocoding API             ▼
                                            build_geojson.py (per city)
                                                       │
                                                       ▼
                                            events.geojson
                                                       │
                                                       ▼
                                            web/events_map.html  ◀─── linked from Telegram
                                            (Mapbox GL JS + clustering)
```

- **Geocoding is one-off** at dataset build time, not per request. Output
  caches to `data/<city>-for-agents/venues.json`, committed to the repo.
- **GeoJSON build** is a small Python script that joins events + venues
  and emits a `events.geojson` with `properties` carrying title, time,
  RSVP URL, neighborhood. Re-run after any dataset crawl.
- **Web page** is a single `web/events_map.html` (no framework). Reads
  `events.geojson` via `fetch`, filters client-side on URL hash
  (`#date=2026-05-28`), enables Mapbox source clustering. ~150 lines.
- **Telegram link**: bot adds a `/map [date]` command and also appends
  a "🗺 View on map" link to event-list answers, pointing at the hosted
  URL with the day in the hash.

## Critical files (new + modified)

1. **`src/twag_clickhouse/geocode.py`** — new. Wraps OpenCage with disk
   caching, rate-limiting (1 req/sec), and a CLI entry point. Reads
   `events/*.md` from the active city's dataset, looks up
   `venue_address`, writes `venues.json` shaped as
   `{event_id: {lat, lon, formatted_address, confidence}}`.
   Idempotent — re-runs skip cached entries unless `--refresh`.

2. **`src/twag_clickhouse/geojson_export.py`** — new. Joins events +
   venues, filters out events that failed geocoding or are canceled,
   writes a `events.geojson` per city under
   `data/<city>-for-agents/events.geojson`. Properties keep things
   that the map popup needs: `title`, `event_date`, `start_time`,
   `end_time`, `host`, `neighborhood`, `venue_name`, `rsvp_url`.

3. **`web/events_map_boston.html` and `web/events_map_nyc.html`** —
   new. One Mapbox GL JS page per city. Reads `#date=2026-05-28` from
   the URL hash, fetches that city's `events.geojson`, sets the initial
   bbox to that city's metro, wires a date selector that updates the
   hash. Popup on point click shows title, time, host, neighborhood,
   RSVP link. Most of the markup is shared — extract a
   `web/events_map.js` so the two HTML files are just thin wrappers
   that pass in city-specific config (GeoJSON URL, initial center,
   date range).

4. **`src/twag_clickhouse/cli.py`** — modified. New subcommands:
   - `geocode-venues` (calls geocode.py)
   - `build-geojson` (calls geojson_export.py)

5. **`src/twag_clickhouse/telegram_agent.py`** — modified. New
   `/map [YYYY-MM-DD]` command returning a link with the date in the
   hash. *Every* event-list answer also gets a single trailing line
   `🗺 View on map` linking to the city's page (with the most
   relevant date inferred from the question, defaulting to today).

6. **`src/twag_clickhouse/city.py`** — modified. Add a `map_center`
   field (lat/lon for the initial bbox) to `CityConfig`, plus an
   optional `public_map_url` (e.g.
   `https://<user>.github.io/twag/events_map.html`) used by the bot
   to build the link.

7. **`.env.example`** — add `OPENCAGE_API_KEY=` and
   `MAPBOX_PUBLIC_TOKEN=`. The Mapbox token is *public* (referrer-
   restricted) so it can live in the static HTML at build time, not
   in a runtime secret.

8. **GitHub Pages config** — enable Pages on `main` serving `/web` (or
   move the HTML to `docs/`). One-time repo setting; no code.

## Reused existing code

- `parse_event_file()` in `nytw.py` already returns `venue_address`,
  `neighborhood`, `rsvp_url`, dates — geocoder and exporter both use it.
- `NytwDataset.from_path()` resolves dataset directories — same iterator
  pattern.
- `active_city()` + `CityConfig` already gives us per-city paths — the
  geocoder, exporter, and bot map link all read from it.

## Decisions

1. **Hosting**: GitHub Pages off this repo. URL pattern
   `https://<user>.github.io/twag/events_map_<city>.html#date=YYYY-MM-DD`.
   Requires the repo to be public (or GitHub Pro).
2. **Map link scope**: append `🗺 View on map` to *every* event-list
   answer — keeps the bot logic simple and the affordance discoverable.
3. **Per-city pages**: one HTML per city (`events_map_boston.html`,
   `events_map_nyc.html`) — no `?city=` switcher; cleaner per-city
   links and the city-specific bbox lives in the file.
4. **Venue dedup**: rely on Mapbox auto-clustering. One GeoJSON point
   per event; same-venue events stack and clustering merges them at
   low zoom. Revisit if same-venue stacks turn out to be unclickable
   in practice.

## Verification

1. **Geocode coverage**: after `twag --city boston geocode-venues`,
   inspect `venues.json` — expect ≥95% of 593 events with `confidence ≥ 7`
   (OpenCage scale). Manually patch any failures in a `venues.overrides.json`.

2. **GeoJSON validity**: open `events.geojson` in
   <https://geojson.io/>; all points should land in the Boston metro
   area (no obvious South-Africa-instead-of-South-Boston outliers).

3. **Local map**: `python -m http.server` in `web/`, open
   `events_map_boston.html#date=2026-05-28` — expect cluster bubbles
   over Kendall, Back Bay, Seaport; click-to-zoom; popups with event
   details. Repeat with `events_map_nyc.html` to confirm parity.

4. **Mobile**: open the hosted URL inside Telegram on an iPhone — pinch
   zoom should be smooth, popups readable, RSVP link tappable.

5. **Bot integration**: `/map 2026-05-28` returns a link that opens on
   the right day. An event-list query has the map link appended.

## Out of scope (deliberate)

- Geocoding at request time. The dataset is static for the conference week.
- Routing or "events near me." Both add geolocation friction in the
  Telegram in-app browser and complicate the privacy story.
- A backend API. The whole map is a static page + static GeoJSON.
- NYC-specific copy on the map. The page reads `?city=` and adapts.
