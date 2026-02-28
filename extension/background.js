// ─────────────────────────────────────────────
// BACKGROUND SERVICE WORKER
// Runs persistently in the background
// Responsibilities:
//   1. Receives parsed offers from content scripts
//   2. Logs them to console (DB sync coming later)
//   3. Updates extension badge to show sync status
// ─────────────────────────────────────────────

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
// For now, just logs them - DB sync coming later
// ─────────────────────────────────────────────
const processOffers = async (bank, cardName, rawOffers) => {
  if (!rawOffers?.length) {
    console.warn(`[Background] No offers received from ${bank}`);
    setBadgeError();
    return { success: false, reason: 'no_offers_found' };
  }

  setBadgeSyncing();

  console.log(`[Background] Processing ${rawOffers.length} offers from ${bank} (${cardName})`);
  console.table(rawOffers);

  // TODO: Add database sync here
  // For now, just store in chrome.storage for testing
  try {
    await chrome.storage.local.set({
      [`offers_${bank}_${cardName}`]: {
        bank,
        cardName,
        offers: rawOffers,
        syncedAt: new Date().toISOString(),
      }
    });

    console.log(`[Background] Stored ${rawOffers.length} offers in local storage`);
    setBadgeSuccess(rawOffers.length);

    return { success: true, synced: rawOffers.length };
  } catch (e) {
    console.error('[Background] Failed to store offers:', e);
    setBadgeError();
    return { success: false, reason: e.message };
  }
};

// ─────────────────────────────────────────────
// MESSAGE LISTENER
// Content scripts send messages to background
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

  // Popup requesting stored offers
  if (message.type === 'GET_OFFERS') {
    chrome.storage.local.get(null, (items) => {
      const offerKeys = Object.keys(items).filter(k => k.startsWith('offers_'));
      const allOffers = offerKeys.map(k => items[k]);
      sendResponse({ offers: allOffers });
    });
    return true;
  }
});

// ─────────────────────────────────────────────
// EXTENSION INSTALL / STARTUP
// ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Background] RewardsFindr extension installed');
  setBadge('', '#6366f1');
});

console.log('[Background] RewardsFindr service worker started');
