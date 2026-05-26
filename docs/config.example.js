// Copy this to docs/config.js and paste your Mapbox public token below.
// The token must be referrer-restricted to your GitHub Pages domain
// (e.g. https://natea.github.io/twag/*) in the Mapbox account dashboard,
// since this file is publicly served.
window.TWAG_MAPBOX_TOKEN = "pk.YOUR_PUBLIC_TOKEN_HERE";

// PostHog product analytics + surveys. The project API key is public
// (PostHog calls it the "client key"); restrict it to the allowed
// origin under Project Settings → CORS in the PostHog dashboard.
// Leave blank to disable analytics entirely.
window.TWAG_POSTHOG_KEY = "phc_YOUR_POSTHOG_KEY_HERE";

// Datadog RUM. applicationId is a UUID; clientToken starts with "pub".
// Both are public client-side credentials. Leave blank to disable.
window.TWAG_DATADOG_APPLICATION_ID = "YOUR_DATADOG_APPLICATION_ID_HERE";
window.TWAG_DATADOG_CLIENT_TOKEN = "pubYOUR_DATADOG_CLIENT_TOKEN_HERE";
