/* StageHopper event map — shared logic for per-city HTML pages.
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

// Today's calendar date as a "YYYY-MM-DD" string in the visitor's local time.
function todayISO() {
  const d = new Date();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}

// Day to show when the visitor hasn't picked one (no hash, no saved choice):
// today if the event is happening now, otherwise the event's first day
// (covers both "event hasn't started yet" and "event already passed").
function defaultEventDate(dateRange) {
  const t = todayISO();
  return dateRange.indexOf(t) !== -1 ? t : dateRange[0];
}

// Persisted day choice (the "cookie") so a returning visitor lands back on
// the day they were browsing. Keyed per city; ignored if it's not a valid
// day for the current event (e.g. last year's saved date).
function dayStorageKey(citySlug) {
  return "stagehopper_day_" + (citySlug || "");
}
function loadSavedDate(citySlug, dateRange) {
  try {
    const v = localStorage.getItem(dayStorageKey(citySlug));
    return v && dateRange.indexOf(v) !== -1 ? v : null;
  } catch (_) {
    return null;
  }
}
function saveDate(citySlug, date) {
  try {
    localStorage.setItem(dayStorageKey(citySlug), date);
  } catch (_) {}
}

// Initial day priority: explicit #date= (deep link / tab carry-over) →
// saved choice → today-or-first-day default.
function pickInitialDate(config) {
  return (
    parseDateFromHash() ||
    loadSavedDate(config.citySlug, config.dateRange) ||
    defaultEventDate(config.dateRange)
  );
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
  // Native-only action buttons (share sheet, local-notification reminder).
  // Hidden on the plain web build so the public site is unchanged.
  const native = !!(window.twagNative && window.twagNative.isNative());
  const reminded = native && window.twagNative.hasReminder(props.event_id);
  const remind = native
    ? `<button class="popup-remind${reminded ? " is-set" : ""}" type="button" aria-pressed="${reminded ? "true" : "false"}" title="Remind me 15 min before">${reminded ? "🔔 Reminder set" : "🔔 Remind me"}</button>`
    : "";
  const share = native
    ? `<button class="popup-share" type="button" aria-label="Share event" title="Share">📤</button>`
    : "";
  const actions = (rsvp || remind || share)
    ? `<div class="popup-actions">${rsvp}${remind}${share}</div>`
    : "";
  return `
    <div class="popup">
      <div class="popup-title">${title}</div>
      <div class="popup-meta">${escapeHtml(time)} · ${escapeHtml(where)} ${cap}</div>
      ${host}
      ${actions}
    </div>
  `;
}

function parseEventFromHash() {
  const raw = (window.location.hash || "").replace(/^#/, "");
  const params = new URLSearchParams(raw);
  return params.get("event");
}

/* Custom "Locate me" control. Used only inside the native shell, where it
 * routes through twagNative.requestLocation() to get the better native
 * permission UX; the plain web build keeps its existing controls unchanged. */
