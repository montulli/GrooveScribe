# Mobile builds (Android + iOS via Capacitor)

Groove Scribe is a pure client-side web app. It is packaged as native Android
and iOS apps with [Capacitor](https://capacitorjs.com), which runs the existing
web app inside a native WebView — **no rewrite, no bundler.**

The web app is the single source of truth. The native iOS/Android projects are
**not committed**: they are generated fresh during CI. This keeps the repo clean
and means you don't need any native toolchain (or a Mac) locally to ship builds.

## How a build happens (GitHub Actions)

Workflow: [`.github/workflows/mobile-build.yml`](.github/workflows/mobile-build.yml).
It has two independent jobs:

| Job       | Runner          | Produces                                              |
| --------- | --------------- | ----------------------------------------------------- |
| `android` | `ubuntu-latest` | `app-debug.apk` (installable debug build)             |
| `ios`     | `macos-14`      | an **unsigned** simulator `.app` (proves it compiles) |

Each job: `npm ci` → `npm run build:www` (assemble the web bundle) →
`npx cap add <platform>` → `npx cap sync` → native build → upload artifact.

**To run it:** GitHub → **Actions** tab → **Mobile build (Capacitor)** →
**Run workflow**. (It also runs automatically when you push a `v*` tag.) It is
_not_ run on every push — macOS runner minutes are billed at a higher rate.

**To get the apps:** open the finished run and download the artifacts
(`groovescribe-android-debug-apk`, `groovescribe-ios-simulator-app`).

## What you still need for _distributable_ apps

The CI builds above are enough to **verify it compiles** and to sideload a debug
Android APK. Shipping to stores / real iOS devices additionally needs:

- **Android release:** a signing keystore, `./gradlew bundleRelease` to make a
  signed `.aab`, and a **Google Play Developer account** ($25, one-time). Add the
  keystore + passwords as encrypted repo secrets and switch the Android job to a
  signed release build.
- **iOS release:** an **Apple Developer Program** membership ($99/yr), a signing
  certificate + provisioning profile (added as encrypted secrets, e.g. via
  `apple-actions/import-codesign-certs` or fastlane `match`), then `xcodebuild`
  `archive` + `-exportArchive` to produce a signed `.ipa` for TestFlight / the
  App Store. There is no way around needing macOS for this — CI's macOS runner
  covers it.

## Configuration

- [`capacitor.config.json`](capacitor.config.json) — `appId`
  (`com.montulli.groovescribe`), `appName` ("Groove Scribe"), and
  `webDir: "www"`. Change `appId` here before your first store submission (it's
  permanent once published).
- [`scripts/build-www.mjs`](scripts/build-www.mjs) — assembles `www/` (the
  Capacitor web-dir) from the runtime files only: `index.html`, the app-wired
  pages, and `js/ css/ MIDI.js/ soundfont/ images/ font-awesome/`. It excludes
  `node_modules`, the test suites, and the `html_examples_and_tests/` pages. The
  full bundle is ~16 MB (mostly soundfonts).

## Building locally (optional)

You don't need this — CI does it all — but if you have the toolchains:

```bash
npm ci
npm run build:www
# Android (needs Android Studio / SDK + JDK 17):
npx cap add android && npx cap sync android && npx cap open android
# iOS (needs a Mac with Xcode + CocoaPods):
npx cap add ios && npx cap sync ios && npx cap open ios
```

Note: the repo pins **Node 22** (see [`.nvmrc`](.nvmrc)), which the CI runners
also use. Capacitor 6 is used here; Capacitor 7 also works on Node 20+, so you
can upgrade later if you want its newer features.

## Known follow-ups (verify/fix on first on-device run)

Because the app was not written for a WebView, a few things should be checked
once you can run it on a device/emulator — none block the build:

1. **Audio on iOS.** WKWebView won't start audio without a user gesture. The
   Play button is a gesture, so it should work, but you may need to call
   `AudioContext.resume()` on first tap and set the audio session category so the
   ringer switch doesn't mute it. Verify playback produces sound.
2. **Download buttons.** The SVG/PNG/MIDI "download" actions use browser
   downloads, which don't work in a WebView. Re-wire them to
   `@capacitor/filesystem` + `@capacitor/share`.
3. **App icon & splash screen.** Not set yet (default Capacitor icon). Generate
   them from a source image with `@capacitor/assets`.
