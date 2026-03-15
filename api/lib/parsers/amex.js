// ─────────────────────────────────────────────
// AMEX OFFERS PARSER — JSON-based
// Parses the ReadOffersHubPresentation API response intercepted
// by buildAmexJsonCaptureJs() in mobile/components/sync/amexSync.js
//
// Response shape (Mar 2026):
//   {
//     recommendedOffers: { offersList: { page1: [ ...offerObjects ] } },
//     addedToCard:       { offersList: { page1: [ ...offerObjects ] } },
//   }
//
// Each offer object contains:
//   offerId, title, shortDescription, businessName,
//   currencyType ('MR' | 'USD' | 'PERCENT'),
//   rewardValue (number), minimumSpend (number),
//   offerEndDate ('YYYY-MM-DD'),
//   redemptionType (e.g. 'CARD_LINKED')
//
// parseAmexEligibleOffers  → reads recommendedOffers (phase: eligible)
// parseAmexEnrolledOffers  → reads addedToCard       (phase: enrolled)
// parseAmexOffers          → auto-routes by phase string (called from offers.js)
// ─────────────────────────────────────────────

function mapOffer(offer, isActivated) {
  const title       = offer.title            || '';
  const description = offer.shortDescription || title;
  const merchant    = (offer.businessName    || '').trim();

  if (!merchant) return null;

  // ── Cashback ────────────────────────────────────────────
  const currency = (offer.currencyType || '').toUpperCase();
  let cashbackAmount = parseFloat(offer.rewardValue) || 0;
  let cashbackType;

  if (currency === 'MR') {
    cashbackType = 'points';
  } else if (currency === 'PERCENT') {
    cashbackType = 'percent';
  } else {
    // USD or unknown — treat as fixed dollar
    cashbackType = 'fixed';
  }

  // ── Minimum spend ───────────────────────────────────────
  const minimumSpend = parseFloat(offer.minimumSpend) || 0;

  // ── Expiry ──────────────────────────────────────────────
  let expiryDate = null;
  if (offer.offerEndDate) {
    const parsed = new Date(offer.offerEndDate);
    if (!isNaN(parsed.getTime())) expiryDate = parsed.toISOString();
  }

  return {
    merchantName:     merchant,
    offerDescription: description,
    cashbackAmount,
    cashbackType,
    minimumSpend,
    category:         'other',
    expiryDate,
    isActivated,
    offerDeepLink:    offer.offerId ? `https://global.americanexpress.com/offers?offerId=${offer.offerId}` : null,
  };
}

function extractOfferList(container) {
  const offersList = container?.offersList || {};
  // Amex paginates as page1, page2, ... — collect all pages
  return Object.keys(offersList)
    .sort()
    .flatMap(key => Array.isArray(offersList[key]) ? offersList[key] : []);
}

export function parseAmexEligibleOffers(json) {
  const raw = extractOfferList(json?.recommendedOffers);
  const offers = raw.map(o => mapOffer(o, false)).filter(Boolean);
  console.log(`[parseAmexEligibleOffers] offers parsed: ${offers.length} (from ${raw.length} raw)`);
  return offers;
}

export function parseAmexEnrolledOffers(json) {
  const raw = extractOfferList(json?.addedToCard);
  const offers = raw.map(o => mapOffer(o, true)).filter(Boolean);
  console.log(`[parseAmexEnrolledOffers] offers parsed: ${offers.length} (from ${raw.length} raw)`);
  return offers;
}

/**
 * Auto-routes by phase. Called from api/routes/offers.js.
 * @param {object} json  — parsed ReadOffersHubPresentation response
 * @param {string} phase — 'eligible' | 'enrolled'
 */
export function parseAmexOffers(json, phase) {
  if (phase === 'enrolled') return parseAmexEnrolledOffers(json);
  return parseAmexEligibleOffers(json);
}
