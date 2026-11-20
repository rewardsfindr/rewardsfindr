import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK_COLORS, bankLabel } from './resultsBankDisplay.js';

test('results bankLabel and BANK_COLORS map us_bank and drop discover', () => {
  assert.equal(bankLabel('us_bank'), 'US BANK');
  assert.equal(BANK_COLORS.us_bank, '#0c2074');
  assert.equal(Object.hasOwn(BANK_COLORS, 'discover'), false);
  assert.equal(bankLabel('chase'), 'CHASE');
  assert.equal(bankLabel(''), '');
  assert.equal(bankLabel(null), '');
});
