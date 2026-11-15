import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmexOffers, parseAmexValue } from './amex.js';

test('reads a dollar reward without treating the spend minimum as the reward', () => {
  const value = parseAmexValue('Spend $50 or more, earn $10 back');
  assert.equal(value.cashbackAmount, 10);
  assert.equal(value.cashbackType, 'fixed');
  assert.equal(value.minimumSpend, 50);
});

test('reads a percent reward and a membership rewards rate', () => {
  assert.deepEqual(parseAmexValue('Earn 10% back when you spend $25'), {
    cashbackAmount: 10,
    cashbackType: 'percent',
    minimumSpend: 25,
  });
  assert.equal(parseAmexValue('Earn +5 Membership Rewards points').cashbackType, 'points');
  assert.equal(parseAmexValue('Earn +5 Membership Rewards points').cashbackAmount, 5);
});

test('eligible merchant offers stay unactivated and enrolled offers are activated', () => {
  const eligible = parseAmexOffers({
    recommendedOffers: {
      offersList: {
        page1: [{ offerType: 'MERCHANT', title: 'Nike', shortDescription: '$10 back', offerId: 'A' }],
      },
    },
  }, 'eligible');
  assert.equal(eligible[0].isActivated, false);
  assert.equal(eligible[0].cashbackAmount, 10);

  const enrolled = parseAmexOffers({
    addedToCard: {
      offersList: {
        page1: [{ offerType: 'MERCHANT', title: 'Nike', shortDescription: 'Earn 5% back', offerId: 'B' }],
      },
    },
  }, 'enrolled');
  assert.equal(enrolled[0].isActivated, true);
  assert.equal(enrolled[0].cashbackType, 'percent');
});
