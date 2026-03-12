# RewardsFindr — Dev Context (Mar 12, 2026)

## Project Overview
- **App name:** RewardsFindr
- **Purpose:** Rewards credit card finder — mobile app + Chrome extension that auto-syncs bank offers and recommends best card at any store
- **Developer:** Rakesh Balasubramani
- **Location:** San Diego, CA
- **Live domain:** rewardsfindr.com
- **GitHub:** https://github.com/rewardsfindr/rewardsfindr (monorepo)

---

## Repository Structure

**Main Monorepo:** https://github.com/rewardsfindr/rewardsfindr
- API, Mobile App, Shared utilities

**Separate Repos:**
- **Web Landing Page:** https://github.com/rewardsfindr/rewardsfindr-web
  - React landing page deployed on Vercel → rewardsfindr.com
  - Split out on Mar 2, 2026
- **Chrome Extension:** https://github.com/rewardsfindr/rewardsfindr-chrome-extension
  - Manifest V3, scrapes Chase & Amex offers
  - Split out on Mar 2, 2026

---

## Tech Stack

### Web Landing Page (Separate Repo)
- **Framework:** React 18 (Create React App)
- **Deployment:** Vercel
- **Repo:** https://github.com/rewardsfindr/rewardsfindr-web
- **Purpose:** Marketing site only (no auth/app features)

### Mobile App (Primary Focus)
- **Framework:** React Native + Expo SDK 54
- **Router:** Expo Router ~4.0
- **Auth:** Firebase JS SDK v10 (Google Sign-In)
- **Deployment:** EAS (Expo Application Services)

### Chrome Extension (Separate Repo)
- **Repo:** https://github.com/rewardsfindr/rewardsfindr-chrome-extension
- **Manifest:** V3
- **Banks Supported:** Chase, Amex (Capital One planned)
- **Auth:** chrome.identity + Firebase custom tokens

### Backend API
- **Runtime:** Node.js 18+ with Express
- **Auth:** Firebase Admin SDK
- **Database:** Firestore
- **Deployment:** Railway (or Render)
- **Port:** 3001 (local dev)

### Firebase Projects
- **Dev:** `rewardsfindr-dev` (us-west2)
- **Prod:** `rewardsfindr-prod` (us-west2)

### Language & Tools
- **Language:** JavaScript (no TypeScript)
- **IDE:** VSCode on Windows, PowerShell terminal
- **Package manager:** npm
- **Version control:** GitHub

---

## Project Root
```
D:\RewardsFindr\rewardsfindr\
```

---

## Current Architecture (Mar 12, 2026)

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Chrome Extension│     │   Mobile App     │     │  Landing Page    │
│  (Separate Repo) │     │  (Expo + EAS)    │     │  (React/Vercel)  │
└───────┬─────────┘     └───────┬─────────┘     └──────────────────┘
         │                        │                   (separate repo)
         │   REST / HTTPS calls   │
         └───────┬───────────────┘
                  │
         ┌───────┴───────────────────────┐
         │           Backend API (Node.js)             │
         │   POST /sync-offers   GET /best-card        │
         │   POST /auth/verify   GET /user/offers      │
         │   POST /api/offers/parse (HTML → Firestore)  │
         └──────────────┬────────────────┘
                       │
               ┌───────┴───────┐
               │    Firebase    │
               │  Firestore DB  │
               │  + Auth (JWT)  │
               └─────────────────┘
```

---

## Monorepo Structure (Main Repo)

```
rewardsfindr/
├── mobile/                 ← React Native + Expo app
│   ├── app/
│   ├── components/
│   │   ├── SyncWebView.js     ← WebView modal for bank offer sync
│   │   └── OffersSyncStatus.js
│   ├── lib/
│   │   ├── firebaseClient.js  ← Firebase JS SDK init
│   │   └── apiClient.js       ← HTTP client for API calls
│   ├── shared/
│   ├── .env.example
│   ├── .env.development     ← gitignored, local only
│   └── .env.production      ← gitignored, local only
├── api/                    ← Node.js Express backend
│   ├── index.js
│   ├── config/
│   │   └── firebase.js        ← Firebase Admin SDK
│   ├── middleware/
│   │   └── auth.js            ← Token verification
│   ├── routes/
│   │   ├── auth.js
│   │   └── offers.js          ← includes /parse endpoint
│   ├── .env.example
│   └── .env                 ← gitignored, local only
├── shared/                  ← Top-level shared utilities
├── src/shared/              ← Shared constants (used by mobile)
├── .github/workflows/       ← CI/CD (tests)
└── DEV_CONTEXT.md           ← This file
```

---

## Environment Variables

### Mobile App (`/mobile`)
**Prefix:** `EXPO_PUBLIC_`
```
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
EXPO_PUBLIC_API_URL
```

### Backend API (`/api`)
**No prefix** (standard Node.js)
```
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
PORT
NODE_ENV
ALLOWED_ORIGINS
```

---

## API Endpoints (`/api`)

### Public
- `GET /health` — Health check

### Authentication
- `POST /api/auth/verify` — Exchange Google OAuth token for Firebase custom token

### Offers (Protected)
- `POST /api/offers/parse` — Accept raw HTML from mobile WebView, parse offers, store in Firestore
- `GET /api/offers/:userId` — Get user’s synced offers

---

## Firestore Data Model

```
/users/{uid}
  ├── email: string
  ├── createdAt: timestamp
  └── displayName: string
  
  /users/{uid}/offers/{offerId}
       ├── merchant: string        ← e.g. "Target"
       ├── bank: string            ← e.g. "chase"
       ├── cardName: string        ← e.g. "Sapphire Reserve (...0483)"
       ├── amount: number          ← e.g. 5 (% or $ off)
       ├── expiry: string          ← ISO date
       ├── activatedAt: timestamp
       └── source: string          ← "mobile" | "extension"
