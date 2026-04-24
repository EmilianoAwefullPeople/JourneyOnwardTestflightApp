# TestFlight and Release

Quick reference for building and submitting the app to TestFlight.

## Bundle identifier

- **iOS:** `com.awefullpeople.journeyon` (set in `app.json` under `expo.ios.bundleIdentifier`)
- Create an app in [App Store Connect](https://appstoreconnect.apple.com) with this same bundle ID before submitting.

## EAS profiles

Defined in `eas.json`:

- **development** – Development client, internal distribution (not for TestFlight).
- **preview** – Internal distribution, no simulator build; for team testing.
- **production** – Store distribution; use this for TestFlight and App Store.

## Prerequisites

- [Expo](https://expo.dev) account: `npx eas login`
- [Apple Developer Program](https://developer.apple.com/programs/) enrollment ($99/yr)
- App record in App Store Connect with bundle ID `com.awefullpeople.journeyon`

## Build (iOS)

From the `journeyon` folder:

```bash
# TestFlight / App Store build
npx eas build --platform ios --profile production

# Or internal testing only (no App Store)
npx eas build --platform ios --profile preview
```

Builds run on EAS servers. When complete, the build page shows a link to the `.ipa` and optional submit.

## Submit to TestFlight

After a production build has finished:

```bash
# Submit the latest iOS production build to App Store Connect
npx eas submit --platform ios --latest --profile production
```

Follow the prompts to sign in to Apple and select the app. Then in App Store Connect:

1. Open your app → **TestFlight**.
2. Select the new build and complete any compliance (e.g. encryption) questions.
3. Add **Beta App Description** and **What to Test** (see `TESTFLIGHT_CHECKLIST.md`).
4. Add internal or external testers.

## Manual upload (alternative)

1. Open the [EAS build page](https://expo.dev/accounts/~/projects/journeyon/builds) and download the `.ipa` for the desired build.
2. Upload via [Transporter](https://apps.apple.com/app/transporter/id1450874784) or Xcode → Window → Organizer → Distribute App.

## Checklist before each upload

Run through `TESTFLIGHT_CHECKLIST.md` (safe area, layout, VoiceOver, Dynamic Type, Reduce Motion, general) before uploading a new build.
