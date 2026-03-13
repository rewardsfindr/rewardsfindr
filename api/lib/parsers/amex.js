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

  let $rows;
  const $root = $.root().children().first();
  const isRootListView = $root.attr('data-testid') === 'listViewContainer';

  if (isRootListView) {
    $rows = $root.children('div');
    console.log(`[parseAmexOffers] root IS listViewContainer, direct div children: ${$rows.length}`);
  } else {
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
      // Search both title and description; description usually has the cashback value
      const searchText = offerTitle + ' ' + offerDescription;

      let cashbackAmount = 0;
      let cashbackType   = 'fixed';

      // Handle "Earn +5 Membership Rewards" or "earn 10,000 Membership Rewards"
      const pointsMatch  = searchText.match(/[Ee]arn\s+\+?([\d,]+(?:\.\d+)?)\s+[Mm]embership\s+[Rr]ewards/);
      const percentMatch = searchText.match(/([\d.]+)%\s+back/);
      // Match dollar amount after "earn" (handles "earn $10 back", "earn $25")
      const dollarMatch  = searchText.match(/[Ee]arn\s+\$([0-9,]+(?:\.[0-9]+)?)/);

      if (pointsMatch) {
        cashbackAmount = parseFloat(pointsMatch[1].replace(/,/g, ''));
        cashbackType   = 'points';
      } else if (percentMatch) {
        cashbackAmount = parseFloat(percentMatch[1]);
        cashbackType   = 'percent';
      } else if (dollarMatch) {
        cashbackAmount = parseFloat(dollarMatch[1].replace(/,/g, ''));
        cashbackType   = 'fixed';
      }

      // ── Minimum Spend ────────────────────────────────
      let minimumSpend = 0;
      const combinedText  = searchText.toLowerCase();
      // Strip commas from amounts like $1,000
      const minSpendMatch = combinedText.match(/spend\s+\$?([\d,]+(?:\.\d+)?)/);
      if (minSpendMatch) minimumSpend = parseFloat(minSpendMatch[1].replace(/,/g, ''));

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
