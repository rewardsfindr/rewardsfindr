import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOfferExpiry,
  replaceCardPass,
  resultsRouteParams,
  summarizeSyncCards,
} from './savedOffers.js';

test('search navigation carries the store name and leaves the offer list on the phone', () => {
  assert.deepEqual(resultsRouteParams('bose', [{ merchantName: 'Bose' }]), {
    pathname: '/results',
    params: { storeName: 'bose' },
  });
  assert.deepEqual(resultsRouteParams('bose', []), {
    pathname: '/results',
    params: { notFound: 'bose' },
  });
  assert.equal(Object.hasOwn(resultsRouteParams('bose', [{ merchantName: 'Bose' }]).params, 'offers'), false);
});

test('formats a known expiry and stays blank when the bank sent none', () => {
  assert.equal(formatOfferExpiry({ expiryDate: '2026-12-31T00:00:00.000Z' }), 'Expires Dec 31, 2026');
  assert.equal(formatOfferExpiry({ expiresAt: Date.parse('2027-02-02T00:00:00.000Z') }), 'Expires Feb 2, 2027');
  assert.equal(formatOfferExpiry({ expiryDate: null, expiresAt: null }), '');
  assert.equal(formatOfferExpiry({}), '');
});

test('sync summary counts every card the same way', () => {
  const summary = summarizeSyncCards([
    { cardName: 'Blue Cash', count: 88, phase: 'eligible' },
    { cardName: 'Blue Cash', count: 3, phase: 'enrolled' },
    { cardName: 'Platinum', count: 95, phase: 'eligible' },
  ]);
  assert.equal(summary.cardCount, 2);
  assert.equal(summary.lines, 'Blue Cash: 91 offers\nPlatinum: 95 offers');
});

test('a later pass for the same card and phase replaces the earlier count', () => {
  const first = replaceCardPass([], { cardName: 'Platinum', count: 80, phase: 'eligible' });
  const second = replaceCardPass(first, { cardName: 'Platinum', count: 95, phase: 'eligible' });
  const enrolled = replaceCardPass(second, { cardName: 'Platinum', count: 2, phase: 'enrolled' });
  assert.equal(second.length, 1);
  assert.equal(second[0].count, 95);
  assert.equal(enrolled.length, 2);
});
