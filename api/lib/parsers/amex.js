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
//
// NOTE: captureJs grabs outerHTML of listViewContainer, so when Cheerio
// loads it the ROOT element IS listViewContainer — we can't use a
// descendant selector to find it. We detect both cases:
//   1. Root IS listViewContainer → select its direct > div children
//   2. Root is a full page       → find listViewContainer then its > div children
// ─────────────────────────────────────────────
import * as cheerio from 'cheerio';

export function parseAmexOffers(html) {
  const $ = cheerio.load(html);
  const offers = [];

  // Determine row set:
  // Case 1: captured HTML is outerHTML of listViewContainer itself (root element)
  // Case 2: captured HTML is a larger page containing listViewContainer
  let $rows;
  const $root = $.root().children().first();
  const isRootListView = $root.attr('data-testid') === 'listViewContainer';

  if (isRootListView) {
    // Root IS the container — rows are its direct children
    $rows = $root.children('div');
    console.log(`[parseAmexOffers] root IS listViewContainer, direct div children: ${$rows.length}`);
  } else {
    // Full page — find container then its children
    $rows = $('[data-testid="listViewContainer"]').first().children('div');
    console.log(`[parseAmexOffers] full page mode, listViewContainer children: ${$rows.length}`);
  }

  $rows.each((i, el) => {
    try {
      const $el = $(el);

      // ── Filter: skip bank/promo tiles ────────────────────
      const isAddable   = $el.find('[data-testid="merchantOfferListAddButton"]').length > 0;
      const isActivated = $el.find('[data-testid="merchantOfferSuccessIcon"]').length > 0;
      if (!isAddable && !isActivated) return;

      // ── Merchant Name ─────────────────────────────────
      const merchantName = $el.find('h3').first().text().trim();
      if (!merchantName) return;

      // ── Offer Title + Description ───────────────────────
      const descContainers   = $el.find('[data-testid="overflowTextContainer"]');
      const offerTitle       = descContainers.eq(0).text().trim();
      const offerDescription = descContainers.eq(1).text().trim() || offerTitle;

      // ── Cashback Parsing ─────────────────────────────
      let cashbackAmount = 0;
      let cashbackType   = 'fixed';

      const pointsMatch  = offerTitle.match(/[Ee]arn\s+(\d+(?:\.\d+)?)\s+[Mm]embership\s+[Rr]ewards/);
      const percentMatch = offerTitle.match(/(\d+(?:\.\d+)?)%/);
      const dollarMatch  = offerTitle.match(/\$([\d.]+)/);

      if (pointsMatch) {
        cashbackAmount = parseFloat(pointsMatch[1]);
        cashbackType   = 'points';
      } else if (percentMatch) {
        cashbackAmount = parseFloat(percentMatch[1]);
        cashbackType   = 'percent';
      } else if (dollarMatch) {
        cashbackAmount = parseFloat(dollarMatch[1]);
        cashbackType   = 'fixed';
      }

      // ── Minimum Spend ────────────────────────────────
      let minimumSpend = 0;
      const combinedText  = (offerTitle + ' ' + offerDescription).toLowerCase();
      const minSpendMatch = combinedText.match(/spend\s+\$?([\d.]+)/);
      if (minSpendMatch) minimumSpend = parseFloat(minSpendMatch[1]);

      // ── Expiry Date ──────────────────────────────────
      let expiryDate    = null;
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
          const parsed   = new Date(fullYear, parseInt(m) - 1, parseInt(d));
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

  console.log(`[parseAmexOffers] offers parsed: ${offers.length}`);
  return offers;
}
