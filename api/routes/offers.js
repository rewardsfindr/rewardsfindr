// ─────────────────────────────────────────────
// OFFERS ROUTES
// Handle offer syncing and retrieval
// ─────────────────────────────────────────────
import express from 'express';
import { db } from '../config/firebase.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/offers/sync
 * Accept scraped offers from Chrome extension
 * Protected route - requires valid Firebase token
 */
router.post('/sync', verifyToken, async (req, res) => {
  try {
    const { offers } = req.body;
    const userId = req.user.uid;

    if (!Array.isArray(offers) || offers.length === 0) {
      return res.status(400).json({ error: 'Invalid offers data' });
    }

    // Validate each offer has required fields
    for (const offer of offers) {
      if (!offer.merchant || !offer.bank || !offer.amount) {
        return res.status(400).json({ 
          error: 'Each offer must have merchant, bank, and amount' 
        });
      }
    }

    // Store offers in Firestore
    const batch = db.batch();
    const timestamp = new Date();

    for (const offer of offers) {
      // Generate unique offer ID based on merchant and bank
      const offerId = `${offer.bank}_${offer.merchant}_${Date.now()}`.toLowerCase().replace(/\s+/g, '_');
      const offerRef = db.collection('users').doc(userId).collection('offers').doc(offerId);
      
      batch.set(offerRef, {
        ...offer,
        activatedAt: timestamp,
        source: 'extension',
        synced: true
      });
    }

    await batch.commit();

    res.json({ 
      success: true, 
      count: offers.length,
      message: `${offers.length} offers synced successfully` 
    });
  } catch (error) {
    console.error('Offer sync error:', error);
    res.status(500).json({ error: 'Failed to sync offers' });
  }
});

/**
 * GET /api/offers/:userId
 * Retrieve all offers for a user
 * Protected route - requires valid Firebase token
 */
router.get('/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Users can only access their own offers
    if (userId !== req.user.uid) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const offersSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('offers')
      .orderBy('activatedAt', 'desc')
      .get();

    const offers = [];
    offersSnapshot.forEach(doc => {
      offers.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json({ 
      success: true,
      count: offers.length,
      offers 
    });
  } catch (error) {
    console.error('Get offers error:', error);
    res.status(500).json({ error: 'Failed to retrieve offers' });
  }
});

export default router;
