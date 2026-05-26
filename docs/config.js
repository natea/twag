// Copy this to docs/config.js and paste your Mapbox public token below.
// The token must be referrer-restricted to your GitHub Pages domain
// (e.g. https://aleksj.github.io/twag/*) in the Mapbox account dashboard,
// since this file is publicly served.
window.TWAG_MAPBOX_TOKEN =
  "pk.eyJ1IjoibmF0ZWF1bmUiLCJhIjoiY21wbHU4aHdmMXRzdzJycTd2bWQ3czN2YiJ9.CzTQoqTuInVTkb0cx-pNiQ";

// PostHog project API key. Restrict to https://natea.github.io
// under Project Settings → CORS in the PostHog dashboard.
// Leave blank ("") to disable analytics entirely (the snippet no-ops).
window.TWAG_POSTHOG_KEY = "phc_otNjakqHqTEBx2M35NgKZY3JAPf8KAgzBC34HdEpQoEC";

// Datadog RUM (Real User Monitoring). Both values are public client-side
// credentials and intended to be shipped in client JS. Leave blank to
// disable Datadog entirely.
window.TWAG_DATADOG_APPLICATION_ID = "03c930f5-c516-45e4-920d-cb74a900b6a9";
window.TWAG_DATADOG_CLIENT_TOKEN = "pub9611675038caf75b2f24a815177d4554";
