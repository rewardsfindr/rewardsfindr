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

export function chaseRecords({ cardName, cardLast4, rawOffers, tileCount, gridFound, partial, now = new Date() }) {
  const rows = Array.isArray(rawOffers) ? rawOffers : [];
  const normalized = rows.map(offer => normalizeChaseSnapshotOffer(offer, now)).filter(Boolean);
  const blocked = assertSnapshotSafe({
    gridFound,
    partial,
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

const WELLS_CARD_NAME = 'Wells Fargo';

function refuseSnapshot(message) {
  const error = new Error(message);
  error.code = 'SNAPSHOT_REFUSED';
  throw error;
}

function wellsDealsReady(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
  const available = json.availableDeals;
  if (!available || typeof available !== 'object' || Array.isArray(available)) return false;
  if (!Array.isArray(available.cardlyticsEligibleDeals)) return false;
  if (available.activatedDeals != null && !Array.isArray(available.activatedDeals)) return false;
  if (json.earnedDeals != null) {
    if (typeof json.earnedDeals !== 'object' || Array.isArray(json.earnedDeals)) return false;
    if (json.earnedDeals.deals != null && !Array.isArray(json.earnedDeals.deals)) return false;
  }
  return true;
}

function mapWellsReward(details) {
  const amountType = String(details?.amountType ?? '').trim();
  const raw = details?.dealAmount;
  let amount = NaN;
  if (typeof raw === 'number') amount = raw;
  else if (raw != null && String(raw).trim() !== '') {
    amount = parseFloat(String(raw).replace(/[$,\s]/g, ''));
  }
  const hasAmount = Number.isFinite(amount);
  const offerDescription = String(details?.shortDescription ?? '').trim();
  return {
    hasReward: hasAmount || offerDescription !== '',
    cashbackAmount: hasAmount ? amount : 0,
    cashbackType: amountType === '$' ? 'fixed' : 'percent',
    offerDescription,
  };
}

function mapWellsExpiry(value) {
  const unknown = { expiryDate: null, expiryPrecision: 'unknown', expiresAt: null };
  if (value == null) return unknown;
  const text = String(value).trim();
  if (!text) return unknown;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        expiryDate: parsed.toISOString(),
        expiryPrecision: 'date',
        expiresAt: parsed.getTime(),
      };
    }
  }

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const expiresAt = Date.UTC(year, month - 1, day);
    const parsed = new Date(expiresAt);
    if (!Number.isNaN(parsed.getTime()) && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) {
      return {
        expiryDate: parsed.toISOString(),
        expiryPrecision: 'date',
        expiresAt,
      };
    }
  }

  return unknown;
}

export function wellsFargoRecords({ json, now = new Date() }) {
  if (!wellsDealsReady(json)) {
    refuseSnapshot('Wells Fargo deals were not recognized. Nothing was changed.');
  }

  const eligible = json.availableDeals.cardlyticsEligibleDeals;
  const activated = json.availableDeals.activatedDeals || [];
  const earned = json.earnedDeals?.deals || [];
  const seen = new Set();
  const records = [];
  let considered = 0;
  let sawOfferId = false;

  const take = (list, { forceActivated, requireReward }) => {
    for (const item of list) {
      considered += 1;
      const details = item?.merchantDealDetails;
      const bankOfferId = String(details?.merchantOfferId ?? '').trim();
      if (bankOfferId) sawOfferId = true;
      const reward = mapWellsReward(details);
      if (requireReward && !reward.hasReward) continue;
      const merchantName = String(details?.merchantName ?? '').trim();
      if (!bankOfferId || !merchantName || seen.has(bankOfferId)) continue;
      seen.add(bankOfferId);
      const expiry = mapWellsExpiry(details?.expirationDate);
      const offerToken = bankOfferId.replace(/[/\s]/g, '');
      records.push({
        id: `wells_fargo_${slug(WELLS_CARD_NAME)}_${offerToken}`.slice(0, 700),
        bankOfferId,
        userId: null,
        merchantName,
        merchantNameLower: merchantName.toLowerCase().trim(),
        offerDescription: reward.offerDescription,
        cashbackAmount: reward.cashbackAmount,
        cashbackType: reward.cashbackType,
        minimumSpend: 0,
        category: 'other',
        expiryDate: expiry.expiryDate,
        expiryPrecision: expiry.expiryPrecision,
        expiresAt: expiry.expiresAt,
        isActivated: forceActivated ? true : item?.isActivated === true,
        offerDeepLink: null,
        bank: 'wells_fargo',
        cardName: WELLS_CARD_NAME,
        cardLast4: null,
        phase: '',
        syncedAt: now.toISOString(),
      });
    }
  };

  take(eligible, { forceActivated: false, requireReward: false });
  take(activated, { forceActivated: true, requireReward: false });
  take(earned, { forceActivated: true, requireReward: true });

  if (considered > 0 && records.length === 0) {
    refuseSnapshot(sawOfferId
      ? 'Wells Fargo deals were incomplete. Nothing was changed.'
      : 'Wells Fargo deals had no offer id. Nothing was changed.');
  }
  return records;
}

