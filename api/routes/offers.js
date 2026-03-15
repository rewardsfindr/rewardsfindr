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

async function writeOffersToDB(offers, { userId, bank, cardName }) {
  const userOffersRef = db.collection('users').doc(userId).collection('offers');

  // Fetch all existing offer IDs for this card in one read
  const existingSnap = await userOffersRef
    .where('bank', '==', bank)
    .where('cardName', '==', cardName)
    .get();
  const existingIds = new Set(existingSnap.docs.map(d => d.id));

  const batch = db.batch();
  let newCount     = 0;
  let updatedCount = 0;
  let errorCount   = 0;

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

      if (existingIds.has(offerId)) {
        updatedCount++;
      } else {
        newCount++;
      }
    } catch (error) {
      console.error(`❌ Error processing offer "${offer.merchantName}":`, error);
      errorCount++;
    }
  }

  await batch.commit();
  return { newCount, updatedCount, errorCount };
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
    const { newCount, updatedCount, errorCount } = await writeOffersToDB(offers, { userId, bank, cardName });
    console.log(`✅ Sync complete: ${newCount} new, ${updatedCount} updated, ${errorCount} errors`);

    res.json({ success: true, newCount, updatedCount, errorCount, total: offers.length });
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

    console.log(`📥 [parse] bank=${bank} phase=${phase} cardName=${cardName} userId=${userId}`);
    console.log(`📥 [parse] body keys:`, Object.keys(req.body));

    if (!bank || !['chase', 'amex'].includes(bank)) {
      return res.status(400).json({ error: "bank must be 'chase' or 'amex'" });
    }

    let offers;

    // ── Amex: JSON path ──────────────────────────────────────────
    if (bank === 'amex') {
      const { json } = req.body;
      if (!json || typeof json !== 'object') {
        console.error('❌ [parse:amex] json field missing or not an object. typeof json:', typeof json);
        return res.status(400).json({ error: 'json (object) is required for amex' });
      }
      const resolvedPhase = phase === 'enrolled' ? 'enrolled' : 'eligible';
      console.log(`🔍 [parse:amex] phase=${resolvedPhase} cardName=${cardName}`);
      console.log(`🔍 [parse:amex] json top-level keys:`, Object.keys(json));

      if (json.recommendedOffers?.offersList) {
        const pages = Object.keys(json.recommendedOffers.offersList);
        const total = pages.reduce((s, p) => s + (json.recommendedOffers.offersList[p]?.length || 0), 0);
        console.log(`🔍 [parse:amex] recommendedOffers pages=${JSON.stringify(pages)} totalRaw=${total}`);
      }
      const enrolledContainer = json.addedToCardViewAll ?? json.addedToCard;
      if (enrolledContainer?.offersList) {
        const pages = Object.keys(enrolledContainer.offersList);
        const total = pages.reduce((s, p) => s + (enrolledContainer.offersList[p]?.length || 0), 0);
        console.log(`🔍 [parse:amex] addedToCardViewAll pages=${JSON.stringify(pages)} totalRaw=${total}`);
      }

      offers = parseAmexOffers(json, resolvedPhase);
      console.log(`✅ [parse:amex] parsed ${offers.length} offers`);
      if (offers.length > 0) {
        console.log(`✅ [parse:amex] first offer sample:`, JSON.stringify(offers[0]));
      }
    }

    // ── Chase: HTML path (unchanged) ─────────────────────────────
    else {
      const { html } = req.body;
      if (!html || typeof html !== 'string') {
        return res.status(400).json({ error: 'html (string) is required for chase' });
      }
      console.log(`🔍 [parse:chase] cardName=${cardName} html.length=${html.length}`);
      offers = parseChaseOffers(html);
      console.log(`✅ [parse:chase] parsed ${offers.length} offers`);
      if (offers.length > 0) {
        console.log(`✅ [parse:chase] first offer sample:`, JSON.stringify(offers[0]));
      }
    }

    if (offers.length === 0) {
      console.log(`⚠️ [parse] 0 offers found for ${bank} phase=${phase} — returning empty`);
      return res.json({ success: true, offers: [], newCount: 0, updatedCount: 0, errorCount: 0, bank, message: 'No offers found.' });
    }

    const resolvedCardName = cardName || (bank === 'chase' ? 'Chase Card' : 'Amex Card');
    console.log(`💾 [parse] writing ${offers.length} offers to DB for ${bank} — ${resolvedCardName}`);
    const { newCount, updatedCount, errorCount } = await writeOffersToDB(offers, { userId, bank, cardName: resolvedCardName });

    console.log(`✅ [parse] done: ${offers.length} parsed → ${newCount} new, ${updatedCount} updated, ${errorCount} errors (${bank} — ${resolvedCardName})`);

    res.json({ success: true, offers, newCount, updatedCount, errorCount, bank, cardName: resolvedCardName });
  } catch (error) {
    console.error('❌ Offers parse error:', error);
    res.status(500).json({ error: 'Failed to parse and sync offers' });
  }
});

export default router;
