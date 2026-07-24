# JourneyOnward

**JourneyOnward** is a React Native / Expo iOS app by AweFull People — a travel journaling app that lets users capture experiences, track emotions, write journals, and review trips through albums, recaps, and postcards.

Built for iOS (TestFlight / App Store) u

## Features

- **Capture** — log experiences and insis, media, and emotion tagging(valence/arousal, emotion labels & notes)
- **Journals** — write reflective entriecaptured experience
- **Trip Albums** — dated trip containers that auto-collect entries and journals within their date range
- **Travel Mode** — a UX state that actihere's an active trip, with manualoverride
- **Journey Recap** — auto-generated recr trip's entries
- **Postcards** — create shareable postcard-style summaries from a library of templates
- **Review** — dashboards, bookmarks, sterest-style grid to revisit past trips
- **Import** — pull in recent photos from your device's media library, with automatic weather/location backfill

## Tech Stack

- [Expo](https://expo.dev) / React Nativ
- TypeScript
- SQLite (`expo-sqlite`) for structured rip albums)
- AsyncStorage for user preferences (theme, onboarding state, travel mode)
- `expo-file-system` for local media sto
- React Navigation

## Getting Started

All commands run from the `journeyon/` directory.

# Install dependencies
npm install

# Start the Expo dev server
npx expo start

# Start for a specific platform
npx expo start --ios
npx expo start --android

EAS Builds

# TestFlight / App Store build
npx eas build --platform ios --profile production

# Internal testing build
npx eas build --platform ios --profile p

# Submit the latest build to TestFlight
npx eas submit --platform ios --latest --profile production

There is no test runner or lint script configured. TypeScript is checked implicitly by the Expo/Metro
bundler.

Architecture

Provider Tree

GestureHandlerRootView
  AppProvider          ← global data (entries, journals, albums) + CRUD
    ThemeProvider      ← dark/light themge
      SafeAreaProvider
        ProgressProvider
          AppContent   ← lazy-loaded navigator

Note: React Navigation and screen imports are lazy-loaded via require() inside component render (not at
module top-level) to avoid native modulestartup.

Navigation

- Root stack: Loading → Welcome (first l
- Main tabs: Studio | Home | Review
- Modals/stacks: Capture, Entry Detail,  (Create/Detail/Edit), Entry Edit, Emotion Capture, Settings, Journey Recap (Candidates/Player/Post), Import Latest, Add Past Experiences, Notes
Editor

State Management

- AppContext — single source of truth forip albums
- ThemeContext — dark/light color scheme, persisted to AsyncStorage
- ProgressContext — gamification/progres

Persistence

- SQLite (journeyon.db) — entries, journersioned, migrations are additive)
- AsyncStorage — user preferences and app state
- Local filesystem — media storage

Project Structure

journeyon/
  src/
    components/    # capture, common, fe
    config/        # design tokens, theme, typography
    context/       # AppContext, ThemeCo
    models/        # Entry, Journal, TripAlbum, Postcard
    navigation/     # navigators & types
    screens/       # top-level screens
    services/      # weather, metadata b
    storage/       # SQLite persistence, media storage
    utils/
Context and resources/   # PRDs & design reference (read-only)

iOS Notes

- Bundle ID: com.awefullpeople.journeyon
- Before each TestFlight upload, run thrCHECKLIST.md (safe area, layout on SE/ProMax, VoiceOver, Dynamic Type, Reduce Motion)
- EAS profiles: development, preview, pr

License

Proprietary — © AweFull People. All righ
