import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK_LIST, FAQ_ITEMS } from '../shared/constants.js';

test('BANK_LIST replaces Discover with supported US Bank', () => {
  assert.equal(BANK_LIST.some((bank) => bank.id === 'discover'), false);
  const usBank = BANK_LIST.find((bank) => bank.id === 'us_bank');
  assert.ok(usBank);
  assert.equal(usBank.label, 'US Bank');
  assert.equal(usBank.supported, true);
});

test('FAQ lists US Bank as supported and not Discover', () => {
  const faq = FAQ_ITEMS.find((item) => item.q === 'Which banks are supported?');
  assert.ok(faq);
  const [supported, comingSoon] = faq.a.split('coming soon');
  assert.match(supported, /US Bank/);
  assert.equal(comingSoon.includes('US Bank'), false);
  assert.equal(faq.a.includes('Discover'), false);
});
