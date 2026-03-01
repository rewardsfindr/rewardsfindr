// ─────────────────────────────────────────────
// SEARCH ROUTES
// Handle store search and card recommendations
// ─────────────────────────────────────────────
import express from 'express';
import { CARDS } from '../../shared/constants.js';
import { buildStoreLookup, findBestStoreMatch, buildResultsForCategory } from '../../shared/offerUtils.js';

const router = express.Router();
const STORE_LOOKUP = buildStoreLookup();

/**
 * GET /api/search?q=storename
 * Search for best credit card rewards for a store
 */
router.get('/', (req, res) => {
  try {
    const query = req.query.q;

    if (!query || !query.trim()) {
      return res.status(400).json({ 
        error: 'Search query is required',
        example: '/api/search?q=amazon'
      });
    }

    console.log(`🔍 Search query: "${query}"`);

    // Find best store match
    const match = findBestStoreMatch(query, STORE_LOOKUP);

    if (!match) {
      console.log(`❌ No match found for "${query}"`);
      return res.json({
        store: null,
        category: null,
        quality: null,
        cards: [],
        message: `No matches found for "${query}"`
      });
    }

    console.log(`✅ Match found: ${match.displayName} (${match.category})`);

    // Build card results for the matched category
    const cards = buildResultsForCategory(match.category, CARDS);

    res.json({
      store: match.displayName,
      category: match.category,
      quality: match.quality,
      cards: cards,
      query: query
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
