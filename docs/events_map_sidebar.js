/* TWAG map sidebar — lists events whose pin is in the current viewport,
 * with an expanded detail card for the selected event.
 *
 * Usage from events_map.js, after the map's 'load' event:
 *   const sidebar = initMapSidebar({
 *     map,
 *     sourceId: "events",
 *     citySlug: "boston",
 *     onSelect: (eventId, lonLat) => { ... open popup ... },
 *   });
 *   sidebar.refresh();           // call after date change
 *   sidebar.select(eventId);     // call after pin click
 */

function _esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _thumbUrl(citySlug, eventId) {
  return `./${citySlug}/thumbs/${eventId}.jpg`;
}

function _humanTime(props) {
  const start = props.start_time || "";
  const end = props.end_time || "";
  if (start && end) return `${start}–${end}`;
  return start || end || "";
}

function _humanWhere(props) {
  return [props.venue_name, props.neighborhood].filter(Boolean).join(" · ");
}

function _rowHtml(citySlug, props) {
  const eventId = props.event_id;
  const cap = props.at_capacity ? `<span class="sidebar-row-cap">full</span>` : "";
  const time = _humanTime(props);
  const where = _humanWhere(props);
  const going = (typeof props.going_guest_count === "number")
    ? `<span class="sidebar-detail-stat">${props.going_guest_count} going</span>` : "";
  const remaining = (typeof props.remaining_capacity === "number" && props.remaining_capacity > 0)
    ? `<span class="sidebar-detail-stat">${props.remaining_capacity} spots left</span>` : "";
  const host = props.host ? `<div class="sidebar-row-meta">${_esc(props.host)}</div>` : "";
  const description = props.description
    ? `<div class="sidebar-detail-desc">${_esc(props.description)}</div>` : "";
  const venueLine = props.venue_address
    ? `<div class="sidebar-detail-where">${_esc(props.venue_name || "")}${props.venue_name && props.venue_address ? " · " : ""}${_esc(props.venue_address)}</div>`
    : (where ? `<div class="sidebar-detail-where">${_esc(where)}</div>` : "");
  const rsvp = props.rsvp_url
    ? `<a class="sidebar-detail-rsvp" href="${_esc(props.rsvp_url)}" target="_blank" rel="noopener">RSVP on Partiful →</a>`
    : "";
  const stats = (going || remaining)
    ? `<div class="sidebar-detail-stats">${going}${remaining}</div>` : "";
  return `
    <button class="sidebar-row" type="button" data-event-id="${_esc(eventId)}" aria-selected="false">
      <div class="sidebar-row-thumb">
        <img loading="lazy" src="${_esc(_thumbUrl(citySlug, eventId))}" alt="">
      </div>
      <div class="sidebar-row-body">
        <div class="sidebar-row-title">${_esc(props.title)} ${cap}</div>
        <div class="sidebar-row-meta">${_esc(time)}</div>
        <div class="sidebar-row-meta">${_esc(where)}</div>
        ${host}
        <div class="sidebar-detail">
          <img class="sidebar-detail-img" loading="lazy" src="${_esc(_thumbUrl(citySlug, eventId))}" alt="">
          ${venueLine}
          ${stats}
          ${description}
          ${rsvp}
        </div>
      </div>
    </button>
  `;
}

function _debounce(fn, ms) {
  let t = null;
  return function () {
    const args = arguments;
    if (t !== null) clearTimeout(t);
    t = setTimeout(() => { t = null; fn.apply(null, args); }, ms);
  };
}

function _getClusterLeaves(source, clusterId) {
  return new Promise((resolve) => {
    source.getClusterLeaves(clusterId, Infinity, 0, (err, leaves) => {
      if (err || !leaves) resolve([]);
      else resolve(leaves);
    });
  });
}

function _sortByStart(features) {
  return features.slice().sort((a, b) => {
    const at = a.properties.start_time || "";
    const bt = b.properties.start_time || "";
    if (at < bt) return -1;
    if (at > bt) return 1;
    const aT = a.properties.title || "";
    const bT = b.properties.title || "";
    return aT < bT ? -1 : aT > bT ? 1 : 0;
  });
}

