import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyOfferCategory,
  categoryForChip,
  enrichOffersWithCategoryKey,
  offerMatchesFilters,
  filterOffersForChips,
  sortOffersForList,
  banksPresentInOffers,
  bankChipLabel,
  formatOfferReward,
  normalizeSelectedBanks,
  OFFER_CATEGORY_CHIPS,
} from './offerFilters.js';
import { CATEGORIES } from '../shared/constants.js';

test('OFFER_CATEGORY_CHIPS covers All + Food/Groceries/Travel/Shopping/Gas/Other', () => {
  assert.deepEqual(
    OFFER_CATEGORY_CHIPS.map((c) => c.key),
    ['all', 'dining', 'grocery', 'travel', 'shopping', 'gas', 'other']
  );
  assert.equal(OFFER_CATEGORY_CHIPS.find((c) => c.key === 'dining').label, 'Food');
});

test('classifyOfferCategory trusts stored non-other category', () => {
  assert.equal(
    classifyOfferCategory({ merchantName: 'Random Cafe', category: 'travel' }),
    'travel'
  );
});

test('classifyOfferCategory falls back to popular stores when category is other', () => {
  assert.equal(
    classifyOfferCategory({ merchantName: 'Starbucks', category: 'other' }),
    CATEGORIES.DINING
  );
  assert.equal(
    classifyOfferCategory({ merchantName: 'Nike Store', category: 'other' }),
    CATEGORIES.SHOPPING
  );
  assert.equal(
    classifyOfferCategory({ merchantName: 'Target', category: '' }),
    CATEGORIES.GROCERY
  );
});

test('classifyOfferCategory uses keyword heuristics then other', () => {
  assert.equal(
    classifyOfferCategory({ merchantName: 'Skyline Airlines Lounge', category: 'other' }),
    CATEGORIES.TRAVEL
  );
  assert.equal(
    classifyOfferCategory({ merchantName: 'Joe Pizza Corner', category: 'other' }),
    CATEGORIES.DINING
  );
  assert.equal(
    classifyOfferCategory({ merchantName: 'Mystery Merchant XYZ', category: 'other' }),
    CATEGORIES.OTHER
  );
});

test('categoryForChip rolls drugstore/subscription into other', () => {
  assert.equal(categoryForChip(CATEGORIES.DINING), 'dining');
  assert.equal(categoryForChip(CATEGORIES.DRUGSTORE), 'other');
  assert.equal(categoryForChip(CATEGORIES.SUBSCRIPTION), 'other');
});

test('enrichOffersWithCategoryKey classifies once into categoryKey', () => {
  const enriched = enrichOffersWithCategoryKey([
    { merchantName: 'Starbucks', category: 'other', bank: 'chase' },
    { merchantName: 'Mystery', category: 'other', bank: 'citi' },
  ]);
  assert.equal(enriched[0].categoryKey, 'dining');
  assert.equal(enriched[1].categoryKey, 'other');
  // Same object fields preserved.
  assert.equal(enriched[0].bank, 'chase');
});

test('filterOffersForChips uses precomputed categoryKey without needing raw category', () => {
  const enriched = [
    { merchantName: 'A', categoryKey: 'dining', bank: 'chase', cashbackAmount: 5 },
    { merchantName: 'B', categoryKey: 'shopping', bank: 'citi', cashbackAmount: 3 },
    { merchantName: 'C', categoryKey: 'gas', bank: 'wells_fargo', cashbackAmount: 5 },
    { merchantName: 'D', categoryKey: 'other', bank: 'chase', cashbackAmount: 2 },
  ];

  const foodChase = filterOffersForChips(enriched, { category: 'dining', banks: ['chase'] });
  assert.equal(foodChase.length, 1);
  assert.equal(foodChase[0].merchantName, 'A');

  const multi = filterOffersForChips(enriched, { category: 'all', banks: ['chase', 'citi'] });
  assert.deepEqual(multi.map((o) => o.merchantName), ['A', 'B', 'D']);

  const emptyBanks = filterOffersForChips(enriched, { category: 'other', banks: [] });
  assert.deepEqual(emptyBanks.map((o) => o.merchantName), ['D']);
});

test('offerMatchesFilters treats empty banks as all; supports multi-select', () => {
  const offer = { merchantName: 'Nike', categoryKey: 'shopping', bank: 'citi' };
  assert.equal(offerMatchesFilters(offer, { category: 'all', banks: [] }), true);
  assert.equal(offerMatchesFilters(offer, { category: 'shopping', banks: [] }), true);
  assert.equal(offerMatchesFilters(offer, { category: 'all', banks: ['chase'] }), false);
  assert.equal(offerMatchesFilters(offer, { category: 'all', banks: ['chase', 'citi'] }), true);
  assert.equal(normalizeSelectedBanks([]), null);
  assert.equal(normalizeSelectedBanks(['chase']).has('chase'), true);
});

test('sortOffersForList is merchant A–Z then higher cashback', () => {
  const sorted = sortOffersForList([
    { merchantName: 'Target', cashbackAmount: 2 },
    { merchantName: 'Amazon', cashbackAmount: 1 },
    { merchantName: 'Target', cashbackAmount: 10 },
  ]);
  assert.deepEqual(
    sorted.map((o) => `${o.merchantName}:${o.cashbackAmount}`),
    ['Amazon:1', 'Target:10', 'Target:2']
  );
});

test('banksPresentInOffers and chip helpers', () => {
  assert.deepEqual(
    banksPresentInOffers([
      { bank: 'citi' },
      { bank: 'chase' },
      { bank: 'citi' },
      { bank: '' },
    ]),
    ['chase', 'citi']
  );
  assert.equal(bankChipLabel('us_bank'), 'US Bank');
  assert.equal(bankChipLabel('wells_fargo'), 'Wells');
  assert.equal(formatOfferReward(5, 'percent'), '5%');
  assert.equal(formatOfferReward(10, 'fixed'), '$10');
  assert.equal(formatOfferReward(0, 'percent'), 'Offer');
});
