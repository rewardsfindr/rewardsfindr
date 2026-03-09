// ─────────────────────────────────────────────
// OFFERS ROUTES
// POST /api/offers/sync  — sync pre-parsed offers from Chrome extension
// POST /api/offers/parse — parse raw HTML from mobile WebView + sync
// ─────────────────────────────────────────────
import express from 'express';
import { db, auth } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { generateOfferId, normalizeMerchant } from '../../shared/offerUtils.js';
import { parseChaseOffers } from '../lib/parsers/chase.js';
import { parseAmexOffers } from '../lib/parsers/amex.js';

const router = express.Router();

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

// ─────────────────────────────────────────────
// Shared helper: write an offers array to Firestore
// offerId includes cardName so the same offer on two
// different cards generates distinct Firestore documents.
// ─────────────────────────────────────────────
async function writeOffersToDB(offers, { userId, bank, cardName }) {
  const batch = db.batch();
  let syncedCount = 0;
  let skippedCount = 0;

  for (const offer of offers) {
    try {
      const offerId = generateOfferId(
        offer.merchantName,
        offer.cashbackAmount,
        offer.expiryDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        cardName  // included for per-card deduplication
      );

      const offerDoc = {
        offerId,
        userId,
        merchantName: offer.merchantName,
        normalizedMerchant: normalizeMerchant(offer.merchantName),
        offerDescription: offer.offerDescription || '',
        cashbackAmount: offer.cashbackAmount || 0,
        cashbackType: offer.cashbackType || 'percent',
        minimumSpend: offer.minimumSpend || 0,
        category: offer.category || 'other',
        expiryDate: offer.expiryDate || null,
        isActivated: offer.isActivated || false,
        bank,
        cardName,
        syncedAt: FieldValue.serverTimestamp(),
      };

      batch.set(db.collection('offers').doc(offerId), offerDoc, { merge: true });
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
 * Sync pre-parsed offers from Chrome extension to Firestore.
 * Body: { offers: [], bank: string, cardName: string }
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

    res.json({
      success: true,
      synced: syncedCount,
      skipped: skippedCount,
      total: offers.length,
    });
  } catch (error) {
    console.error('❌ Offers sync error:', error);
    res.status(500).json({ error: 'Failed to sync offers' });
  }
});

/**
 * POST /api/offers/parse
 * Parse raw HTML from mobile WebView and sync offers to Firestore.
 * Body: { html: string, bank: 'chase' | 'amex', cardName?: string }
 * Auth: Required (Firebase Bearer token)
 */
router.post('/parse', async (req, res) => {
  try {
    const decoded = await verifyToken(req, res);
    if (!decoded) return;

    const userId = decoded.uid;
    const { html, bank, cardName } = req.body;

    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'html is required and must be a string' });
    }
    if (!bank || !['chase', 'amex'].includes(bank)) {
      return res.status(400).json({ error: "bank must be 'chase' or 'amex'" });
    }

    const parseFn = bank === 'chase' ? parseChaseOffers : parseAmexOffers;
    const offers = parseFn(html);

    console.log(`🔍 Parsed ${offers.length} offers from ${bank} HTML for user ${userId}`);

    if (offers.length === 0) {
      return res.json({
        success: true,
        offers: [],
        synced: 0,
        bank,
        message: 'No offers found in provided HTML. Selectors may need tuning.',
      });
    }

    const resolvedCardName = cardName || (bank === 'chase' ? 'Chase Card' : 'Amex Card');

    const { syncedCount, skippedCount } = await writeOffersToDB(offers, {
      userId,
      bank,
      cardName: resolvedCardName,
    });

    console.log(`✅ Parse+sync complete: ${syncedCount} synced, ${skippedCount} skipped (${bank} — ${resolvedCardName})`);

    res.json({
      success: true,
      offers,
      synced: syncedCount,
      skipped: skippedCount,
      bank,
      cardName: resolvedCardName,
    });
  } catch (error) {
    console.error('❌ Offers parse error:', error);
    res.status(500).json({ error: 'Failed to parse and sync offers' });
  }
});

export default router;
