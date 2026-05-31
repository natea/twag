# StageHopper — Apple App Store submission

How to ship the iOS app, and how to drive App Store Connect programmatically
from Claude Code via **asc-mcp**.

- **Full pre-flight checklist:** [`docs/plans/app-store-submission.md`](./docs/plans/app-store-submission.md)
- **Rejection / delay pitfalls:** [`docs/plans/app-store-DO-NOT-DO.md`](./docs/plans/app-store-DO-NOT-DO.md)
- **Build & run the native app:** [`CAPACITOR.md`](./CAPACITOR.md)

---

## App Store Connect MCP (asc-mcp)

`asc-mcp` lets Claude Code drive the **App Store Connect–side** release workflow
without leaving the terminal: create a version, attach a build, set review
details, submit for review, manage TestFlight, respond to reviews, read metrics.

> **What it does NOT do:** it does not upload the binary. The `.ipa`/archive
> still goes up via **Xcode → Product → Archive → Distribute** (or
> `altool` / `xcodebuild`). asc-mcp takes over once the build is processing in
> App Store Connect.

### Install (one-time)

Already done in this environment:

```bash
brew install mint
mint install zelentsov-dev/asc-mcp@v3.0.0    # binary lands at ~/.mint/bin/asc-mcp
```

(Requires macOS 14+, Swift 6.2+ / Xcode 26+.)

### Connect it — needs YOUR App Store Connect API credentials

These are account secrets; they can't be created for you.

1. App Store Connect → **Users and Access → Integrations → App Store Connect
   API** → generate a key with the **Admin** or **App Manager** role.
2. Download the **`.p8`** file (one-time download — save it somewhere safe) and
   note the **Key ID** and **Issuer ID**.
3. Register the MCP server with Claude Code (the `--workers` Release preset keeps
   only the submission tools loaded, to save context):

   ```bash
   claude mcp add asc-mcp \
     -e ASC_KEY_ID=<your key id> \
     -e ASC_ISSUER_ID=<your issuer id> \
     -e ASC_PRIVATE_KEY_PATH=/abs/path/AuthKey.p8 \
     -- ~/.mint/bin/asc-mcp --workers apps,builds,versions,reviews
   ```

   - ⚠️ **`.p8` is a private signing key — do NOT commit it to the repo.** Store
     it outside the project (e.g. `~/.appstoreconnect/keys/`).
   - Like XcodeBuildMCP, **MCP tools load at session start**, so asc-mcp becomes
     usable in the **next** Claude Code session after registering.
   - Verify by asking Claude to call `company_current` — it should return your
     team name.

### Worker presets (`--workers`)

asc-mcp ships ~208 tools; load only what you need:

| Preset        | `--workers`                                   | Use case               |
|---------------|-----------------------------------------------|------------------------|
| TestFlight    | `apps,builds,beta_groups,beta_testers`        | Beta distribution      |
| **Release**   | `apps,builds,versions,reviews`                | App Store submission   |
| Monetization  | `apps,iap,subscriptions,offer_codes,pricing`  | IAP / subscriptions    |
| Full          | *(omit the flag)*                             | Everything (~208 tools)|

### Release pipeline (once asc-mcp is connected)

```
1. apps_search(query: "StageHopper")        → app ID
2. builds_list(appId, limit: 5)             → latest processed build (state VALID)
3. app_versions_create(appId, platform: "IOS", versionString: "1.0")
4. app_versions_attach_build(versionId, buildId)
5. app_versions_set_review_details(versionId, { contactEmail, notes, ... })
6. app_versions_submit_for_review(versionId)
```

Review notes should **lead with the native features** (live geolocation on the
map, local-notification reminders, native share) to clear Guideline 4.2 — see
the DO-NOT-DO doc.

---

## Quick iOS submission path

1. `npx cap sync` (after any web/config change).
2. Open `ios/App/App.xcworkspace` in Xcode; set Team, Version, Build.
3. Confirm `ios/App/App/PrivacyInfo.xcprivacy` is in the App target's *Copy
   Bundle Resources*.
4. Product → Archive → Distribute → **TestFlight** first.
5. Use asc-mcp (above) to create the version, set review details, and submit.

See the full checklist + pitfalls docs linked at the top before submitting.
