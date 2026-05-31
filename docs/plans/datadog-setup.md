# Datadog setup

The code-side wiring is done in this repo:

- `docs/datadog.js` loads Datadog's browser RUM SDK v7 and initialises it.
- `docs/config.js` holds the public credentials (`window.TWAG_DATADOG_APPLICATION_ID` and `window.TWAG_DATADOG_CLIENT_TOKEN`).
- `service: twag`, `env: prod`, `version: 1.0.0`, US5 site.
- `sessionSampleRate: 100`, `sessionReplaySampleRate: 20`.
- `trackResources`, `trackUserInteractions`, `trackLongTasks` all on.

Everything else lives in the Datadog dashboard at <https://us5.datadoghq.com>.

## Where the data actually shows up

The Datadog quick-start screen pushes you toward installing the **Agent**
(a server-side daemon) and **APM** (backend tracing). **Neither applies
to TWAG** — we're a static site, no server, no containers. Ignore the
"No Infrastructure Detected" banner; that warning is for backend-only
features.

Our data lives under **RUM (Real User Monitoring)**:

1. Left nav → **Digital Experience**
2. → **Real User Monitoring** → **Applications**
3. Pick the `twag` application (matches `service: "twag"` in `datadog.js`).

You'll see panels for **Performance**, **Sessions**, **Errors**, and
**Long Tasks**. Bookmark this page — it's your homepage for TWAG.

## Required (gets data flowing properly)

### 1. Verify ingest

1. Open the live site in a normal (non-blocking-extension) browser:
   `https://natea.github.io/twag/events_map_boston.html`
2. Click a pin or two; switch the date.
3. Open Datadog → **Digital Experience → Sessions**.
4. Filter `service:twag` and time range "Last 15 minutes."
5. Your session should appear within ~1–2 minutes (RUM batches before
   sending).

If nothing arrives: open the browser DevTools console on the live site
and look for Datadog errors — usually a CORS rejection or a typo in
the `applicationId` / `clientToken`.

### 2. Restrict the client token

Datadog client tokens are public by design but should still be scoped:

1. **Personal → Organization Settings → Application Keys** (or "Client
   Tokens" depending on the org).
2. Find the `pub9611675…` token used by TWAG.
3. If your tier allows allowlisting referrers, set the allowed origin
   to `https://natea.github.io`. (Some Datadog plans expose this; on the
   free trial it may not be available — skip if so.)

## Recommended (signal quality)

### 3. Exclude your own traffic

1. Digital Experience → **Real User Monitoring → Settings → Application
   Settings → Privacy & Sampling** (or similar — the exact path moves
   around).
2. Add a **Session exclude rule** — anything with your User-Agent string,
   or with `usr.email` matching yours if you ever start identifying users.

Easier interim: set a saved view filter `-@view.url:*natea.github.io* OR
-@usr.id:nate` so dashboards don't include your own QA noise.

### 4. Drop the session replay sample rate (later)

The code currently records 20% of sessions for replay. Free trial gives
you generous replay quota; the paid tier charges per replay. Once you
have enough replay data to know what you're looking at, drop the rate
to 5–10% by editing `docs/datadog.js`:

```js
sessionReplaySampleRate: 10,
```

## Polish (dashboards + monitors)

### 5. Build a TWAG RUM dashboard

Dashboards → **New dashboard** → "TWAG — Tech Week monitoring." Useful
widgets:

| Widget | Type | Config |
|---|---|---|
| Sessions over time | Timeseries | `service:twag`, group by `@view.url_path` |
| Page-load duration (p50/p75/p95) | Timeseries | metric `@view.loading_time`, percentiles `50, 75, 95`, group by `@view.url_path` |
| Long Tasks per session | Top list | metric `@long_task.duration`, group by `@view.url_path` |
| JS errors over time | Timeseries | event type `error`, count, group by `@error.message` |
| Resource timing — Mapbox tiles | Timeseries | `@resource.url:*api.mapbox.com*`, p95 `@resource.duration` |
| RSVP click-through rate | (Funnels need RUM Premium — skip if free tier) | event type `action`, `@action.name:rsvp_clicked` |
| Geo-distribution of sessions | Geomap | `service:twag`, count |
| Device + OS breakdown | Top list | `service:twag`, group by `@device.type` and `@os.name` |

### 6. Set up RUM monitors (alerts)

Monitoring → **New Monitor → RUM**.

Useful alerts:

- **JS error rate > 1%** of sessions in the last hour → notify
  (catches deploy regressions).
- **p95 page load > 5 s** for any page in `service:twag` → notify
  (catches CDN / asset issues).
- **Sessions drop to zero** for >10 min during Tech Week → notify
  (catches site-down scenarios).

Free trial supports a handful of monitors; pick the most useful one
or two.

### 7. Connect RUM sessions to errors

Datadog auto-correlates uncaught JS errors to the session that produced
them. Click any error in **Real User Monitoring → Errors** to jump to
the full session replay — invaluable for "why did this user's map fail
to load?" debugging.

## Skip for now (these don't apply to a static site)

- **Agent / Infrastructure Monitoring** — needs a server or container.
  We have neither. The "No Agent Detected" warning on the quick-start
  screen is expected; ignore it.
- **APM (Application Performance Monitoring)** — backend service tracing.
  Same reason.
- **Database Monitoring**, **Cloud SIEM**, **Cloud Cost Management** —
  all backend / infra products; not applicable.
- **Synthetic Tests** — could be useful for "is the site up?" checks
  during Tech Week, but the RUM monitor in step 6 covers the same need
  cheaper.

## What RUM captures automatically (no extra code)

Because we set `trackUserInteractions: true`, `trackResources: true`,
and `trackLongTasks: true`, Datadog automatically records:

- Every page view (`@view`)
- Every click on a tagged element (`@action`)
- Every network resource fetch with timing (`@resource`)
- Every Long Task (`@long_task`) — JS that blocked the main thread > 50 ms
- Every uncaught JS error (`@error`)
- Session replays (sampled at 20%)

So you generally don't need to add explicit Datadog tracking calls —
PostHog's named events cover business semantics, and Datadog covers
performance signal automatically.

If you ever do want a custom action recorded to Datadog, the helper is
already available:

```js
twagTrackDD("custom_event_name", { foo: "bar" });
```

## Troubleshooting

- **Sessions in Datadog but no replays** — verify Session Replay is
  enabled at the org level; some Datadog tiers require explicit opt-in.
- **No data at all** — check `window.TWAG_DATADOG_APPLICATION_ID` and
  `TWAG_DATADOG_CLIENT_TOKEN` are non-empty in `docs/config.js`. Check
  the browser Network tab for a POST to `*.us5.datadoghq.com`.
- **Quick-start banner won't go away** — the "Install Your First Agent"
  prompt is for backend-monitoring users; ignore it. Bookmark
  **Digital Experience → RUM** as your default starting point.
- **Quota burn worry** — Datadog RUM bills per session and per replay
  separately. Replays are the expensive bit. Drop
  `sessionReplaySampleRate` in `docs/datadog.js` if cost becomes a
  concern post-trial.
