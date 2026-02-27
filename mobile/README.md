# RewardsFindr — Mobile App

Expo (React Native) app for iOS and Android.
Shares all business logic with the web app via `mobile/shared/`.

## Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli` (for builds + submission)

## Local Development

```bash
cd mobile
npm install
npm start          # opens Expo Go on your phone
npm run android    # Android emulator
npm run ios        # iOS simulator (Mac only)
```

Scan the QR code with **Expo Go** (free app on App Store / Play Store)
to run on your real phone immediately — no build needed.

## Cloud Builds (EAS)

```bash
eas build --platform android   # builds .aab for Play Store
eas build --platform ios       # builds .ipa for App Store (no Mac needed)
eas build --platform all       # both at once
```

## Store Submission

```bash
eas submit --platform android  # submits to Google Play
eas submit --platform ios      # submits to App Store Connect
```

## Before first build

1. Run `eas init` to get your EAS project ID — paste into `app.json` → `extra.eas.projectId`
2. Add your Apple Team ID, App Store Connect App ID to `eas.json`
3. Add `google-services.json` (Android Firebase config) to `mobile/`
4. Add `GoogleService-Info.plist` (iOS Firebase config) to `mobile/`

## Shared Logic

`mobile/shared/` is a copy of `src/shared/` from the web app.
When updating cards or stores, update **both** files.

> Long-term: move shared logic to an npm workspace so both apps
> import from one source of truth automatically.

## File Structure

```
mobile/
├── app/
│   ├── _layout.js     ← root navigation layout
│   ├── index.js       ← Home screen (search)
│   └── results.js     ← Results screen (top 3 cards)
├── hooks/
│   └── useSearch.js   ← search state + logic
├── shared/
│   ├── constants.js   ← CARDS, STORES, POPULAR_STORES
│   └── offerUtils.js  ← matching + utility functions
├── app.json           ← Expo config (bundle ID, version, etc.)
├── eas.json           ← EAS build + submit config
├── babel.config.js
└── package.json
```
