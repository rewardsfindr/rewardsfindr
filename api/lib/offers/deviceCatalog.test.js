import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amexRecords,
  chaseRecords,
  filterOffers,
  replaceCardOffers,
} from './deviceCatalog.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

test('stores a Chase tile under the bank offer id and drops that card on the next snapshot', () => {
  const first = chaseRecords({
    cardName: 'Sapphire Reserve (...0483)',
    cardLast4: '0483',
    gridFound: true,
    tileCount: 1,
    now: NOW,
    rawOffers: [{
      bankOfferId: 'FIGG:1894293',
      tileId: 'carousel_0_FIGG:1894293',
      merchantName: 'Starbucks',
      valueText: '10% cash back',
      daysLeft: '22d left',
      isActivated: false,
    }],
  });
  assert.equal(first.length, 1);
  assert.equal(first[0].id, 'chase_sapphire-reserve-0483_FIGG:1894293');
  assert.equal(first[0].expiryPrecision, 'day-count');
  assert.equal(first[0].cardLast4, '0483');

  const second = chaseRecords({
    cardName: 'Sapphire Reserve (...0483)',
    gridFound: true,
    tileCount: 1,
    now: NOW,
    rawOffers: [{
      bankOfferId: 'FIGG:2',
      merchantName: 'Target',
      valueText: '$5',
      daysLeft: '',
      isActivated: true,
    }],
  });
  const catalog = replaceCardOffers(first, {
    bank: 'chase',
    cardName: 'Sapphire Reserve (...0483)',
    phase: '',
    records: second,
  });
  assert.deepEqual(catalog.map(offer => offer.merchantName), ['Target']);
  assert.equal(catalog[0].expiryPrecision, 'unknown');
});

test('refuses a Chase snapshot that saw tiles but no offer ids', () => {
  assert.throws(
    () => chaseRecords({
      cardName: 'Freedom Flex (...1111)',
      gridFound: true,
      tileCount: 2,
      rawOffers: [{ merchantName: 'Nike', valueText: '5%' }],
      now: NOW,
    }),
    /Nothing was changed/
  );
});

test('an empty Chase grid clears that card and leaves the other card alone', () => {
  const existing = [
    { id: 'a', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
    { id: 'b', bank: 'chase', cardName: 'Reserve', phase: '', merchantName: 'Target' },
  ];
  const records = chaseRecords({
    cardName: 'Freedom',
    gridFound: true,
    tileCount: 0,
    rawOffers: [],
    now: NOW,
  });
  const next = replaceCardOffers(existing, {
    bank: 'chase',
    cardName: 'Freedom',
    phase: '',
    records,
  });
  assert.deepEqual(next.map(offer => offer.id), ['b']);
});

test('Amex eligible and enrolled rows for one card stay separate', () => {
  const json = {
    recommendedOffers: {
      offersList: {
        page1: [{
          offerType: 'MERCHANT',
          title: 'Whole Foods',
          shortDescription: '$10 back',
          offerId: 'AX1',
          expiration: { text: '04/30/2026' },
        }],
      },
    },
  };
  const eligible = amexRecords({
    cardName: 'Gold (...2001)',
    cardLast4: '2001',
    json,
    phase: 'eligible',
    now: NOW,
  });
  const enrolled = amexRecords({
    cardName: 'Gold (...2001)',
    json: { addedToCard: { offersList: { page1: [] } } },
    phase: 'enrolled',
    now: NOW,
  });
  const catalog = replaceCardOffers(
    replaceCardOffers([], { bank: 'amex', cardName: 'Gold (...2001)', phase: 'eligible', records: eligible }),
    { bank: 'amex', cardName: 'Gold (...2001)', phase: 'enrolled', records: enrolled }
  );
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].bankOfferId, 'AX1');
  assert.equal(catalog[0].phase, 'eligible');
  assert.equal(catalog[0].expiryPrecision, 'date');
});

test('search returns a current prefix match and hides an expired offer', () => {
  const offers = [
    {
      merchantName: 'Starbucks',
      merchantNameLower: 'starbucks',
      expiryPrecision: 'date',
      expiresAt: NOW.getTime() + 86_400_000,
    },
    {
      merchantName: 'Starbucks Reserve',
      merchantNameLower: 'starbucks reserve',
      expiryPrecision: 'date',
      expiresAt: NOW.getTime() - 86_400_000,
    },
    {
      merchantName: 'Target',
      merchantNameLower: 'target',
      expiryPrecision: 'unknown',
      expiresAt: null,
    },
  ];
  const found = filterOffers(offers, 'star', NOW);
  assert.deepEqual(found.map(offer => offer.merchantName), ['Starbucks']);
});
