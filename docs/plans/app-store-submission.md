# StageHopper — App Store & Play Store submission prep

Status of the apps: Capacitor shell wrapping the `docs/` site, builds + runs on
iOS Simulator and Android (Pixel) emulator. This doc is the path to shipping,
with **⛔ DO NOT DO** items called out — these are the things that get a build
**rejected** or **delayed** in review.

---

## 0. Already done in the repo (this branch)

- ✅ iOS app-level **Privacy Manifest** `ios/App/App/PrivacyInfo.xcprivacy`
  (declares location + analytics + crash data, `NSPrivacyTracking=false`, and
  the `UserDefaults` required-reason API). **Action still needed:** in Xcode,
  confirm the file is a member of the **App** target (Build Phases → Copy Bundle
  Resources). Capacitor doesn't auto-add it.
- ✅ Removed the over-broad `NSLocationAlwaysAndWhenInUseUsageDescription`
  (we only use *when in use*).
- ✅ Added `ITSAppUsesNonExemptEncryption=false` (standard HTTPS only — skips the
  per-upload export-compliance question).
- ✅ Native permission strings + Android permissions already declared.
- ✅ App display name = **StageHopper**, icons + splash generated.

---

## 1. Decisions to lock BEFORE first upload (permanent afterward)

1. **Bundle ID / applicationId** — currently `io.github.natea.twag` on **both**
   platforms. This is **permanent once published** and still says "twag".
   Decide now whether to switch to e.g. `app.stagehopper` / `io.stagehopper.app`.
   - ⛔ **DO NOT** publish, then try to change the bundle ID — you can't; you'd
     have to ship a brand-new app and lose ratings/installs.
   - If changing: update `PRODUCT_BUNDLE_IDENTIFIER` (iOS) + `applicationId`
     (Android) + `appId` in `capacitor.config.ts`, then `npx cap sync`.
2. **Privacy policy URL** — **required by both stores** because the app collects
   location + analytics (PostHog/Datadog). Host one (e.g. `stagehopper.app/privacy`).
   - ⛔ **DO NOT** submit without a reachable privacy-policy URL — both stores
     block the listing. (I can draft `docs/privacy.html` on request.)
