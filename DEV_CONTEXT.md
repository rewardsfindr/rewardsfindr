# RewardsFindr — Dev Context (Mar 2, 2026)

## Project Overview
- **App name:** RewardsFindr
- **Purpose:** Rewards credit card finder — mobile app + Chrome extension that auto-syncs bank offers and recommends best card at any store
- **Developer:** Rakesh Balasubramani
- **Location:** San Diego, CA
- **Live domain:** rewardsfindr.com
- **GitHub:** https://github.com/rewardsfindr/rewardsfindr (monorepo)

---

## Repository Structure (Updated Mar 2, 2026)

**Main Monorepo:** https://github.com/rewardsfindr/rewardsfindr
- API, Mobile App, Extension, Shared utilities

**Separate Repos:**
- **Web Landing Page:** https://github.com/rewardsfindr/rewardsfindr-web
  - React landing page deployed on Vercel → rewardsfindr.com
  - Split out on Mar 2, 2026 to separate concerns

**Coming Soon (Planned Splits):**
- `rewardsfindr-mobile` - Standalone mobile app repo
- `rewardsfindr-api` - Standalone backend API repo

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

### Chrome Extension (Primary Focus)
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

## Current Architecture (Mar 2, 2026)

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Chrome Extension│     │   Mobile App     │     │  Landing Page    │
│  (Manifest V3)   │     │  (Expo + EAS)    │     │  (React/Vercel)  │
└────────┬─────────┘     └────────┬─────────┘     └──────────────────┘
         │                        │                   (separate repo)
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

## Monorepo Structure (Main Repo)

```
rewardsfindr/
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
├── api/                    ← Node.js Express backend
│   ├── index.js
│   ├── config/
│   │   └── firebase.js      ← Firebase Admin SDK
│   ├── middleware/
│   │   └── auth.js          ← Token verification
│   ├── routes/
│   │   ├── auth.js
│   │   └── offers.js
│   ├── .env.example
│   └── .env                 ← gitignored, local only
├── shared/                  ← Top-level shared utilities
├── src/shared/              ← Shared constants (used by extension/mobile)
├── .github/workflows/       ← CI/CD (tests)
└── DEV_CONTEXT.md           ← This file
```

**Note:** `/src`, `/public`, `package.json` removed Mar 2, 2026 (moved to rewardsfindr-web repo)

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

### Shared Utilities — Tests ✅
- `src/shared/` — Constants and utilities (used by extension/mobile)
- Tested via monorepo test scripts

### API (`/api`) — **0 tests** ⚠️
**Status:** No tests yet. Planned after MVP wiring complete.
**TODO:** Add Jest + supertest for endpoint testing.

### Mobile (`/mobile`) — **0 tests** ⚠️
**Status:** No tests yet. Planned after MVP wiring complete.
**TODO:** Add React Native Testing Library for component tests.

---

## Recent Changes (Mar 2, 2026)

### Repository Split
**Date:** March 2, 2026

**What Changed:**
- Split landing page into separate `rewardsfindr-web` repo
- Cleaned monorepo: removed `/src`, `/public`, `package.json`, `vercel.json`, babel/jest configs
- Kept `/src/shared` (used by extension and mobile)
- Disabled Vercel builds on main repo (added `.vercelignore`)
- Updated README to reflect monorepo structure

**Reason:**
- Separation of concerns: marketing site vs. app infrastructure
- Cleaner development: each repo has focused purpose
- Easier deployment: web auto-deploys independently

**PRs:**
- PR #30: Remove web config files (package.json, babel, jest, vercel)
- PR #31: Remove all web source files (src/, public/ folders)
- PR #33: Update README and disable Vercel builds

---

## Recent PRs (Feb 28 - Mar 2, 2026)

| PR | Title | Status | Notes |
|---|---|---|---|
| #14 | feat: add Node.js API backend with Firebase integration | ✅ Merged | Express server, Firebase Admin, auth + offers endpoints |
| #15 | fix: load dotenv before Firebase config imports | ✅ Merged | Fixed env var loading order |
| #16 | feat: add Firebase and API client for mobile app | ✅ Merged | Firebase JS SDK, apiClient.js, env config |
| #30 | chore: remove web files - phase 1 | ✅ Merged | Removed root config files |
| #31 | chore: complete web files cleanup | ✅ Merged | Removed all src/ and public/ web files |
| #33 | chore: update README and disable Vercel builds | ✅ Merged | Updated docs, added .vercelignore |

---

## Next Steps (Priority Order)

### Immediate (In Progress)
1. ✅ **Node.js API backend** — Merged (PR #14, #15)
2. ✅ **Mobile Firebase + API client** — Merged (PR #16)
3. ✅ **Repo split** — Web moved to separate repo (PR #30, #31, #33)
4. ⬜ **Mobile Google Sign-In UI** — Add auth screen with Firebase Google auth
5. ⬜ **Extension auth flow** — Wire chrome.identity + Firebase custom tokens
6. ⬜ **Extension offer sync** — POST to `/api/offers/sync` after scraping

### Post-MVP
7. ⬜ **Add tests** — API endpoint tests (Jest + supertest)
8. ⬜ **Deploy API** — Railway or Render with prod Firebase project
9. ⬜ **EAS production builds** — Android/iOS app store builds
10. ⬜ **Capital One scraper** — Add third bank to extension
11. ⬜ **Consider further splits** — Move mobile/api to separate repos if needed

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

### Extension
```bash
cd extension
npm install
npm run build
# Load unpacked in Chrome from extension/dist
```

---

## How to Resume
Paste this file into a new chat and say:
**"Here is my DEV_CONTEXT.md, continue from Next Steps"**
