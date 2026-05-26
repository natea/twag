/* TWAG Datadog RUM (Real User Monitoring).
 *
 * Loads the Datadog browser RUM SDK and initializes it. The application ID
 * + client token are PUBLIC by design (Datadog's "client token" is meant to
 * be shipped in client-side code; the API key that grants ingest access
 * stays server-side and we don't have one here).
 *
 * If TWAG_DATADOG_APPLICATION_ID or TWAG_DATADOG_CLIENT_TOKEN is missing,
 * this file no-ops so the rest of the page still works.
 *
 * Snippet body matches Datadog's recommended v7 loader. Configure what
 * RUM captures from this file's init block.
 */
(function () {
  var appId = window.TWAG_DATADOG_APPLICATION_ID;
  var clientToken = window.TWAG_DATADOG_CLIENT_TOKEN;
  if (!appId || !clientToken) return;

  // Don't ping during local file:// dev.
  if (location.protocol === "file:") return;

  // Official Datadog v7 loader.
  (function (h, o, u, n, d) {
    h = h[d] = h[d] || { q: [], onReady: function (c) { h.q.push(c); } };
    d = o.createElement(u); d.async = 1; d.src = n; d.crossOrigin = "";
    n = o.getElementsByTagName(u)[0]; n.parentNode.insertBefore(d, n);
  })(window, document, "script",
     "https://www.datadoghq-browser-agent.com/us5/v7/datadog-rum.js",
     "DD_RUM");

  window.DD_RUM.onReady(function () {
    window.DD_RUM.init({
      applicationId: appId,
      clientToken: clientToken,
      site: "us5.datadoghq.com",
      service: "twag",
      env: "prod",
      version: "1.0.0",
      sessionSampleRate: 100,
      sessionReplaySampleRate: 20,
      trackResources: true,
      trackUserInteractions: true,
      trackLongTasks: true,
    });
  });
})();

// Optional helper, mirrors twagTrack for parity. Calls DD_RUM.addAction
// once the SDK is ready. Safe to call before init — DD_RUM queues callbacks.
window.twagTrackDD = function (event, props) {
  try {
    if (window.DD_RUM && window.DD_RUM.onReady) {
      window.DD_RUM.onReady(function () {
        window.DD_RUM.addAction(event, props || {});
      });
    }
  } catch (_) {}
};
