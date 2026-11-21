import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyOfferCategory,
  categoryForChip,
  offerMatchesFilters,
  filterOffersForChips,
  sortOffersForList,
  banksPresentInOffers,
  bankChipLabel,
  formatOfferReward,
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

test('filterOffersForChips applies category AND bank', () => {
  const offers = [
    { merchantName: 'Starbucks', category: 'other', bank: 'chase', cashbackAmount: 5 },
    { merchantName: 'Nike', category: 'other', bank: 'citi', cashbackAmount: 3 },
    { merchantName: 'Chevron', category: 'gas', bank: 'wells_fargo', cashbackAmount: 5 },
    { merchantName: 'Unknown Mart', category: 'other', bank: 'chase', cashbackAmount: 2 },
  ];

  const foodChase = filterOffersForChips(offers, { category: 'dining', bank: 'chase' });
  assert.equal(foodChase.length, 1);
  assert.equal(foodChase[0].merchantName, 'Starbucks');

  const otherAll = filterOffersForChips(offers, { category: 'other', bank: 'all' });
  assert.deepEqual(otherAll.map((o) => o.merchantName), ['Unknown Mart']);

  const allWells = filterOffersForChips(offers, { category: 'all', bank: 'wells_fargo' });
  assert.equal(allWells.length, 1);
  assert.equal(allWells[0].merchantName, 'Chevron');
});

test('offerMatchesFilters treats All as no-op on each axis', () => {
  const offer = { merchantName: 'Nike', category: 'other', bank: 'citi' };
  assert.equal(offerMatchesFilters(offer, { category: 'all', bank: 'all' }), true);
  assert.equal(offerMatchesFilters(offer, { category: 'shopping', bank: 'all' }), true);
  assert.equal(offerMatchesFilters(offer, { category: 'all', bank: 'chase' }), false);
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