function makeLocateControl(map, citySlug) {
  let marker = null;
  return {
    onAdd() {
      const div = document.createElement("div");
      div.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "twag-locate-btn";
      btn.title = "Locate me";
      btn.setAttribute("aria-label", "Locate me");
      btn.textContent = "◎";
      btn.addEventListener("click", async () => {
        btn.classList.add("loading");
        const loc = await window.twagNative.requestLocation();
        btn.classList.remove("loading");
        if (!loc) return;
        const [lon, lat] = loc;
        if (!marker) {
          const el = document.createElement("div");
          el.className = "twag-user-dot";
          marker = new mapboxgl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
        } else {
          marker.setLngLat([lon, lat]);
        }
        map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 14) });
        if (window.twagTrack) twagTrack("locate_me_used", { city: citySlug });
      });
      div.appendChild(btn);
      this._container = div;
      return div;
    },
    onRemove() {
      if (this._container && this._container.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }
    },
  };
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
  if (window.twagNative && window.twagNative.isNative()) {
    map.addControl(makeLocateControl(map, config.citySlug), "top-right");
  }

  const response = await fetch(config.geojsonUrl);
  if (!response.ok) {
    document.getElementById("error").textContent =
      `Failed to load ${config.geojsonUrl}: ${response.status}`;
    return;
  }
  const fullGeoJson = await response.json();

  const initialDate = pickInitialDate(config);
  let activeDate = initialDate;

  const datePicker = document.getElementById("date-picker");
  buildDatePicker(datePicker, config.dateRange, activeDate, (date) => {
    activeDate = date;
    setDateInHash(date);
    saveDate(config.citySlug, date);
    refresh();
  });

  let sidebar = null;
  let activePopup = null;
  let search = null;

  function filterByDateAndSearch() {
    const matchIds = search ? search.currentMatchIds() : null;
    const scope = search ? search.currentScope() : "all";
    // No search query: just date-filter.
    if (!matchIds) return filterFeaturesByDate(fullGeoJson, activeDate);
    // Search + "day" scope: intersect matches with the active date.
    if (scope === "day") {
      const byDate = filterFeaturesByDate(fullGeoJson, activeDate);
      return {
        type: "FeatureCollection",
        features: byDate.features.filter((f) => matchIds.has(f.properties.event_id)),
      };
    }
    // Search + "all" scope (default): every matching event, any day.
    return {
      type: "FeatureCollection",
      features: fullGeoJson.features.filter((f) => matchIds.has(f.properties.event_id)),
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

    const popupEl = activePopup.getElement();

    // Track RSVP click-throughs from the popup.
    const rsvpEl = popupEl.querySelector(".popup-rsvp");
    if (rsvpEl && window.twagTrack) {
      rsvpEl.addEventListener("click", () => {
        twagTrack("rsvp_clicked", {
          city: config.citySlug,
          event_id: props.event_id || "",
          source: "map_popup",
        });
      });
    }

    // Native share sheet.
    const shareEl = popupEl.querySelector(".popup-share");
    if (shareEl && window.twagNative) {
      shareEl.addEventListener("click", () => {
        window.twagNative.shareEvent({
          title: props.title,
          text: [props.title, props.start_time, props.venue_name].filter(Boolean).join(" · "),
          url: props.rsvp_url,
        });
        if (window.twagTrack) {
          twagTrack("event_shared", {
            city: config.citySlug,
            event_id: props.event_id || "",
            source: "map_popup",
          });
        }
      });
    }

    // Native local-notification reminder (toggle).
    const remindEl = popupEl.querySelector(".popup-remind");
    if (remindEl && window.twagNative) {
      remindEl.addEventListener("click", async () => {
        const props2 = Object.assign({ city: config.citySlug }, props);
        if (window.twagNative.hasReminder(props.event_id)) {
          await window.twagNative.cancelEventReminder(props.event_id);
          remindEl.classList.remove("is-set");
          remindEl.setAttribute("aria-pressed", "false");
          remindEl.textContent = "🔔 Remind me";
          if (window.twagTrack) twagTrack("reminder_cancelled", { city: config.citySlug, event_id: props.event_id || "" });
          return;
        }
        const res = await window.twagNative.scheduleEventReminder(props2);
        if (res && res.scheduled) {
          remindEl.classList.add("is-set");
          remindEl.setAttribute("aria-pressed", "true");
          remindEl.textContent = "🔔 Reminder set";
          if (window.twagTrack) twagTrack("reminder_scheduled", { city: config.citySlug, event_id: props.event_id || "" });
        } else {
          remindEl.textContent = res && res.reason === "too_late" ? "Already started" : "Couldn't set reminder";
          setTimeout(() => { remindEl.textContent = "🔔 Remind me"; }, 2500);
        }
      });
    }
  }

  let lastTrackedDate = null;

  function refresh() {
    const previousDate = lastTrackedDate;
    buildDatePicker(datePicker, config.dateRange, activeDate, (date) => {
      activeDate = date;
      setDateInHash(date);
      saveDate(config.citySlug, date);
      refresh();
    });
    // Update the "This day" pill label when the active date changes.
    if (search && search.refreshScopeLabel) search.refreshScopeLabel();
    const filtered = filterByDateAndSearch();
    const query = search ? search.currentQuery() : "";
    const scope = search ? search.currentScope() : "all";
    const dateLabel = formatHumanDate(activeDate);
    const scopeLabel = scope === "day" ? `on ${dateLabel}` : "across all days";
    document.getElementById("count").textContent = query
      ? `${filtered.features.length} events matching "${query}" ${scopeLabel}`
      : `${filtered.features.length} events on ${dateLabel}`;
    const source = map.getSource("events");
    if (source) {
      source.setData(filtered);
    }
    if (sidebar) {
      // Re-anchor the sidebar to current-or-next when the date changes
      // (initial load also counts since previousDate is null).
      if (previousDate !== activeDate && sidebar.scrollToNowOnNextRender) {
        sidebar.scrollToNowOnNextRender();
      }
      sidebar.refresh();
    }

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
      getActiveDate: () => activeDate,
    });
    // Sidebar reads window.__twagSearch.currentMatchOrder() so it can sort
    // its rows by Fuse relevance when a search is active.
    window.__twagSearch = search;
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

    // Deep link from a tapped notification: #date=…&event=<id>. Fly to the
    // event, open its popup, and select it in the sidebar.
    focusEventFromHash();
  });

  // Pan to + select the event named in the hash, switching days if needed.
  function focusEventFromHash() {
    const eventId = parseEventFromHash();
    if (!eventId) return;
    const feature = fullGeoJson.features.find(
      (f) => f.properties.event_id === eventId
    );
    if (!feature) return;
    const eventDate = feature.properties.event_date;
    if (eventDate && eventDate !== activeDate) {
      activeDate = eventDate;
      refresh();
    }
    const coords = feature.geometry.coordinates;
    map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 14) });
    showPopup(coords, feature.properties);
    if (sidebar) sidebar.select(eventId, { fromUser: false });
  }

  window.addEventListener("hashchange", () => {
    const hashDate = parseDateFromHash();
    if (hashDate && hashDate !== activeDate) {
      activeDate = hashDate;
      saveDate(config.citySlug, hashDate);
      refresh();
    }
    focusEventFromHash();
  });
}
