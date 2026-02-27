import { CATEGORIES, BANKS, CARDS, STORES, POPULAR_STORES, BANK_OFFER_URLS } from '../constants.js';

// ── CATEGORIES ────────────────────────────────
describe('CATEGORIES', () => {
  test('contains all required categories', () => {
    const required = ['grocery', 'dining', 'gas', 'drugstore', 'travel', 'shopping', 'subscription', 'other'];
    required.forEach(cat => {
      expect(Object.values(CATEGORIES)).toContain(cat);
    });
  });

  test('has no duplicate values', () => {
    const values = Object.values(CATEGORIES);
    const unique = [...new Set(values)];
    expect(values.length).toBe(unique.length);
  });
});

// ── BANKS ─────────────────────────────────────
describe('BANKS', () => {
  test('contains all required banks', () => {
    const required = ['amex', 'chase', 'citi', 'bofa', 'capital_one'];
    required.forEach(bank => {
      expect(Object.values(BANKS)).toContain(bank);
    });
  });

  test('has no duplicate values', () => {
    const values = Object.values(BANKS);
    const unique = [...new Set(values)];
    expect(values.length).toBe(unique.length);
  });
});

// ── CARDS ─────────────────────────────────────
describe('CARDS', () => {
  test('every card has all required fields', () => {
    const requiredFields = ['id', 'cardName', 'issuer', 'bank', 'annualFee', 'categoryRates', 'rewardType'];
    CARDS.forEach(card => {
      requiredFields.forEach(field => {
        expect(card).toHaveProperty(field);
      });
    });
  });

  test('every card has a fallback rate for OTHER category', () => {
    CARDS.forEach(card => {
      expect(card.categoryRates).toHaveProperty(CATEGORIES.OTHER);
      expect(card.categoryRates[CATEGORIES.OTHER]).toBeGreaterThan(0);
    });
  });

  test('every card id is unique', () => {
    const ids = CARDS.map(c => c.id);
    const unique = [...new Set(ids)];
    expect(ids.length).toBe(unique.length);
  });

  test('every card bank value matches a BANKS constant', () => {
    const bankValues = Object.values(BANKS);
    CARDS.forEach(card => {
      expect(bankValues).toContain(card.bank);
    });
  });

  test('all category rates are numbers greater than 0', () => {
    CARDS.forEach(card => {
      Object.entries(card.categoryRates).forEach(([cat, rate]) => {
        expect(typeof rate).toBe('number');
        expect(rate).toBeGreaterThan(0);
      });
    });
  });

  test('rewardType is either cashback or points', () => {
    CARDS.forEach(card => {
      expect(['cashback', 'points']).toContain(card.rewardType);
    });
  });

  test('annualFee is a non-negative number', () => {
    CARDS.forEach(card => {
      expect(typeof card.annualFee).toBe('number');
      expect(card.annualFee).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── STORES ────────────────────────────────────
describe('STORES', () => {
  test('every store has all required fields', () => {
    STORES.forEach(store => {
      expect(store).toHaveProperty('storeName');
      expect(store).toHaveProperty('category');
      expect(store).toHaveProperty('aliases');
    });
  });

  test('every store category matches a CATEGORIES constant', () => {
    const categoryValues = Object.values(CATEGORIES);
    STORES.forEach(store => {
      expect(categoryValues).toContain(store.category);
    });
  });

  test('every store name is unique', () => {
    const names = STORES.map(s => s.storeName);
    const unique = [...new Set(names)];
    expect(names.length).toBe(unique.length);
  });

  test('aliases is always an array', () => {
    STORES.forEach(store => {
      expect(Array.isArray(store.aliases)).toBe(true);
    });
  });

  test('no alias duplicates across all stores', () => {
    const allAliases = STORES.flatMap(s => s.aliases);
    const unique = [...new Set(allAliases)];
    expect(allAliases.length).toBe(unique.length);
  });
});

// ── POPULAR_STORES ────────────────────────────
describe('POPULAR_STORES', () => {
  test('every popular store exists in STORES', () => {
    const storeNames = STORES.map(s => s.storeName);
    POPULAR_STORES.forEach(name => {
      expect(storeNames).toContain(name);
    });
  });

  test('has no duplicates', () => {
    const unique = [...new Set(POPULAR_STORES)];
    expect(POPULAR_STORES.length).toBe(unique.length);
  });

  test('is a non-empty array', () => {
    expect(Array.isArray(POPULAR_STORES)).toBe(true);
    expect(POPULAR_STORES.length).toBeGreaterThan(0);
  });
});

// ── BANK_OFFER_URLS ───────────────────────────
describe('BANK_OFFER_URLS', () => {
  test('every key corresponds to a valid BANKS value', () => {
    const bankValues = Object.values(BANKS);
    Object.keys(BANK_OFFER_URLS).forEach(bank => {
      expect(bankValues).toContain(bank);
    });
  });

  test('every URL is a non-empty string', () => {
    Object.values(BANK_OFFER_URLS).forEach(url => {
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
    });
  });
});