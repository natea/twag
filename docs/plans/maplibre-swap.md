# Plan: swap Mapbox GL JS → MapLibre GL JS (if/when needed)

## Context

We currently use Mapbox GL JS v3.7 for the map view. It's free at our scale
(~600 loads/Tech Week vs. 50k/mo free tier), and the integration is clean.
MapLibre GL JS is the open-source fork of Mapbox GL JS v1.x — same JS API,
BSD-3 license, no vendor lock. The library itself is free; cost shifts to
whoever provides the tile data.

This plan is **not a recommendation to switch now**. It's the swap recipe to
keep on hand for one of these future triggers:

- We start sponsoring multiple cities and approach Mapbox's 50k loads/month.
- We want to drop the "© Mapbox" attribution requirement.
- We want a fully open-source map stack for principle / portability.
- Mapbox raises prices again (last hike was the move to v2 in 2020).

## Tile vendor choice (the actual decision)

MapLibre needs tiles from somewhere. Four realistic options for this project:

| Vendor | Free tier | Style quality | Attribution | Notes |
|---|---|---|---|---|
| **MapTiler** | 100k tile requests/mo + 5k map sessions | Excellent — Streets/Outdoor/Satellite close to Mapbox | "© MapTiler © OSM" | Easiest swap. Token-based like Mapbox. Free tier *pauses* (no overage charges). Paid Flex $25/mo. |
| **Protomaps** (PMTiles) | Free, hosted at `https://api.protomaps.com/...` or self-host single `.pmtiles` file | Basic — Light/Dark/White only. Roads + labels + landuse. No satellite. | "© Protomaps © OSM" | Cheapest forever. Self-hosting from GitHub Pages = zero cost. |
| **OpenFreeMap** | Free, community-run | Liberty (Mapbox-style), Bright, Positron | "© OpenFreeMap © OSM" | No account / no token. Best-effort uptime. |
| **Stadia Maps** | 200k req/mo free with account, no CC | Stamen styles + custom | "© Stadia Maps © OSM" | More artistic styles (Toner, Watercolor). |

**Recommendation if/when we swap**: **MapTiler** — closest visual parity with
the current Mapbox look, single token swap, generous free tier, paid plan is
cheap if we ever cross it. If "free forever" matters more than style fidelity,
**OpenFreeMap** is the no-account choice.

## Files that change

Five files touched. Total swap: ~30 minutes of work, mostly find-and-replace.

### 1. `docs/events_map_<city>.html` (both cities)

```diff
- <link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet">
+ <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet">
  ...
- <script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
+ <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script src="./config.js"></script>
  <script src="./tab_nav.js"></script>
  <script src="./events_map_sidebar.js"></script>
  <script src="./events_map.js"></script>
```

Both `events_map_boston.html` and `events_map_nyc.html`.

### 2. `docs/config.js`

