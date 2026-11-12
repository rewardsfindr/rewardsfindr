import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveChaseExpiry,
  chaseOfferDocId,
  normalizeChaseSnapshotOffer,
  assertSnapshotSafe,
  planChaseSnapshot,
  toChaseOfferFields,
} from './chaseSnapshot.js';
import { isCurrentOffer } from './offerFreshness.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

test('converts a days-left banner into a timestamp', () => {
  const expiry = resolveChaseExpiry('22d left', NOW);
  assert.equal(expiry.expiryPrecision, 'day-count');
  assert.equal(expiry.expiresAtMs, NOW.getTime() + 22 * 24 * 60 * 60 * 1000);
  assert.equal(expiry.expiryDate, new Date(expiry.expiresAtMs).toISOString());
});

test('parses an explicit calendar date without shifting the month', () => {
  const expiry = resolveChaseExpiry('Expires 06/30/2026', NOW);
  assert.equal(expiry.expiryPrecision, 'date');
  assert.equal(expiry.expiresAtMs, Date.UTC(2026, 5, 30));
});

test('leaves a missing or unrecognized expiry unknown', () => {
  for (const text of ['', '   ', 'Limited time', 'Ends soon']) {
    const expiry = resolveChaseExpiry(text, NOW);
    assert.equal(expiry.expiryPrecision, 'unknown');
    assert.equal(expiry.expiryDate, null);
    assert.equal(expiry.expiresAtMs, null);
  }
});

test('builds a stable document id from the Chase offer id and card', () => {
  const card = 'Sapphire Reserve (...0483)';
  const first = chaseOfferDocId('FIGG:1894293', card);
  const second = chaseOfferDocId('FIGG:1894293', card);
  assert.equal(first, second);
  assert.equal(first.includes('/'), false);
  assert.notEqual(chaseOfferDocId('FIGG:1894293', 'Freedom Flex (...1111)'), first);
  assert.notEqual(chaseOfferDocId('FIGG:999', card), first);
});

test('normalizes a structured tile and keeps unknown expiry off the clock', () => {
  const offer = normalizeChaseSnapshotOffer({
    bankOfferId: 'FIGG:1894293',
    merchantName: 'Nike',
    valueText: '10% back',
    daysLeft: '',
    isActivated: false,
    tileId: 'carousel_0_FIGG:1894293',
  }, NOW);

  assert.equal(offer.cashbackAmount, 10);
  assert.equal(offer.cashbackType, 'percent');
  assert.equal(offer.expiryPrecision, 'unknown');
  assert.equal(offer.expiresAtMs, null);
  assert.match(offer.offerDeepLink, /offerId=carousel_0_FIGG%3A1894293/);
});

test('drops tiles that have no Chase offer id', () => {
  assert.equal(normalizeChaseSnapshotOffer({ merchantName: 'Nike', valueText: '5%' }, NOW), null);
});

test('refuses to snapshot when tiles were seen but none were identifiable', () => {
  assert.equal(assertSnapshotSafe({ gridFound: false, tileCount: 0, normalizedCount: 0 }),
    'Chase offers grid was not found. Nothing was changed.');
  assert.ok(assertSnapshotSafe({ gridFound: true, tileCount: 12, normalizedCount: 0 }));
  assert.equal(assertSnapshotSafe({ gridFound: true, tileCount: 0, normalizedCount: 0 }), null);
});

test('snapshot deletes rows the latest sync did not see', () => {
  const keep = normalizeChaseSnapshotOffer({
    bankOfferId: 'FIGG:1',
    merchantName: 'Nike',
    valueText: '$25 back',
    daysLeft: '3 days left',
  }, NOW);
  const plan = planChaseSnapshot({
    existingIds: ['chase_sapphire-reserve-0483_FIGG:1', 'stale-hash-id'],
    offers: [keep],
    cardName: 'Sapphire Reserve (...0483)',
  });

  assert.deepEqual(plan.deletes, ['stale-hash-id']);
  assert.equal(plan.upserts.length, 1);
  assert.equal(plan.upserts[0].offer.cashbackType, 'fixed');
  assert.equal(plan.upserts[0].offer.expiryPrecision, 'day-count');
});

test('stored chase fields do not invent an expiry', () => {
  const offer = normalizeChaseSnapshotOffer({
    bankOfferId: 'FIGG:2',
    merchantName: 'Starbucks',
    valueText: '5% back',
    daysLeft: 'Ends soon',
  }, NOW);
  const fields = toChaseOfferFields(offer, {
    userId: 'user-1',
    cardName: 'Freedom Flex (...2222)',
  });

  assert.equal(fields.expiryPrecision, 'unknown');
  assert.equal(fields.expiryDate, null);
  assert.equal(fields.phase, '');
  assert.equal(fields.bank, 'chase');
  assert.equal(fields.bankOfferId, 'FIGG:2');
  assert.equal(Object.hasOwn(fields, 'expiresAt'), false);
});

test('unknown expiry stays searchable and a past date does not', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');
  assert.equal(isCurrentOffer({ expiryPrecision: 'unknown', expiresAt: null }, now), true);
  assert.equal(isCurrentOffer({ expiresAt: '2026-05-01T00:00:00.000Z' }, now), false);
  assert.equal(isCurrentOffer({ expiresAt: '2026-07-01T00:00:00.000Z' }, now), true);
  assert.equal(isCurrentOffer({ expiresAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') } }, now), false);
});
