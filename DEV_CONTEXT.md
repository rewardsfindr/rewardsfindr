# RewardsFindr — Full Dev Session Context

## Project Overview
- **App name:** RewardsFindr
- **Purpose:** Rewards credit card finder — user searches a store/merchant and gets ranked
  results showing which credit card gives the best cashback/points rate for that merchant
- **Developer:** Rakesh Balasubramani
- **Location:** San Diego, CA

---

## Tech Stack
- **Frontend:** React (Vite)
- **Backend:** Firebase (Firestore)
- **Deployment:** Vercel
- **Language:** JavaScript (no TypeScript)
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
│   │   ├── offerUtils.js          ← core utility logic
│   │   ├── constants.js           ← CARDS array and category definitions
│   │   └── __tests__/
│   │       └── offerUtils.test.js ← 63 tests, all passing ✅
│   ├── components/                ← React components (tests not yet written)
│   ├── App.jsx
│   └── main.jsx
├── DEV_CONTEXT.md                 ← this file
├── package.json
└── vite.config.js
```

---

## Test Setup

### Test runner
- Jest + React Testing Library
- Config inside `package.json` or `jest.config.js`

### NPM scripts
```bash
npm run test            # runs all tests
npm run test:shared     # runs only src/shared/__tests__/
```

### Environment
- Tests run in jsdom environment
- ES module support via Babel transform

---

## Test Files Written

### ✅ `src/shared/__tests__/offerUtils.test.js`
- **63 tests, all passing**
- Covers the following functions from `src/shared/offerUtils.js`:

| Function | # Tests | What's Tested |
|---|---|---|
| `buildStoreLookup` | 6 | Non-empty, lowercase keys, required fields, primary stores, aliases |
| `findBestStoreMatch` | 11 | Null/empty/invalid input, EXACT/PARTIAL/FUZZY quality tiers, case insensitivity, category correctness |
| `buildResultsForCategory` | 8 | Empty inputs, sort order, required fields, fallback to 1x, all cards returned |
| `generateOfferId` | 6 | Deterministic, unique per merchant/amount/expiry, alphanumeric, ≤20 chars |
| `generateCardId` | 5 | Correct slug, strips `®`, deterministic, different banks, no double underscores |
| `normalizeMerchant` | 5 | Lowercases, strips numbers/specials, single word, already lowercase, trims whitespace |

---

## Source Functions in `offerUtils.js`

### `buildStoreLookup()`
- Builds a flat key-value lookup from the store/merchant list
- Keys are all lowercase (both primary names and aliases)
- Each value has `{ category, displayName }`
- Example: `lookup['starbucks coffee'] → { category: 'dining', displayName: 'Starbucks' }`

### `findBestStoreMatch(term, storeLookup)`
- 3-tier matching system:
  - **Tier 1 — EXACT:** `term === key`
  - **Tier 2 — PARTIAL:** `term.includes(key)` (the stored key is inside the search term)
  - **Tier 3 — FUZZY:** Levenshtein/edit distance for typos
- Returns `{ category, displayName, quality }` or `null`
- `MATCH_QUALITY` enum: `{ EXACT: 'exact', PARTIAL: 'partial', FUZZY: 'fuzzy' }`

### `buildResultsForCategory(category, cards)`
- Takes a category string and the CARDS array
- Maps each card to `{ ...card, rate: card.categoryRates?.[category] ?? 1, category }`
- Sorts by `rate` descending
- Returns empty array for null/undefined category

### `generateOfferId(merchantName, cashbackAmount, expiryDate)`
- Builds string: `merchantname_amount_expiry`
- Encodes with `btoa(unescape(encodeURIComponent(raw)))`
- Strips non-alphanumeric chars
- Returns **last 20 chars** (not first — expiry at end is most unique part)

### `generateCardId(bank, cardName)`
- Lowercases both inputs
- Strips special characters like `®`, `™`
- Joins with `_`, collapses multiple spaces to single `_`
- Example: `generateCardId('chase', 'Freedom Flex') → 'chase_freedom_flex'`

### `normalizeMerchant(merchantName)`
- Step order matters:
  1. `.trim()` — FIRST, before split
  2. `.toLowerCase()`
  3. `.replace(/[\/\\-]/g, ' ')` — replace slashes/dashes with space
  4. `.replace(/[^a-z\s]/g, '')` — strip non-alpha
  5. `.trim()` — again after replacements
  6. `.split(/\s+/)[0]` — take first word only
- Example: `normalizeMerchant('CVS/pharmacy #5678') → 'cvs'`

---

## Bugs Fixed in `offerUtils.js` (this session)

### Bug 1 — `findBestStoreMatch` Tier 2 too greedy
- **Problem:** `'starbuck'.includes('starbucks')` is false, but `'starbucks'.includes('starbuck')`
  was being checked incorrectly — the logic had `key.includes(term)` instead of `term.includes(key)`
  which caused `starbuck` to hit Tier 2 instead of Tier 3
- **Fix:** Tier 2 must check `term.includes(key)` — the search term contains the full store key

### Bug 2 — `generateOfferId` truncation loses uniqueness
- **Problem:** `encoded.slice(0, 20)` was used — the merchant name dominates the first 20 chars,
  so different expiry dates produced the same ID
- **Fix:** Changed to `encoded.slice(-20)` — last 20 chars contain the most varied part (expiry)

### Bug 3 — `normalizeMerchant` slash not replaced with space
- **Problem:** `'CVS/pharmacy'` had `/` stripped but not replaced with a space,
  resulting in `'cvspharmacy'` instead of `'cvs'`
- **Fix:** Replace `/`, `\`, `-` with a space before stripping non-alpha chars

### Bug 4 — `normalizeMerchant` trim after split, not before
- **Problem:** `'  Walmart  '.split(' ')[0]` returns `''` (empty string from leading space)
- **Fix:** Call `.trim()` as the very first operation before any split

---

## Constants (`src/shared/constants.js`)

### `CARDS` array
Each card object has:
```js
{
  id: String,           // e.g. 'chase_freedom_flex'
  bank: String,         // e.g. 'Chase'
  name: String,         // e.g. 'Freedom Flex'
  categoryRates: {      // cashback multiplier per category
    dining: Number,
    grocery: Number,
    travel: Number,
    drugstore: Number,
    // ...etc
  }
}
```

### Categories used
`dining`, `grocery`, `travel`, `drugstore`, `gas`, `streaming`, `online`, `general`

---

## Session History — What Was Built Today

### Phase 1: Test infrastructure setup
- Added Jest + React Testing Library to the project
- Configured Babel for ES module support in tests
- Added `test:shared` script to `package.json`
- Fixed Vite/Jest config conflict (Vite uses ESM, Jest needs CommonJS transform)

### Phase 2: First test file — `App.test.js`
- Basic smoke test confirming App renders without crashing

### Phase 3: `App.integration.test.js`
- Integration tests for the top-level App component
- Tests search input interaction and results rendering

### Phase 4: `searchUtils.test.js`
- Tests for search utility functions

### Phase 5: `offerUtils.test.js` (63 tests)
- Full coverage of all 6 utility functions in `offerUtils.js`
- Fixed 4 bugs discovered during testing
- All 63 tests passing ✅

---

## Next Steps (in priority order)
1. **Option B — Component tests:** SearchBar component, ResultsCard component
   - Use React Testing Library `render`, `fireEvent`, `screen`
2. **Option C — Firebase/API layer tests:** Mock Firestore calls
   - Use `jest.mock('firebase/firestore')`
3. **Option A — Remaining shared utils:** Any untested files in `src/shared/`

---

## How to Resume
Paste this file into a new chat and say:
**"Here is my DEV_CONTEXT.md, let's continue from Next Steps"**
