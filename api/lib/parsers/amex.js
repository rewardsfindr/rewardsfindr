// ─────────────────────────────────────────────
// AMEX OFFERS PARSER
// Parses raw HTML from the Amex Offers & Benefits page.
// Selectors target americanexpress.com/en-us/benefits/offers/
// and may need tuning as Amex updates their frontend.
// ─────────────────────────────────────────────
import * as cheerio from 'cheerio';

/**
 * Parse raw Amex offers page HTML into a normalized offer array.
 * @param {string} html - Raw outerHTML captured from the Amex offers page
 * @returns {Array} offers - Array of normalized offer objects
 */
export function parseAmexOffers(html) {
  const $ = cheerio.load(html);
  const offers = [];

  // Amex renders offer cards in a grid. Try multiple selector strategies.
  const cardSelector = [
    '[data-module-name="offer-module"]',
    '[class*="OfferCard"]',
    '[class*="offer-card"]',
    '.offer-card',
    '[data-testid="offer-card"]',
  ].join(', ');

  $(cardSelector).each((i, el) => {
    try {
      const $el = $(el);

      // ── Merchant Name ──────────────────────────────
      const merchantName = $el
        .find(
          '[class*="merchant"], [class*="Merchant"], [class*="brand"], [class*="Brand"], .offer-merchant-name'
        )
        .first()
        .text()
        .trim();

      if (!merchantName) return; // skip cards without a merchant

      // ── Offer Value ────────────────────────────────
      const valueText = $el
        .find(
          '[class*="offer-value"], [class*="OfferValue"], [class*="cashback"], [class*="Cashback"], .offer-title, [class*="headline"]'
        )
        .first()
        .text()
        .trim();

      let cashbackAmount = 0;
      let cashbackType = 'fixed'; // Amex is usually fixed $ amounts

      const percentMatch = valueText.match(/(\d+(?:\.\d+)?)\s*%/);
      const dollarMatch = valueText.match(/\$(\d+(?:\.\d+)?)/);

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
          '[class*="terms"], [class*="Terms"], [class*="description"], [class*="Description"], [class*="subtitle"]'
        )
        .first()
        .text()
        .trim();

      // ── Minimum Spend ──────────────────────────────
      let minimumSpend = 0;
      const combinedText = (valueText + ' ' + offerDescription).toLowerCase();
      const minSpendMatch = combinedText.match(/(?:spend|purchase|shop)\s+\$?(\d+)/);
      if (minSpendMatch) minimumSpend = parseFloat(minSpendMatch[1]);

      // ── Expiry Date ────────────────────────────────
      const expiryText = $el
        .find(
          '[class*="expir"], [class*="Expir"], [class*="valid"], [class*="Valid"], [class*="date"], [class*="Date"]'
        )
        .first()
        .text()
        .trim();

      let expiryDate = null;
      if (expiryText) {
        const cleaned = expiryText
          .replace(/(?:valid through|expires?|through|by)/i, '')
          .trim();
        const parsed = new Date(cleaned);
        if (!isNaN(parsed.getTime())) expiryDate = parsed.toISOString();
      }

      // ── Activation Status ──────────────────────────
      const btnText = $el.find('button, [role="button"]').text().toLowerCase();
      const isActivated =
        btnText.includes('added') ||
        btnText.includes('enrolled') ||
        btnText.includes('remove') ||
        $el.find('[class*="enrolled"], [class*="activated"], [class*="added"]').length > 0;

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
      console.error('⚠️ Error parsing Amex offer card:', err);
    }
  });

  return offers;
}
