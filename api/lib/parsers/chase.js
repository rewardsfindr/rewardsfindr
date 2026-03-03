// ─────────────────────────────────────────────
// CHASE OFFERS PARSER
// Parses raw HTML from Chase offers page using cheerio.
// Selectors are based on Chase's current DOM structure
// and may need tuning as Chase updates their frontend.
// ─────────────────────────────────────────────
import * as cheerio from 'cheerio';

/**
 * Parse raw Chase offers page HTML into a normalized offer array.
 * @param {string} html - Raw outerHTML captured from the Chase offers page
 * @returns {Array} offers - Array of normalized offer objects
 */
export function parseChaseOffers(html) {
  const $ = cheerio.load(html);
  const offers = [];

  // Chase renders offer tiles inside a list/grid.
  // Try multiple selector strategies in priority order.
  const tileSelector = [
    '[data-testid="offer-tile"]',
    '.offer-tile',
    '.offers-list-item',
    '[class*="OfferTile"]',
    '[class*="offer-card"]',
  ].join(', ');

  $(tileSelector).each((i, el) => {
    try {
      const $el = $(el);

      // ── Merchant Name ──────────────────────────────
      const merchantName = $el
        .find(
          '[data-testid="merchant-name"], .merchant-name, .offer-merchant, [class*="MerchantName"], [class*="merchantName"]'
        )
        .first()
        .text()
        .trim();

      if (!merchantName) return; // skip tiles without a merchant

      // ── Headline / Offer Value ──────────────────────
      const headlineText = $el
        .find(
          '[data-testid="offer-headline"], .offer-headline, .offer-title, [class*="OfferHeadline"], [class*="offerHeadline"]'
        )
        .first()
        .text()
        .trim();

      let cashbackAmount = 0;
      let cashbackType = 'percent';

      const percentMatch = headlineText.match(/(\d+(?:\.\d+)?)\s*%/);
      const dollarMatch = headlineText.match(/\$(\d+(?:\.\d+)?)/);

      if (percentMatch) {
        cashbackAmount = parseFloat(percentMatch[1]);
        cashbackType = 'percent';
      } else if (dollarMatch) {
        cashbackAmount = parseFloat(dollarMatch[1]);
        cashbackType = 'fixed';
      }

      // ── Description / Terms ────────────────────────
      const offerDescription = $el
        .find(
          '.offer-description, .offer-terms, [data-testid="offer-description"], [class*="OfferDescription"]'
        )
        .first()
        .text()
        .trim();

      // ── Minimum Spend ──────────────────────────────
      let minimumSpend = 0;
      const combinedText = (headlineText + ' ' + offerDescription).toLowerCase();
      const minSpendMatch = combinedText.match(/(?:spend|purchase)\s+\$?(\d+)/);
      if (minSpendMatch) minimumSpend = parseFloat(minSpendMatch[1]);

      // ── Expiry Date ────────────────────────────────
      const expiryText = $el
        .find(
          '.expiration-date, .offer-expiry, [data-testid="expiry-date"], [class*="ExpiryDate"], [class*="expirationDate"]'
        )
        .first()
        .text()
        .trim();

      let expiryDate = null;
      if (expiryText) {
        const cleaned = expiryText.replace(/expires?/i, '').trim();
        const parsed = new Date(cleaned);
        if (!isNaN(parsed.getTime())) expiryDate = parsed.toISOString();
      }

      // ── Activation Status ──────────────────────────
      const btnText = $el.find('button').text().toLowerCase();
      const isActivated =
        btnText.includes('added') ||
        btnText.includes('activated') ||
        btnText.includes('remove') ||
        $el.find('[class*="activated"], [class*="added"]').length > 0;

      offers.push({
        merchantName,
        offerDescription,
        cashbackAmount,
        cashbackType,
        minimumSpend,
        category: 'other', // TODO: infer from merchant if needed
        expiryDate,
        isActivated,
      });
    } catch (err) {
      console.error('⚠️ Error parsing Chase offer tile:', err);
    }
  });

  return offers;
}
