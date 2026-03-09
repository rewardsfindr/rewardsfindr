// ─────────────────────────────────────────────
// SEARCH ROUTES
// Returns personalized offers synced by the user (auth required).
// ─────────────────────────────────────────────
import express from 'express';
import { db, auth } from '../config/firebase.js';
import { normalizeMerchant } from '../../shared/offerUtils.js';

const router = express.Router();

/**
 * GET /api/search?q=storename
 * Authorization: Bearer <firebaseIdToken>  (required)
 *
 * Returns the user's personalized synced offers matching the query.
 */
router.get('/', async (req, res) => {
  try {
    const query = req.query.q;

    if (!query || !query.trim()) {
      return res.status(400).json({
        error: 'Search query is required',
        example: '/api/search?q=turo',
      });
    }

    console.log(`🔍 Search query: "${query}"`);

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    let personalizedOffers = [];

    try {
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const normalizedQuery = normalizeMerchant(query);

      const offersSnapshot = await db.collection('offers')
        .where('userId', '==', userId)
        .get();

      const allOffers = offersSnapshot.docs.map(doc => doc.data());

      personalizedOffers = allOffers.filter(offer => {
        if (offer.normalizedMerchant === normalizedQuery) return true;
        const merchantLower = (offer.merchantName || '').toLowerCase().trim();
        return merchantLower.startsWith(normalizedQuery);
      });

      if (personalizedOffers.length > 0) {
        console.log(`✅ Found ${personalizedOffers.length} offers for "${query}" (user: ${userId})`);
      } else {
        console.log(`ℹ️  No offers found for "${query}" (user: ${userId})`);
      }
    } catch (err) {
      console.warn('[Search] Error:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (personalizedOffers.length === 0) {
      return res.json({ offers: [], message: `No offers found for "${query}"`, query });
    }

    res.json({ offers: personalizedOffers, query });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
