# RewardsFindr — Dev Context

Handoff updated Nov 14, 2026. The March sections below are historical. Start from this handoff.

## Where we left off (Nov 14, 2026)

Offers for Chase and Amex are stored only on the phone, keyed by Firebase uid (`rewardsfindr_offers_v1_{uid}`). Sync does not store bank HTML, credentials, account ids, cookies, or session tokens. A failed or partial read must not wipe a card. `.cursor/agent-workflow.md` and `.cursor/agents/` may be committed. Do not commit lockfile noise, screenshots, `.env`, or line-ending-only `google-services.json`. Do not change `main` directly. Work on a branch, then open a PR. Merge only after `/reviewer` writes `Approved`. The reviewer checks the diff and the PR description against `.cursor/agents/review-guidelines.md`.

### Chase (on main, PR #62)
- Sync reads the `customer-offers` response. One complete response is one card. `partial === true` refuses the snapshot. FIGG and CDLX offer ids are both saved.
- Sync does not activate offers. Result cards show Activate for an unactivated Chase offer and Activated when Chase already marked it added. Activate opens `https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-activated/{bankOfferId}` in a signed-in Chase browser. That route also adds the offer.
- The Sync Offers button appears only when the offers page is ready. After login, the sheet opens the offers page once. There is no "Go to Offers" button.

### Amex (this session)
- Reward text is parsed into percent, fixed cash back, or Membership Rewards points, including the spend minimum. Search can rank those offers. Points render as `NX` on the result card.
- Eligible (`/offers`) and enrolled (`/offers/enrolled`) are separate passes. Enrolled is checked first because that path contains the eligible path.
- Repeated `ReadOffersHubPresentation` responses for one card are debounced: keep the fullest REPLACE or UPDATE payload and save it once. A second pass for the same card and phase replaces the earlier count. A card already visited in that phase is not saved again.
- The card menu is not clicked when it is already open. A missing card reports "Could not open the next Amex card. Nothing else was changed." and does not include the option id.
- If a switch produces no new offers response within 5 seconds, the walk continues. That can skip a card's enrolled offers.
- The success summary is one line per card: `Card name: N offers`. The home badge counts unique cards.
- Search passes only the store name to the results screen. The results screen reads matches from the phone. A known expiry renders as `Expires Mon D, YYYY`. An offer with no date shows no expiry line.

### Tests
- `mobile`: `npm test` covers Chase sync, Amex menu/capture, search route params, expiry text, the sync summary, and the on-device catalog/parser under `mobile/lib/catalog/`.

### Next session
1. The enrolled pass can still skip a card when Amex does not send a new offers response after the switch. The summary then counts only the eligible offers for that card.
2. `cashbackType: 'points'` displays as `5X`. A flat bonus such as "2,000 Membership Rewards points" should not look like a rate.
3. The WebView cookie jar is still shared across RewardsFindr accounts. Offer lists are per uid.
4. The Activate link was not verified by a tap on the phone. It needs a signed-in Chase browser.
5. Capital One is not started.

---

## Project Overview
- **App name:** RewardsFindr
- **Purpose:** Rewards credit card finder — mobile app that syncs bank offers on the phone and recommends the best card at a store
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

### Backend
- **None for product use.** Offers, search, and history are on-device (AsyncStorage). Firebase Auth only.
- The former Express / Cloud Run API was removed. GCP cleanup: `docs/retire-cloud-run.md`.

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
│   │   ├── offerStore.js      ← AsyncStorage offer catalog
│   │   └── catalog/           ← On-device parsers / snapshot logic
│   ├── shared/
│   ├── .env.example
│   ├── .env.development     ← gitignored, local only
│   └── .env.production      ← gitignored, local only
├── docs/                   ← Ops notes (e.g. retire Cloud Run)
├── shared/                  ← Top-level shared utilities
├── src/shared/              ← Shared constants (used by mobile)
├── .github/workflows/       ← CI (mobile tests)
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
EXPO_PUBLIC_GOOGLE_CLIENT_ID
```

Normal product use does **not** need a RewardsFindr HTTP API URL.

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
6. On "Sync Offers" tap: JS injected to capture structured offer payloads → saved on-device via `offerStore` / `mobile/lib/catalog/` (AsyncStorage keyed by Firebase uid)
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

## Next Steps

The current list is in **Where we left off** at the top of this file. The March checklist below is historical and is not the queue for the next session.

### Historical (Mar 12, 2026)
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
10. ☐ Add tests — Mobile (React Native Testing Library)
11. ☐ EAS production builds — Android/iOS app store builds
12. ☐ Capital One scraper
13. ☐ Clear unused GitHub Environments (Preview/Production) so PRs stop showing Deployments — see `docs/retire-cloud-run.md`


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
Read **Where we left off** at the top of this file. Do not follow the March sync flow or the March next-step list. Those describe the old server HTML parse path.
