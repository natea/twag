# PostHog setup

The code-side wiring is done in this repo:

- `docs/posthog.js` loads PostHog and exposes a `twagTrack(event, props)` helper.
- `docs/config.js` holds the project API key (`window.TWAG_POSTHOG_KEY`).
- 12 named events are instrumented across `events_map.js`, `events_map_sidebar.js`, `events_gallery.js`, and `tab_nav.js`.

Everything else lives in the PostHog dashboard at <https://us.posthog.com>. The
checklist below covers what to set up there, in priority order.

## Required (gets data flowing properly)

### 1. Verify ingest

1. Sign in at <https://us.posthog.com> and open the TWAG project.
2. Navigate to **Activity → Live events**.
3. Load `https://natea.github.io/twag/events_map_boston.html` in a separate
   tab. Click a pin or two.
4. Within ~5 seconds, you should see `$pageview` and the named events
   (`map_view_loaded`, `map_pin_clicked`, etc.) arriving live.

If nothing arrives: open the browser DevTools console on the live site and
look for PostHog errors — usually a CORS rejection or a typo in the key.

### 2. Restrict the project key by domain

1. Project Settings → **Project authorization** (sometimes labelled
   "Permitted domains").
2. Add `https://natea.github.io`.
3. Save.

This stops anyone who lifts the key from sending fake events at you from
their own domain. PostHog public keys (`phc_…`) are designed to ship in
client code, but a domain restriction is the cheap safety net.

## Recommended (security + signal quality)

### 3. Enable Session Replay

1. Project Settings → **Session Replay**.
2. Toggle **Enable session recording** on.
3. Set the **Recording sample rate** — start at 100%; drop to 10% later if
   the 5,000 recordings/month free-tier cap becomes a constraint.

Session replays are PostHog's most useful UX-debugging tool — they show
exactly how real users navigated the map and gallery.

### 4. Block your own traffic from analytics

1. Project Settings → **Project members & test accounts**.
2. Mark your own user as a test account.
3. Project Settings → **Filters** → exclude test accounts globally.

Without this every dashboard double-counts you while you're QA'ing the
site, which skews early funnel numbers.

### 5. Set the project data retention

Project Settings → **Data retention**. Free-tier default is 12 months,
which is plenty. Worth a glance so you know what you've got.

## Polish (better dashboards + feedback survey)

### 6. Set up the feedback survey

Activity → **Surveys → New survey**:

- Trigger: "URL contains `natea.github.io/twag`" + "After 45 seconds on
  the page"
- Frequency: "Once per user"
- Questions:
  - "Did you find what you came here for?" (rating, 1–5)
  - "What would you change?" (free text)
  - "Email for follow-up?" (free text, optional)
- Display: bottom-right card, accent colour `#e8543e` (the site's brand
  orange)

### 7. Build a TWAG dashboard

Dashboards → **New dashboard**. Useful tiles:

| Tile | Insight type | Config |
|---|---|---|
| Sessions per day | Trends | event `$pageview`, breakdown by `properties.city` |
| Map → RSVP funnel | Funnels | `map_view_loaded` → `rsvp_clicked` (filter `properties.source = map_popup`) |
| Gallery → RSVP funnel | Funnels | `gallery_view_loaded` → `rsvp_clicked` (filter `properties.source = gallery`) |
| Top neighborhoods | Trends | event `map_pin_clicked`, breakdown by `properties.neighborhood`, bar chart |
| Map vs Gallery vs Schedule | Trends | event `tab_switched`, breakdown by `properties.to`, bar chart |
| Date popularity | Trends | event `date_filter_changed`, breakdown by `properties.to_date`, bar chart |
| Sidebar usage | Trends | events `sidebar_hidden` and `sidebar_shown` over time |

### 8. RSVP click attribution

Insights → **New trends** → event = `rsvp_clicked`, breakdown by
`properties.source`. Shows which surface (map popup vs sidebar card vs
gallery overlay) drives the most RSVPs — useful for deciding where to
invest UX polish.

### 9. (Optional) Alert on traffic drop

Save the "sessions per day" trend → **Set up alert** → "notify if value
drops below X." Useful during Tech Week itself in case the site goes
down or Pages stops serving correctly.

## Reference: events the site emits

Defined in code; you don't need to register these in PostHog, but having
the list handy helps when building insights.

| Event | Properties | Fires when |
|---|---|---|
| `$pageview` | (automatic) | Any page load |
| `$autocapture` | (automatic) | Any click / form submit |
| `map_view_loaded` | `city, date, event_count` | Map page first renders |
| `gallery_view_loaded` | `city, date, event_count` | Gallery page first renders |
| `date_filter_changed` | `city, view, from_date, to_date` | User picks a different day |
| `map_pin_clicked` | `city, event_id, neighborhood` | Clicking an unclustered pin |
| `map_cluster_clicked` | `city, cluster_size` | Clicking a cluster bubble |
| `sidebar_row_clicked` | `city, event_id` | Clicking a row in the sidebar |
| `sidebar_hidden` / `sidebar_shown` | `city` | Toggling the sidebar |
| `gallery_tile_clicked` | `city, event_id` | Clicking a gallery tile |
| `tab_switched` | `city, from, to` | Map ⇄ Gallery (⇄ Schedule, when shipped) |
| `rsvp_clicked` | `city, event_id, source: map_popup\|sidebar\|gallery` | User clicks any RSVP-to-Partiful link |
| `search_performed` | `city, view, query, query_length, match_count` | User pauses typing in the search box for ≥ 700 ms (deduped against the prior tracked query) |

## Skip for now

- **Feature flags** — no A/B testing needed yet.
- **Person profiles** — the snippet is in `identified_only` mode by design;
  no per-visitor profiles get created. Don't switch to `always` unless real
  user accounts are added later.
- **CDP / data warehouse** — overkill for a static site.

## Troubleshooting

- **No events arriving** — check `window.TWAG_POSTHOG_KEY` is set in
  `docs/config.js` (not blank) and matches your project key.
- **Events arriving but no replays** — Session Replay must be toggled on
  in Project Settings (step 3 above).
- **Events from your own clicks polluting dashboards** — mark yourself a
  test account (step 4 above).
- **GitHub Pages serving stale JS** — Pages caches aggressively. Append
  `?cb=$(date +%s)` to the URL during testing, or use a private/incognito
  window to bypass the cache.