```diff
- window.TWAG_MAPBOX_TOKEN =
-   "pk.eyJ1IjoibmF0ZWF1bmUi…";
+ window.TWAG_MAP_TILE_TOKEN = "<MAPTILER_KEY>";   // MapTiler key (free tier)
+ window.TWAG_MAP_STYLE_URL =
+   `https://api.maptiler.com/maps/streets-v2/style.json?key=${window.TWAG_MAP_TILE_TOKEN}`;
```

For **Protomaps / OpenFreeMap** (no key needed):

```diff
- window.TWAG_MAPBOX_TOKEN = "pk…";
+ window.TWAG_MAP_STYLE_URL =
+   "https://tiles.openfreemap.org/styles/liberty";   // OpenFreeMap
+   // or: "https://api.protomaps.com/styles/v4/light/en.json"   // Protomaps hosted
```

### 3. `docs/events_map.js`

Three changes in `initEventMap()`:

```diff
- mapboxgl.accessToken = config.token;
- const map = new mapboxgl.Map({
+ const map = new maplibregl.Map({
    container: "map",
-   style: "mapbox://styles/mapbox/streets-v12",
+   style: config.styleUrl,
    center: [config.centerLon, config.centerLat],
    zoom: config.zoom,
  });
- map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
+ map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
```

And in `showPopup()`:

```diff
- activePopup = new mapboxgl.Popup({ maxWidth: "300px" })
+ activePopup = new maplibregl.Popup({ maxWidth: "300px" })
```

(All other `map.on('load')`, `addSource`, `addLayer`, `queryRenderedFeatures`,
`getClusterLeaves`, `flyTo`, `easeTo`, `setData` calls are **identical** in
MapLibre — that's the whole point of the fork.)

### 4. `docs/events_map_<city>.html` config block

```diff
  initEventMap({
-   token: window.TWAG_MAPBOX_TOKEN,
+   styleUrl: window.TWAG_MAP_STYLE_URL,
    citySlug: "boston",
    centerLat: 42.3601,
    centerLon: -71.0942,
    zoom: 12.0,
    geojsonUrl: "./boston.geojson",
    dateRange: [...],
    defaultDate: "2026-05-26",
  });
```

Same change in the NYC HTML.

### 5. `docs/events_map.css`

Cluster + unclustered-point styling is unchanged — MapLibre renders the same
paint expressions. **One CSS class might need adjusting**: Mapbox's bottom-
right attribution control has the class `mapboxgl-ctrl-attrib`; MapLibre uses
`maplibregl-ctrl-attrib`. If we have any custom rules targeting it (we don't
currently), they'd need duplication. **No change required for our CSS.**

### 6. `.env.example` (and `docs/config.example.js`)

```diff
- # Mapbox public token. Restrict to https://natea.github.io/twag/* in dashboard.
- MAPBOX_PUBLIC_TOKEN=pk.your-mapbox-public-token-here
+ # MapTiler API key for the map tiles. Restrict to your Pages domain at
+ # https://cloud.maptiler.com/account/keys/. Free tier: 100k tile requests/mo.
+ MAPTILER_KEY=your-maptiler-key-here
```

(Or omit the token entirely if going OpenFreeMap.)

### 7. `docs/plans/event-map-view.md` and `README.md`

Update the "Stack" sentence in the plan doc and the Cities section in the
README to reference MapLibre/MapTiler instead of Mapbox. One-line edits.

## What does NOT change

- Native GeoJSON source clustering and `getClusterLeaves`. Same code paths.
- Popup rendering, click handlers, `flyTo`, all map event names.
- The sidebar module (`events_map_sidebar.js`). It reads `map.queryRenderedFeatures`
  and `source.getClusterLeaves` — both MapLibre.
- The gallery and schedule pages — they don't load Mapbox at all.
- The geocoding pipeline (OpenCage). Independent of the map library.
- The geojson exporter (`build_geojson` in `geojson_export.py`). Output format
  is identical.

## Attribution

MapLibre style files include attribution via the `sources.openmaptiles.attribution`
field; the control auto-renders it. With MapTiler the bottom-right says
"© MapTiler © OpenStreetMap." With OpenFreeMap it says "© OpenFreeMap © OSM."
No code change needed for either — both replace the "© Mapbox" line
automatically.

## Verification

1. `cd docs && python3 -m http.server 8085`, open Boston map.
2. Confirm tiles render at zoom 12 (Cambridge / Boston rendered as expected).
3. Pan/zoom — confirm raster/vector smoothness comparable to Mapbox.
4. Click a cluster — `getClusterExpansionZoom` still works (it's the same API).
5. Click a pin — popup opens; click another pin — first popup closes
   (the existing single-popup logic relies on `activePopup` so the only API
   call is `mapboxgl.Popup` → `maplibregl.Popup`).
6. Open the sidebar, click rows, confirm `flyTo` works.
7. Check the bottom-right attribution control shows the new tile vendor.
8. Repeat on NYC.

## Estimated effort

- **MapTiler swap**: ~30 min code + 10 min to grab a MapTiler key and add a
  referrer restriction. Visual parity with Mapbox.
- **OpenFreeMap swap**: ~20 min (no token to add). Visual style is a different
  look — flat/clean rather than Mapbox Streets. Worth a sanity test before
  shipping.
- **Protomaps self-hosted**: add another half-day to generate a Boston/NYC
  `.pmtiles` extract and host it. Probably overkill for this site.

## Out of scope

- Switching the geocoder (OpenCage stays).
- Switching to Leaflet (different paradigm — raster tiles + jQuery-like API;
  not API-compatible with our current code).
- Self-hosted tiles. Possible but requires either a PMTiles file or a
  TileServer GL instance — unjustified ops cost at this scale.
