import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChaseOffers } from './chase.js';

const makeChaseHTML = ({ merchant, headline, description, expiry, btnText }) => `
  <html><body>
    <div class="offer-tile">
      <div class="merchant-name">${merchant}</div>
      <div class="offer-headline">${headline}</div>
      <div class="offer-description">${description}</div>
      <div class="expiration-date">${expiry}</div>
      <button>${btnText}</button>
    </div>
  </body></html>
`;

test('parses a percent cashback Chase offer', () => {
  const html = makeChaseHTML({
    merchant: 'Nike',
    headline: '5% cash back',
    description: 'Spend $50 or more at Nike.com',
    expiry: 'Expires 06/30/2026',
    btnText: 'Add to card',
  });

  const offers = parseChaseOffers(html);
  assert.equal(offers.length, 1);
  const [offer] = offers;
  assert.equal(offer.merchantName, 'Nike');
  assert.equal(offer.cashbackAmount, 5);
  assert.equal(offer.cashbackType, 'percent');
  assert.equal(offer.minimumSpend, 50);
  assert.equal(offer.isActivated, false);
  assert.ok(offer.expiryDate, 'expiryDate should be set');
});

test('parses a fixed dollar cashback Chase offer', () => {
  const html = makeChaseHTML({
    merchant: 'Marriott',
    headline: '$25 cash back',
    description: 'Book a stay at Marriott',
    expiry: 'Expires 12/31/2026',
    btnText: 'Add to card',
  });

  const offers = parseChaseOffers(html);
  const [offer] = offers;
  assert.equal(offer.cashbackAmount, 25);
  assert.equal(offer.cashbackType, 'fixed');
});

test('detects activated offer from button text', () => {
  const html = makeChaseHTML({
    merchant: 'Starbucks',
    headline: '10% cash back',
    description: 'At Starbucks',
    expiry: 'Expires 03/31/2026',
    btnText: 'Added to card',
  });

  const [offer] = parseChaseOffers(html);
  assert.equal(offer.isActivated, true);
});

test('skips tiles with no merchant name', () => {
  const html = `
    <html><body>
      <div class="offer-tile">
        <div class="offer-headline">5% cash back</div>
      </div>
    </body></html>
  `;
  const offers = parseChaseOffers(html);
  assert.equal(offers.length, 0);
});

test('returns empty array for HTML with no offer tiles', () => {
  const offers = parseChaseOffers('<html><body><p>No offers</p></body></html>');
  assert.equal(offers.length, 0);
});

test('parses multiple offer tiles', () => {
  const html = `
    <html><body>
      <div class="offer-tile">
        <div class="merchant-name">Nike</div>
        <div class="offer-headline">5% cash back</div>
        <div class="offer-description">Spend $50</div>
        <div class="expiration-date">06/30/2026</div>
        <button>Add</button>
      </div>
      <div class="offer-tile">
        <div class="merchant-name">Apple</div>
        <div class="offer-headline">3% cash back</div>
        <div class="offer-description">On Apple.com</div>
        <div class="expiration-date">09/30/2026</div>
        <button>Add</button>
      </div>
    </body></html>
  `;
  const offers = parseChaseOffers(html);
  assert.equal(offers.length, 2);
  assert.equal(offers[0].merchantName, 'Nike');
  assert.equal(offers[1].merchantName, 'Apple');
});
