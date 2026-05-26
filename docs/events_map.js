/* TWAG event map — shared logic for per-city HTML pages.
 *
 * Each city HTML inlines its own MAP_CONFIG (token, center, zoom,
 * geojsonUrl, dateRange) and then calls initEventMap(MAP_CONFIG).
 */

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function parseDateFromHash() {
  const raw = (window.location.hash || "").replace(/^#/, "");
  const match = raw.match(/date=(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function setDateInHash(date) {
  // Merge into existing hash params so the search query (q=…) survives a
  // date chip click. Without this, switching days erases the user's search.
  const raw = (window.location.hash || "").replace(/^#/, "");
  const params = new URLSearchParams(raw);
  if (date) params.set("date", date);
  else params.delete("date");
  window.location.hash = params.toString();
}

function formatHumanDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const opts = { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" };
  return date.toLocaleDateString(undefined, opts);
}

const _WEEKDAY_SHORT = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
function weekdayShort(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return _WEEKDAY_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function buildDatePicker(container, dateRange, activeDate, onChange) {
  container.innerHTML = "";
  for (const date of dateRange) {
    const btn = document.createElement("button");
    btn.className = "date-btn" + (date === activeDate ? " active" : "");
    btn.innerHTML =
      `<span class="date-btn-long">${formatHumanDate(date)}</span>` +
      `<span class="date-btn-short">${weekdayShort(date)}</span>`;
    btn.addEventListener("click", () => onChange(date));
    container.appendChild(btn);
  }
}

function filterFeaturesByDate(geojson, date) {
  return {
    type: "FeatureCollection",
    features: geojson.features.filter(f => f.properties.event_date === date),
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupHtml(props) {
  const title = escapeHtml(props.title);
  const time = [props.start_time, props.end_time].filter(Boolean).join("–");
  const where = [props.venue_name, props.neighborhood].filter(Boolean).join(" · ");
  const host = props.host ? `<div class="popup-host">${escapeHtml(props.host)}</div>` : "";
  const rsvp = props.rsvp_url
    ? `<a class="popup-rsvp" href="${escapeHtml(props.rsvp_url)}" target="_blank" rel="noopener">RSVP →</a>`
    : "";
  const cap = props.at_capacity ? `<span class="popup-cap">at capacity</span>` : "";
  return `
    <div class="popup">
      <div class="popup-title">${title}</div>
      <div class="popup-meta">${escapeHtml(time)} · ${escapeHtml(where)} ${cap}</div>
      ${host}
      ${rsvp}
    </div>
  `;
}

async function initEventMap(config) {
  mapboxgl.accessToken = config.token;
  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: [config.centerLon, config.centerLat],
    zoom: config.zoom,
  });
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

  const response = await fetch(config.geojsonUrl);
  if (!response.ok) {
    document.getElementById("error").textContent =
      `Failed to load ${config.geojsonUrl}: ${response.status}`;
    return;
  }
  const fullGeoJson = await response.json();

  const initialDate = parseDateFromHash() || config.defaultDate;
  let activeDate = initialDate;

  const datePicker = document.getElementById("date-picker");
  buildDatePicker(datePicker, config.dateRange, activeDate, (date) => {
    activeDate = date;
    setDateInHash(date);
    refresh();
  });

  let sidebar = null;
  let activePopup = null;
  let search = null;

  function filterByDateAndSearch() {
    const matchIds = search ? search.currentMatchIds() : null;
    const byDate = filterFeaturesByDate(fullGeoJson, activeDate);
    if (!matchIds) return byDate;
    return {
      type: "FeatureCollection",
      features: byDate.features.filter((f) => matchIds.has(f.properties.event_id)),
    };
  }

  function showPopup(lonLat, props) {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
    activePopup = new mapboxgl.Popup({ maxWidth: "300px" })
      .setLngLat(lonLat)
      .setHTML(popupHtml(props))
      .addTo(map);
    activePopup.on("close", () => { activePopup = null; });

    // Track RSVP click-throughs from the popup.
    const rsvpEl = activePopup.getElement().querySelector(".popup-rsvp");
    if (rsvpEl && window.twagTrack) {
      rsvpEl.addEventListener("click", () => {
        twagTrack("rsvp_clicked", {
          city: config.citySlug,
          event_id: props.event_id || "",
          source: "map_popup",
        });
      });
    }
  }

  let lastTrackedDate = null;

  function refresh() {
    const previousDate = lastTrackedDate;
    buildDatePicker(datePicker, config.dateRange, activeDate, (date) => {
      activeDate = date;
      setDateInHash(date);
      refresh();
    });
    const filtered = filterByDateAndSearch();
    const query = search ? search.currentQuery() : "";
    const dateLabel = formatHumanDate(activeDate);
    document.getElementById("count").textContent = query
      ? `${filtered.features.length} events matching "${query}" on ${dateLabel}`
      : `${filtered.features.length} events on ${dateLabel}`;
    const source = map.getSource("events");
    if (source) {
      source.setData(filtered);
    }
    if (sidebar) sidebar.refresh();

    if (window.twagTrack) {
      if (previousDate === null) {
        twagTrack("map_view_loaded", {
          city: config.citySlug,
          date: activeDate,
          event_count: filtered.features.length,
        });
      } else if (previousDate !== activeDate) {
        twagTrack("date_filter_changed", {
          city: config.citySlug,
          view: "map",
          from_date: previousDate,
          to_date: activeDate,
        });
      }
      lastTrackedDate = activeDate;
    }
  }

  // Build the search index once we have the full feature list.
  if (typeof initSearch === "function") {
    search = initSearch({
      events: fullGeoJson.features.map((f) => f.properties),
      onChange: refresh,
      citySlug: config.citySlug,
      view: "map",
    });
  }

  map.on("load", () => {
    map.addSource("events", {
      type: "geojson",
      data: filterByDateAndSearch(),
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });

    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "events",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step", ["get", "point_count"],
          "#51bbd6", 5,
          "#f1f075", 15,
          "#f28cb1",
        ],
        "circle-radius": [
          "step", ["get", "point_count"],
          18, 5, 24, 15, 32,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });

    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "events",
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 13,
      },
    });

    map.addLayer({
      id: "unclustered-point",
      type: "circle",
      source: "events",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#e8543e",
        "circle-radius": 8,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });

    map.on("click", "clusters", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
      const clusterId = features[0].properties.cluster_id;
      if (window.twagTrack) {
        twagTrack("map_cluster_clicked", {
          city: config.citySlug,
          cluster_size: features[0].properties.point_count || 0,
        });
      }
      map.getSource("events").getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({ center: features[0].geometry.coordinates, zoom });
      });
    });

    map.on("click", "unclustered-point", (e) => {
      const feature = e.features[0];
      const [lon, lat] = feature.geometry.coordinates;
      showPopup([lon, lat], feature.properties);
      if (window.twagTrack) {
        twagTrack("map_pin_clicked", {
          city: config.citySlug,
          event_id: feature.properties.event_id || "",
          neighborhood: feature.properties.neighborhood || "",
        });
      }
      // Mirror selection in the sidebar (no pan — see plan decision #4).
      if (sidebar && feature.properties.event_id) {
        sidebar.select(feature.properties.event_id, { fromUser: false });
      }
    });

    for (const layerId of ["clusters", "unclustered-point"]) {
      map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
    }

    if (typeof initMapSidebar === "function") {
      sidebar = initMapSidebar({
        map,
        sourceId: "events",
        citySlug: config.citySlug,
        onSelect: (eventId, lonLat, opts) => {
          // Open the popup when a sidebar row is the source of the selection.
          if (!opts || !opts.fromUser || !lonLat) return;
          const feature = fullGeoJson.features.find(
            (f) => f.properties.event_id === eventId
          );
          if (!feature) return;
          showPopup(lonLat, feature.properties);
        },
      });
    }

    refresh();
  });

  window.addEventListener("hashchange", () => {
    const hashDate = parseDateFromHash();
    if (hashDate && hashDate !== activeDate) {
      activeDate = hashDate;
      refresh();
    }
  });
}
