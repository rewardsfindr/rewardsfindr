import { STORES } from './constants.js';

// ─────────────────────────────────────────────
export const MATCH_QUALITY = {
  EXACT: 'exact',
  ALIAS: 'alias',
  PARTIAL: 'partial',
  FUZZY: 'fuzzy',
  NONE: 'none',
};

export const buildStoreLookup = () => {
  const lookup = {};
  STORES.forEach(store => {
    lookup[store.storeName.toLowerCase()] = {
      category: store.category,
      displayName: store.storeName,
    };
    store.aliases.forEach(alias => {
      lookup[alias.toLowerCase()] = {
        category: store.category,
        displayName: store.storeName,
      };
    });
  });
  return lookup;
};

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

export const findBestStoreMatch = (searchTerm, storeLookup = {}) => {
  if (!searchTerm?.trim()) return null;

  const term = searchTerm.toLowerCase().trim();

  if (storeLookup[term]) {
    return { ...storeLookup[term], quality: MATCH_QUALITY.EXACT };
  }

  for (const [key, value] of Object.entries(storeLookup)) {
    if (term.includes(key)) {
      return { ...value, quality: MATCH_QUALITY.PARTIAL };
    }
  }

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
// Deterministic hash — same offer on same card always gets the same ID.
// cardName is included so the same offer on two different cards
// (e.g. Sapphire Reserve and Freedom Flex) gets distinct IDs.
// ─────────────────────────────────────────────
export const generateOfferId = (merchantName, cashbackAmount, expiryDate, cardName = '') => {
  const raw = `${merchantName.toLowerCase().trim()}_${cashbackAmount}_${cardName.toLowerCase().trim()}_${expiryDate}`;
  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/[^a-zA-Z0-9]/g, '');
  return encoded.slice(-20);
};

export const generateCardId = (bankName, cardName) => {
  return `${bankName}_${cardName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')}`;
};

export const normalizeMerchant = (merchantName) => {
  return merchantName
    .trim()
    .toLowerCase()
    .replace(/[\/\\-]/g, ' ')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)[0]
    .trim();
};
