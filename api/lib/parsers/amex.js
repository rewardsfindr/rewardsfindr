// ─────────────────────────────────────────────
// AMEX OFFERS PARSER — JSON-based
// Parses the ReadOffersHubPresentation API response intercepted
// by buildAmexJsonCaptureJs() in mobile/components/sync/amexSync.js
// ─────────────────────────────────────────────

function parseExpiryDate(expirationText) {
  if (!expirationText) return null;
  // e.g. "Expires 3/15/26"
  const match = expirationText.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;
  const [, month, day, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  const parsed = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapOffer(offer, isActivated) {
  const merchantName = (offer.title || '').trim();
  if (!merchantName) return null;

  const offerDescription = offer.shortDescription || '';
  const category = (offer.applicableCategories?.[0]?.optionType || 'OTHER').toLowerCase();
  const expiryDate = parseExpiryDate(offer.expiration?.text);
  const activated = isActivated ?? (offer.enrollmentDetails?.status === 'ENROLLED');

  return {
    merchantName,
    offerDescription,
    cashbackAmount: null,
    cashbackType:   null,
    minimumSpend:   null,
    category,
    expiryDate,
    isActivated:    activated,
    offerDeepLink:  offer.offerId
      ? `https://global.americanexpress.com/offers?offerId=${encodeURIComponent(offer.offerId)}`
      : null,
  };
}

function extractOfferList(container, label) {
  if (!container?.offersList) return [];
  const pages = Object.keys(container.offersList).sort();
  return pages.flatMap(key =>
    Array.isArray(container.offersList[key]) ? container.offersList[key] : []
  );
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

/**
 * Auto-routes by phase. Called from api/routes/offers.js.
 * @param {object} json  — parsed ReadOffersHubPresentation response
 * @param {string} phase — 'eligible' | 'enrolled'
 */
export function parseAmexOffers(json, phase) {
  if (phase === 'enrolled') return parseAmexEnrolledOffers(json);
  return parseAmexEligibleOffers(json);
}
