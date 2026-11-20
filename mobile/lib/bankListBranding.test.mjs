import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK_LIST, FAQ_ITEMS } from '../shared/constants.js';

test('BANK_LIST replaces Discover with Coming Soon US Bank', () => {
  assert.equal(BANK_LIST.some((bank) => bank.id === 'discover'), false);
  const usBank = BANK_LIST.find((bank) => bank.id === 'us_bank');
  assert.ok(usBank);
  assert.equal(usBank.label, 'US Bank');
  assert.equal(usBank.supported, false);
});

test('FAQ coming-soon list names US Bank and not Discover', () => {
  const faq = FAQ_ITEMS.find((item) => item.q === 'Which banks are supported?');
  assert.ok(faq);
  assert.match(faq.a, /US Bank/);
  assert.equal(faq.a.includes('Discover'), false);
});
