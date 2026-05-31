# StageHopper — App Store listing metadata (ready to use)

Bundle ID: **`app.stagehopper.twag`** · Version **1.0** (build 1) · Category: **Navigation** (secondary: Travel) · Price: **Free** · Age: expected **17+** (unrestricted web access — external RSVP links open in-app).

## Name & subtitle
- **Name** (≤30): `StageHopper`
- **Subtitle** (≤30): `Tech Week events on a map`

## Promotional text (≤170, editable anytime)
> Every Boston & NY Tech Week event on one clustered map. Filter by day, find what's near you, and get a reminder before your next one starts.

## Description (≤4000, plain text)
> StageHopper puts every Tech Week event on a single, fast, clustered map — the thing the official conference sites forget.
>
> • Browse 1,900+ Boston and NY Tech Week 2026 events on a map or a scrollable image gallery.
> • Filter by day; it opens on today automatically.
> • Tap a pin or tile for the details and RSVP.
> • See where you are on the map to find what's happening nearby.
> • Tap "Remind me" and get a local notification 15 minutes before an event starts — even with the app closed.
> • Search across every event by name, host, neighborhood, or venue.
>
> No account, no login, no tracking. Just the map.

## Keywords (≤100 bytes, comma-separated, no trademarked terms)
> tech week,events,map,conference,startup,meetup,schedule,nearby,boston,nyc,founders,networking

## URLs
- **Support URL:** `https://stagehopper.app`
- **Marketing URL:** `https://stagehopper.app`
- **Privacy Policy URL:** `https://stagehopper.app/privacy.html`  ← now live in the repo

## App Review notes (paste into "Notes") — fast-tracks 4.2
> StageHopper is a native iOS app (Capacitor) — NOT just a website. Native features to test:
> 1. LOCATE ME — on the map, tap the ◎ control (top-right, under the zoom buttons). iOS will prompt for location; allow it to see your position render as a blue dot. (Simulator: set a custom location via Features → Location.)
> 2. REMIND ME — tap any pin, then "🔔 Remind me" in the popup. iOS prompts for notifications; a local notification is scheduled 15 min before the event and fires even if the app is closed.
> 3. SHARE — the 📤 button in an event popup opens the native iOS share sheet.
>
> No login or account is required, so no demo credentials are needed. The app bundles its event data and opens to the Boston map. External "RSVP" buttons open partiful.com event pages.
>
> Review network note: map tiles load over IPv6; please ensure network connectivity for Mapbox tiles.

- **Demo account:** none required (no login).
- **Contact:** Nate Aune · natejaune+stagehopper@gmail.com · (phone)

## Age rating questionnaire (Jan-2026 tiers) — answer honestly
- Unrestricted web access: **YES** (event popups link out to partiful.com / open URLs) → pushes rating to 17+.
- User-generated content: No. Violence/mature/gambling/etc.: No. Messaging: No. Ads: No.

## Privacy "nutrition labels" (must match docs/privacy.html + PrivacyInfo.xcprivacy)
- **Location (Precise):** Used for App Functionality. Not linked to identity. Not used for tracking.
- **Usage Data / Product Interaction (PostHog):** Analytics. Not linked. Not tracking.
- **Diagnostics / Crash Data (Datadog):** App Functionality. Not linked. Not tracking.
- Data is **not** used to track you across apps/sites; **not** sold.

## Screenshots (capture next session from the 6.9" simulator)
Required: one set at **6.9"** (1320×2868) — iPhone 17 Pro Max sim. Capture:
1. Boston map with clusters + sidebar
2. An open event popup (RSVP / Remind me / Share visible)
3. The gallery grid
4. (optional) "Locate me" blue dot

## Export compliance
`ITSAppUsesNonExemptEncryption=false` already set → answer "No" to non-exempt encryption.
