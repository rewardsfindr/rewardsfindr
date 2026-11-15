import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECT_BANK_COPY,
  ONBOARDING_PAGES,
  buildSyncedBanksUpdate,
  getOnboardingCta,
  nextOnboardingIndex,
} from './onboardingContent.js';

test('onboarding has exactly three product-aligned pages', () => {
  assert.equal(ONBOARDING_PAGES.length, 3);
  assert.deepEqual(ONBOARDING_PAGES.map((p) => p.key), ['value', 'sync', 'search']);
  assert.match(ONBOARDING_PAGES[1].body, /Chase and Amex/);
  assert.match(ONBOARDING_PAGES[1].body, /never store your bank password/i);
  assert.equal(ONBOARDING_PAGES[2].cta, 'Get started');
});

test('connect-bank copy names live banks only', () => {
  assert.equal(CONNECT_BANK_COPY.chaseCta, 'Sync Chase');
  assert.equal(CONNECT_BANK_COPY.amexCta, 'Sync Amex');
  assert.match(CONNECT_BANK_COPY.footnote, /Capital One, Citi/);
});

test('nextOnboardingIndex advances then finishes', () => {
  assert.equal(nextOnboardingIndex(0), 1);
  assert.equal(nextOnboardingIndex(1), 2);
  assert.equal(nextOnboardingIndex(2), null);
  assert.equal(getOnboardingCta(0), 'Next');
  assert.equal(getOnboardingCta(2), 'Get started');
  assert.equal(getOnboardingCta(-1), null);
});

test('buildSyncedBanksUpdate merges bank snapshot metadata', () => {
  const before = Date.now();
  const next = buildSyncedBanksUpdate(
    { chase: { cards: 1, lastSyncedAt: 1 } },
    'amex',
    [{ cardName: 'Blue Cash' }, { cardName: 'Gold' }],
  );
  assert.equal(next.chase.cards, 1);
  assert.equal(next.amex.cards, 2);
  assert.ok(next.amex.lastSyncedAt >= before);
  assert.equal(buildSyncedBanksUpdate(null, 'chase', null).chase.cards, 0);
});
