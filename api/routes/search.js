// ─────────────────────────────────────────────
// SEARCH ROUTES
// GET /api/search?q=storename
//
// Queries /users/{userId}/offers scoped to the user.
// Uses merchantNameLower for a prefix match.
// Drops expired offers in process. Unknown expiry stays in the results.
// ─────────────────────────────────────────────
import express from 'express';
import { db, auth } from '../config/firebase.js';
import { isCurrentOffer } from '../lib/offers/offerFreshness.js';

const router = express.Router();

/**
 * GET /api/search?q=storename
 * Authorization: Bearer <firebaseIdToken>  (required)
 */
router.get('/', async (req, res) => {
  try {
    const query = req.query.q;

    if (!query || !query.trim()) {
      return res.status(400).json({
        error: 'Search query is required',
        example: '/api/search?q=starbucks',
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const queryLower = query.toLowerCase().trim();
    const now = new Date();

    // Scoped to this user only — no cross-user reads
    const userOffersRef = db.collection('users').doc(userId).collection('offers');

    // Prefix match on the merchant name. Expired rows are dropped here so an
    // offer with an unknown expiry (no expiresAt) still comes back.
    const snapshot = await userOffersRef
      .where('merchantNameLower', '>=', queryLower)
      .where('merchantNameLower', '<=', queryLower + '\uf8ff')
      .get();

    const personalizedOffers = snapshot.docs
      .map(doc => doc.data())
      .filter(offer => isCurrentOffer(offer, now));

    if (personalizedOffers.length > 0) {
      console.log(`✅ Found ${personalizedOffers.length} offers for "${query}" (user: ${userId})`);
    } else {
      console.log(`ℹ️  No offers found for "${query}" (user: ${userId})`);
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
