# RewardsFindr — Dev Context (Feb 27, 2026)

## Project Overview
- **App name:** RewardsFindr
- **Purpose:** Rewards credit card finder — user searches a store/merchant and gets ranked
  results showing which credit card gives the best cashback/points rate for that merchant
- **Developer:** Rakesh Balasubramani
- **Location:** San Diego, CA
- **Live domain:** rewardsfindr.com
- **GitHub:** https://github.com/rewardsfindr/rewardsfindr

---

## Tech Stack
- **Frontend:** React 18 (Create React App — `react-scripts`, NOT Vite)
- **Backend:** Firebase 10 (Firestore + Google Auth)
- **Deployment:** Vercel
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

## Key File Structure
```
src/
├── App.js                        ← root component, orchestration only (~90 lines)
├── App.css                       ← all styles, named CSS classes, no inline styles
├── index.js                      ← CRA entry point
├── firebase.js                   ← Firebase init — exports auth, provider, db
├── hooks/
│   ├── useAuth.js                ← Google Sign In/Out, onAuthStateChanged
│   └── useSearch.js              ← all search state + logic (runSearch, clearSearch)
├── components/
│   ├── Header.js                 ← logo, card/store count, sign in/out + avatar
│   ├── SearchBar.js              ← text input, search button, popular store chips
│   ├── MatchBanner.js            ← yellow "Did you mean" / "Showing results for" strip
│   ├── ResultsHeader.js          ← purple gradient banner + Top Rewards title
│   └── ResultCard.js             ← single credit card result tile
├── shared/
│   ├── constants.js              ← CARDS, STORES, POPULAR_STORES, BANKS, CATEGORIES, BANK_OFFER_URLS
│   ├── offerUtils.js             ← core matching + utility functions
│   ├── mockFirebase.js           ← mock DB + auth (mirrors real Firebase interface)
│   └── __tests__/
│       ├── offerUtils.test.js    ← 41 tests ✅
│       └── constants.test.js     ← 21 tests ✅
└── __tests__/
    └── App.test.js               ← 27 tests ✅ (integration, mocks Firebase)
```

---

## Test Suite

**Total: 89 tests, 3 suites, all passing ✅**

```
npx jest --passWithNoTests --watchAll=false
PASS src/shared/__tests__/constants.test.js
PASS src/shared/__tests__/offerUtils.test.js
PASS src/__tests__/App.test.js
Tests: 89 passed, 89 total
```

### `App.test.js` — 39 tests
Full integration tests for the React app. Mocks:
- `../firebase.js` → `{ auth: {}, provider: {}, db: {} }`
- `firebase/auth` → stubs `onAuthStateChanged`, `signInWithPopup`, `signOut`
- `../shared/constants.js` → 3 fixed test cards + 3 popular stores
- `../shared/offerUtils.js` → deterministic match map
- `lucide-react` → lightweight `<span>` stubs

Covers: initial render, typing behaviour, search results, match quality banners,
store-not-found, quick search chips, error state, Sign In button visibility.

### `offerUtils.test.js` — 41 tests
Unit tests for all 6 utility functions in `offerUtils.js`.

| Function | Tests |
|---|---|
| `buildStoreLookup` | 6 |
| `findBestStoreMatch` | 11 |
| `buildResultsForCategory` | 8 |
| `generateOfferId` | 6 |
| `generateCardId` | 5 |
| `normalizeMerchant` | 5 |

### `constants.test.js` — 21 tests
Structural validation of all exported constants:
`CATEGORIES`, `BANKS`, `CARDS`, `STORES`, `POPULAR_STORES`, `BANK_OFFER_URLS`.

---

## Environment Variables

**CRA requires `REACT_APP_` prefix (NOT `VITE_`).**

```
REACT_APP_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN
REACT_APP_FIREBASE_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET
REACT_APP_FIREBASE_MESSAGING_SENDER_ID
REACT_APP_FIREBASE_APP_ID
```

- Stored in `.env` locally (gitignored)
- Added manually in Vercel → Project → Environment Variables
- `firebase.js` reads them via `process.env.REACT_APP_*`

---

## Firebase Setup

### `src/firebase.js`
Single source of truth for Firebase. All other files import from here, never from the SDK directly.
```js
export const auth     = getAuth(app);        // Google Auth
export const provider = new GoogleAuthProvider();
export const db       = getFirestore(app);   // Firestore (ready, not yet wired to UI)
```

### `src/hooks/useAuth.js`
- `onAuthStateChanged` is the single source of truth for auth state
- Exposes: `user`, `authLoading`, `signIn`, `signOut`
- `user === null` → signed out; `user === object` → signed in (Firebase user)
- `authLoading === true` → auth state not yet resolved (shows loading spinner)
- Popup closed without sign-in → silently ignored (`auth/popup-closed-by-user`)

