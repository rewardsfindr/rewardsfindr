// ─────────────────────────────────────────────
// CHASE OFFERS PARSER
// Selectors based on real Chase DOM (inspected March 2026).
// Tile:      [data-testid="commerce-tile"]
// Merchant:  span.r9jbijk  (mds-body-small-heavier)
// Value:     span.r9jbijj  (mds-body-large-heavier)
// Activated: aria-label contains "Add Offer" when NOT activated
// tileId:    id attr e.g. "carousel_0_FIGG:1894293" → used for deep link
// Expiry + MinSpend: NOT available in grid tile HTML (Chase renders
//   these in a click-to-open detail modal, outside the captured DOM).
// ─────────────────────────────────────────────
import * as cheerio from 'cheerio';

const CHASE_OFFERS_BASE_URL = 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub';

function parsePurchaseType(text) {
  const lower = text.toLowerCase();
  const hasOnline = lower.includes('online');
  const hasInStore = lower.includes('in-store') || lower.includes('in store') || lower.includes('in-stores');
  if (hasOnline && hasInStore) return 'both';
  if (hasOnline) return 'online';
  if (hasInStore) return 'in-store';
  return null;
}

export function parseChaseOffers(html) {
  const $ = cheerio.load(html);
  const offers = [];
  const seen = new Set();

  $('[data-testid="commerce-tile"]').each((i, el) => {
    try {
      const $el = $(el);

      const merchantName = $el.find('span.r9jbijk').first().text().trim();
      if (!merchantName) return;

      if (seen.has(merchantName.toLowerCase())) return;
      seen.add(merchantName.toLowerCase());

      const valueText = $el.find('span.r9jbijj').first().text().trim();

      let cashbackAmount = 0;
      let cashbackType = 'percent';
      const percentMatch = valueText.match(/(\d+(?:\.\d+)?)\s*%/);
      const dollarMatch  = valueText.match(/\$(\d+(?:\.\d+)?)/);
      if (percentMatch) { cashbackAmount = parseFloat(percentMatch[1]); cashbackType = 'percent'; }
      else if (dollarMatch) { cashbackAmount = parseFloat(dollarMatch[1]); cashbackType = 'fixed'; }

      const ariaLabel  = $el.attr('aria-label') || '';
      const isActivated = !ariaLabel.toLowerCase().includes('add offer');
      const purchaseType = parsePurchaseType($el.text());

      // Extract tile ID for deep link — format: "carousel_0_FIGG:1894293"
      // The offer hub URL with ?offerId= opens the detail modal directly.
      const tileId = $el.attr('id') || '';
      const offerDeepLink = tileId
        ? `${CHASE_OFFERS_BASE_URL}?offerId=${encodeURIComponent(tileId)}`
        : CHASE_OFFERS_BASE_URL;

      offers.push({
        merchantName,
        offerDescription: valueText,
        cashbackAmount,
        cashbackType,
        minimumSpend: 0,
        expiryDate: null,
        purchaseType,
        category: 'other',
        isActivated,
        offerDeepLink,
      });
    } catch (err) {
      console.error('⚠️ Error parsing Chase offer tile:', err);
    }
  });

  console.log(`🔍 Chase parser found ${offers.length} tiles from ${$('[data-testid="commerce-tile"]').length} total`);
  return offers;
}
