// ─────────────────────────────────────────────
// AMEX OFFERS PARSER
// Parses raw HTML from the Amex Offers & Benefits page.
// Selectors target americanexpress.com/en-us/benefits/offers/
// DOM analysis: Mar 2026
// ─────────────────────────────────────────────
import * as cheerio from 'cheerio';

/**
 * Parse raw Amex offers page HTML into a normalized offer array.
 * Only includes real merchant offers (ignores bank/promo tiles).
 *
 * HOW TO DISTINGUISH MERCHANT OFFERS FROM BANK PROMOS:
 *   - Merchant (not yet activated): has [data-testid="merchantOfferListAddButton"]
 *   - Merchant (already activated): has [data-testid="merchantOfferSuccessIcon"]
 *   - Bank/promo tiles (e.g. Amex Savings, Loans, CreditSecure): have neither.
 *     They use [data-testid="cardOfferLearnLink"] instead.
 *
 * @param {string} html - Raw outerHTML captured from the Amex offers page
 * @returns {Array} offers - Array of normalized offer objects
 */
export function parseAmexOffers(html) {
  const $ = cheerio.load(html);
  const offers = [];

  // All offer rows (merchant + bank promos) share this class pattern
  $('[class*="listViewRow"]').each((i, el) => {
    try {
      const $el = $(el);

      // ── Filter: skip bank/promo offers ─────────────
      // Merchant offers always have either the add button OR the success icon.
      // Bank promos (Savings, Loans, CreditSecure, card referrals) have neither.
      const isAddable   = $el.find('[data-testid="merchantOfferListAddButton"]').length > 0;
      const isActivated = $el.find('[data-testid="merchantOfferSuccessIcon"]').length > 0;
      if (!isAddable && !isActivated) return;

      // ── Merchant Name ──────────────────────────────
      // The merchant name lives in the first <h3> inside the row
      const merchantName = $el.find('h3').first().text().trim();
      if (!merchantName) return;

      // ── Offer Description ──────────────────────────
      // Second [data-testid="overflowTextContainer"] holds the deal text
      const descContainers = $el.find('[data-testid="overflowTextContainer"]');
      const offerDescription = descContainers.eq(1).text().trim();

      // ── Cashback Parsing ───────────────────────────
      // Amex descriptions follow patterns like:
      //   "Spend $50 or more, earn $10 back"
      //   "Earn 6 Membership Rewards points per eligible dollar spent"
      //   "Earn 10 back on purchases"
      let cashbackAmount = 0;
      let cashbackType = 'fixed';
      const descLower = offerDescription.toLowerCase();

      // Points offers (e.g. "Earn 6 Membership Rewards points")
      const pointsMatch = offerDescription.match(/[Ee]arn\s+(\d+(?:\.\d+)?)\s+[Mm]embership\s+[Rr]ewards/);
      // Percent back offers (e.g. "Earn 10% back")
      const percentMatch = offerDescription.match(/(\d+(?:\.\d+)?)%/);
      // Fixed dollar back offers (e.g. "earn $25 back", "earn 10 back")
      const dollarBackMatch = offerDescription.match(/earn\s+\$?(\d+(?:\.\d+)?)\s+back/i);

      if (pointsMatch) {
        cashbackAmount = parseFloat(pointsMatch[1]);
        cashbackType = 'points';
      } else if (percentMatch) {
        cashbackAmount = parseFloat(percentMatch[1]);
        cashbackType = 'percent';
      } else if (dollarBackMatch) {
        cashbackAmount = parseFloat(dollarBackMatch[1]);
        cashbackType = 'fixed';
      }

      // ── Minimum Spend ──────────────────────────────
      // e.g. "Spend $50 or more" or "Spend 125 or more"
      let minimumSpend = 0;
      const minSpendMatch = descLower.match(/spend\s+\$?(\d+)/);
      if (minSpendMatch) minimumSpend = parseFloat(minSpendMatch[1]);

      // ── Expiry Date ────────────────────────────────
      // Expiry lives in a <p> tag directly inside the offer content area.
      // Format from DOM: "Expires 4/2/26" or "Expires 12/30/25"
      // Near-expiry rows use class containing "color-status-text-critical"
      let expiryDate = null;
      let isExpiringSoon = false;

      const $expiryP = $el.find('p').filter((_, p) => {
        return $(p).text().toLowerCase().includes('expires');
      }).first();

      if ($expiryP.length) {
        isExpiringSoon = ($expiryP.attr('class') || '').includes('color-status-text-critical');
        const rawExpiry = $expiryP.text().replace(/expires/i, '').trim();
        // rawExpiry is like "4/2/26" — parse as M/D/YY
        const parts = rawExpiry.split('/');
        if (parts.length === 3) {
          const [m, d, y] = parts;
          const fullYear = parseInt(y) < 100 ? 2000 + parseInt(y) : parseInt(y);
          const parsed = new Date(fullYear, parseInt(m) - 1, parseInt(d));
          if (!isNaN(parsed.getTime())) expiryDate = parsed.toISOString();
        }
      }

      offers.push({
        merchantName,
        offerDescription,
        cashbackAmount,
        cashbackType,
        minimumSpend,
        category: 'other',
        expiryDate,
        isActivated,
        isExpiringSoon,
      });
    } catch (err) {
      console.error('⚠️ Error parsing Amex offer row:', err);
    }
  });

  return offers;
}
