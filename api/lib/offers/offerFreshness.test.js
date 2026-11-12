import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentOffer } from './offerFreshness.js';

test('offers with no expiry field stay in search results', () => {
  assert.equal(isCurrentOffer({ merchantName: 'Nike' }, new Date()), true);
});