```

---

## Mobile App — Offer Sync Flow (Current)

The mobile app uses an **in-app WebView** (not a Chrome extension) to sync bank offers:

1. User opens the app and signs in with Google (Firebase Auth)
2. User taps a bank card (e.g. Chase) on the home/offers screen
3. `SyncWebView` modal opens, loading the bank's offers URL directly
4. **No credentials are stored** — user logs into the bank inside the WebView each time
5. Footer shows contextual buttons:
   - **Nothing** while navigating/loading
   - **"Go to Offers Page →"** after login page loads (fallback redirect)
   - **"Sync Offers"** once card dropdown detected on offers page
   - **Spinner + status** during sync
6. On "Sync Offers" tap: JS injected to capture HTML → POSTed to `/api/offers/parse` → stored in Firestore
7. For multiple cards: auto-switches via dropdown JS injection, captures each card’s offers

### SyncWebView — Key Implementation Details
- **Chase is a SPA** — `onNavigationStateChange` does NOT fire for hash/route changes
- **Offers page detection for Chase:** `CARDS_DETECTED` message (card dropdown present = on offers page). This fires *before* `onLoadEnd`, so `onOffersPage` is NOT gated on `pageLoaded`
- **Login page detection:** URL `loginPaths` match (prevents false positive from Chase login URL which contains `merchantOffers` in the hash fragment)
- **`pageLoaded`** only gates the fallback "Go to Offers Page" button (not the Sync button)
- **`onOffersPage`** resets on every navigation change

---

## Recent PRs (Mar 2 – Mar 12, 2026)

| PR | Title | Status | Notes |
|---|---|---|---|
| #30 | chore: remove web config files | ✅ Merged | |
| #31 | chore: complete web files cleanup | ✅ Merged | |
| #33 | chore: update README and disable Vercel builds | ✅ Merged | |
| #40–#50 | Various mobile + API features | ✅ Merged | Google Sign-In, offer sync API, SyncWebView multi-card |
| #51 | fix: SyncWebView footer button logic | ⏳ Open | Fix sync button showing on login page; fix Chase SPA detection |

### PR #51 — SyncWebView Footer Fix (In Review)
**Branch:** `fix/disable-bank-button-during-sync`

**Problems fixed:**
1. "Sync Offers" button appeared on Chase login page (Chase login URL contains `merchantOffers` in hash fragment)
2. Button not appearing after login (Chase SPA — `onNavigationStateChange` doesn’t fire for hash changes)
3. Button appeared before page finished loading (SPA fires `CARDS_DETECTED` before `onLoadEnd`)

**Solution:**
- Added `loginPaths` exclusion to prevent false positive on login page
- Replaced URL-based detection with `CARDS_DETECTED` signal for Chase (`useCardsDetectedAsOffersSignal: true`)
- `onOffersPage` state drives button visibility; not gated on `pageLoaded` for Chase
- `pageLoaded` only gates the fallback "Go to Offers Page" button

---

## Next Steps (Priority Order)

### Immediate
1. ✅ Node.js API backend — Merged
2. ✅ Mobile Firebase + API client — Merged
3. ✅ Repo splits (web + extension) — Done
4. ✅ Mobile Google Sign-In — Done
5. ✅ SyncWebView — multi-card Chase offer sync via in-app WebView — Done
6. ⏳ **Merge PR #51** — SyncWebView footer button fixes
7. ☐ **Offers display screen** — Show synced offers in the app (list/filter by merchant)
8. ☐ **Best card recommendation** — `GET /best-card?merchant=Target` endpoint + UI
9. ☐ **Amex offer sync** — Wire up Amex bank in SyncWebView (config already present)

### Post-MVP
10. ☐ Add tests — API (Jest + supertest), Mobile (React Native Testing Library)
11. ☐ Deploy API — Railway or Render with prod Firebase project
12. ☐ EAS production builds — Android/iOS app store builds
13. ☐ Capital One scraper
14. ☐ Consider further repo splits (mobile/api) if needed

---

## Build & Deploy

### Web Landing Page (Separate Repo)
```bash
cd ../rewardsfindr-web
npm install
npm start          # local dev
npm run build      # production build
```
Vercel auto-deploys `rewardsfindr-web` repo to rewardsfindr.com

### Chrome Extension (Separate Repo)
```bash
cd ../rewardsfindr-chrome-extension
cp config.example.js config.js
# fill in config.js with Firebase credentials
# Load unpacked in Chrome from repo root
```

### Mobile App
```bash
cd mobile
npm start          # Expo dev server
eas build --profile development --platform android  # dev build
eas build --profile production --platform android   # prod build
```

### API
```bash
cd api
npm run dev        # local with --watch
npm start          # production
```

---

## How to Resume
Paste this file into a new chat and say:
**"Here is my DEV_CONTEXT.md, continue from Next Steps"**
