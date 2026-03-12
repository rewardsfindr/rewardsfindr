// ─────────────────────────────────────────────
// AMEX OFFERS PARSER
// Parses raw HTML from global.americanexpress.com/offers/eligible
// DOM analysis: Mar 2026
//
// Structure:
//   [data-testid="listViewContainer"]
//     > DIV  (one per offer, no data-testid on row itself)
//       ├─ [data-testid="merchantOfferListAddButton"]   ← not yet added
//       ├─ [data-testid="merchantOfferSuccessIcon"]     ← already added
//       ├─ h3                                           ← merchant name
//       ├─ [data-testid="overflowTextContainer"] x2     ← [0]=title [1]=description
//       └─ <p> containing "Expires"                     ← expiry
// ─────────────────────────────────────────────
import * as cheerio from 'cheerio';

export function parseAmexOffers(html) {
  const $ = cheerio.load(html);
  const offers = [];

  // Each offer is a direct DIV child of listViewContainer.
  // There are no data-testid or stable class names on the row itself.
  $('[data-testid="listViewContainer"] > div').each((i, el) => {
    try {
      const $el = $(el);

      // ── Filter: skip bank/promo tiles ────────────────────
      // Real merchant offers always have either the add button OR success icon.
      // Bank promos (Savings, Loans, CreditSecure) have neither.
      const isAddable   = $el.find('[data-testid="merchantOfferListAddButton"]').length > 0;
      const isActivated = $el.find('[data-testid="merchantOfferSuccessIcon"]').length > 0;
      if (!isAddable && !isActivated) return;

      // ── Merchant Name ─────────────────────────────────
      const merchantName = $el.find('h3').first().text().trim();
      if (!merchantName) return;

      // ── Offer Title + Description ───────────────────────
      // First overflowTextContainer = short title (e.g. "Earn $10 back")
      // Second overflowTextContainer = terms (e.g. "Spend $50 or more")
      const descContainers = $el.find('[data-testid="overflowTextContainer"]');
      const offerTitle       = descContainers.eq(0).text().trim();
      const offerDescription = descContainers.eq(1).text().trim() || offerTitle;

      // ── Cashback Parsing ─────────────────────────────
      // Parse from the title which is most concise
      let cashbackAmount = 0;
      let cashbackType = 'fixed';

      const pointsMatch   = offerTitle.match(/[Ee]arn\s+(\d+(?:\.\d+)?)\s+[Mm]embership\s+[Rr]ewards/);
      const percentMatch  = offerTitle.match(/(\d+(?:\.\d+)?)%/);
      const dollarMatch   = offerTitle.match(/\$([\d.]+)/);

      if (pointsMatch) {
        cashbackAmount = parseFloat(pointsMatch[1]);
        cashbackType = 'points';
      } else if (percentMatch) {
        cashbackAmount = parseFloat(percentMatch[1]);
        cashbackType = 'percent';
      } else if (dollarMatch) {
        cashbackAmount = parseFloat(dollarMatch[1]);
        cashbackType = 'fixed';
      }

      // ── Minimum Spend ────────────────────────────────
      let minimumSpend = 0;
      const combinedText = (offerTitle + ' ' + offerDescription).toLowerCase();
      const minSpendMatch = combinedText.match(/spend\s+\$?([\d.]+)/);
      if (minSpendMatch) minimumSpend = parseFloat(minSpendMatch[1]);

      // ── Expiry Date ──────────────────────────────────
      // Format: "Expires 4/2/26"
      let expiryDate = null;
      let isExpiringSoon = false;

      const $expiryP = $el.find('p').filter((_, p) =>
        $(p).text().toLowerCase().includes('expires')
      ).first();

      if ($expiryP.length) {
        isExpiringSoon = ($expiryP.attr('class') || '').includes('color-status-text-critical');
        const rawExpiry = $expiryP.text().replace(/expires/i, '').trim();
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

  console.log(`[parseAmexOffers] total rows scanned: ${$('[data-testid="listViewContainer"] > div').length}, offers parsed: ${offers.length}`);
  return offers;
}
