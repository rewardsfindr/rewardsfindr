// ─────────────────────────────────────────────
// MOCK FIREBASE
// Drop-in replacement for the real Firebase SDK
// Mirrors the exact same method signatures as real Firestore + Auth
// When Firebase account is ready, swap this import in ONE line per file:
//   FROM: import { mockDB, mockAuth } from '../shared/mockFirebase.js'
//   TO:   import { db, auth } from '../shared/firebase.config.js'
// ─────────────────────────────────────────────

const mockStore = {
  users: {},
};

// ─────────────────────────────────────────────
// INTERNAL HELPER
// Ensures user node always exists before read/write
// ─────────────────────────────────────────────
const getUser = (uid) => {
  if (!mockStore.users[uid]) {
    mockStore.users[uid] = { cards: {} };
  }
  return mockStore.users[uid];
};

// ─────────────────────────────────────────────
// MOCK DATABASE
// ─────────────────────────────────────────────
export const mockDB = {

  // Write a single offer
  // Mirrors: setDoc(doc(db, 'users', uid, 'cards', cardId, 'offers', offerId), offerData)
  // Idempotent — calling twice with same offerId overwrites, never duplicates
  setOffer: (uid, cardId, offerId, offerData) => {
    const user = getUser(uid);
    if (!user.cards[cardId]) {
      user.cards[cardId] = {
        offers: {},
        lastSynced: null,
        syncStatus: 'success',
      };
    }
    user.cards[cardId].offers[offerId] = {
      ...offerData,
      syncedAt: new Date().toISOString(),
    };
    user.cards[cardId].lastSynced = new Date().toISOString();
    console.log(`[MockDB] ✓ Offer written: ${cardId} / ${offerId}`, offerData);
  },

  // Read all offers for a user across all cards
  // Mirrors: getDocs(collectionGroup(db, 'offers')) filtered by uid
  getOffers: (uid) => {
    const user = getUser(uid);
    const offers = [];
    Object.entries(user.cards).forEach(([cardId, card]) => {
      Object.entries(card.offers).forEach(([offerId, offer]) => {
        offers.push({ cardId, offerId, ...offer });
      });
    });
    console.log(`[MockDB] getOffers(${uid}): ${offers.length} offers found`);
    return offers;
  },

  // Read all cards with sync metadata (no offers data)
  // Used by SyncScreen to show per-card sync status
  getCards: (uid) => {
    const user = getUser(uid);
    return Object.entries(user.cards).map(([cardId, card]) => ({
      cardId,
      lastSynced: card.lastSynced,
      syncStatus: card.syncStatus,
      offerCount: Object.keys(card.offers).length,
    }));
  },

  // Mark a card's sync as failed
  // Used by extension when DOM parse fails on a bank page
  setSyncFailed: (uid, cardId, reason) => {
    const user = getUser(uid);
    if (!user.cards[cardId]) {
      user.cards[cardId] = { offers: {}, lastSynced: null, syncStatus: 'failed' };
    }
    user.cards[cardId].syncStatus = 'failed';
    user.cards[cardId].syncError = reason;
    console.warn(`[MockDB] ✗ Sync failed: ${cardId} — ${reason}`);
  },

  // Clear all data for a user — used in unit tests only
  clearUser: (uid) => {
    delete mockStore.users[uid];
    console.log(`[MockDB] Cleared all data for uid: ${uid}`);
  },

  // Dump full store state to console — debugging only
  dump: () => {
    console.log('[MockDB] Full store state:', JSON.stringify(mockStore, null, 2));
  },
};

// ─────────────────────────────────────────────
// MOCK AUTH
// Mirrors Firebase Auth interface
// uid is the single identity key used across all Firestore reads/writes
// ─────────────────────────────────────────────
export const mockAuth = {
  currentUser: {
    uid: 'mock_user_001',
    email: 'test@rewardsfindr.com',
    displayName: 'Test User',
  },

  // Mirrors: signInWithPopup(auth, googleProvider)
  signIn: () => {
    console.log('[MockAuth] ✓ Signed in as mock_user_001');
    return Promise.resolve(mockAuth.currentUser);
  },

  // Mirrors: signOut(auth)
  signOut: () => {
    console.log('[MockAuth] Signed out');
    return Promise.resolve();
  },

  // Mirrors: onAuthStateChanged(auth, callback)
  onAuthStateChanged: (callback) => {
    console.log('[MockAuth] onAuthStateChanged: returning mock user');
    callback(mockAuth.currentUser);
    // Returns unsubscribe function (mirrors real Firebase behavior)
    return () => {};
  },
};
