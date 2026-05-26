# PostHog: usage analytics + in-app feedback

## Context

TWAG ships event maps + galleries for Boston Tech Week 2026 (May 26–31, day 1
is today) and NY Tech Week 2026 (June 1–7). We have zero visibility into how
people use the site: which city wins, which day gets the most traffic, whether
the new sidebar / Add+ flow lands, whether the gallery vs map split makes
sense on mobile vs desktop, and whether users actually click RSVP after
browsing. We also want a way for early users to send us feedback without us
having to chase them on Twitter.

PostHog gives us all of that from a single drop-in JS snippet:

- **Product analytics** — page views, custom events, funnels, retention,
  device/browser breakdowns.
- **Session replay** — see how people actually use the map (very useful for
  catching UX confusion, opt-in or sampled to save quota).
- **Surveys** — built-in feedback widget that pops up in-app with rules
  (e.g. "after 30 seconds on a page" or "after the 3rd map pan").
- **Feature flags** — would let us A/B test layouts (not v1 scope).
- **Heatmaps** — see which map regions get the most clicks.

Free tier covers 1M events/month + 5k session recordings + 250 survey
responses, comfortably ahead of any realistic Tech Week 2026 traffic.

Branch: `natea/posthog`, off `main`.

## Setup

### 1. PostHog snippet

Add one shared file `docs/posthog.js` that initializes the client and exposes
a tiny `track(event, props)` helper so the rest of the code doesn't import
PostHog directly:

```js
// docs/posthog.js
(function () {
  if (!window.TWAG_POSTHOG_KEY) return;        // not configured, no-op
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){...});
  // ↑ the standard PostHog snippet from app.posthog.com (we'll paste the latest).
  posthog.init(window.TWAG_POSTHOG_KEY, {
    api_host: "https://us.i.posthog.com",       // or eu.i.posthog.com
    person_profiles: "identified_only",         // don't create profiles for everyone
    capture_pageview: true,
    autocapture: true,                          // automatic click/form tracking
  });
})();

window.twagTrack = function (event, props) {
  if (window.posthog && posthog.capture) posthog.capture(event, props || {});
};
```

`window.TWAG_POSTHOG_KEY` lives in `docs/config.js` (alongside the existing
Mapbox token):

```js
window.TWAG_POSTHOG_KEY = "phc_…";    // PostHog project API key (public, OK to ship)
```

PostHog project API keys are *public* by design — they identify the project,
not a secret. The same logic applies as Mapbox tokens: GitHub's secret scanner
might flag them, but they're meant to live in client-side code.

### 2. Inclusion

`docs/posthog.js` loaded *first* in every page (before tab_nav.js / the page-
specific JS) so subsequent code can call `twagTrack(...)`:

- `events_map_boston.html`
- `events_map_nyc.html`
- `events_gallery_boston.html`
- `events_gallery_nyc.html`
- `index.html` (the redirect page — tracks landing on the bare /twag/ URL
  before bouncing to Boston map)

### 3. Privacy posture

