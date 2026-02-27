import {
  buildStoreLookup,
  findBestStoreMatch,
  buildResultsForCategory,
  generateOfferId,
  generateCardId,
  normalizeMerchant,
  MATCH_QUALITY,
} from '../offerUtils.js';
import { CARDS } from '../constants.js';

// ── buildStoreLookup ──────────────────────────
describe('buildStoreLookup', () => {
  let lookup;

  beforeAll(() => {
    lookup = buildStoreLookup();
  });

  test('returns a non-empty object', () => {
    expect(Object.keys(lookup).length).toBeGreaterThan(0);
  });

  test('all keys are lowercase', () => {
    Object.keys(lookup).forEach(key => {
      expect(key).toBe(key.toLowerCase());
    });
  });

  test('every entry has category and displayName', () => {
    Object.values(lookup).forEach(entry => {
      expect(entry).toHaveProperty('category');
      expect(entry).toHaveProperty('displayName');
    });
  });

  test('primary store names are in lookup', () => {
    expect(lookup).toHaveProperty('starbucks');
    expect(lookup).toHaveProperty('target');
    expect(lookup).toHaveProperty('shell');
  });

  test('aliases are included in lookup', () => {
    expect(lookup).toHaveProperty('starbucks coffee');
    expect(lookup['starbucks coffee'].displayName).toBe('Starbucks');
  });

  test('alias resolves to same category as primary', () => {
    expect(lookup['starbucks'].category).toBe(lookup['starbucks coffee'].category);
  });
});

// ── findBestStoreMatch ────────────────────────
describe('findBestStoreMatch', () => {
  let lookup;

  beforeAll(() => {
    lookup = buildStoreLookup();
  });

  test('returns null for empty string', () => {
    expect(findBestStoreMatch('', lookup)).toBeNull();
  });

  test('returns null for null input', () => {
    expect(findBestStoreMatch(null, lookup)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(findBestStoreMatch(undefined, lookup)).toBeNull();
  });

  test('returns null for completely unrelated term', () => {
    expect(findBestStoreMatch('xyzabc123notastore', lookup)).toBeNull();
  });

  test('exact match returns EXACT quality', () => {
    const result = findBestStoreMatch('starbucks', lookup);
    expect(result).not.toBeNull();
    expect(result.quality).toBe(MATCH_QUALITY.EXACT);
    expect(result.displayName).toBe('Starbucks');
    expect(result.category).toBe('dining');
  });

  test('alias match returns EXACT quality', () => {
    const result = findBestStoreMatch('starbucks coffee', lookup);
    expect(result).not.toBeNull();
    expect(result.quality).toBe(MATCH_QUALITY.EXACT);
    expect(result.displayName).toBe('Starbucks');
  });

  test('partial match returns PARTIAL quality', () => {
    const result = findBestStoreMatch('whole foods market place', lookup);
    expect(result).not.toBeNull();
    expect(result.quality).toBe(MATCH_QUALITY.PARTIAL);
    expect(result.displayName).toBe('Whole Foods');
  });

  test('fuzzy match on typo returns FUZZY quality', () => {
    const result = findBestStoreMatch('starbuck', lookup);
    expect(result).not.toBeNull();
    expect(result.quality).toBe(MATCH_QUALITY.FUZZY);
    expect(result.displayName).toBe('Starbucks');
  });

  test('is case insensitive for exact match', () => {
    const lower = findBestStoreMatch('starbucks', lookup);
    const upper = findBestStoreMatch('STARBUCKS', lookup);
    const mixed = findBestStoreMatch('StArBuCkS', lookup);
    expect(lower?.displayName).toBe(upper?.displayName);
    expect(lower?.displayName).toBe(mixed?.displayName);
  });

  test('Shell does NOT match Sephora', () => {
    const result = findBestStoreMatch('sephora', lookup);
    expect(result?.displayName).not.toBe('Shell');
  });

  test('CVS matches drugstore category', () => {
    const result = findBestStoreMatch('cvs', lookup);
    expect(result?.category).toBe('drugstore');
  });

  test('United Airlines matches travel category', () => {
    const result = findBestStoreMatch('united airlines', lookup);
    expect(result?.category).toBe('travel');
  });
});

// ── buildResultsForCategory ───────────────────
describe('buildResultsForCategory', () => {
  test('returns empty array for empty cards list', () => {
    expect(buildResultsForCategory('dining', [])).toEqual([]);
  });

  test('returns empty array for null category', () => {
    expect(buildResultsForCategory(null, CARDS)).toEqual([]);
  });

  test('returns empty array for undefined category', () => {
    expect(buildResultsForCategory(undefined, CARDS)).toEqual([]);
  });

  test('results are sorted by rate descending', () => {
    const results = buildResultsForCategory('dining', CARDS);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].rate).toBeGreaterThanOrEqual(results[i + 1].rate);
    }
  });

  test('every result has rate and category fields', () => {
    const results = buildResultsForCategory('grocery', CARDS);
    results.forEach(result => {
      expect(result).toHaveProperty('rate');
      expect(result).toHaveProperty('category', 'grocery');
    });
  });

  test('falls back to 1 for unknown category', () => {
    const results = buildResultsForCategory('unknown_xyz', CARDS);
    results.forEach(result => {
      expect(result.rate).toBe(1);
    });
  });

  test('returns all cards for a valid category', () => {
    const results = buildResultsForCategory('grocery', CARDS);
    expect(results.length).toBe(CARDS.length);
  });

  test('first result is highest rate for grocery', () => {
    const results = buildResultsForCategory('grocery', CARDS);
    const maxRate = Math.max(...CARDS.map(c => c.categoryRates?.grocery ?? 1));
    expect(results[0].rate).toBe(maxRate);
  });
});

