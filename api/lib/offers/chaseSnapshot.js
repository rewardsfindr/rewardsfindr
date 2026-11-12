// Chase sync snapshot.
// Identity is the bank offer id (FIGG:…) plus the card, not a hash of
// label text. Expiry comes from the tile. Missing expiry stays unknown
// instead of being stored as a made-up 90-day date.

import { normalizeMerchant } from '../shared/offerUtils.js';

export const CHASE_OFFERS_BASE_URL = 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub';
export const SNAPSHOT_BATCH_LIMIT = 450;
const DAY_MS = 24 * 60 * 60 * 1000;

function unknownExpiry() {
  return { expiryDate: null, expiryPrecision: 'unknown', expiresAtMs: null };
}

export function resolveChaseExpiry(daysLeftText, now = new Date()) {
  const text = String(daysLeftText || '').trim();
  if (!text) return unknownExpiry();

  const daysMatch = text.match(/(\d+)\s*d(?:ay|ays)?\b/i);
  if (daysMatch) {
    const expiresAtMs = now.getTime() + Number(daysMatch[1]) * DAY_MS;
    return {
      expiryDate: new Date(expiresAtMs).toISOString(),
      expiryPrecision: 'day-count',
      expiresAtMs,
    };
  }

  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dateMatch) {
    const month = Number(dateMatch[1]);
    const day = Number(dateMatch[2]);
    let year = Number(dateMatch[3]);
    if (year < 100) year += 2000;
    const expiresAtMs = Date.UTC(year, month - 1, day);
    const parsed = new Date(expiresAtMs);
    if (Number.isNaN(parsed.getTime()) || parsed.getUTCMonth() !== month - 1) {
      return unknownExpiry();
    }
    return {
      expiryDate: parsed.toISOString(),
      expiryPrecision: 'date',
      expiresAtMs,
    };
  }

  return unknownExpiry();
}

export function parseReward(valueText) {
  const text = String(valueText || '');
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const dollarMatch = text.match(/\$(\d+(?:\.\d+)?)/);
  if (percentMatch) {
    return { cashbackAmount: parseFloat(percentMatch[1]), cashbackType: 'percent' };
  }
  if (dollarMatch) {
    return { cashbackAmount: parseFloat(dollarMatch[1]), cashbackType: 'fixed' };
  }
  return { cashbackAmount: 0, cashbackType: 'percent' };
}

export function chaseOfferDocId(bankOfferId, cardName) {
  const offer = String(bankOfferId).trim().replace(/[/\s]/g, '');
  const card = String(cardName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `chase_${card}_${offer}`.slice(0, 700);
}

export function normalizeChaseSnapshotOffer(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') return null;

  const merchantName = String(raw.merchantName || '').trim();
  const bankOfferId = String(raw.bankOfferId || '').trim();
  if (!merchantName || !bankOfferId) return null;

  const valueText = String(raw.valueText || raw.offerDescription || '').trim();
  const reward = parseReward(valueText);
  const expiry = resolveChaseExpiry(raw.daysLeft || raw.expiryText || '', now);
  const tileId = String(raw.tileId || bankOfferId).trim();

  return {
    bankOfferId,
    merchantName,
    offerDescription: valueText,
    cashbackAmount: reward.cashbackAmount,
    cashbackType: reward.cashbackType,
    minimumSpend: 0,
    purchaseType: raw.purchaseType || null,
    category: 'other',
    isActivated: raw.isActivated === true,
    tileId,
    offerDeepLink: `${CHASE_OFFERS_BASE_URL}?offerId=${encodeURIComponent(tileId)}`,
    ...expiry,
  };
}

// Refuse a write that would erase a card when the page clearly had tiles
// we failed to identify. An empty grid is a real snapshot and may delete.
export function assertSnapshotSafe({ gridFound, tileCount, normalizedCount }) {
  if (gridFound !== true) {
    return 'Chase offers grid was not found. Nothing was changed.';
  }
  if (tileCount > 0 && normalizedCount === 0) {
    return 'Offers were visible but none included a Chase offer id. Nothing was changed.';
  }
  return null;
}

export function planChaseSnapshot({ existingIds, offers, cardName }) {
  const upserts = [];
  const seen = new Set();
  let skipped = 0;

  for (const offer of offers) {
    if (!offer?.bankOfferId) {
      skipped += 1;
      continue;
    }
    const id = chaseOfferDocId(offer.bankOfferId, cardName);
    if (seen.has(id)) {
      skipped += 1;
      continue;
    }
    seen.add(id);
    upserts.push({ id, offer });
  }

  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds || []);
  const deletes = [...existing].filter(id => !seen.has(id));
  return { upserts, deletes, skipped };
}

export function toChaseOfferFields(offer, { userId, cardName }) {
  return {
    offerId: chaseOfferDocId(offer.bankOfferId, cardName),
    bankOfferId: offer.bankOfferId,
    userId,
    merchantName: offer.merchantName,
    merchantNameLower: offer.merchantName.toLowerCase().trim(),
    normalizedMerchant: normalizeMerchant(offer.merchantName),
    offerDescription: offer.offerDescription || '',
    cashbackAmount: offer.cashbackAmount || 0,
    cashbackType: offer.cashbackType || 'percent',
    minimumSpend: offer.minimumSpend || 0,
    category: offer.category || 'other',
    purchaseType: offer.purchaseType || null,
    expiryDate: offer.expiryDate,
    expiryPrecision: offer.expiryPrecision,
    isActivated: offer.isActivated === true,
    offerDeepLink: offer.offerDeepLink || null,
    bank: 'chase',
    cardName,
    phase: '',
  };
}
