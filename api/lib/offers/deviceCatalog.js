// On-device offer catalog.
// A sync replaces one card (and phase). Search filters this list.
// Nothing here talks to Firestore or the network.

import {
  assertSnapshotSafe,
  normalizeChaseSnapshotOffer,
  planChaseSnapshot,
  toChaseOfferFields,
} from './chaseSnapshot.js';
import { isCurrentOffer } from './offerFreshness.js';
import { parseAmexOffers } from '../parsers/amex.js';

function amexPayloadReady(json, phase) {
  if (!json || typeof json !== 'object') return false;
  if (phase === 'enrolled') return !!(json.addedToCardViewAll || json.addedToCard);
  return !!json.recommendedOffers;
}

function amexOfferId(offer) {
  const link = offer.offerDeepLink || '';
  const match = link.match(/[?&]offerId=([^&]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function chaseRecords({ cardName, cardLast4, rawOffers, tileCount, gridFound, now = new Date() }) {
  const rows = Array.isArray(rawOffers) ? rawOffers : [];
  const normalized = rows.map(offer => normalizeChaseSnapshotOffer(offer, now)).filter(Boolean);
  const blocked = assertSnapshotSafe({
    gridFound,
    tileCount: Math.max(Number(tileCount) || 0, rows.length),
    normalizedCount: normalized.length,
  });
  if (blocked) {
    const error = new Error(blocked);
    error.code = 'SNAPSHOT_REFUSED';
    throw error;
  }

  const { upserts } = planChaseSnapshot({ existingIds: [], offers: normalized, cardName });
  return upserts.map(({ id, offer }) => ({
    ...toChaseOfferFields(offer, { userId: null, cardName }),
    id,
    cardLast4: cardLast4 || null,
    expiresAt: offer.expiresAtMs,
    syncedAt: now.toISOString(),
  }));
}

export function amexRecords({ cardName, cardLast4, json, phase, now = new Date() }) {
  const resolvedPhase = phase === 'enrolled' ? 'enrolled' : 'eligible';
  if (!amexPayloadReady(json, resolvedPhase)) {
    const error = new Error('Amex offers payload was not recognized. Nothing was changed.');
    error.code = 'SNAPSHOT_REFUSED';
    throw error;
  }

  const parsed = parseAmexOffers(json, resolvedPhase);
  const records = [];
  for (const offer of parsed) {
    const bankOfferId = amexOfferId(offer);
    if (!bankOfferId) continue;
    const expiryMs = offer.expiryDate ? new Date(offer.expiryDate).getTime() : NaN;
    const knownExpiry = Number.isFinite(expiryMs);
    records.push({
      id: `amex_${slug(cardName)}_${resolvedPhase}_${bankOfferId}`.slice(0, 700),
      bankOfferId,
      userId: null,
      merchantName: offer.merchantName,
      merchantNameLower: offer.merchantName.toLowerCase().trim(),
      offerDescription: offer.offerDescription || '',
      cashbackAmount: offer.cashbackAmount ?? 0,
      cashbackType: offer.cashbackType || 'percent',
      minimumSpend: offer.minimumSpend || 0,
      category: offer.category || 'other',
      expiryDate: knownExpiry ? offer.expiryDate : null,
      expiryPrecision: knownExpiry ? 'date' : 'unknown',
      expiresAt: knownExpiry ? expiryMs : null,
      isActivated: offer.isActivated === true,
      offerDeepLink: offer.offerDeepLink || null,
      bank: 'amex',
      cardName,
      cardLast4: cardLast4 || null,
      phase: resolvedPhase,
      syncedAt: now.toISOString(),
    });
  }

  if (parsed.length > 0 && records.length === 0) {
    const error = new Error('Amex offers had no offer id. Nothing was changed.');
    error.code = 'SNAPSHOT_REFUSED';
    throw error;
  }
  return records;
}

export function buildSnapshotRecords(input) {
  if (input.bank === 'chase') return chaseRecords(input);
  if (input.bank === 'amex') return amexRecords(input);
  throw new Error('bank must be chase or amex');
}

export function replaceCardOffers(existing, { bank, cardName, phase, records }) {
  const phaseKey = phase || '';
  const kept = (existing || []).filter(offer =>
    !(offer.bank === bank && offer.cardName === cardName && (offer.phase || '') === phaseKey)
  );
  return [...kept, ...records];
}

export function filterOffers(offers, query, now = new Date()) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const end = `${q}\uf8ff`;
  return (offers || []).filter(offer => {
    const name = offer.merchantNameLower || String(offer.merchantName || '').toLowerCase().trim();
    return name >= q && name <= end && isCurrentOffer(offer, now);
  });
}
