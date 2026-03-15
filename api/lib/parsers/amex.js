// ─────────────────────────────────────────────
// AMEX OFFERS PARSER — JSON-based
// ─────────────────────────────────────────────

function mapOffer(offer, isActivated) {
  const title       = offer.title            || '';
  const description = offer.shortDescription || title;
  const merchant    = (offer.businessName    || '').trim();

  if (!merchant) {
    return null;
  }

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

  const minimumSpend = parseFloat(offer.minimumSpend) || 0;

  let expiryDate = null;
  if (offer.offerEndDate) {
    const parsed = new Date(offer.offerEndDate);
    if (!isNaN(parsed.getTime())) {
      expiryDate = parsed.toISOString();
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
  if (!container) return [];
  const offersList = container.offersList;
  if (!offersList) return [];

  const pages = Object.keys(offersList).sort();
  const all = pages.flatMap(key => Array.isArray(offersList[key]) ? offersList[key] : []);

  if (all.length > 0) {
    console.log(`[amex:sample] first offer from "${label}":\n`, JSON.stringify(all[0], null, 2));
  }

  return all;
}

export function parseAmexEligibleOffers(json) {
  const raw    = extractOfferList(json?.recommendedOffers, 'recommendedOffers');
  const offers = raw.map(o => mapOffer(o, false)).filter(Boolean);
  console.log(`[parseAmexEligibleOffers] ${offers.length} valid offers from ${raw.length} raw`);
  return offers;
}

export function parseAmexEnrolledOffers(json) {
  const raw    = extractOfferList(json?.addedToCard, 'addedToCard');
  const offers = raw.map(o => mapOffer(o, true)).filter(Boolean);
  console.log(`[parseAmexEnrolledOffers] ${offers.length} valid offers from ${raw.length} raw`);
  return offers;
}

export function parseAmexOffers(json, phase) {
  if (phase === 'enrolled') return parseAmexEnrolledOffers(json);
  return parseAmexEligibleOffers(json);
}
