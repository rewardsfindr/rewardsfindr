// ─────────────────────────────────────────────
// OFFERS ROUTES
// POST /api/offers/sync  — sync pre-parsed offers from Chrome extension
// POST /api/offers/parse — parse raw HTML from mobile WebView + sync
//
// Storage: /users/{userId}/offers/{offerId}  (subcollection per user)
// Cleanup: expired offers are purged on every sync (no Firestore TTL needed)
// ─────────────────────────────────────────────
import express from 'express';
import { db, auth } from '../config/firebase.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { generateOfferId, normalizeMerchant } from '../lib/shared/offerUtils.js';
import { parseChaseOffers } from '../lib/parsers/chase.js';
import { parseAmexOffers } from '../lib/parsers/amex.js';

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
 */
router.post('/parse', async (req, res) => {
  try {
    const decoded = await verifyToken(req, res);
    if (!decoded) return;

    const userId = decoded.uid;
    const { html, bank, cardName, phase } = req.body;

    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'html is required and must be a string' });
    }
    if (!bank || !['chase', 'amex'].includes(bank)) {
      return res.status(400).json({ error: "bank must be 'chase' or 'amex'" });
    }

    // DEBUG: log incoming HTML stats
    console.log(`📥 [parse] bank=${bank} cardName=${cardName} phase=${phase} html.length=${html.length}`);
    console.log(`📥 [parse] html snippet (first 300 chars):`, html.substring(0, 300));

    // DEBUG: check if key Amex selectors are present in the HTML
    if (bank === 'amex') {
      console.log(`🔍 [parse:amex] listViewRow count:`, (html.match(/listViewRow/g) || []).length);
      console.log(`🔍 [parse:amex] merchantOfferListAddButton count:`, (html.match(/merchantOfferListAddButton/g) || []).length);
      console.log(`🔍 [parse:amex] merchantOfferSuccessIcon count:`, (html.match(/merchantOfferSuccessIcon/g) || []).length);
      console.log(`🔍 [parse:amex] listViewContainer present:`, html.includes('listViewContainer'));
    }

    const parseFn = bank === 'chase' ? parseChaseOffers : parseAmexOffers;
    const offers = parseFn(html);

    // For Amex, override isActivated based on phase:
    // eligible page = all not activated, enrolled page = all activated
    if (bank === 'amex' && phase) {
      const activated = phase === 'enrolled';
      offers.forEach(o => { o.isActivated = activated; });
      console.log(`🔍 [parse:amex] overriding isActivated=${activated} for all ${offers.length} offers (phase=${phase})`);
    }

    console.log(`🔍 [parse] parsed ${offers.length} offers from ${bank} HTML for user ${userId}`);
    if (offers.length > 0) {
      console.log(`🔍 [parse] first offer sample:`, JSON.stringify(offers[0]));
    }

    if (offers.length === 0) {
      return res.json({ success: true, offers: [], synced: 0, bank, message: 'No offers found in provided HTML.' });
    }

    const resolvedCardName = cardName || (bank === 'chase' ? 'Chase Card' : 'Amex Card');
    const { syncedCount, skippedCount } = await writeOffersToDB(offers, { userId, bank, cardName: resolvedCardName });

    console.log(`✅ [parse] Parse+sync complete: ${syncedCount} synced, ${skippedCount} skipped (${bank} — ${resolvedCardName})`);

    res.json({ success: true, offers, synced: syncedCount, skipped: skippedCount, bank, cardName: resolvedCardName });
  } catch (error) {
    console.error('❌ Offers parse error:', error);
    res.status(500).json({ error: 'Failed to parse and sync offers' });
  }
});

export default router;
