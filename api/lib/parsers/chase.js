// ─────────────────────────────────────────────
// CHASE OFFERS PARSER
// Selectors based on real Chase DOM (inspected March 2026).
// Tile:     [data-testid="commerce-tile"]
// Merchant: span.r9jbijk  (mds-body-small-heavier)
// Value:    span.r9jbijj  (mds-body-large-heavier)
// Activated: aria-label ends with "Remove Offer" (vs "Add Offer")
// ─────────────────────────────────────────────
import * as cheerio from 'cheerio';

/**
 * Parse raw Chase offers page HTML into a normalized offer array.
 * @param {string} html - HTML captured from the Chase offers grid
 * @returns {Array} offers
 */
export function parseChaseOffers(html) {
  const $ = cheerio.load(html);
  const offers = [];
  const seen = new Set();

  $('[data-testid="commerce-tile"]').each((i, el) => {
    try {
      const $el = $(el);

      // Merchant name
      const merchantName = $el.find('span.r9jbijk').first().text().trim();
      if (!merchantName) return;

      // Deduplicate (carousel + grid both render tiles)
      if (seen.has(merchantName.toLowerCase())) return;
      seen.add(merchantName.toLowerCase());

      // Cashback value — e.g. "25% back", "$20 cash back", "20% cash back"
      const valueText = $el.find('span.r9jbijj').first().text().trim();

      let cashbackAmount = 0;
      let cashbackType = 'percent';

      const percentMatch = valueText.match(/(\d+(?:\.\d+)?)\s*%/);
      const dollarMatch  = valueText.match(/\$(\d+(?:\.\d+)?)/);

      if (percentMatch) {
        cashbackAmount = parseFloat(percentMatch[1]);
        cashbackType = 'percent';
      } else if (dollarMatch) {
        cashbackAmount = parseFloat(dollarMatch[1]);
        cashbackType = 'fixed';
      }

      // Activation status — aria-label ends with "Add Offer" when not activated
      const ariaLabel = ($el.attr('aria-label') || '').toLowerCase();
      const isActivated = !ariaLabel.includes('add offer');

      offers.push({
        merchantName,
        offerDescription: valueText,
        cashbackAmount,
        cashbackType,
        minimumSpend: 0,
        category: 'other',
        expiryDate: null,
        isActivated,
      });
    } catch (err) {
      console.error('⚠️ Error parsing Chase offer tile:', err);
    }
  });

  console.log(`🔍 Chase parser found ${offers.length} tiles from ${$('[data-testid="commerce-tile"]').length} total`);
  return offers;
}
