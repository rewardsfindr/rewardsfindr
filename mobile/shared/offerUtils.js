// ─────────────────────────────────────────────
// SHARED OFFER UTILS — mobile copy
// Pure JS — no browser or React Native APIs used.
// Keep in sync with ../src/shared/offerUtils.js in the web app.
// ─────────────────────────────────────────────
import { STORES } from './constants.js';

export const MATCH_QUALITY = {
  EXACT:   'exact',
  PARTIAL: 'partial',
  FUZZY:   'fuzzy',
};

// ─── Levenshtein distance ──────────────────────────────────
const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
};

// ─── buildStoreLookup ─────────────────────────────────
export const buildStoreLookup = () => {
  const lookup = {};
  for (const store of STORES) {
    const key = store.storeName.toLowerCase();
    lookup[key] = { category: store.category, displayName: store.storeName };
    for (const alias of store.aliases) {
      lookup[alias.toLowerCase()] = { category: store.category, displayName: store.storeName };
    }
  }
  return lookup;
};

// ─── findBestStoreMatch ──────────────────────────────
export const findBestStoreMatch = (term, lookup) => {
  if (!term?.trim()) return null;
  const normalized = term.trim().toLowerCase();

  // Tier 1 — exact
  if (lookup[normalized]) return { ...lookup[normalized], quality: MATCH_QUALITY.EXACT };

  // Tier 2 — partial (search term contains a full store key)
  for (const key of Object.keys(lookup)) {
    if (normalized.includes(key)) return { ...lookup[key], quality: MATCH_QUALITY.PARTIAL };
  }

  // Tier 3 — fuzzy
  let best = null, bestDist = Infinity;
  for (const key of Object.keys(lookup)) {
    const dist = levenshtein(normalized, key);
    const threshold = Math.max(2, Math.floor(key.length * 0.3));
    if (dist <= threshold && dist < bestDist) { best = key; bestDist = dist; }
  }
  if (best) return { ...lookup[best], quality: MATCH_QUALITY.FUZZY };

  return null;
};

// ─── buildResultsForCategory ──────────────────────────
export const buildResultsForCategory = (category, cards) => {
  if (!category) return [];
  return cards
    .map(c => ({ ...c, rate: c.categoryRates?.[category] ?? 1, category }))
    .sort((a, b) => b.rate - a.rate);
};

// ─── normalizeMerchant ───────────────────────────────
export const normalizeMerchant = (name) => {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/[\/\\-]/g, ' ')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)[0];
};
