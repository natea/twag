# TWAG native app (Capacitor)

The existing site in `docs/` is wrapped in a native iOS/Android shell via
[Capacitor](https://capacitorjs.com). The same `docs/` folder serves both
GitHub Pages and the bundled native app — feature detection
(`window.twagNative.isNative()`) decides whether to use native plugins or
web fallbacks, so the public web build is byte-for-byte unchanged.

See `docs/plans/capacitor-native-app.md` for the full design.

## What the native shell adds

| Feature | Native plugin | Web fallback |
|---|---|---|
| 🔔 Event reminders (local notifications) | `@capacitor/local-notifications` | hidden (no-op) |
| 📤 Share an event | `@capacitor/share` | `navigator.share` → clipboard |
| ◎ "Locate me" on the map | `@capacitor/geolocation` | hidden (web uses no extra control) |

The Remind / Share / Locate-me controls are rendered **only inside the
Capacitor shell**. On the plain web build they never appear.

The bridge lives in `docs/capacitor_bridge.js` and exposes `window.twagNative`:
`isNative()`, `requestLocation()`, `scheduleEventReminder(event, minutesBefore=15)`,
`cancelEventReminder(eventId)`, `hasReminder(eventId)`, `shareEvent(event)`.

## One-time setup

```bash
npm install                      # Capacitor CLI + plugins
```

The `ios/` and `android/` native projects are committed. Heavy build
artifacts (`node_modules/`, Pods, Gradle caches, `*/build/`) are gitignored.

### iOS prerequisite — CocoaPods

`cap sync ios` and `cap run ios` need CocoaPods, which is **not** installed in
this environment. Install it once, then re-sync:

```bash
brew install cocoapods            # or: sudo gem install cocoapods
npx cap sync ios
```

### Android prerequisite — SDK

Install Android Studio (or the command-line SDK) so Gradle can resolve the
Android SDK, then open `android/` in Android Studio.

## Develop / run

```bash
# After editing anything in docs/, copy it into the native bundles:
npx cap sync

npx cap run ios                   # iOS Simulator (needs CocoaPods + Xcode)
npx cap run android               # Android Emulator (needs Android SDK)

# Or open the native IDEs directly:
npx cap open ios
npx cap open android
```

## Icons & splash

Source art lives in `assets/` (rasterized from `docs/favicon.svg`). Regenerate
the per-platform icons/splash with:

```bash
npm run cap:assets
```

## Native permissions already declared

- **iOS** `ios/App/App/Info.plist`: `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription`.
- **Android** `android/app/src/main/AndroidManifest.xml`:
  `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS`,
  `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`.

## Out of scope for v1 (per the plan)

Remote push (no backend), offline-first caching, Wallet passes, tablet
layouts, store-submission metadata. Local notifications cover the
"next event starting" use case with no backend.
