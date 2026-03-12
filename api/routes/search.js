// ─────────────────────────────────────────────
// SEARCH ROUTES
// GET /api/search?q=storename
//
// Queries /users/{userId}/offers scoped to the user.
// Uses merchantNameLower for exact match + startsWith prefix.
// Filters out expired offers (expiresAt < now).
//
// Required Firestore composite index:
//   Collection: users/{userId}/offers
//   Fields: merchantNameLower ASC, expiresAt ASC
// ─────────────────────────────────────────────
import express from 'express';
import { db, auth } from '../config/firebase.js';
import { normalizeMerchant } from '../lib/shared/offerUtils.js';

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

    // Firestore prefix search: merchantNameLower >= queryLower AND < queryLower + '\uf8ff'
    // Also filters out expired offers in the same query
    const snapshot = await userOffersRef
      .where('merchantNameLower', '>=', queryLower)
      .where('merchantNameLower', '<=', queryLower + '\uf8ff')
      .where('expiresAt', '>', now)
      .get();

    const personalizedOffers = snapshot.docs.map(doc => doc.data());

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
