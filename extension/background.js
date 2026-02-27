// ─────────────────────────────────────────────
// BACKGROUND SERVICE WORKER
// Runs persistently in the background
// Responsibilities:
//   1. Manages user auth state (Google sign-in)
//   2. Receives parsed offers from content scripts
//   3. Writes offers to MockDB (swapped for real Firebase later)
//   4. Updates extension badge to show sync status
// ─────────────────────────────────────────────

import { mockDB, mockAuth } from '../src/shared/mockFirebase.js';
import { generateOfferId, generateCardId, normalizeMerchant } from '../src/shared/offerUtils.js';
import { CATEGORIES } from '../src/shared/constants.js';

// ─────────────────────────────────────────────
// AUTH STATE
// Persisted in chrome.storage.local so it survives
// service worker restarts (MV3 service workers don't stay in memory)
// ─────────────────────────────────────────────
let currentUser = null;

const initAuth = async () => {
  // Check if we have a cached user first
  const cached = await chrome.storage.local.get('rewardsfindr_user');
  if (cached.rewardsfindr_user) {
    currentUser = cached.rewardsfindr_user;
    console.log('[Background] Restored user from storage:', currentUser.email);
    return currentUser;
  }

  // No cached user — sign in
  try {
    const user = await mockAuth.signIn();
    currentUser = user;
    await chrome.storage.local.set({ rewardsfindr_user: user });
    console.log('[Background] Signed in:', user.email);
    return user;
  } catch (e) {
    console.error('[Background] Auth failed:', e);
    return null;
  }
};

// ─────────────────────────────────────────────
// BADGE HELPERS
// Badge is the only UI feedback during silent sync
// Green ✓ = synced, Red ! = error, empty = idle
// ─────────────────────────────────────────────
const setBadge = (text, color) => {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
};

const setBadgeSyncing = () => setBadge('...', '#6366f1');  // indigo — syncing
const setBadgeSuccess = (count) => setBadge(`${count}`, '#10b981'); // green — done
const setBadgeError = () => setBadge('!', '#ef4444');       // red — failed

// ─────────────────────────────────────────────
// PROCESS OFFERS
// Called when a content script sends parsed offers
// Validates, deduplicates, and writes to DB
// ─────────────────────────────────────────────
const processOffers = async (bank, cardName, rawOffers) => {
  if (!currentUser) {
    console.warn('[Background] No user — cannot sync offers');
    setBadgeError();
    return { success: false, reason: 'not_authenticated' };
  }

  if (!rawOffers?.length) {
    console.warn(`[Background] No offers received from ${bank}`);
    mockDB.setSyncFailed(currentUser.uid, generateCardId(bank, cardName), 'no_offers_found');
    setBadgeError();
    return { success: false, reason: 'no_offers_found' };
  }

  setBadgeSyncing();

  const cardId = generateCardId(bank, cardName);
  let successCount = 0;
  let failCount = 0;

  for (const raw of rawOffers) {
    try {
      // Validate required fields before writing
      if (!raw.merchantName || raw.cashbackAmount == null) {
        console.warn('[Background] Skipping malformed offer:', raw);
        failCount++;
        continue;
      }

      const offerId = generateOfferId(
        raw.merchantName,
        raw.cashbackAmount,
        raw.expiryDate || 'no-expiry'
      );

      const offer = {
        merchantName: raw.merchantName,
        merchantNormalized: normalizeMerchant(raw.merchantName),
        offerDescription: raw.offerDescription || '',
        cashbackAmount: Number(raw.cashbackAmount),
        cashbackType: raw.cashbackType || 'fixed',
        minimumSpend: Number(raw.minimumSpend) || 0,
        expiryDate: raw.expiryDate || null,
        category: raw.category || CATEGORIES.OTHER,
        isActivated: raw.isActivated || false,
        source: 'chrome_extension',
      };

      mockDB.setOffer(currentUser.uid, cardId, offerId, offer);
      successCount++;

    } catch (e) {
      console.error('[Background] Failed to write offer:', e);
      failCount++;
    }
  }

  console.log(`[Background] Sync complete — ${successCount} written, ${failCount} failed`);
  setBadgeSuccess(successCount);

  return { success: true, synced: successCount, failed: failCount };
};

// ─────────────────────────────────────────────
// MESSAGE LISTENER
// Content scripts cannot write to DB directly — they send
// messages to background which handles all DB writes
// This keeps auth logic in one place
// ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Content script finished parsing offers
  if (message.type === 'OFFERS_PARSED') {
    const { bank, cardName, offers } = message.payload;
    console.log(`[Background] Received ${offers?.length} offers from ${bank}`);

    processOffers(bank, cardName, offers)
      .then(result => sendResponse(result))
      .catch(e => {
        console.error('[Background] processOffers error:', e);
        sendResponse({ success: false, reason: e.message });
      });

    return true; // Required for async sendResponse in MV3
  }

  // Popup requesting current user info
  if (message.type === 'GET_USER') {
    sendResponse({ user: currentUser });
    return true;
  }

  // Popup requesting sync summary
  if (message.type === 'GET_SYNC_STATUS') {
    if (!currentUser) {
      sendResponse({ cards: [] });
      return true;
    }
    const cards = mockDB.getCards(currentUser.uid);
    sendResponse({ cards });
    return true;
  }

  // Popup requesting sign in
  if (message.type === 'SIGN_IN') {
    initAuth()
      .then(user => sendResponse({ user }))
      .catch(e => sendResponse({ user: null, error: e.message }));
    return true;
  }

  // Popup requesting sign out
  if (message.type === 'SIGN_OUT') {
    currentUser = null;
    chrome.storage.local.remove('rewardsfindr_user');
    setBadge('', '#6366f1');
    sendResponse({ success: true });
    return true;
  }
});

// ─────────────────────────────────────────────
// EXTENSION INSTALL / STARTUP
// Runs when extension is first installed or Chrome restarts
// ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Background] RewardsFindr installed');
  await initAuth();
});

// Restore auth on service worker restart (MV3 kills service workers when idle)
initAuth();
