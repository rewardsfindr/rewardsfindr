# RewardsFindr — Dev Context (Feb 28, 2026)

## Project Overview
- **App name:** RewardsFindr
- **Purpose:** Rewards credit card finder — mobile app + Chrome extension that auto-syncs bank offers and recommends best card at any store
- **Developer:** Rakesh Balasubramani
- **Location:** San Diego, CA
- **Live domain:** rewardsfindr.com
- **GitHub:** https://github.com/rewardsfindr/rewardsfindr

---

## Tech Stack

### Web App (Lower Priority)
- **Frontend:** React 18 (Create React App — `react-scripts`, NOT Vite)
- **Deployment:** Vercel
- **Auth:** Firebase Google Auth

### Mobile App (Primary Focus)
- **Framework:** React Native + Expo SDK 54
- **Router:** Expo Router ~4.0
- **Auth:** Firebase JS SDK v10 (Google Sign-In)
- **Deployment:** EAS (Expo Application Services)

### Chrome Extension (Primary Focus)
- **Manifest:** V3
- **Banks Supported:** Chase, Amex (Capital One planned)
- **Auth:** chrome.identity + Firebase custom tokens

### Backend API (NEW - Feb 28)
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

## Current Architecture (Feb 28, 2026)

```
┌──────────────────┐     ┌──────────────────┐
│  Chrome Extension│     │   Mobile App     │
│  (Manifest V3)   │     │  (Expo + EAS)    │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         │   REST / HTTPS calls   │
         └────────┬───────────────┘
                  │
         ┌────────┴──────────────────────────────────┐
         │           Backend API (Node.js)             │
         │   POST /sync-offers   GET /best-card        │
         │   POST /auth/verify   GET /user/offers      │
         └──────────────┬────────────────────────────┘
                       │
               ┌───────┴────────┐
               │    Firebase    │
               │  Firestore DB  │
               │  + Auth (JWT)  │
               └─────────────────┘
```

**Key Decision:** Backend API layer added to avoid direct Firestore access from clients (security, rate limiting, server-side validation).

---

## Repository Structure

```
rewardsfindr/
├── src/                    ← Web app (React, lower priority)
├── extension/              ← Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js
│   ├── content/
│   │   ├── chase.js
│   │   └── amex.js
│   └── popup/
├── mobile/                 ← React Native + Expo app
│   ├── app/
│   ├── lib/
│   │   ├── firebaseClient.js  ← Firebase JS SDK init
│   │   └── apiClient.js        ← HTTP client for API calls
│   ├── shared/
│   ├── .env.example
│   ├── .env.development     ← gitignored, local only
│   └── .env.production      ← gitignored, local only
└── api/                    ← Node.js Express backend (NEW)
    ├── index.js
    ├── config/
    │   └── firebase.js      ← Firebase Admin SDK
    ├── middleware/
    │   └── auth.js          ← Token verification
    ├── routes/
    │   ├── auth.js
    │   └── offers.js
    ├── .env.example
    └── .env                 ← gitignored, local only
```

---

## Environment Variables

### Web App (`/src`)
**Prefix:** `REACT_APP_`
```
REACT_APP_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN
REACT_APP_FIREBASE_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET
REACT_APP_FIREBASE_MESSAGING_SENDER_ID
REACT_APP_FIREBASE_APP_ID
```

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
- `POST /api/offers/sync` — Accept scraped offers from extension
- `GET /api/offers/:userId` — Get user's synced offers

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
       ├── cardId: string          ← e.g. "chase_freedom_flex"
       ├── amount: number          ← e.g. 5 (% or $ off)
       ├── expiry: string          ← ISO date
       ├── activatedAt: timestamp
       └── source: string          ← "extension" | "manual"
```

---

## Test Coverage

### Web App (`/src`) — 89 tests ✅
- `App.test.js` — 39 tests (integration)
- `offerUtils.test.js` — 41 tests (unit)
- `constants.test.js` — 21 tests (validation)

### API (`/api`) — **0 tests** ⚠️
**Status:** No tests yet. Planned after MVP wiring complete.
**TODO:** Add Jest + supertest for endpoint testing.

### Mobile (`/mobile`) — **0 tests** ⚠️
**Status:** No tests yet. Planned after MVP wiring complete.
**TODO:** Add React Native Testing Library for component tests.

---

## Recent PRs (Feb 28, 2026)

| PR | Title | Status | Notes |
|---|---|---|---|
| #14 | feat: add Node.js API backend with Firebase integration | ✅ Merged | Express server, Firebase Admin, auth + offers endpoints |
| #15 | fix: load dotenv before Firebase config imports | ✅ Merged | Fixed env var loading order |
| #16 | feat: add Firebase and API client for mobile app | 🔄 Open | Firebase JS SDK, apiClient.js, env config |

---

## Next Steps (Priority Order)

### Immediate (In Progress)
1. ✅ **Node.js API backend** — Merged (PR #14, #15)
2. 🔄 **Mobile Firebase + API client** — Open (PR #16)
3. ⬜ **Mobile Google Sign-In UI** — Add auth screen with Firebase Google auth
4. ⬜ **Extension auth flow** — Wire chrome.identity + Firebase custom tokens
5. ⬜ **Extension offer sync** — POST to `/api/offers/sync` after scraping

### Post-MVP
6. ⬜ **Add tests** — API endpoint tests (Jest + supertest)
7. ⬜ **Deploy API** — Railway or Render with prod Firebase project
8. ⬜ **EAS production builds** — Android/iOS app store builds
9. ⬜ **Capital One scraper** — Add third bank to extension

---

## Build & Deploy

### Web App
```bash
npm start          # local dev
npm test           # run 89 tests
npm run build      # production build
```
Vercel auto-deploys on push to `main`.

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
