// ─────────────────────────────────────────────
// CHASE OFFERS PARSER
// Selectors based on real Chase DOM (inspected March 2026).
// Tile:      [data-testid="commerce-tile"]
// Merchant:  span.r9jbijk  (mds-body-small-heavier)
// Value:     span.r9jbijj  (mds-body-large-heavier)
// Activated: aria-label ends with "Remove Offer" (vs "Add Offer")
// Expiry, MinSpend, PurchaseType: parsed from aria-label text
// ─────────────────────────────────────────────
import * as cheerio from 'cheerio';

/**
 * Extract expiry date string from Chase aria-label.
 * Handles: "expires 5/31/25", "expires 05/31/2025", "expires May 31, 2025"
 * Returns ISO date string (YYYY-MM-DD) or null.
 */
function parseExpiryDate(ariaLabel) {
  const slashMatch = ariaLabel.match(/expires?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (slashMatch) {
    const d = new Date(slashMatch[1]);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  const wordMatch = ariaLabel.match(/expires?\s+([A-Za-z]+ \d{1,2},?\s*\d{4})/i);
  if (wordMatch) {
    const d = new Date(wordMatch[1]);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  return null;
}

/**
 * Extract minimum spend from Chase aria-label.
 * Handles: "minimum purchase of $50", "on purchases of $50 or more", "spend $50"
 * Returns number or 0.
 */
function parseMinimumSpend(ariaLabel) {
  const patterns = [
    /minimum\s+(?:purchase\s+of\s+)?\$(\d+(?:\.\d+)?)/i,
    /on\s+purchases?\s+of\s+\$(\d+(?:\.\d+)?)/i,
    /spend\s+\$(\d+(?:\.\d+)?)/i,
    /\$(\d+(?:\.\d+)?)\s+(?:or more|minimum)/i,
  ];
  for (const pattern of patterns) {
    const match = ariaLabel.match(pattern);
    if (match) return parseFloat(match[1]);
  }
  return 0;
}

/**
 * Detect whether offer applies online, in-store, or both.
 * Returns: 'online' | 'in-store' | 'both' | null
 */
function parsePurchaseType(ariaLabel) {
  const lower = ariaLabel.toLowerCase();
  const hasOnline = lower.includes('online');
  const hasInStore = lower.includes('in-store') || lower.includes('in store') || lower.includes('in-stores');
  if (hasOnline && hasInStore) return 'both';
  if (hasOnline) return 'online';
  if (hasInStore) return 'in-store';
  return null;
}

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

      // Cashback value — e.g. "25% back", "$20 cash back"
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

      // Full aria-label contains expiry, min spend, purchase type
      const ariaLabel = $el.attr('aria-label') || '';
      const isActivated  = !ariaLabel.toLowerCase().includes('add offer');
      const expiryDate   = parseExpiryDate(ariaLabel);
      const minimumSpend = parseMinimumSpend(ariaLabel);
      const purchaseType = parsePurchaseType(ariaLabel);

      offers.push({
        merchantName,
        offerDescription: valueText,
        cashbackAmount,
        cashbackType,
        minimumSpend,
        expiryDate,
        purchaseType,
        category: 'other',
        isActivated,
      });
    } catch (err) {
      console.error('⚠️ Error parsing Chase offer tile:', err);
    }
  });

  console.log(`🔍 Chase parser found ${offers.length} tiles from ${$('[data-testid="commerce-tile"]').length} total`);
  return offers;
}
