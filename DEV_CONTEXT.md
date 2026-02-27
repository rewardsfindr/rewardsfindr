# RewardsFindr — Full Dev Session Context (Feb 27, 2026)

## Project Overview
- **App name:** RewardsFindr
- **Purpose:** Rewards credit card finder — user searches a store/merchant and gets ranked
  results showing which credit card gives the best cashback/points rate for that merchant
- **Developer:** Rakesh Balasubramani
- **Location:** San Diego, CA
- **Live domain:** rewardsfindr.com

---

## Tech Stack
- **Frontend:** React (Vite)
- **Backend:** Firebase (Firestore)
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
D:\RewardsFindr\rewardsfindr\
├── src/
│   ├── shared/
│   │   ├── offerUtils.js            ← core utility logic (main functions)
│   │   ├── constants.js             ← CARDS array and category definitions
│   │   └── __tests__/
│   │       └── offerUtils.test.js   ← 63 tests, all passing ✅
│   ├── components/                  ← React components (tests not yet written)
│   ├── firebase.js                  ← Firebase init and db export
│   ├── App.jsx
│   └── main.jsx
├── .env                             ← Firebase env vars (gitignored)
├── DEV_CONTEXT.md                   ← this file
├── package.json
└── vite.config.js
```

---

## Environment Variables (`.env`)
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```
- Vite requires `VITE_` prefix (not `REACT_APP_`)
- Same keys added manually in Vercel → Project → Environment Variables

---

## `.gitignore` (current, correct state)
```gitignore
# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# production
/build
/dist

# misc
.DS_Store
.env.local
.env.development.local
.env.test.local
.env.production.local

npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env

# Vercel
.vercel/
```
- `package-lock.json` is NOT ignored — intentionally committed for consistent builds

---

## Test Setup

### Packages installed
```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom
npm install --save-dev babel-jest @babel/core @babel/preset-env @babel/preset-react
```

### Babel config (`babel.config.js` or `.babelrc`)
```js
{
  "presets": [
    ["@babel/preset-env", { "targets": { "node": "current" } }],
    ["@babel/preset-react", { "runtime": "automatic" }]
  ]
}
```

### Jest config (inside `package.json` or `jest.config.js`)
```js
{
  "testEnvironment": "jsdom",
  "transform": {
    "^.+\\.[jt]sx?$": "babel-jest"
  },
  "setupFilesAfterFramework": ["@testing-library/jest-dom"]
}
```

### NPM scripts (in `package.json`)
```json
"scripts": {
  "test": "jest",
  "test:shared": "jest src/shared/__tests__"
}
```

### Key config issue resolved
- Vite uses native ESM; Jest needs CommonJS — solved by Babel transform
- `vite.config.js` must NOT be picked up by Jest — resolved by scoping jest config

---

## Test Files Written This Session

### 1. `src/App.test.js` ✅
Basic smoke test — confirms App renders without crashing.
```js
import { render, screen } from '@testing-library/react';
import App from '../App';

test('renders learn react link', () => {
  render(<App />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
```

---

### 2. `src/App.integration.test.js` ✅
Integration test — mocks Firebase Firestore, simulates a full search interaction.

**What it mocks:**
- `.firebase` module (exports `db`)
- `firebase/firestore` (`collection`, `getDocs`)

**Fake data used:**
```js
const cards = [{ id: '1', cardName: 'Test Card', issuer: 'Test Bank',
  categoryRates: { grocery: 5, default: 1 } }];
const stores = [{ storeName: 'Whole Foods', category: 'grocery' }];
```

**What it tests:**
- Loading state disappears after data loads
- Typing "Whole Foods" and clicking search shows results heading
- "Test Card" appears in results

---

### 3. `src/shared/__tests__/searchUtils.test.js` ✅
Tests early versions of `findBestStoreMatch` and `buildResultsForCategory`
(before these were moved/expanded into `offerUtils.js`).

**`findBestStoreMatch` tests:**
- Exact key match
- Matches by `startsWith`
- Matches by `contains`
- Returns null when no match

**`buildResultsForCategory` tests:**
- Computes rate and sorts descending
- Falls back to default rate for unknown category

---

### 4. `src/shared/__tests__/offerUtils.test.js` ✅ — 63 tests, all passing

Full coverage of all 6 utility functions:

| Function | # Tests | What's Tested |
|---|---|---|
| `buildStoreLookup` | 6 | Non-empty result, lowercase keys, required fields, primary stores present, aliases present, alias resolves to same category |
| `findBestStoreMatch` | 11 | Null/empty/undefined input, unrelated term, EXACT/PARTIAL/FUZZY quality tiers, case insensitivity, Shell≠Sephora, CVS=drugstore, United Airlines=travel |
| `buildResultsForCategory` | 8 | Empty cards, null/undefined category, sorted descending, required fields, fallback to 1x, all cards returned, first result is max rate |
| `generateOfferId` | 6 | Deterministic, unique per merchant, unique per amount, unique per expiry, alphanumeric only, ≤20 chars |
| `generateCardId` | 5 | Correct slug format, strips `®`, deterministic, different banks differ, no double underscores |
| `normalizeMerchant` | 5 | Strips store number/specials, handles slash in name, single word, already lowercase, trims whitespace |