3. **Apple Developer Program** ($99/yr) and **Google Play Console** ($25 one-time)
   enrollments must be active. Play Console for **new personal accounts** also
   requires **20 testers for 14 days** before production access — start this early
   (it's the #1 hidden Android delay).

---

## 2. iOS — steps (DO)

1. Open `ios/App/App.xcworkspace` in Xcode (use the **workspace**, not the project).
2. Signing & Capabilities → select your Team; let Xcode manage signing.
3. Set **Version** (1.0) and **Build** (increment every upload).
4. Confirm `PrivacyInfo.xcprivacy` is in the App target (see §0).
5. Product → Archive → distribute to **App Store Connect** → **TestFlight** first.
6. App Store Connect: screenshots (6.7" + 6.5" + 5.5" + iPad if "Designed for iPad"),
   description, keywords, support URL, **privacy policy URL**, and the **App
   Privacy** questionnaire (mirror the privacy manifest: Location → App
   Functionality, not linked, not tracking; Usage/Analytics → Analytics).
7. Submit for review (~24–48h typical).

### iOS — ⛔ DO NOT DO

- ⛔ **DO NOT enable the Push Notifications capability / add an `aps-environment`
  entitlement.** We use **local** notifications only (no APNs). Adding the push
  capability without a working APNs setup = rejection. *(The `@capacitor/push-notifications`
  plugin is installed but unused — optionally remove it with
  `npm uninstall @capacitor/push-notifications && npx cap sync` to avoid review
  questions. Local reminders come from `@capacitor/local-notifications`.)*
- ⛔ **DO NOT** request "Always" location (already removed) or any permission you
  don't actually use. Guideline 5.1.1 rejection.
- ⛔ **DO NOT** ship the app as an obvious "just a website in a wrapper."
  Guideline **4.2 (minimum functionality)** is the top rejection for Capacitor
  apps. **Mitigation:** lead the review notes with the native features — live
  geolocation on the map, local-notification event reminders, native share —
  and make sure they're visible on first launch.
- ⛔ **DO NOT** submit with a `server.url` pointing at a remote/dev site in
  `capacitor.config.ts` (we don't — assets are bundled). A remote-URL app invites
  4.2 / 2.5.2 rejections.
- ⛔ **DO NOT** leave placeholder screenshots, Lorem-ipsum metadata, or a 4+ age
  rating that doesn't match content.
- ⛔ **DO NOT** forget the privacy-policy URL or the App Privacy questionnaire —
  must match `PrivacyInfo.xcprivacy`.

---

## 3. Android — steps (DO)

1. **Target API level:** Play requires **new apps to target Android 15 (API 35)**
   in 2026. We're at **`targetSdkVersion = 34`** in `android/variables.gradle`.
   - **DO** bump `compileSdkVersion` + `targetSdkVersion` to **35**. ⚠️ This may
     require an Android Gradle Plugin bump (and `build-tools;35`); verify the build
     still passes after. (SDK platform `android-36` is installed locally; 35 also fine.)
   - ⛔ **DO NOT** submit a new app targeting API ≤34 — Play rejects it outright.
2. Set `versionCode` / `versionName` in `android/app/build.gradle` (start 1 / "1.0";
   bump `versionCode` every upload).
3. Build a release **AAB** (not APK) in Android Studio: Build → Generate Signed
   Bundle → **Android App Bundle**, and **let Play manage the signing key**
   (Play App Signing).
4. Play Console: Internal testing track first → store listing (screenshots, short +
   full description, feature graphic 1024×500), **content rating** questionnaire,
   **Data safety** form (location + analytics, not shared, not for tracking), and
   the **privacy policy URL**.
5. Roll out to production (and complete the 20-testers/14-days closed test if it's
   a new personal account — see §1).

### Android — ⛔ DO NOT DO

- ⛔ **DO NOT** ship a **debug** APK or self-managed signing you might lose. Use
  AAB + Play App Signing. Losing the upload key without Play-managed signing =
  you can never update the app.
- ⛔ **DO NOT** target API ≤34 for a new app (see above).
- ⛔ **DO NOT** declare permissions you don't use. We request
  `ACCESS_FINE/COARSE_LOCATION`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`,
  `USE_EXACT_ALARM`. `SCHEDULE_EXACT_ALARM` triggers a **Play policy
  declaration** (exact-alarm justification) and can delay review.
  - **Reconsider:** local event reminders work fine with **inexact** alarms.
    If you drop exact timing, remove `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`
    to skip that policy form entirely.
- ⛔ **DO NOT** skip the **Data safety** form or leave it inconsistent with the
  actual SDKs (PostHog, Datadog, Mapbox all collect data) — mismatches cause
  rejection.
- ⛔ **DO NOT** use cleartext traffic (we set `allowMixedContent=false` — good).

---

## 4. Shared / store-listing assets (DO)

- App icon 1024×1024 (have it), feature graphic 1024×500 (Android), screenshots
  per device class.
- Short + long description that **describe the native value** (offline-bundled
  maps, locate-me, reminders) — not just "the website."
- Privacy policy URL (see §1).
- Support/contact URL (the Google Form or `stagehopper.app`).

### ⛔ DO NOT DO (both stores)

- ⛔ **DO NOT** use the **Apple logo / "Download on the App Store" / Google Play
  badges** until the apps are actually live, and follow each brand's marketing
  guidelines. (The Apple/Android glyphs in the website teaser are decorative and
  fine; the official *store badges* are regulated.)
- ⛔ **DO NOT** mention the *other* platform's store inside an app (e.g. "also on
  Google Play" inside the iOS app) — Apple rejects cross-store promotion.
- ⛔ **DO NOT** ship the unrestricted Mapbox token without a **usage cap + billing
  alert** set in the Mapbox dashboard (not a review blocker, but it's now public).

---

## 5. Quick pre-flight before each upload

- [ ] `npx cap sync` after any web/config change
- [ ] Version + build number incremented
- [ ] Runs on a **real device** (not just simulator/emulator)
- [ ] Permission prompts show the right copy and only fire when used
- [ ] Privacy policy URL live; store privacy forms match the app's real data use