function initMapSidebar(config) {
  const map = config.map;
  const sourceId = config.sourceId;
  const citySlug = config.citySlug;
  const onSelect = config.onSelect || (() => {});

  const root = document.getElementById("sidebar");
  if (!root) return null;

  root.innerHTML = `
    <div class="sidebar-header" id="sidebar-count">Loading…</div>
    <div class="sidebar-list" id="sidebar-list"></div>
  `;
  const countEl = root.querySelector("#sidebar-count");
  const listEl = root.querySelector("#sidebar-list");

  let selectedEventId = null;
  let lastFeatures = [];
  const eventCoords = new Map(); // event_id → [lon, lat]

  async function compute() {
    const source = map.getSource(sourceId);
    if (!source) return [];

    const layers = [];
    if (map.getLayer("clusters")) layers.push("clusters");
    if (map.getLayer("unclustered-point")) layers.push("unclustered-point");
    if (!layers.length) return [];

    const rendered = map.queryRenderedFeatures(undefined, { layers });
    const seen = new Set();
    const out = [];

    // Expand clusters to their leaves so the sidebar lists every event in
    // the viewport, even at low zoom where pins are still clustered.
    const clusterFeatures = rendered.filter(f => f.properties && f.properties.cluster);
    const leafGroups = await Promise.all(
      clusterFeatures.map(f => _getClusterLeaves(source, f.properties.cluster_id))
    );
    for (const group of leafGroups) {
      for (const leaf of group) {
        const id = leaf.properties.event_id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(leaf);
        eventCoords.set(id, leaf.geometry.coordinates);
      }
    }
    for (const f of rendered) {
      if (f.properties && f.properties.cluster) continue;
      const id = f.properties && f.properties.event_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(f);
      eventCoords.set(id, f.geometry.coordinates);
    }
    return _sortByStart(out);
  }

  function render(features) {
    lastFeatures = features;
    if (!features.length) {
      countEl.textContent = "No events in view";
      listEl.innerHTML = `<div class="sidebar-empty">Pan or zoom the map — events in view will appear here.</div>`;
      return;
    }
    countEl.textContent = `${features.length} event${features.length === 1 ? "" : "s"} in view`;
    listEl.innerHTML = features.map(f => _rowHtml(citySlug, f.properties)).join("");

    listEl.querySelectorAll(".sidebar-row").forEach(row => {
      row.addEventListener("click", () => {
        const id = row.dataset.eventId;
        select(id, { fromUser: true });
      });
    });

    if (selectedEventId) {
      applySelectionDom();
    }
  }

  function applySelectionDom() {
    listEl.querySelectorAll(".sidebar-row").forEach(row => {
      const isSel = row.dataset.eventId === selectedEventId;
      row.setAttribute("aria-selected", isSel ? "true" : "false");
    });
  }

  function select(eventId, opts) {
    opts = opts || {};
    selectedEventId = eventId;
    applySelectionDom();
    const row = listEl.querySelector(`.sidebar-row[data-event-id="${CSS.escape(eventId)}"]`);
    if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const coords = eventCoords.get(eventId);
    if (opts.fromUser && coords) {
      // Clicking a row pans toward the pin (per plan: sidebar→map flies, map→sidebar doesn't).
      map.flyTo({ center: coords, speed: 1.4, curve: 1 });
    }
    onSelect(eventId, coords || null, opts);
  }

  function clearSelection() {
    selectedEventId = null;
    applySelectionDom();
  }

  async function refresh() {
    const features = await compute();
    render(features);
  }

  const debouncedRefresh = _debounce(refresh, 150);
  map.on("moveend", debouncedRefresh);
  map.on("sourcedata", (e) => {
    if (e.sourceId === sourceId && e.isSourceLoaded) debouncedRefresh();
  });

  refresh();

  return { refresh, select, clearSelection };
}
