// ─────────────────────────────────────────────
// SEARCH ROUTES
// Handle store search and card recommendations
// Returns:
//   - personalizedOffers: user's own synced offers (requires auth)
//   - cards: general card recommendations for everyone
// ─────────────────────────────────────────────
import express from 'express';
import { db, auth } from '../config/firebase.js';
import { CARDS } from '../../shared/constants.js';
import {
  buildStoreLookup,
  findBestStoreMatch,
  buildResultsForCategory,
  normalizeMerchant,
} from '../../shared/offerUtils.js';

const router = express.Router();
const STORE_LOOKUP = buildStoreLookup();

/**
 * GET /api/search?q=storename
 * Optional: Authorization: Bearer <firebaseIdToken>
 *
 * Always returns general card recommendations.
 * If authenticated, also returns user's personalized synced offers.
 */
router.get('/', async (req, res) => {
  try {
    const query = req.query.q;

    if (!query || !query.trim()) {
      return res.status(400).json({
        error: 'Search query is required',
        example: '/api/search?q=amazon',
      });
    }

    console.log(`🔍 Search query: "${query}"`);

    // ── 1. Match store from our known store list ──────────────────────
    const match = findBestStoreMatch(query, STORE_LOOKUP);

    // ── 2. General card results (available to everyone) ───────────────
    const generalCards = match
      ? buildResultsForCategory(match.category, CARDS).map(card => ({
          ...card,
          source: 'general',
        }))
      : [];

    // ── 3. Personalized offers from Firestore (auth optional) ─────────
    let personalizedOffers = [];
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // Normalize query for exact Firestore field match
        const normalizedQuery = normalizeMerchant(query);

        const offersSnapshot = await db.collection('offers')
          .where('userId', '==', userId)
          .where('normalizedMerchant', '==', normalizedQuery)
          .get();

        if (!offersSnapshot.empty) {
          personalizedOffers = offersSnapshot.docs.map(doc => ({
            ...doc.data(),
            source: 'synced',
          }));
          console.log(`✅ Found ${personalizedOffers.length} personalized offers for "${query}" (user: ${userId})`);
        } else {
          console.log(`ℹ️  No personalized offers found for "${query}" (user: ${userId})`);
        }
      } catch (tokenError) {
        // Bad token — gracefully skip personalized results, don't fail
        console.warn('[Search] Token verification failed, returning general results only:', tokenError.message);
      }
    }

    // ── 4. No results at all ──────────────────────────────────────────
    if (!match && personalizedOffers.length === 0) {
      console.log(`❌ No match found for "${query}"`);
      return res.json({
        store: null,
        category: null,
        quality: null,
        personalizedOffers: [],
        cards: [],
        message: `No matches found for "${query}"`,
        query,
      });
    }

    res.json({
      store: match?.displayName || query,
      category: match?.category || null,
      quality: match?.quality || null,
      personalizedOffers,
      cards: generalCards,
      query,
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
