# StageHopper — App Store / Play Store: DO NOT DO

A focused list of the things that **get the apps rejected or delayed**. Tailored
to StageHopper specifically: a Capacitor web-shell app with **no login, no
in-app purchases**, that uses **location + analytics (PostHog/Datadog)** and
opens **external links** (Partiful RSVP). Companion to
[`app-store-submission.md`](./app-store-submission.md); deeper guidance lives in
the vendored `axiom-shipping` skill.

> Rule of thumb: a 30-minute pre-flight saves 3–7 days per rejection cycle.
> Apple cites Guideline **2.1 (App Completeness)** in ~40% of rejections and
> metadata/privacy in another ~30%.

---

## 🔴 Lock before the FIRST upload (irreversible afterward)

- ⛔ **DO NOT publish, then try to change the bundle ID.** It's permanent.
  Currently `io.github.natea.twag` on both platforms — decide if you want
  `app.stagehopper` / `io.stagehopper.app` **now**.
- ⛔ **DO NOT submit without a reachable privacy-policy URL.** We collect location
  + analytics, so it's required by **both** stores, and Apple needs it **in two
  places** (App Store Connect *and* a link inside the app). 5.1.1(i) rejection.
- ⛔ **DO NOT** let the privacy policy, the App Privacy "nutrition labels," and
  the app's actual behavior disagree. Apple cross-checks all three — any mismatch
  = 5.1.1 rejection. Our real data: precise location (app functionality),
  product-interaction + crash analytics (PostHog/Datadog/Mapbox), **no tracking**.

## 🍎 iOS — DO NOT DO

- ⛔ **DO NOT ship as an obvious "website in a wrapper."** Guideline **4.2** is
  the #1 rejection for Capacitor apps. Mitigation: lead the App Review notes with
  the **native** features (live geolocation on the map, local-notification event
  reminders, native share) and make them visible on first launch.
- ⛔ **DO NOT enable the Push Notifications capability / `aps-environment`
  entitlement.** We use **local** notifications only (no APNs). Adding it without
  a working APNs setup = rejection. *(Optional cleanup: `npm uninstall
  @capacitor/push-notifications && npx cap sync`.)*
- ⛔ **DO NOT request permissions you don't use.** The over-broad "Always"
  location string was already removed; keep only When-In-Use. 5.1.1 rejection.
- ⛔ **DO NOT submit without the privacy manifest.** `PrivacyInfo.xcprivacy` is an
  **automated gate** (ITMS-91053) since May 2024 — no human review involved.
  *(Added at `ios/App/App/PrivacyInfo.xcprivacy`; confirm it's in the App
  target's Copy Bundle Resources in Xcode.)*
- ⛔ **DO NOT** leave `ITSAppUsesNonExemptEncryption` unset (already set to
  `false` — standard HTTPS is exempt; avoids a per-upload prompt).
- ⛔ **DO NOT** point `capacitor.config.ts` `server.url` at a remote/dev site —
  a remote-loaded app invites 4.2 / 2.5.2. (Ours bundles assets — good.)
- ⛔ **DO NOT** understate the **age rating**. The questionnaire was overhauled
  effective **Jan 31, 2026** (tiers 4+/9+/13+/16+/18+). Our webview opens
  **unrestricted external links** (Partiful) — declare **web access** honestly or
  it's a 2.3.6 rejection.
- ⛔ **DO NOT** test only in the Simulator. App Review runs on **physical devices**
  over an **IPv6-only** network — verify a real device + that Mapbox/analytics
  work over IPv6.
- ⛔ **DO NOT** submit placeholder/“Coming soon” screens, outdated screenshots,
  or an icon with an alpha channel / rounded corners.

### Not applicable to us (don't waste time, but know why)
- Sign in with Apple (4.8), account-deletion flow (5.1.1v), demo credentials —
  **N/A**: StageHopper has **no accounts/login**.
- In-app purchase rules (3.1.x) — **N/A**: no IAP.

## 🤖 Android (Play) — DO NOT DO

- ⛔ **DO NOT target API ≤ 34 for a new app.** Play requires **Android 15
  (API 35)** for new apps in 2026. We're at `targetSdkVersion = 34` in
  `android/variables.gradle` — bump compile/target to **35** (may need an AGP
  bump; verify the build).
- ⛔ **DO NOT ship a debug APK or self-managed signing.** Use a release **AAB +
  Play App Signing**. Losing a self-managed upload key = you can never update.
- ⛔ **DO NOT** keep `SCHEDULE_EXACT_ALARM` unless you truly need exact timing —
  it triggers a Play **exact-alarm policy declaration** that delays review.
  Reminders work with **inexact** alarms; dropping `SCHEDULE_EXACT_ALARM` +
  `USE_EXACT_ALARM` skips that form.
- ⛔ **DO NOT** skip or mismatch the **Data safety** form. It must match the real
  SDKs (PostHog, Datadog, Mapbox all collect data).
- ⛔ **DO NOT** declare permissions you don't use (we request fine/coarse
  location + `POST_NOTIFICATIONS` — all used).
- 🕒 **DO NOT** leave the **closed-testing requirement** to the last minute. New
  **personal** Play accounts must run a closed test with **20 testers for 14
  days** before production access. This is the biggest hidden Android delay —
  start it early.

## 🌐 Both stores / marketing — DO NOT DO

- ⛔ **DO NOT** use the official **"Download on the App Store" / Google Play
  badges** until the apps are live, and follow each brand's guidelines. *(The
  decorative Apple/Android glyphs on the website teaser are fine.)*
- ⛔ **DO NOT** cross-promote the other store **inside** an app (e.g. "also on
  Google Play" in the iOS app) — Apple rejects it.
- ⛔ **DO NOT** ship the unrestricted Mapbox token without a **usage cap +
  billing alert** in the Mapbox dashboard (it's now public on the web).
- ⛔ **DO NOT** treat a later "just a bug-fix update" as exempt — updates are
  reviewed against **current** guidelines, which change mid-cycle. Re-run the
  pre-flight every time.

---

## ✅ Already handled in the repo
- iOS `PrivacyInfo.xcprivacy` (location/analytics/crash, no tracking, UserDefaults reason)
- Removed over-broad "Always" location string
- `ITSAppUsesNonExemptEncryption=false`
- Native permission strings (iOS) + permissions (Android)
- App display name **StageHopper**, icons + splash

## ⏳ Still TODO before submitting
- [ ] Decide final bundle ID (§ lock-before-first-upload)
- [ ] Publish a privacy policy URL + link it in-app
- [ ] Bump Android target/compile SDK to 35 (verify build)
- [ ] Decide: drop exact-alarm permission (recommended) or file the Play declaration
- [ ] Complete the Jan-2026 age-rating questionnaire (declare web access)
- [ ] Screenshots per device class; store descriptions emphasizing native value
- [ ] Test on a real iPhone + real Android device (IPv6)
- [ ] Start Play closed test (20 testers / 14 days) if a new personal account
