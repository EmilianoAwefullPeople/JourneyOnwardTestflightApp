# Pre-release checklist (TestFlight)

Run these steps before each TestFlight (or App Store) submission.

## 1. Version and build number

- **Version:** In `app.json`, set `expo.version` (e.g. `1.0.0`, `1.0.1`) for this release.
- **Build number:** In `app.json`, under `expo.ios`, set `buildNumber` to a value **higher** than the last uploaded build (e.g. `"1"`, `"2"`, …). Apple rejects builds with a duplicate or lower build number.
- Optional: Use EAS auto-increment for `buildNumber` if configured.

## 2. TypeScript and build verification

From the `journeyon` directory:

```bash
npx tsc --noEmit
```

Fix any type errors, then verify the iOS bundle builds:

```bash
npx expo export --platform ios
```

(Or trigger a full EAS build: `eas build --platform ios --profile production`.)

## 3. Pre-submission hygiene

- Confirm no uncommitted secrets, API keys, or debug credentials in source.
- Confirm logging uses `logger` from `src/utils/logger.ts` (not raw `console.log`/`console.warn`) so production builds stay quiet.
- Optional: Remove unused imports and fix linter warnings if you use ESLint.

## 4. Build and submit

- Run an EAS production build (if not already done):

  ```bash
  eas build --platform ios --profile production
  ```

- After the build completes, submit to TestFlight:

  ```bash
  eas submit --platform ios --profile production
  ```

  Or upload the build artifact from the EAS dashboard / App Store Connect.

- In App Store Connect, update **What to Test** / release notes for testers if needed.
