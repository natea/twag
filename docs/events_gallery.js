/* TWAG event gallery — shared logic for per-city HTML pages.
 *
 * Each city HTML inlines GALLERY_CONFIG (galleryUrl, dateRange,
 * defaultDate) and calls initEventGallery(GALLERY_CONFIG).
 */

function pad2g(n) {
  return n < 10 ? "0" + n : "" + n;
}

function parseDateFromHashG() {
  const raw = (window.location.hash || "").replace(/^#/, "");
  const match = raw.match(/date=(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function setDateInHashG(date) {
  // Merge into existing hash params so the search query (q=…) survives a
  // date chip click. Without this, switching days erases the user's search.
  const raw = (window.location.hash || "").replace(/^#/, "");
  const params = new URLSearchParams(raw);
  if (date) params.set("date", date);
  else params.delete("date");
  window.location.hash = params.toString();
}

function formatHumanDateG(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const opts = { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" };
  return date.toLocaleDateString(undefined, opts);
}

const _WEEKDAY_SHORT_G = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
function weekdayShortG(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return _WEEKDAY_SHORT_G[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function buildDatePickerG(container, dateRange, activeDate, onChange) {
  container.innerHTML = "";
  for (const date of dateRange) {
    const btn = document.createElement("button");
    btn.className = "date-btn" + (date === activeDate ? " active" : "");
    btn.innerHTML =
      `<span class="date-btn-long">${formatHumanDateG(date)}</span>` +
      `<span class="date-btn-short">${weekdayShortG(date)}</span>`;
    btn.addEventListener("click", () => onChange(date));
    container.appendChild(btn);
  }
}

function escapeHtmlG(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Assume any event missing an explicit end_iso runs at most this long
// past its start time. Matches Partiful's typical event length, biased
// generous so we don't grey events that are still actually happening.
const _DEFAULT_EVENT_DURATION_MS = 3 * 60 * 60 * 1000;

function _isPastNowG(event) {
  const now = Date.now();
  if (event.end_iso) {
    const t = Date.parse(event.end_iso);
    if (Number.isFinite(t)) return t < now;
  }
  // Fallback: many Partiful events list a start but no end. Treat them as
  // past if they started more than _DEFAULT_EVENT_DURATION_MS ago.
  if (event.start_iso) {
    const t = Date.parse(event.start_iso);
    if (Number.isFinite(t)) return t + _DEFAULT_EVENT_DURATION_MS < now;
  }
  return false;
}

function _humanShortDateG(eventDate) {
  if (!eventDate) return "";
  const [y, m, d] = eventDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function renderTile(event, crossDay) {
  const time = [event.start_time, event.end_time].filter(Boolean).join("–");
  const where = [event.venue_name, event.neighborhood].filter(Boolean).join(" · ");
  const cap = event.at_capacity ? `<span class="tile-cap">at capacity</span>` : "";
  const href = event.rsvp_url || "#";
  const pastClass = _isPastNowG(event) ? " is-past" : "";
  const dayPrefix = crossDay ? _humanShortDateG(event.event_date) : "";
  const whenLine = dayPrefix ? `${dayPrefix} · ${time}` : time;
  const going = (typeof event.going_guest_count === "number")
    ? `<span class="overlay-stat">${event.going_guest_count} going</span>`
    : "";
  const remaining = (typeof event.remaining_capacity === "number" && event.remaining_capacity > 0)
    ? `<span class="overlay-stat">${event.remaining_capacity} spots left</span>`
    : "";
  const description = event.description
    ? `<div class="overlay-desc">${escapeHtmlG(event.description)}</div>`
    : "";
  const stats = (going || remaining)
    ? `<div class="overlay-stats">${going}${remaining}</div>`
    : "";
  return `
    <a class="tile${pastClass}" href="${escapeHtmlG(href)}" target="_blank" rel="noopener" data-event-id="${escapeHtmlG(event.event_id)}">
      <div class="tile-img-wrap">
        <img class="tile-img" loading="lazy" src="${escapeHtmlG(event.image)}" alt="${escapeHtmlG(event.title)}">
        <div class="tile-overlay">
          <div class="overlay-title">${escapeHtmlG(event.title)}</div>
          <div class="overlay-when">${escapeHtmlG(time)}</div>
          <div class="overlay-where">${escapeHtmlG(where)}</div>
          ${event.host ? `<div class="overlay-host">Hosted by ${escapeHtmlG(event.host)}</div>` : ""}
          ${stats}
          ${description}
          <div class="overlay-cta">Tap to RSVP →</div>
        </div>
      </div>
      <div class="tile-body">
        <div class="tile-title">${escapeHtmlG(event.title)} ${cap}</div>
        <div class="tile-meta">${escapeHtmlG(whenLine)}</div>
        <div class="tile-meta">${escapeHtmlG(where)}</div>
        ${event.host ? `<div class="tile-host">${escapeHtmlG(event.host)}</div>` : ""}
      </div>
    </a>
  `;
}

async function initEventGallery(config) {
  const response = await fetch(config.galleryUrl);
  if (!response.ok) {
    document.getElementById("error").textContent =
      `Failed to load ${config.galleryUrl}: ${response.status}`;
    return;
  }
  const payload = await response.json();
  const allEvents = payload.events || [];
  const citySlug = payload.city || "";

  const initialDate = parseDateFromHashG() || config.defaultDate;
  let activeDate = initialDate;

  const datePicker = document.getElementById("date-picker");
  const grid = document.getElementById("gallery-grid");
  const countEl = document.getElementById("count");

  let lastTrackedDate = null;
  let lastScrolledDate = null;
  let search = null;

  function refresh() {
    const previousDate = lastTrackedDate;
    const shouldScroll = activeDate !== lastScrolledDate;
    buildDatePickerG(datePicker, config.dateRange, activeDate, (date) => {
      activeDate = date;
      setDateInHashG(date);
      refresh();
    });
    // Update the "This day" pill label when activeDate changes.
    if (search && search.refreshScopeLabel) search.refreshScopeLabel();
    const matchIds = search ? search.currentMatchIds() : null;
    const query = search ? search.currentQuery() : "";
    const scope = search ? search.currentScope() : "all";
    const dateLabel = formatHumanDateG(activeDate);
    let filtered;
    if (matchIds) {
      const order = search.currentMatchOrder() || [];
      const rank = new Map(order.map((id, i) => [id, i]));
      const candidate = scope === "day"
        ? allEvents.filter(e => e.event_date === activeDate)
        : allEvents;
      filtered = candidate
        .filter(e => matchIds.has(e.event_id))
        .sort((a, b) => {
          const ra = rank.has(a.event_id) ? rank.get(a.event_id) : Number.MAX_SAFE_INTEGER;
          const rb = rank.has(b.event_id) ? rank.get(b.event_id) : Number.MAX_SAFE_INTEGER;
          return ra - rb;
        });
    } else {
      filtered = allEvents.filter(e => e.event_date === activeDate);
    }
    const scopeLabel = scope === "day" ? `on ${dateLabel}` : "across all days";
    countEl.textContent = query
      ? `${filtered.length} events matching "${query}" ${scopeLabel}`
      : `${filtered.length} events on ${dateLabel}`;
    const crossDay = !!matchIds && scope === "all";
    grid.innerHTML = filtered.length
      ? filtered.map(e => renderTile(e, crossDay)).join("")
      : `<div class="empty">${query
          ? `No events match "${escapeHtmlG(query)}".`
          : "No events with images on this day."}</div>`;

    // Auto-scroll to the first current-or-upcoming tile, but only when the
    // user changed days (not on every search keystroke). Suppressed entirely
    // while a search is active — the relevance-sorted first match should
    // stay at the top of the grid.
    if (shouldScroll && filtered.length && !matchIds) {
      lastScrolledDate = activeDate;
      const tiles = Array.from(grid.querySelectorAll(".tile"));
      const target = tiles.find((t) => !t.classList.contains("is-past"));
      if (target) {
        requestAnimationFrame(() => {
          target.scrollIntoView({ block: "start", behavior: "auto" });
        });
      } else {
        // All events past — leave the user at the top so they see chronologically.
        grid.scrollTop = 0;
      }
    }

    if (window.twagTrack) {
      if (previousDate === null) {
        twagTrack("gallery_view_loaded", {
          city: citySlug,
          date: activeDate,
          event_count: filtered.length,
        });
      } else if (previousDate !== activeDate) {
        twagTrack("date_filter_changed", {
          city: citySlug,
          view: "gallery",
          from_date: previousDate,
          to_date: activeDate,
        });
      }
      lastTrackedDate = activeDate;

      // Wire tile-click tracking. Each tile <a> goes to the Partiful RSVP,
      // so we fire both gallery_tile_clicked and rsvp_clicked.
      grid.querySelectorAll(".tile").forEach(tile => {
        tile.addEventListener("click", () => {
          const href = tile.getAttribute("href") || "";
          // Extract event_id from the Partiful URL last path segment.
          const match = href.match(/\/e\/([A-Za-z0-9_-]+)/);
          const eventId = match ? match[1] : "";
          twagTrack("gallery_tile_clicked", { city: citySlug, event_id: eventId });
          twagTrack("rsvp_clicked", {
            city: citySlug,
            event_id: eventId,
            source: "gallery",
          });
        });
      });
    }
  }

  if (typeof initSearch === "function") {
    search = initSearch({
      events: allEvents,
      onChange: refresh,
      citySlug: citySlug,
      view: "gallery",
      getActiveDate: () => activeDate,
    });
  }

  refresh();

  window.addEventListener("hashchange", () => {
    const hashDate = parseDateFromHashG();
    if (hashDate && hashDate !== activeDate) {
      activeDate = hashDate;
      refresh();
    }
  });
}
