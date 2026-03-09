// ─────────────────────────────────────────────
// CHASE OFFERS PARSER
// Selectors based on real Chase DOM (inspected March 2026).
// Tile:      [data-testid="commerce-tile"]
// Merchant:  span.r9jbijk  (mds-body-small-heavier)
// Value:     span.r9jbijj  (mds-body-large-heavier)
// Activated: aria-label contains "Add Offer" when not activated
// Expiry, MinSpend, PurchaseType: parsed from full tile text content
// ─────────────────────────────────────────────
import * as cheerio from 'cheerio';

function parseExpiryDate(text) {
  // "Expires 5/31/25", "Expires 05/31/2025"
  const slashMatch = text.match(/expires?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (slashMatch) {
    const d = new Date(slashMatch[1]);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  // "Expires May 31, 2025"
  const wordMatch = text.match(/expires?\s+([A-Za-z]+ \d{1,2},?\s*\d{4})/i);
  if (wordMatch) {
    const d = new Date(wordMatch[1]);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  return null;
}

function parseMinimumSpend(text) {
  const patterns = [
    /minimum\s+(?:purchase\s+of\s+)?\$(\d+(?:\.\d+)?)/i,
    /on\s+purchases?\s+of\s+\$(\d+(?:\.\d+)?)/i,
    /spend\s+\$(\d+(?:\.\d+)?)/i,
    /\$(\d+(?:\.\d+)?)\s+(?:or more|minimum)/i,
    /min\.?\s+\$(\d+(?:\.\d+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseFloat(match[1]);
  }
  return 0;
}

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
  let debugCount = 0;

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

      const ariaLabel = $el.attr('aria-label') || '';
      const isActivated = !ariaLabel.toLowerCase().includes('add offer');

      // Use full tile text for expiry, min spend, purchase type
      const tileText = $el.text();

      // DEBUG: log first 3 tile texts to verify format
      if (debugCount < 3) {
        console.log(`[Chase DEBUG] tile[${debugCount}] text: ${tileText.replace(/\s+/g, ' ').trim().substring(0, 200)}`);
        debugCount++;
      }

      const expiryDate   = parseExpiryDate(tileText);
      const minimumSpend = parseMinimumSpend(tileText);
      const purchaseType = parsePurchaseType(tileText);

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