function citiOffersReady(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
  if (!Array.isArray(json.merchantOffers)) return false;
  for (const group of json.merchantOffers) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) return false;
    if (!Array.isArray(group.offers)) return false;
  }
  return true;
}

function mapCitiReward(offer) {
  const title = String(offer?.offerTitle ?? '').trim();
  const discountType = String(offer?.offerDiscountType ?? '').trim().toUpperCase();
  const dollar = title.match(/\$\s*(\d+(?:\.\d+)?)/);
  const percent = title.match(/(\d+(?:\.\d+)?)\s*%/);
  let amount = NaN;
  if (discountType === 'ABSOLUTE' && dollar) amount = parseFloat(dollar[1]);
  else if (discountType === 'PERCENTAGE' && percent) amount = parseFloat(percent[1]);
  else if (dollar) amount = parseFloat(dollar[1]);
  else if (percent) amount = parseFloat(percent[1]);
  const hasAmount = Number.isFinite(amount);
  const cashbackType = discountType === 'ABSOLUTE' || (dollar && discountType !== 'PERCENTAGE')
    ? 'fixed'
    : 'percent';
  return {
    hasReward: hasAmount || title !== '',
    cashbackAmount: hasAmount ? amount : 0,
    cashbackType,
    offerDescription: title,
  };
}

function mapCitiExpiry(value) {
  const fromWells = mapWellsExpiry(value);
  if (fromWells.expiryPrecision !== 'unknown') return fromWells;
  if (value == null) return fromWells;
  const text = String(value).trim();
  if (!text) return fromWells;
  const match = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match) return fromWells;
  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  const month = months[match[1].toLowerCase()];
  if (month == null) return fromWells;
  const day = Number(match[2]);
  const year = Number(match[3]);
  const expiresAt = Date.UTC(year, month, day);
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCMonth() !== month || parsed.getUTCDate() !== day) {
    return fromWells;
  }
  return {
    expiryDate: parsed.toISOString(),
    expiryPrecision: 'date',
    expiresAt,
  };
}

export function citiRecords({ cardName, cardLast4, json, now = new Date() }) {
  if (!citiOffersReady(json)) {
    refuseSnapshot('Citi offers were not recognized. Nothing was changed.');
  }

  const resolvedName = String(cardName || '').trim() || 'Citi Card';
  const seen = new Set();
  const records = [];
  let considered = 0;
  let sawOfferId = false;

  for (const group of json.merchantOffers) {
    for (const item of group.offers || []) {
      considered += 1;
      const bankOfferId = String(item?.offerId ?? '').trim();
      if (bankOfferId) sawOfferId = true;
      const status = String(item?.offerStatus ?? '').trim().toUpperCase();
      if (status && status !== 'AVAILABLE' && status !== 'ENROLLED') continue;
      const merchantName = String(item?.merchantName ?? '').trim();
      if (!bankOfferId || !merchantName || seen.has(bankOfferId)) continue;
      seen.add(bankOfferId);
      const reward = mapCitiReward(item);
      const expiry = mapCitiExpiry(item?.offerEndDate);
      const offerToken = bankOfferId.replace(/[/\s]/g, '');
      records.push({
        id: `citi_${slug(resolvedName)}_${offerToken}`.slice(0, 700),
        bankOfferId,
        userId: null,
        merchantName,
        merchantNameLower: merchantName.toLowerCase().trim(),
        offerDescription: reward.offerDescription,
        cashbackAmount: reward.cashbackAmount,
        cashbackType: reward.cashbackType,
        minimumSpend: 0,
        category: 'other',
        expiryDate: expiry.expiryDate,
        expiryPrecision: expiry.expiryPrecision,
        expiresAt: expiry.expiresAt,
        isActivated: status === 'ENROLLED',
        offerDeepLink: null,
        bank: 'citi',
        cardName: resolvedName,
        cardLast4: cardLast4 || null,
        phase: '',
        syncedAt: now.toISOString(),
      });
    }
  }

  // An empty or no-offer payload is not a successful sync. Refuse so
  // replaceCardOffers never wipes the saved Citi card.
  if (records.length === 0) {
    if (considered === 0) {
      refuseSnapshot('Citi offers were empty. Nothing was changed.');
    }
    refuseSnapshot(sawOfferId
      ? 'Citi offers were incomplete. Nothing was changed.'
      : 'Citi offers had no offer id. Nothing was changed.');
  }
  return records;
}

export function buildSnapshotRecords(input) {
  if (input.bank === 'chase') return chaseRecords(input);
  if (input.bank === 'amex') return amexRecords(input);
  if (input.bank === 'wells_fargo') return wellsFargoRecords(input);
  if (input.bank === 'citi') return citiRecords(input);
  throw new Error('bank must be chase, amex, wells_fargo, or citi');
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
