/* StageHopper Capacitor bridge — a tiny adapter that exposes native device
 * capabilities (geolocation, local notifications, share sheet) behind a
 * single feature-detected `window.twagNative` object.
 *
 * Loaded by every city HTML page BEFORE events_map.js / events_gallery.js.
 *
 * Design rule: every method is safe to call on the plain web build. When
 * the page is NOT running inside the Capacitor shell, native calls are
 * replaced by web-API fallbacks (navigator.geolocation, navigator.share,
 * clipboard) or graceful no-ops. The same docs/ folder therefore serves
 * both GitHub Pages and the bundled native app with no per-build branching
 * anywhere else in the codebase.
 *
 * Native plugins are reached through Capacitor's global bridge
 * (window.Capacitor.Plugins.<Name>) rather than via imported npm packages,
 * so this file needs no bundler — it stays plain ES5-ish JS like the rest
 * of docs/. The plugins themselves are registered in the native iOS/Android
 * projects by `npx cap sync`.
 */
(function () {
  "use strict";

  function hasCapacitor() {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function");
  }

  function isNative() {
    return hasCapacitor() && window.Capacitor.isNativePlatform();
  }

  function plugin(name) {
    if (!hasCapacitor() || !window.Capacitor.Plugins) return null;
    return window.Capacitor.Plugins[name] || null;
  }

  // iOS Mapbox token swap. The iOS webview origin (capacitor://…) can't be
  // allow-listed by Mapbox, so the referrer-restricted web token 403s there.
  // Swap in the unrestricted iOS token before the page's initEventMap() reads
  // window.TWAG_MAPBOX_TOKEN. Runs synchronously at load — Capacitor injects
  // window.Capacitor before app scripts, and this file loads before the inline
  // init. Android keeps the web token (its origin really is natea.github.io).
  if (
    isNative() &&
    window.Capacitor.getPlatform &&
    window.Capacitor.getPlatform() === "ios" &&
    window.TWAG_MAPBOX_TOKEN_NATIVE
  ) {
    window.TWAG_MAPBOX_TOKEN = window.TWAG_MAPBOX_TOKEN_NATIVE;
  }

  // ----- scheduled-reminder bookkeeping --------------------------------
  // LocalNotifications needs a 32-bit-ish integer id; event_ids are opaque
  // strings. We derive a stable positive integer from the string and keep a
  // localStorage map so a reminder can be cancelled later (e.g. un-RSVP).

  var REMINDER_KEY = "twag_reminders"; // { [event_id]: { id, at } }

  function stableId(str) {
    // djb2 → clamp into a safe positive 31-bit range.
    var h = 5381;
    str = String(str || "");
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % 2000000000 || 1;
  }

  function loadReminders() {
    try {
      return JSON.parse(localStorage.getItem(REMINDER_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveReminders(map) {
    try {
      localStorage.setItem(REMINDER_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  function reminderId(eventId) {
    var map = loadReminders();
    var entry = map[eventId];
    return entry ? entry.id : null;
  }

  function hasReminder(eventId) {
    return reminderId(eventId) !== null;
  }

  // ----- geolocation ---------------------------------------------------
  // Returns [lon, lat] (Mapbox order) or null. Native path uses the
  // Capacitor plugin for the better permission UX; web path falls back to
  // navigator.geolocation.

  function requestLocation(opts) {
    opts = opts || {};
    var Geolocation = plugin("Geolocation");
    if (isNative() && Geolocation) {
      return Geolocation.requestPermissions()
        .catch(function () { return null; })
        .then(function () {
          return Geolocation.getCurrentPosition({
            enableHighAccuracy: opts.highAccuracy !== false,
            timeout: opts.timeout || 10000,
          });
        })
        .then(function (pos) {
          if (!pos || !pos.coords) return null;
          return [pos.coords.longitude, pos.coords.latitude];
        })
        .catch(function () { return null; });
    }
    // Web fallback.
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve([pos.coords.longitude, pos.coords.latitude]); },
        function () { resolve(null); },
        { enableHighAccuracy: opts.highAccuracy !== false, timeout: opts.timeout || 10000 }
      );
    });
  }

  // ----- local notifications -------------------------------------------
  // Schedules a one-off "starts in N min" reminder for an event the user
  // chose. Native only; on the web it resolves to {scheduled:false} so the
  // caller can fall back to an in-app cue.

  function scheduleEventReminder(event, minutesBefore) {
    minutesBefore = typeof minutesBefore === "number" ? minutesBefore : 15;
    var eventId = event && event.event_id;
    if (!eventId) return Promise.resolve({ scheduled: false, reason: "no_event_id" });

    var startMs = event.start_iso ? Date.parse(event.start_iso) : NaN;
    if (!Number.isFinite(startMs)) {
      return Promise.resolve({ scheduled: false, reason: "no_start_time" });
    }
    var fireMs = startMs - minutesBefore * 60 * 1000;
    if (fireMs <= Date.now()) {
      // Event already started or is within the lead window — nothing to
      // schedule. Caller can show an inline "starts soon" cue instead.
      return Promise.resolve({ scheduled: false, reason: "too_late" });
    }

    var LocalNotifications = plugin("LocalNotifications");
    if (!isNative() || !LocalNotifications) {
      return Promise.resolve({ scheduled: false, reason: "web" });
    }

    var id = stableId(eventId);
    var venue = event.venue_name || event.neighborhood || "the venue";
    return LocalNotifications.requestPermissions()
      .then(function (perm) {
        if (perm && perm.display && perm.display !== "granted") {
          return { scheduled: false, reason: "denied" };
        }
        return LocalNotifications.schedule({
          notifications: [{
            id: id,
            title: event.title || "Tech Week event",
            body: "Starts in " + minutesBefore + " min at " + venue + ". Tap to view.",
            schedule: { at: new Date(fireMs), allowWhileIdle: true },
            extra: {
              event_id: eventId,
              city: event.city || "",
              event_date: event.event_date || "",
              view: "map",
            },
          }],
        }).then(function () {
          var map = loadReminders();
          map[eventId] = { id: id, at: fireMs };
          saveReminders(map);
          return { scheduled: true, id: id, at: fireMs };
        });
      })
      .catch(function () { return { scheduled: false, reason: "error" }; });
  }

  function cancelEventReminder(eventId) {
    var map = loadReminders();
    var entry = map[eventId];
    var LocalNotifications = plugin("LocalNotifications");
    var done = function () {
      delete map[eventId];
      saveReminders(map);
      return { cancelled: true };
    };
    if (isNative() && LocalNotifications && entry) {
      return LocalNotifications.cancel({ notifications: [{ id: entry.id }] })
        .then(done)
        .catch(done);
    }
    return Promise.resolve(done());
  }

  // ----- share ---------------------------------------------------------
  // Native opens the OS share sheet; web uses navigator.share, then falls
  // back to copying the URL to the clipboard.

  function shareEvent(event) {
    event = event || {};
    var title = event.title || "Tech Week event";
    var text = event.text ||
      [event.title, event.start_time, event.venue_name].filter(Boolean).join(" · ");
    var url = event.url || event.rsvp_url || window.location.href;

    var Share = plugin("Share");
    if (isNative() && Share) {
      return Share.share({ title: title, text: text, url: url, dialogTitle: "Share event" })
        .then(function () { return { shared: true, via: "native" }; })
        .catch(function () { return { shared: false }; });
    }
    if (navigator.share) {
      return navigator.share({ title: title, text: text, url: url })
        .then(function () { return { shared: true, via: "web-share" }; })
        .catch(function () { return { shared: false }; });
    }
    // Final fallback: copy the URL to the clipboard.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url)
        .then(function () { return { shared: true, via: "clipboard" }; })
        .catch(function () { return { shared: false }; });
    }
    return Promise.resolve({ shared: false, reason: "unsupported" });
  }

  // ----- notification-tap deep linking ---------------------------------
  // When a scheduled reminder fires and the user taps it, open the right
  // city map focused on the event. Only wired on native.

  function wireNotificationTaps() {
    var LocalNotifications = plugin("LocalNotifications");
    if (!isNative() || !LocalNotifications || !LocalNotifications.addListener) return;
    LocalNotifications.addListener("localNotificationActionPerformed", function (action) {
      var extra = (action && action.notification && action.notification.extra) || {};
      if (!extra.event_id) return;
      var city = extra.city || "boston";
      var params = new URLSearchParams();
      if (extra.event_date) params.set("date", extra.event_date);
      params.set("event", extra.event_id);
      var target = "events_map_" + city + ".html#" + params.toString();
      // If we're already on the right page, just update the hash so the
      // page's existing hashchange handler re-selects; otherwise navigate.
      if (window.location.pathname.indexOf("events_map_" + city) !== -1) {
        window.location.hash = params.toString();
      } else {
        window.location.assign("./" + target);
      }
    });
  }

  // ----- status bar -----------------------------------------------------
  // The webview is inset below the status bar via ios.contentInset='always',
  // so we only set the content style here (light text for the dark strip).
  // On Android also paint the reserved strip dark.
  function wireStatusBar() {
    var StatusBar = plugin("StatusBar");
    if (!isNative() || !StatusBar) return;
    try {
      if (StatusBar.setStyle) StatusBar.setStyle({ style: "DARK" });
      var plat = window.Capacitor.getPlatform && window.Capacitor.getPlatform();
      if (plat === "android") {
        if (StatusBar.setOverlaysWebView) StatusBar.setOverlaysWebView({ overlay: false });
        if (StatusBar.setBackgroundColor) StatusBar.setBackgroundColor({ color: "#1a1a1a" });
      }
    } catch (_) {}
  }

  if (isNative()) {
    // Defer until the Capacitor bridge has finished bootstrapping.
    document.addEventListener("DOMContentLoaded", function () {
      wireStatusBar();
      wireNotificationTaps();
    });
    wireStatusBar();
  }

  window.twagNative = {
    isNative: isNative,
    requestLocation: requestLocation,
    scheduleEventReminder: scheduleEventReminder,
    cancelEventReminder: cancelEventReminder,
    hasReminder: hasReminder,
    shareEvent: shareEvent,
  };
})();
