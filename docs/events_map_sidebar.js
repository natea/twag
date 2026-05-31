/* StageHopper map sidebar — lists events whose pin is in the current viewport,
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

// Compact weekday + day-of-month label for cross-day rows. ISO event_date
// is "YYYY-MM-DD". Returns e.g. "Thu May 28".
function _humanShortDate(eventDate) {
  if (!eventDate) return "";
  const [y, m, d] = eventDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function _humanWhere(props) {
  return [props.venue_name, props.neighborhood].filter(Boolean).join(" · ");
}

// Assume any event missing an explicit end_iso runs at most this long
// past its start time. Matches Partiful's typical event length, biased
// generous so we don't grey events that are still actually happening.
const _DEFAULT_EVENT_DURATION_MS = 3 * 60 * 60 * 1000;

function _isPastNow(props) {
  const now = Date.now();
  if (props.end_iso) {
    const t = Date.parse(props.end_iso);
    if (Number.isFinite(t)) return t < now;
  }
  // Fallback: many Partiful events list a start but no end. Treat them as
  // past if they started more than _DEFAULT_EVENT_DURATION_MS ago.
  if (props.start_iso) {
    const t = Date.parse(props.start_iso);
    if (Number.isFinite(t)) return t + _DEFAULT_EVENT_DURATION_MS < now;
  }
  return false;
}

function _rowHtml(citySlug, props, crossDay) {
  const eventId = props.event_id;
  const cap = props.at_capacity ? `<span class="sidebar-row-cap">full</span>` : "";
  const pastClass = _isPastNow(props) ? " is-past" : "";
  const time = _humanTime(props);
  const where = _humanWhere(props);
  const dayPrefix = crossDay ? _humanShortDate(props.event_date) : "";
  const whenLine = dayPrefix ? `${dayPrefix} · ${time}` : time;
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
  // Native-only actions (local-notification reminder + share sheet). Rendered
  // as role="button" spans because .sidebar-row is itself a <button>; hidden
  // entirely on the plain web build so the public site is unchanged.
  const native = !!(window.twagNative && window.twagNative.isNative());
  const reminded = native && window.twagNative.hasReminder(eventId);
  const remindBtn = native
    ? `<span class="sidebar-detail-remind${reminded ? " is-set" : ""}" role="button" tabindex="0" data-event-id="${_esc(eventId)}" aria-pressed="${reminded ? "true" : "false"}">${reminded ? "🔔 Reminder set" : "🔔 Remind me"}</span>`
    : "";
  const shareBtn = native
    ? `<span class="sidebar-detail-share" role="button" tabindex="0" data-event-id="${_esc(eventId)}" aria-label="Share event">📤 Share</span>`
    : "";
  const actions = (remindBtn || shareBtn)
    ? `<div class="sidebar-detail-actions">${remindBtn}${shareBtn}</div>` : "";
  return `
    <button class="sidebar-row${pastClass}" type="button" data-event-id="${_esc(eventId)}" aria-selected="false">
      <div class="sidebar-row-thumb" aria-hidden="true">
        <img loading="lazy" src="${_esc(_thumbUrl(citySlug, eventId))}" alt="">
      </div>
      <div class="sidebar-row-body">
        <div class="sidebar-row-title">${_esc(props.title)} ${cap}</div>
        <div class="sidebar-row-meta">${_esc(whenLine)}</div>
        <div class="sidebar-row-meta">${_esc(where)}</div>
        ${host}
        <div class="sidebar-detail">
          <img class="sidebar-detail-img" loading="lazy" src="${_esc(_thumbUrl(citySlug, eventId))}" alt="">
          ${venueLine}
          ${stats}
          ${description}
          ${rsvp}
          ${actions}
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

// Wire the native-only Remind / Share controls inside expanded detail cards.
// They're role="button" spans nested in a .sidebar-row <button>, so each
// handler stops propagation to avoid also triggering the row's own select().
function _wireDetailActions(listEl, propsById, citySlug) {
  listEl.querySelectorAll(".sidebar-detail-share").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const props = propsById.get(el.dataset.eventId);
      if (!props) return;
      window.twagNative.shareEvent({
        title: props.title,
        text: [props.title, props.start_time, props.venue_name].filter(Boolean).join(" · "),
        url: props.rsvp_url,
      });
      if (window.twagTrack) {
        twagTrack("event_shared", { city: citySlug, event_id: props.event_id || "", source: "sidebar" });
      }
    });
  });

  listEl.querySelectorAll(".sidebar-detail-remind").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const props = propsById.get(el.dataset.eventId);
      if (!props) return;
      const eventId = props.event_id;
      if (window.twagNative.hasReminder(eventId)) {
        await window.twagNative.cancelEventReminder(eventId);
        el.classList.remove("is-set");
        el.setAttribute("aria-pressed", "false");
        el.textContent = "🔔 Remind me";
        if (window.twagTrack) twagTrack("reminder_cancelled", { city: citySlug, event_id: eventId });
        return;
      }
      const res = await window.twagNative.scheduleEventReminder(
        Object.assign({ city: citySlug }, props)
      );
      if (res && res.scheduled) {
        el.classList.add("is-set");
        el.setAttribute("aria-pressed", "true");
        el.textContent = "🔔 Reminder set";
        if (window.twagTrack) twagTrack("reminder_scheduled", { city: citySlug, event_id: eventId });
      } else {
        el.textContent = res && res.reason === "too_late" ? "Already started" : "Couldn't set reminder";
        setTimeout(() => { el.textContent = "🔔 Remind me"; }, 2500);
      }
    });
  });
}

const _SIDEBAR_HIDDEN_KEY = "twag_sidebar_hidden";
const _SIDEBAR_EXPANDED_KEY = "twag_sidebar_expanded";

function initMapSidebar(config) {
  const map = config.map;
  const sourceId = config.sourceId;
  const citySlug = config.citySlug;
  const onSelect = config.onSelect || (() => {});

  const root = document.getElementById("sidebar");
  const stage = document.getElementById("map-stage");
  if (!root || !stage) return null;

  root.innerHTML = `
    <div class="sidebar-header">
      <span id="sidebar-count">Loading…</span>
      <div class="sidebar-header-btns">
        <button class="sidebar-expand-btn" type="button" aria-label="Expand list to full height" title="Expand list to full height">⤢</button>
        <button class="sidebar-hide-btn" type="button" aria-label="Hide events list" title="Hide events list">×</button>
      </div>
    </div>
    <div class="sidebar-list" id="sidebar-list"></div>
  `;
  const countEl = root.querySelector("#sidebar-count");
  const listEl = root.querySelector("#sidebar-list");
  const hideBtn = root.querySelector(".sidebar-hide-btn");
  const expandBtn = root.querySelector(".sidebar-expand-btn");

  // Floating "show" button rendered once and revealed when the sidebar is hidden.
  let showBtn = document.getElementById("sidebar-show-btn");
  if (!showBtn) {
    showBtn = document.createElement("button");
    showBtn.id = "sidebar-show-btn";
    showBtn.type = "button";
    showBtn.setAttribute("aria-label", "Show events list");
    showBtn.title = "Show events list";
    showBtn.innerHTML = `<span class="sidebar-show-btn-icon" aria-hidden="true">☰</span><span class="sidebar-show-btn-label">Events</span>`;
    stage.appendChild(showBtn);
  }

  function setHidden(hidden, opts) {
    opts = opts || {};
    stage.classList.toggle("sidebar-hidden", hidden);
    if (hidden) stage.classList.remove("sidebar-expanded"); // hiding clears expand
    try { localStorage.setItem(_SIDEBAR_HIDDEN_KEY, hidden ? "1" : "0"); } catch (_) {}
    // Let CSS transition finish, then have Mapbox refit the canvas.
    setTimeout(() => { if (map && map.resize) map.resize(); }, opts.delay || 220);
  }

  function setExpanded(expanded, opts) {
    opts = opts || {};
    stage.classList.toggle("sidebar-expanded", expanded);
    if (expandBtn) {
      // ⤢ = expand to full; ⤡ = shrink back / reveal the map.
      expandBtn.textContent = expanded ? "⤡" : "⤢";
      expandBtn.setAttribute(
        "aria-label",
        expanded ? "Shrink list and show map" : "Expand list to full height"
      );
      expandBtn.title = expandBtn.getAttribute("aria-label");
    }
    try { localStorage.setItem(_SIDEBAR_EXPANDED_KEY, expanded ? "1" : "0"); } catch (_) {}
    setTimeout(() => { if (map && map.resize) map.resize(); }, opts.delay || 220);
  }

  // Restore prior state (default: visible, not expanded).
  try {
    if (localStorage.getItem(_SIDEBAR_HIDDEN_KEY) === "1") {
      setHidden(true, { delay: 0 });
    }
    if (localStorage.getItem(_SIDEBAR_EXPANDED_KEY) === "1") {
      setExpanded(true, { delay: 0 });
    }
  } catch (_) {}

  hideBtn.addEventListener("click", () => {
    setHidden(true);
    if (window.twagTrack) twagTrack("sidebar_hidden", { city: citySlug });
  });
  showBtn.addEventListener("click", () => {
    setHidden(false);
    if (window.twagTrack) twagTrack("sidebar_shown", { city: citySlug });
  });
  expandBtn.addEventListener("click", () => {
    const nowExpanded = !stage.classList.contains("sidebar-expanded");
    setExpanded(nowExpanded);
    if (window.twagTrack) {
      twagTrack(nowExpanded ? "sidebar_expanded" : "sidebar_contracted", { city: citySlug });
    }
  });

  let selectedEventId = null;
  let lastFeatures = [];
  const eventCoords = new Map(); // event_id → [lon, lat]
  let scrollOnNextRender = false;

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
    // When a search is active, sort by Fuse relevance (most relevant first)
    // so the user's intended match floats to the top regardless of time.
    const matchOrder = window.__twagSearch && window.__twagSearch.currentMatchOrder
      ? window.__twagSearch.currentMatchOrder()
      : null;
    if (matchOrder) {
      const rank = new Map(matchOrder.map((id, i) => [id, i]));
      return out
        .slice()
        .sort((a, b) => {
          const ra = rank.has(a.properties.event_id) ? rank.get(a.properties.event_id) : Number.MAX_SAFE_INTEGER;
          const rb = rank.has(b.properties.event_id) ? rank.get(b.properties.event_id) : Number.MAX_SAFE_INTEGER;
          return ra - rb;
        });
    }
    return _sortByStart(out);
  }

  function render(features) {
    lastFeatures = features;
    const s = window.__twagSearch;
    const crossDay = !!(s && s.currentQuery && s.currentQuery() && s.currentScope && s.currentScope() === "all");
    if (!features.length) {
      countEl.textContent = "No events in view";
      listEl.innerHTML = `<div class="sidebar-empty">Pan or zoom the map — events in view will appear here.</div>`;
      return;
    }
    countEl.textContent = `${features.length} event${features.length === 1 ? "" : "s"} in view`;
    listEl.innerHTML = features.map(f => _rowHtml(citySlug, f.properties, crossDay)).join("");

    listEl.querySelectorAll(".sidebar-row").forEach(row => {
      row.addEventListener("click", () => {
        const id = row.dataset.eventId;
        select(id, { fromUser: true });
      });
    });

    // Native action buttons live inside each row's expanded detail card.
    // Build a quick lookup so handlers have the full event props.
    if (window.twagNative && window.twagNative.isNative()) {
      const propsById = new Map(features.map(f => [f.properties.event_id, f.properties]));
      _wireDetailActions(listEl, propsById, citySlug);
    }

    if (selectedEventId) {
      applySelectionDom();
    }

    if (scrollOnNextRender) {
      scrollOnNextRender = false;
      // Skip the current-or-next anchor while a search is active — the
      // relevance-sorted first row should stay at the top of the list.
      if (!crossDay) _scrollToCurrentOrNext();
    }
  }

  function _scrollToCurrentOrNext() {
    const rows = Array.from(listEl.querySelectorAll(".sidebar-row"));
    const target = rows.find((r) => !r.classList.contains("is-past"));
    if (target) {
      // Defer one tick so the new innerHTML has laid out.
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: "start", behavior: "auto" });
      });
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
    if (row) {
      // Always anchor the row's title to the top of the sidebar's visible
      // area so the user sees what they just selected — same behavior for
      // sidebar-row clicks and map-pin clicks (in both cases the user is
      // intentionally selecting an event).
      row.scrollIntoView({ block: "start", behavior: "smooth" });
      // Track RSVP click-throughs from inside the expanded card.
      const rsvpEl = row.querySelector(".sidebar-detail-rsvp");
      if (rsvpEl && window.twagTrack && !rsvpEl.dataset.tracked) {
        rsvpEl.dataset.tracked = "1";
        rsvpEl.addEventListener("click", () => {
          twagTrack("rsvp_clicked", {
            city: citySlug,
            event_id: eventId,
            source: "sidebar",
          });
        });
      }
    }
    const coords = eventCoords.get(eventId);
    if (opts.fromUser) {
      if (window.twagTrack) {
        twagTrack("sidebar_row_clicked", { city: citySlug, event_id: eventId });
      }
      if (coords) {
        // Clicking a row pans toward the pin (per plan: sidebar→map flies, map→sidebar doesn't).
        map.flyTo({ center: coords, speed: 1.4, curve: 1 });
      }
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

  /** Ask the sidebar to scroll to the current-or-next event the next time
   *  it renders. Called by the map after a date change (so panning doesn't
   *  trigger surprise re-scrolls). */
  function scrollToNowOnNextRender() {
    scrollOnNextRender = true;
  }

  const debouncedRefresh = _debounce(refresh, 150);
  map.on("moveend", debouncedRefresh);
  map.on("sourcedata", (e) => {
    if (e.sourceId === sourceId && e.isSourceLoaded) debouncedRefresh();
  });

  // First load — auto-anchor to the current-or-next event.
  scrollOnNextRender = true;
  refresh();

  return { refresh, select, clearSelection, scrollToNowOnNextRender };
}
