import { STORES } from './constants.js';

// ─────────────────────────────────────────────
// MATCH QUALITY
// Tells the UI how confident the match is
// EXACT/ALIAS  → show results immediately, no suggestion
// PARTIAL      → show results + "Showing results for X"
// FUZZY        → show results + "Did you mean X?"
// NONE         → show "Store not found"
// ─────────────────────────────────────────────
export const MATCH_QUALITY = {
  EXACT: 'exact',
  ALIAS: 'alias',
  PARTIAL: 'partial',
  FUZZY: 'fuzzy',
  NONE: 'none',
};

// ─────────────────────────────────────────────
// BUILD STORE LOOKUP
// Call once on app init — builds flat lookup map from STORES array
// Includes all aliases so every variation maps to the same store
// Returns: { 'starbucks': { category, displayName }, 'starbucks coffee': { ... } }
// ─────────────────────────────────────────────
export const buildStoreLookup = () => {
  const lookup = {};
  STORES.forEach(store => {
    // Primary name
    lookup[store.storeName.toLowerCase()] = {
      category: store.category,
      displayName: store.storeName,
    };
    // All aliases point to the same store
    store.aliases.forEach(alias => {
      lookup[alias.toLowerCase()] = {
        category: store.category,
        displayName: store.storeName,
      };
    });
  });
  return lookup;
};

// ─────────────────────────────────────────────
// LEVENSHTEIN DISTANCE
// Measures how many single-character edits separate two strings
// Used for fuzzy matching — replaces the old first-letter heuristic
// Example: 'starbuck' vs 'starbucks' → distance 1 ✅ match
// Example: 'shell' vs 'sephora'     → distance 4 ❌ no match
// ─────────────────────────────────────────────
const levenshtein = (a, b) => {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) =>
    Array.from({ length: a.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
    }
  }
  return matrix[b.length][a.length];
};

// ─────────────────────────────────────────────
// FIND BEST STORE MATCH
// Replaces the old findBestStoreMatch from searchUtils.js
// Now returns { displayName, category, quality } instead of just a key
// The quality field tells the UI exactly what message to show
// ─────────────────────────────────────────────
export const findBestStoreMatch = (searchTerm, storeLookup = {}) => {
  if (!searchTerm?.trim()) return null;

  const term = searchTerm.toLowerCase().trim();

  // Tier 1: Exact match (includes aliases since they're in the lookup)
  if (storeLookup[term]) {
    return { ...storeLookup[term], quality: MATCH_QUALITY.EXACT };
  }

  // Tier 2: Partial match — term is contained in a key or key in term
  // e.g. "whole foods market" contains "whole foods"
  for (const [key, value] of Object.entries(storeLookup)) {
    if (key.includes(term) || term.includes(key)) {
      return { ...value, quality: MATCH_QUALITY.PARTIAL };
    }
  }

  // Tier 3: Fuzzy match — Levenshtein distance
  // Threshold: allow up to 35% character difference
  // Prevents false matches like Shell → Sephora
  let bestMatch = null;
  let bestDistance = Infinity;

  for (const [key, value] of Object.entries(storeLookup)) {
    const distance = levenshtein(term, key);
    const threshold = Math.floor(key.length * 0.35);
    if (distance < bestDistance && distance <= threshold) {
      bestDistance = distance;
      bestMatch = { ...value, quality: MATCH_QUALITY.FUZZY };
    }
  }

  return bestMatch || null;
};

// ─────────────────────────────────────────────
// BUILD RESULTS FOR CATEGORY
// Ranks all cards by their rate for a given category
// Falls back to 1% (base rate) if category not defined on card
// ─────────────────────────────────────────────
export const buildResultsForCategory = (category, allCards = []) => {
  if (!category || !allCards.length) return [];
  return allCards
    .map(card => ({
      ...card,
      category,
      rate: card.categoryRates?.[category] ?? 1,
    }))
    .sort((a, b) => b.rate - a.rate);
};

// ─────────────────────────────────────────────
// GENERATE OFFER ID
// Deterministic hash — same offer always gets the same ID
// Prevents duplicate offers on weekly re-sync
// ─────────────────────────────────────────────
export const generateOfferId = (merchantName, cashbackAmount, expiryDate) => {
  const raw = `${merchantName.toLowerCase().trim()}_${cashbackAmount}_${expiryDate}`;
  return btoa(raw).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
};

// ─────────────────────────────────────────────
// GENERATE CARD ID
// Deterministic slug — never auto-generated
// Ensures extension and app always refer to same card document
// ─────────────────────────────────────────────
export const generateCardId = (bankName, cardName) => {
  return `${bankName}_${cardName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')}`;
};

// ─────────────────────────────────────────────
// NORMALIZE MERCHANT
// Strips noise from bank offer merchant names for search matching
// "Starbucks Coffee #1234" → "starbucks"
// ─────────────────────────────────────────────
export const normalizeMerchant = (merchantName) => {
  return merchantName
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(' ')[0]
    .trim();
};