// ── generateOfferId ───────────────────────────
describe('generateOfferId', () => {
  test('same inputs always produce same ID', () => {
    const id1 = generateOfferId('Starbucks', 10, '2026-03-31');
    const id2 = generateOfferId('Starbucks', 10, '2026-03-31');
    expect(id1).toBe(id2);
  });

  test('different merchant produces different ID', () => {
    const id1 = generateOfferId('Starbucks', 10, '2026-03-31');
    const id2 = generateOfferId('Target', 10, '2026-03-31');
    expect(id1).not.toBe(id2);
  });

  test('different amount produces different ID', () => {
    const id1 = generateOfferId('Starbucks', 10, '2026-03-31');
    const id2 = generateOfferId('Starbucks', 15, '2026-03-31');
    expect(id1).not.toBe(id2);
  });

  test('different expiry produces different ID', () => {
    const id1 = generateOfferId('Starbucks', 10, '2026-03-31');
    const id2 = generateOfferId('Starbucks', 10, '2026-06-30');
    expect(id1).not.toBe(id2);
  });

  test('result is alphanumeric only', () => {
    const id = generateOfferId('Starbucks', 10, '2026-03-31');
    expect(id).toMatch(/^[a-zA-Z0-9]+$/);
  });

  test('result is max 20 characters', () => {
    const id = generateOfferId('Starbucks', 10, '2026-03-31');
    expect(id.length).toBeLessThanOrEqual(20);
  });
});

// ── generateCardId ────────────────────────────
describe('generateCardId', () => {
  test('produces correct lowercase slug', () => {
    expect(generateCardId('chase', 'Freedom Flex')).toBe('chase_freedom_flex');
  });

  test('strips special characters like ®', () => {
    const id = generateCardId('amex', 'Blue Cash Preferred®');
    expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  test('same inputs always produce same ID', () => {
    const id1 = generateCardId('chase', 'Sapphire Preferred');
    const id2 = generateCardId('chase', 'Sapphire Preferred');
    expect(id1).toBe(id2);
  });

  test('different banks produce different IDs', () => {
    const id1 = generateCardId('chase', 'Freedom Flex');
    const id2 = generateCardId('amex', 'Freedom Flex');
    expect(id1).not.toBe(id2);
  });

  test('collapses multiple spaces into single underscore', () => {
    const id = generateCardId('chase', 'Sapphire  Preferred');
    expect(id).not.toContain('__');
  });
});

// ── normalizeMerchant ─────────────────────────
describe('normalizeMerchant', () => {
  test('lowercases and takes first word', () => {
    expect(normalizeMerchant('Starbucks Coffee #1234')).toBe('starbucks');
  });

  test('strips numbers and special characters', () => {
    expect(normalizeMerchant('CVS/pharmacy #5678')).toBe('cvs');
  });

  test('handles single word merchant', () => {
    expect(normalizeMerchant('Amazon')).toBe('amazon');
  });

  test('handles already lowercase input', () => {
    expect(normalizeMerchant('target store')).toBe('target');
  });

  test('trims whitespace', () => {
    expect(normalizeMerchant('  Walmart  ')).toBe('walmart');
  });
});