---

## Source Functions in `src/shared/offerUtils.js`

### `buildStoreLookup()`
- Builds flat key→value lookup from store/merchant definitions
- All keys lowercase (primary names + aliases)
- Each value: `{ category, displayName }`
- Example: `lookup['starbucks coffee'] → { category: 'dining', displayName: 'Starbucks' }`

### `findBestStoreMatch(term, storeLookup)`
3-tier matching:
- **Tier 1 — EXACT:** `normalizedTerm === key`
- **Tier 2 — PARTIAL:** `term.includes(key)` — the stored key is fully inside the search term
- **Tier 3 — FUZZY:** Edit distance / Levenshtein for typos
- Returns `{ category, displayName, quality }` or `null`
- `MATCH_QUALITY` = `{ EXACT: 'exact', PARTIAL: 'partial', FUZZY: 'fuzzy' }`

### `buildResultsForCategory(category, cards)`
- Maps each card to `{ ...card, rate: card.categoryRates?.[category] ?? 1, category }`
- Sorts by `rate` descending
- Returns `[]` for null/undefined category

### `generateOfferId(merchantName, cashbackAmount, expiryDate)`
- Builds: `` `${merchant}_${amount}_${expiry}` ``
- Encodes: `btoa(unescape(encodeURIComponent(raw)))`
- Strips non-alphanumeric
- Returns **last 20 chars** (expiry at end = most unique part)

### `generateCardId(bank, cardName)`
- Lowercase both → strip specials like `®` `™` → join with `_` → collapse spaces
- Example: `('chase', 'Freedom Flex') → 'chase_freedom_flex'`

### `normalizeMerchant(merchantName)`
Step order is critical:
1. `.trim()` — FIRST
2. `.toLowerCase()`
3. `.replace(/[\/\\-]/g, ' ')` — slash/dash → space
4. `.replace(/[^a-z\s]/g, '')` — strip non-alpha
5. `.trim()` — again
6. `.split(/\s+/)[0]` — first word only

---

## Bugs Found & Fixed in `offerUtils.js`

### Bug 1 — Tier 2 partial match too greedy
- **Symptom:** `'starbuck'` returned `PARTIAL` instead of `FUZZY`
- **Cause:** Logic checked `key.includes(term)` instead of `term.includes(key)`
- **Fix:** Tier 2 = `term.includes(key)` — search term must contain the full store key

### Bug 2 — `generateOfferId` truncation loses uniqueness
- **Symptom:** Different expiry dates produced the same ID
- **Cause:** `encoded.slice(0, 20)` — merchant name dominates first 20 chars
- **Fix:** `encoded.slice(-20)` — last 20 chars capture the expiry variation

### Bug 3 — `normalizeMerchant` slash not spaced
- **Symptom:** `'CVS/pharmacy #5678'` → `'cvspharmacy'` instead of `'cvs'`
- **Cause:** `/` stripped but not replaced with space first
- **Fix:** Replace `/`, `\`, `-` with space before stripping non-alpha

### Bug 4 — `normalizeMerchant` trim after split
- **Symptom:** `'  Walmart  '` → `''` empty string
- **Cause:** Leading space made `split(' ')[0]` return `''`
- **Fix:** `.trim()` must be the very first operation

---

## Constants (`src/shared/constants.js`)

### `CARDS` array — each object shape:
```js
{
  id: String,           // e.g. 'chase_freedom_flex'
  bank: String,         // e.g. 'Chase'
  name: String,         // e.g. 'Freedom Flex'
  categoryRates: {
    dining: Number,
    grocery: Number,
    travel: Number,
    drugstore: Number,
    gas: Number,
    streaming: Number,
    online: Number,
    general: Number,
  }
}
```

### Categories
`dining`, `grocery`, `travel`, `drugstore`, `gas`, `streaming`, `online`, `general`

---

## Earlier Session History (pre-midnight, Dec 2025)

### Firebase setup
- Moved Firebase config/init into its own `firebase.js` module
- App calls `loadCardsAndStores()` instead of embedding fetch logic in `App.jsx`
- Fixed Vercel build failure caused by missing `./firebase` module path after refactor
- Added `.env` with `VITE_` prefixed Firebase keys
- Added `.env` to `.gitignore`
- Vercel env vars added manually in dashboard

---

## Next Steps (in priority order)
1. **Option B — Component tests**
   - `SearchBar` component: typing, submit, clear
   - `ResultsCard` component: displays card name, rate, category
   - Tools: `render`, `fireEvent`, `screen` from React Testing Library
2. **Option C — Firebase/API layer tests**
   - Mock Firestore: `jest.mock('firebase/firestore')`
   - Test `loadCardsAndStores()` returns correct shape
3. **Option A — Remaining shared utils**
   - Any untested files in `src/shared/`

---

## How to Resume
Paste this file into a new chat and say:
**"Here is my DEV_CONTEXT.md, continue from Next Steps"**
