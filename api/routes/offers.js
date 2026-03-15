// ─────────────────────────────────────────────
// OFFERS ROUTES
// POST /api/offers/sync  — sync pre-parsed offers from Chrome extension
// POST /api/offers/parse — parse raw data from mobile WebView + sync
//
// Parse payload by bank:
//   Chase → { html: string,  bank: 'chase', cardName, phase? }
//   Amex  → { json: object,  bank: 'amex',  cardName, phase: 'eligible'|'enrolled' }
//
// Storage: /users/{userId}/offers/{offerId}  (subcollection per user)
// Cleanup: expired offers are purged on every sync (no Firestore TTL needed)
// ─────────────────────────────────────────────
import express from 'express';
import { db, auth } from '../config/firebase.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { generateOfferId, normalizeMerchant } from '../lib/shared/offerUtils.js';
import { parseChaseOffers } from '../lib/parsers/chase.js';
import { parseAmexOffers }  from '../lib/parsers/amex.js';

const router = express.Router();

const OFFER_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function toSafeTimestamp(value) {
  const ms = value ? new Date(value).getTime() : NaN;
  const safeMs = Number.isFinite(ms) ? ms : Date.now() + OFFER_TTL_MS;
  return Timestamp.fromMillis(safeMs);
}

async function verifyToken(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return null;
  }
  try {
    const idToken = authHeader.split('Bearer ')[1];
    return await auth.verifyIdToken(idToken);
  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(401).json({ error: 'Invalid authentication token' });
    return null;
  }
}

async function purgeExpiredOffers(userOffersRef, bank) {
  const now = Timestamp.now();
  const expired = await userOffersRef
    .where('bank', '==', bank)
    .where('expiresAt', '<', now)
    .get();

  if (expired.empty) return 0;

  const batch = db.batch();
  expired.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`🗑️  Purged ${expired.size} expired ${bank} offers`);
  return expired.size;
}

async function writeOffersToDB(offers, { userId, bank, cardName }) {
  const userOffersRef = db.collection('users').doc(userId).collection('offers');

  await purgeExpiredOffers(userOffersRef, bank);

  const batch = db.batch();
  let syncedCount = 0;
  let skippedCount = 0;

  for (const offer of offers) {
    try {
      const expiryDate = offer.expiryDate
        || new Date(Date.now() + OFFER_TTL_MS).toISOString();

      const offerId = generateOfferId(
        offer.merchantName,
        offer.cashbackAmount,
        expiryDate,
        cardName
      );

      const offerDoc = {
        offerId,
        userId,
        merchantName:       offer.merchantName,
        merchantNameLower:  offer.merchantName.toLowerCase().trim(),
        normalizedMerchant: normalizeMerchant(offer.merchantName),
        offerDescription:   offer.offerDescription || '',
        cashbackAmount:     offer.cashbackAmount || 0,
        cashbackType:       offer.cashbackType || 'percent',
        minimumSpend:       offer.minimumSpend || 0,
        category:           offer.category || 'other',
        expiryDate,
        expiresAt:          toSafeTimestamp(offer.expiryDate),
        isActivated:        offer.isActivated ?? false,
        offerDeepLink:      offer.offerDeepLink || null,
        bank,
        cardName,
        syncedAt:           FieldValue.serverTimestamp(),
      };

      batch.set(userOffersRef.doc(offerId), offerDoc, { merge: true });
      syncedCount++;
    } catch (error) {
      console.error(`❌ Error processing offer "${offer.merchantName}":`, error);
      skippedCount++;
    }
  }

  await batch.commit();
  return { syncedCount, skippedCount };
}

/**
 * POST /api/offers/sync
 */
router.post('/sync', async (req, res) => {
  try {
    const decoded = await verifyToken(req, res);
    if (!decoded) return;

    const userId = decoded.uid;
    const { offers, bank, cardName } = req.body;

    if (!offers || !Array.isArray(offers)) {
      return res.status(400).json({ error: 'Invalid offers data' });
    }
    if (!bank || !cardName) {
      return res.status(400).json({ error: 'bank and cardName are required' });
    }

    console.log(`🔄 Syncing ${offers.length} offers for user ${userId} (${bank} - ${cardName})`);
    const { syncedCount, skippedCount } = await writeOffersToDB(offers, { userId, bank, cardName });
    console.log(`✅ Sync complete: ${syncedCount} synced, ${skippedCount} skipped`);

    res.json({ success: true, synced: syncedCount, skipped: skippedCount, total: offers.length });
  } catch (error) {
    console.error('❌ Offers sync error:', error);
    res.status(500).json({ error: 'Failed to sync offers' });
  }
});

/**
 * POST /api/offers/parse
 *
 * Chase: expects { html: string, bank: 'chase', cardName, phase? }
 * Amex:  expects { json: object, bank: 'amex',  cardName, phase: 'eligible'|'enrolled' }
 */
router.post('/parse', async (req, res) => {
  try {
    const decoded = await verifyToken(req, res);
    if (!decoded) return;

    const userId = decoded.uid;
    const { bank, cardName, phase } = req.body;

    if (!bank || !['chase', 'amex'].includes(bank)) {
      return res.status(400).json({ error: "bank must be 'chase' or 'amex'" });
    }

    let offers;

    // ── Amex: JSON path ──────────────────────────────────────────
    if (bank === 'amex') {
      const { json } = req.body;
      if (!json || typeof json !== 'object') {
        return res.status(400).json({ error: 'json (object) is required for amex' });
      }
      const resolvedPhase = phase === 'enrolled' ? 'enrolled' : 'eligible';
      console.log(`📥 [parse:amex] phase=${resolvedPhase} cardName=${cardName}`);
      offers = parseAmexOffers(json, resolvedPhase);
      console.log(`🔍 [parse:amex] parsed ${offers.length} offers`);
    }

    // ── Chase: HTML path (unchanged) ─────────────────────────────
    else {
      const { html } = req.body;
      if (!html || typeof html !== 'string') {
        return res.status(400).json({ error: 'html (string) is required for chase' });
      }
      console.log(`📥 [parse:chase] cardName=${cardName} html.length=${html.length}`);
      offers = parseChaseOffers(html);
      console.log(`🔍 [parse:chase] parsed ${offers.length} offers`);
    }

    if (offers.length === 0) {
      return res.json({ success: true, offers: [], synced: 0, bank, message: 'No offers found.' });
    }

    const resolvedCardName = cardName || (bank === 'chase' ? 'Chase Card' : 'Amex Card');
    const { syncedCount, skippedCount } = await writeOffersToDB(offers, { userId, bank, cardName: resolvedCardName });

    console.log(`✅ [parse] ${bank} parse+sync complete: ${syncedCount} synced, ${skippedCount} skipped (${resolvedCardName})`);

    res.json({ success: true, offers, synced: syncedCount, skipped: skippedCount, bank, cardName: resolvedCardName });
  } catch (error) {
    console.error('❌ Offers parse error:', error);
    res.status(500).json({ error: 'Failed to parse and sync offers' });
  }
});

export default router;