This site has no auth, no accounts, no PII. PostHog stores a random anonymous
ID in localStorage. No cookies are set on EU users without consent because
PostHog's anonymous mode is cookie-less by default with `person_profiles:
"identified_only"`. That keeps us out of GDPR cookie-banner territory.

If we ever add a "save schedule across devices" flow (which would create
real user identities), we'd need to revisit and add a consent banner.

Documenting this in a short `docs/privacy.md` linked from the index page is
a polite move; not strictly required.

## Events to track

PostHog's `autocapture` will record every click + page view by itself. On top
of that, a small set of **named events** make funnels readable. Proposed list,
all called via `twagTrack`:

### Map view

| Event | Props | Where |
|---|---|---|
| `map_view_loaded` | `{city, date, zoom}` | `events_map.js` after first refresh |
| `date_filter_changed` | `{city, view, from_date, to_date}` | both date pickers |
| `map_pin_clicked` | `{city, event_id, neighborhood}` | unclustered-point click |
| `map_cluster_clicked` | `{city, cluster_size}` | clusters click |
| `sidebar_row_clicked` | `{city, event_id}` | sidebar select() from user |
| `sidebar_hidden` / `sidebar_shown` | `{city, view}` | hide/show toggle |
| `rsvp_clicked` | `{city, event_id, source: popup\|sidebar\|gallery}` | every RSVP link |

### Gallery view

| Event | Props | Where |
|---|---|---|
| `gallery_view_loaded` | `{city, date, event_count}` | `events_gallery.js` after refresh |
| `gallery_tile_clicked` | `{city, event_id}` | tile anchor click (same target as rsvp_clicked from gallery) |
| `tab_switched` | `{city, from, to}` | tab_nav.js click handler |

### Telegram (link clicks only; the bot itself logs its own questions)

| Event | Props | Where |
|---|---|---|
| `telegram_link_clicked` | `{city, source}` | any link to `t.me/Twagbot` |

### Schedule view (when shipped per the my-schedule plan)

| Event | Props |
|---|---|
| `schedule_event_added` | `{city, event_id, source}` |
| `schedule_event_removed` | `{city, event_id}` |
| `schedule_viewed` | `{city, count}` |
| `schedule_conflict_seen` | `{city, count}` |

## Feedback collection

Two complementary mechanisms:

1. **PostHog Survey widget** — configure in the PostHog dashboard, no code
   needed beyond the base snippet. Trigger: "user has been on any page for >
   45 seconds AND has not seen the survey before." Three-question survey:
   - "Did you find what you came here for?" (1–5)
   - "What would you change?" (free text)
   - Optional: "Email if you'd like a reply" (free text, optional)

   Renders as a small dismissible card in the bottom-right of the page. The
   styling can be tweaked from the dashboard to match the brand orange.

2. **Persistent feedback link in the header credit line.** Add `· feedback` to
   the existing "Made by Nate Aune (@natea)" credit, linking to either:
   - PostHog Survey trigger URL (so users can fire it on demand), or
   - A direct mailto: `mailto:natejaune+twag@gmail.com?subject=TWAG%20feedback`
   - Or a Google Form / Typeform — heaviest, no advantage over PostHog Survey.

   Recommendation: PostHog Survey on-demand link. One less external dep.

## Files to create / modify

### New

- `docs/posthog.js` — init + `twagTrack` helper.
- `docs/privacy.md` (optional but recommended) — 1-page note linked from
  `index.html` and the credit line.

### Modified

- `docs/config.js` — add `window.TWAG_POSTHOG_KEY`.
- `docs/config.example.js` — document the new var.
- `.env.example` — `POSTHOG_PROJECT_API_KEY=` placeholder (informational; the
  key is embedded in `docs/config.js`, not in `.env` — the env var name is
  documented for symmetry with the other vars).
- All 4 city HTML pages + `index.html` — `<script src="./posthog.js">` tag
  before the other scripts.
- `docs/events_map.js` — `twagTrack` calls at the 7 documented events.
- `docs/events_map_sidebar.js` — `twagTrack` for sidebar interactions.
- `docs/events_gallery.js` — `twagTrack` for gallery loads / tile clicks.
- `docs/tab_nav.js` — `twagTrack` for tab switches.
- `docs/events_map.css` — add `· feedback` link styling to the credit line.

### Reused

- `active_city()` doesn't exist in JS land; we'd derive the city from the
  page's filename or from the `citySlug` passed into init(). Simpler: each
  page already has `citySlug` in its `initEventMap` config block, so threading
  it into `twagTrack` calls is one extra param.

## PostHog dashboard setup (one-time, outside the repo)

1. Sign up at <https://posthog.com/> — free tier, no credit card.
2. Create project "TWAG".
3. Copy the project API key (starts with `phc_`) into `docs/config.js`.
4. Restrict the key by allowed origin: `https://natea.github.io` — set under
   Project settings → CORS allowed origins.
5. Set up the feedback survey under "Surveys": three questions, trigger after
   45 s, frequency limit "once per user."
6. Create a dashboard with the named events: Map view loads by city,
   RSVP click-through rate per event, tab switches, etc.

## Verification

1. `cd docs && python3 -m http.server 8085`, open Boston map.
2. Open DevTools → Network, filter for `posthog`. Expect one POST to
   `us.i.posthog.com/e/` per event.
3. In PostHog dashboard → Live events, see `$pageview` then `map_view_loaded`
   within ~5 seconds.
4. Click a pin — see `map_pin_clicked` with `city: boston, event_id: …`.
5. Click RSVP — see `rsvp_clicked` then the browser navigates away (PostHog
   uses `sendBeacon` so the event still ships).
6. Click the feedback link in the header — survey panel appears.
7. Switch to NYC map, repeat — events arrive with `city: nyc`.

## Decisions

1. **Region**: US (`us.i.posthog.com`).
2. **Session replay**: on, 100% (every session). Heads-up: free tier is 5k
   recordings/month, so if traffic exceeds ~150 sessions/day across both
   cities, recordings pause until the quota resets. Analytics still capture.
   We can drop to 10% sampling later if quota becomes the binding constraint.
3. **Autocapture**: on. Every click + form submit recorded automatically; we
   filter in the PostHog UI.
4. **Feedback**: PostHog Survey widget (auto-trigger after 45 s) *plus* a
   `mailto:` link in the header credit line. Survey for engaged feedback,
   email for bug reports.
5. **Privacy page**: skipping `docs/privacy.md` for v1 — the site collects
   no PII, no auth, and PostHog runs in anonymous mode with
   `person_profiles: "identified_only"`. We can add later if EU traffic
   becomes non-trivial.

## Out of scope (deliberate)

- Server-side event ingestion. Static site, all client-side.
- A/B testing or feature flags. Possible later, not needed v1.
- User identification beyond the anonymous ID. No accounts on this site.
- PostHog integration into the Telegram bot's Python code — bot already
  writes its own JSONL log; folding that into PostHog is interesting but
  separate work.

## Estimated effort

- **Initial setup (this branch)**: ~1 hour for the snippet + 6 named events
  + survey config.
- **Backfilling events as features ship**: ~5 min per new event.