### Firebase Console requirements
- Authentication → Sign-in method → **Google must be enabled**
- Authentication → Settings → Authorized domains → **Vercel domain must be added**

---

## Core Logic (`src/shared/offerUtils.js`)

### `buildStoreLookup()`
Builds flat `key → { category, displayName }` from `STORES` in constants.
All keys lowercase. Includes primary names + all aliases.

### `findBestStoreMatch(term, lookup)`
3-tier matching (priority order):
1. **EXACT** — `normalizedTerm === key`
2. **PARTIAL** — `term.includes(key)` (stored key fully inside search term)
3. **FUZZY** — Levenshtein edit distance for typos
Returns `{ category, displayName, quality }` or `null`.
`MATCH_QUALITY = { EXACT: 'exact', PARTIAL: 'partial', FUZZY: 'fuzzy' }`

### `buildResultsForCategory(category, cards)`
Maps each card → `{ ...card, rate, category }`, sorted by rate descending.
Returns `[]` for null/undefined category.

### `generateOfferId(merchant, amount, expiry)`
Deterministic, alphanumeric, ≤20 chars. Uses `btoa` encoding, takes **last** 20 chars
(expiry at end = most unique part).

### `generateCardId(bank, cardName)`
Lowercase + strip specials (`®` `™`) + join with `_`.
Example: `('chase', 'Freedom Flex') → 'chase_freedom_flex'`

### `normalizeMerchant(name)`
Step order is critical:
1. `.trim()` — FIRST
2. `.toLowerCase()`
3. Replace `/`, `\`, `-` with space
4. Strip non-alpha characters
5. `.trim()` — again
6. `.split(/\s+/)[0]` — first word only

---

## Constants (`src/shared/constants.js`)

### `CARDS` — shape of each card object
```js
{
  id:            String,   // e.g. 'chase_freedom_flex'
  cardName:      String,   // e.g. 'Freedom Flex'
  issuer:        String,   // e.g. 'Chase'
  bank:          String,   // matches a BANKS constant value
  annualFee:     Number,   // 0 for no-fee cards
  rewardType:    String,   // 'cashback' | 'points'
  categoryRates: {
    grocery:      Number,
    dining:       Number,
    gas:          Number,
    travel:       Number,
    drugstore:    Number,
    shopping:     Number,
    subscription: Number,
    other:        Number,  // fallback — every card must have this
  }
}
```

### `STORES` — shape of each store object
```js
{
  storeName: String,   // e.g. 'Starbucks'
  category:  String,   // must match a CATEGORIES value
  aliases:   String[], // e.g. ['starbucks coffee', 'sbux']
}
```

### Other exports
- `CATEGORIES` — enum of valid category strings
- `BANKS` — enum of valid bank identifiers
- `POPULAR_STORES` — string[] shown as quick-search chips in UI
- `BANK_OFFER_URLS` — maps bank key → URL for the bank's offers page

---

## `src/shared/mockFirebase.js`
Drop-in replacement for real Firebase (used during development before auth was wired).
Mirrors exact method signatures of Firestore + Auth.
**Not used in production** — kept for local dev/testing reference.

To swap mock → real: change import in one line per file:
```js
// FROM:
import { mockDB, mockAuth } from '../shared/mockFirebase.js'
// TO:
import { db, auth } from '../firebase.js'
```

---

## Build & Deploy

```bash
npm start          # local dev
npm test           # run all 89 tests
npm run build      # CI=false react-scripts build (suppresses warnings as errors)
```

Vercel auto-deploys on push to `main`. Build command: `npm run build`. Output: `build/`.

---

## Branch & PR Workflow
- All work done on feature branches: `feat/`, `fix/`, `chore/`
- PRs always opened against `main`
- Branch protection on `main`: requires at least 1 approval
- As repo owner, can bypass via Vercel/GitHub settings if needed for solo merges
- AI assistant pushes to feature branches and opens PRs — human reviews and merges

---

## Completed PRs This Session
| PR | Title | Status |
|---|---|---|
| #4 | refactor: extract components, custom hook, move styles to App.css | ✅ Merged |
| #5 | feat: Firebase Google Auth | ✅ Merged |

---

## Next Steps (in priority order)
1. **Firestore favourites** — save user's favourite cards using `db` (already exported)
2. **Chrome extension auth** — sync signed-in user between web app and extension
3. **Rate% display fix** — `ResultCard` shows `%` suffix; verify points cards show correct label

---

## How to Resume
Paste this file into a new chat and say:
**"Here is my DEV_CONTEXT.md, continue from Next Steps"**
