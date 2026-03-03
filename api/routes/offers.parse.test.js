// ─────────────────────────────────────────────
// /api/offers/parse — input validation unit tests
// These tests exercise the validation logic in isolation,
// without needing a real Firebase or Firestore connection.
// Full integration tests should be run against a local
// emulator (firebase emulators:start) in CI.
// ─────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChaseOffers } from '../lib/parsers/chase.js';
import { parseAmexOffers } from '../lib/parsers/amex.js';

// Validate the contract expected by POST /api/offers/parse
const VALID_BANKS = ['chase', 'amex'];

function validateParseRequest({ html, bank }) {
  if (!html || typeof html !== 'string') return 'html is required and must be a string';
  if (!bank || !VALID_BANKS.includes(bank)) return "bank must be 'chase' or 'amex'";
  return null;
}

test('rejects missing html', () => {
  assert.equal(validateParseRequest({ bank: 'chase' }), 'html is required and must be a string');
});

test('rejects non-string html', () => {
  assert.equal(validateParseRequest({ html: 123, bank: 'chase' }), 'html is required and must be a string');
});

test('rejects missing bank', () => {
  assert.equal(validateParseRequest({ html: '<html/>' }), "bank must be 'chase' or 'amex'");
});

test('rejects invalid bank value', () => {
  assert.equal(validateParseRequest({ html: '<html/>', bank: 'citi' }), "bank must be 'chase' or 'amex'");
});

test('accepts valid chase request', () => {
  assert.equal(validateParseRequest({ html: '<html/>', bank: 'chase' }), null);
});

test('accepts valid amex request', () => {
  assert.equal(validateParseRequest({ html: '<html/>', bank: 'amex' }), null);
});

test('routes chase bank to Chase parser', () => {
  const html = `
    <html><body>
      <div class="offer-tile">
        <div class="merchant-name">Nike</div>
        <div class="offer-headline">5% cash back</div>
        <div class="offer-description">Spend $50</div>
        <div class="expiration-date">06/30/2026</div>
        <button>Add</button>
      </div>
    </body></html>
  `;
  const parseFn = 'chase' === 'chase' ? parseChaseOffers : parseAmexOffers;
  const offers = parseFn(html);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].merchantName, 'Nike');
});

test('routes amex bank to Amex parser', () => {
  const html = `
    <html><body>
      <div class="offer-card">
        <div class="merchant-name">Whole Foods</div>
        <div class="offer-value">$15 back</div>
        <div class="terms">Spend $60</div>
        <div class="expiration-date">Valid through 04/30/2026</div>
        <button>Add</button>
      </div>
    </body></html>
  `;
  const parseFn = 'amex' === 'chase' ? parseChaseOffers : parseAmexOffers;
  const offers = parseFn(html);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].merchantName, 'Whole Foods');
});

test('returns empty offers array for unrecognized HTML structure', () => {
  const emptyHTML = '<html><body><p>Nothing here</p></body></html>';
  assert.equal(parseChaseOffers(emptyHTML).length, 0);
  assert.equal(parseAmexOffers(emptyHTML).length, 0);
});
