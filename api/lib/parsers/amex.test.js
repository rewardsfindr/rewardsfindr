import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmexOffers } from './amex.js';

const makeAmexHTML = ({ merchant, value, description, expiry, btnText = 'Add to Card' }) => `
  <html><body>
    <div class="offer-card">
      <div class="merchant-name">${merchant}</div>
      <div class="offer-value">${value}</div>
      <div class="terms">${description}</div>
      <div class="expiration-date">${expiry}</div>
      <button>${btnText}</button>
    </div>
  </body></html>
`;

test('parses a fixed dollar Amex offer', () => {
  const html = makeAmexHTML({
    merchant: 'Whole Foods Market',
    value: '$15 back',
    description: 'Spend $60 or more',
    expiry: 'Valid through 04/30/2026',
  });

  const offers = parseAmexOffers(html);
  assert.equal(offers.length, 1);
  const [offer] = offers;
  assert.equal(offer.merchantName, 'Whole Foods Market');
  assert.equal(offer.cashbackAmount, 15);
  assert.equal(offer.cashbackType, 'fixed');
  assert.equal(offer.minimumSpend, 60);
  assert.equal(offer.isActivated, false);
});

test('parses a percent cashback Amex offer', () => {
  const html = makeAmexHTML({
    merchant: 'Delta',
    value: '10% back',
    description: 'On Delta flights',
    expiry: 'Valid through 12/31/2026',
  });

  const [offer] = parseAmexOffers(html);
  assert.equal(offer.cashbackAmount, 10);
  assert.equal(offer.cashbackType, 'percent');
});

test('detects enrolled/activated offer', () => {
  const html = makeAmexHTML({
    merchant: 'Amazon',
    value: '$20 back',
    description: 'Spend $100',
    expiry: 'Valid through 06/30/2026',
    btnText: 'Remove Offer',
  });

  const [offer] = parseAmexOffers(html);
  assert.equal(offer.isActivated, true);
});

test('skips cards with no merchant name', () => {
  const html = `
    <html><body>
      <div class="offer-card">
        <div class="offer-value">$10 back</div>
      </div>
    </body></html>
  `;
  const offers = parseAmexOffers(html);
  assert.equal(offers.length, 0);
});

test('returns empty array for HTML with no offer cards', () => {
  const offers = parseAmexOffers('<html><body><p>No offers</p></body></html>');
  assert.equal(offers.length, 0);
});
