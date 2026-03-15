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

  if (!merchant) {
    console.log('[amex:mapOffer] skipping offer — no businessName. offerId:', offer.offerId);
    return null;
  }

  // ── Cashback ────────────────────────────────────────────
  const currency = (offer.currencyType || '').toUpperCase();
  const cashbackAmount = parseFloat(offer.rewardValue) || 0;
  let cashbackType;

  if (currency === 'MR') {
    cashbackType = 'points';
  } else if (currency === 'PERCENT') {
    cashbackType = 'percent';
  } else {
    cashbackType = 'fixed';
  }

  // ── Minimum spend ───────────────────────────────────────
  const minimumSpend = parseFloat(offer.minimumSpend) || 0;

  // ── Expiry ──────────────────────────────────────────────
  let expiryDate = null;
  if (offer.offerEndDate) {
    const parsed = new Date(offer.offerEndDate);
    if (!isNaN(parsed.getTime())) {
      expiryDate = parsed.toISOString();
    } else {
      console.log('[amex:mapOffer] invalid offerEndDate:', offer.offerEndDate, 'for offerId:', offer.offerId);
    }
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

function extractOfferList(container, label) {
  if (!container) {
    console.log(`[amex:extractOfferList] container "${label}" is missing`);
    return [];
  }
  const offersList = container.offersList;
  if (!offersList) {
    console.log(`[amex:extractOfferList] "${label}" has no offersList. Keys:`, Object.keys(container));
    return [];
  }
  const pages = Object.keys(offersList).sort();
  console.log(`[amex:extractOfferList] "${label}" pages:`, pages);
  const all = pages.flatMap(key => Array.isArray(offersList[key]) ? offersList[key] : []);
  console.log(`[amex:extractOfferList] "${label}" total raw offers across all pages:`, all.length);
  if (all.length > 0) {
    const sample = all[0];
    console.log(`[amex:extractOfferList] "${label}" first offer sample:`, JSON.stringify({
      offerId:      sample.offerId,
      businessName: sample.businessName,
      title:        sample.title,
      currencyType: sample.currencyType,
      rewardValue:  sample.rewardValue,
      minimumSpend: sample.minimumSpend,
      offerEndDate: sample.offerEndDate,
    }));
  }
  return all;
}

export function parseAmexEligibleOffers(json) {
  console.log('[parseAmexEligibleOffers] top-level keys:', Object.keys(json || {}));
  const raw    = extractOfferList(json?.recommendedOffers, 'recommendedOffers');
  const offers = raw.map(o => mapOffer(o, false)).filter(Boolean);
  console.log(`[parseAmexEligibleOffers] result: ${offers.length} valid offers from ${raw.length} raw`);
  return offers;
}

export function parseAmexEnrolledOffers(json) {
  console.log('[parseAmexEnrolledOffers] top-level keys:', Object.keys(json || {}));
  const raw    = extractOfferList(json?.addedToCard, 'addedToCard');
  const offers = raw.map(o => mapOffer(o, true)).filter(Boolean);
  console.log(`[parseAmexEnrolledOffers] result: ${offers.length} valid offers from ${raw.length} raw`);
  return offers;
}

/**
 * Auto-routes by phase. Called from api/routes/offers.js.
 * @param {object} json  — parsed ReadOffersHubPresentation response
 * @param {string} phase — 'eligible' | 'enrolled'
 */
export function parseAmexOffers(json, phase) {
  console.log(`[parseAmexOffers] routing to phase=${phase}`);
  if (phase === 'enrolled') return parseAmexEnrolledOffers(json);
  return parseAmexEligibleOffers(json);
}
