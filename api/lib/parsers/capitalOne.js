// ─────────────────────────────────────────────────────────────────────────────
// Capital One Offer Parser
//
// Input: raw tiles array from the /feed API
//
// Tile types:
//   Standard — single offer: merchantTLD + buttonText
//   Hero     — same shape as Standard, featured placement
//   Showcase — Standard + rateText / headingText / altText
//   Carousel — contains nested tiles[] of sub-offers
//
// Key fields per tile:
//   merchantTLD  — domain e.g. "walmart.com", "oldnavy.gap.com"
//   type         — Standard | Hero | Showcase | Carousel
//   id           — base64 JSON: { inventory: { source, merchantTLD }, offers: ['affiliate'|'cardLinked'] }
//   buttonText   — "2% back" | "Spend $50, earn $25" | "$150 back" | "Up to 14% back"
//   text         — "Online" | "In-Store & Online" | "In-Store & In-App"
//   imageSrc     — merchant logo URL
//   badge        — optional { text, color } e.g. "New Offer"
//
// NOTE: No expiry date in the feed API — expiryDate will always be null.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives a display merchant name from a TLD.
 * "walmart.com"      → "Walmart"
 * "oldnavy.gap.com"  → "Oldnavy" (best-effort — last segment)
 * "1800contacts.com" → "1800contacts"
 */
function merchantNameFromTLD(tld) {
  if (!tld) return '';
  const withoutSuffix = tld.replace(/\.(com|net|org|us|co\.uk|io)$/, '');
  const segments = withoutSuffix.split('.');
  const primary = segments[segments.length - 1];
  return primary.charAt(0).toUpperCase() + primary.slice(1);
}

/**
 * Parses buttonText into structured cashback fields.
 *
 * "2% back"             → { cashbackAmount: 2,   cashbackType: 'percent', minimumSpend: null }
 * "Up to 14% back"      → { cashbackAmount: 14,  cashbackType: 'percent', minimumSpend: null }
 * "$18 back"            → { cashbackAmount: 18,  cashbackType: 'fixed',   minimumSpend: null }
 * "Spend $50, earn $25" → { cashbackAmount: 25,  cashbackType: 'fixed_spend', minimumSpend: 50 }
 */
function parseButtonText(buttonText) {
  if (!buttonText) {
    return { offerDescription: '', cashbackAmount: null, cashbackType: null, minimumSpend: null };
  }
  const clean = buttonText.replace(/\s+/g, ' ').trim();

  // "Spend $X, earn $Y" (supports newline between comma and earn)
  const spendEarn = clean.match(/[Ss]pend\s+\$(\d+(?:\.\d+)?).*earn\s+\$(\d+(?:\.\d+)?)/i);
  if (spendEarn) {
    return {
      offerDescription: clean,
      cashbackAmount:   parseFloat(spendEarn[2]),
      cashbackType:     'fixed_spend',
      minimumSpend:     parseFloat(spendEarn[1]),
    };
  }

  // "Up to X% back" or "X% back"
  const percentMatch = clean.match(/(\d+(?:\.\d+)?)%\s+back/i);
  if (percentMatch) {
    return {
      offerDescription: clean,
      cashbackAmount:   parseFloat(percentMatch[1]),
      cashbackType:     'percent',
      minimumSpend:     null,
    };
  }

  // "$X back"
  const fixedMatch = clean.match(/\$(\d+(?:\.\d+)?)\s+back/i);
  if (fixedMatch) {
    return {
      offerDescription: clean,
      cashbackAmount:   parseFloat(fixedMatch[1]),
      cashbackType:     'fixed',
      minimumSpend:     null,
    };
  }

  // Fallback — store raw text, no parsed amount
  return { offerDescription: clean, cashbackAmount: null, cashbackType: null, minimumSpend: null };
}

/** Maps tile.text to an availability string */
function parseAvailability(text) {
  if (!text) return 'online';
  const lower = text.toLowerCase();
  if (lower.includes('in-store') && lower.includes('in-app')) return 'in_store_and_app';
  if (lower.includes('in-store'))                              return 'in_store_and_online';
  return 'online';
}

/** Returns true if 'cardLinked' is in the decoded tile id's offers array */
function isCardLinkedOffer(tileId) {
  try {
    const padding = (4 - (tileId.length % 4)) % 4;
    const padded  = tileId + '='.repeat(padding);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return Array.isArray(decoded.offers) && decoded.offers.includes('cardLinked');
  } catch (_) {
    return false;
  }
}

/** Maps a single flat tile to an offer object. Returns null if invalid. */
function mapTile(tile) {
  const merchantTLD = tile.merchantTLD || '';
  if (!merchantTLD) return null;

  const merchantName = merchantNameFromTLD(merchantTLD);
  const { offerDescription, cashbackAmount, cashbackType, minimumSpend } = parseButtonText(tile.buttonText);
  const availability = parseAvailability(tile.text);
  const cardLinked   = isCardLinkedOffer(tile.id || '');

  return {
    merchantName,
    merchantTLD,
    offerDescription,
    cashbackAmount,
    cashbackType,
    minimumSpend:  minimumSpend ?? null,
    category:      'other',  // Capital One feed doesn't provide category
    expiryDate:    null,     // Not provided in feed API
    isActivated:   false,    // No activation step for Capital One offers
    isCardLinked:  cardLinked,
    availability,
    offerDeepLink: tile.id
      ? `https://capitaloneoffers.com?offerId=${encodeURIComponent(tile.id)}`
      : null,
  };
}

/**
 * Parses the full tiles array from the Capital One /feed API.
 * Handles Standard, Hero, Showcase (flat) and Carousel (nested tiles[]).
 *
 * @param {Array} tiles - raw tile array from feed API
 * @returns {Array} normalized offer objects
 */
export function parseCapitalOneOffers(tiles) {
  if (!Array.isArray(tiles)) return [];

  const results = [];

  for (const tile of tiles) {
    if (!tile || !tile.type) continue;

    if (tile.type === 'Carousel') {
      // Flatten carousel sub-tiles — each is a real offer
      if (Array.isArray(tile.tiles)) {
        for (const subTile of tile.tiles) {
          const offer = mapTile(subTile);
          if (offer) results.push(offer);
        }
      }
    } else {
      // Standard, Hero, Showcase
      const offer = mapTile(tile);
      if (offer) results.push(offer);
    }
  }

  return results;
}
