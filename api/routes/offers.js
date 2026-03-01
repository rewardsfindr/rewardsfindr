// ─────────────────────────────────────────────
// OFFERS ROUTES
// Handle syncing offers from Chrome extension
// ─────────────────────────────────────────────
import express from 'express';
import admin from '../firebase.js';
import { generateOfferId, normalizeMerchant } from '../../shared/offerUtils.js';

const router = express.Router();
const db = admin.firestore();

/**
 * POST /api/offers/sync
 * Sync offers from Chrome extension to Firestore
 * Requires Firebase authentication
 */
router.post('/sync', async (req, res) => {
  try {
    // Get Firebase ID token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify Firebase token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      console.error('Token verification failed:', error);
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const userId = decodedToken.uid;
    const { offers } = req.body;

    if (!offers || !Array.isArray(offers)) {
      return res.status(400).json({ error: 'Invalid offers data' });
    }

    console.log(`🔄 Syncing ${offers.length} offers for user ${userId}`);

    // Process offers and write to Firestore
    const batch = db.batch();
    let syncedCount = 0;
    let skippedCount = 0;

    for (const offer of offers) {
      try {
        // Generate deterministic offer ID
        const offerId = generateOfferId(
          offer.merchantName,
          offer.cashbackAmount,
          offer.expiryDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // Default 90 days if no expiry
        );

        // Normalize merchant name for search matching
        const normalizedMerchant = normalizeMerchant(offer.merchantName);

        // Prepare offer document
        const offerDoc = {
          offerId,
          userId,
          merchantName: offer.merchantName,
          normalizedMerchant,
          offerDescription: offer.offerDescription || '',
          cashbackAmount: offer.cashbackAmount || 0,
          cashbackType: offer.cashbackType || 'percent',
          minimumSpend: offer.minimumSpend || 0,
          category: offer.category || 'other',
          expiryDate: offer.expiryDate || null,
          isActivated: offer.isActivated || false,
          bank: 'chase', // TODO: Get from request
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Use offerId as document ID to prevent duplicates
        const offerRef = db.collection('offers').doc(offerId);
        batch.set(offerRef, offerDoc, { merge: true });
        syncedCount++;

      } catch (error) {
        console.error(`❌ Error processing offer ${offer.merchantName}:`, error);
        skippedCount++;
      }
    }

    // Commit batch write
    await batch.commit();

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

export default router;
