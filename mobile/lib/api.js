// ─────────────────────────────────────────────
// API Service
// Handles all HTTP calls to the RewardsFindr backend
// Automatically attaches Firebase ID token when user is signed in
// ─────────────────────────────────────────────
import { getAuthInstance } from './firebaseClient.js';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

// Get Firebase ID token for the currently signed-in user
// Returns null if not signed in (search still works, just no personalized results)
const getIdToken = async () => {
  try {
    const user = getAuthInstance().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch (e) {
    console.warn('[API] Could not get Firebase token:', e.message);
    return null;
  }
};

/**
 * Search for best credit card rewards for a store
 * If signed in, also returns personalized offers synced from extension
 * @param {string} storeName
 * @returns {Promise<{ store, category, quality, personalizedOffers, cards }>}
 */
export async function searchStore(storeName) {
  if (!storeName?.trim()) {
    throw new Error('Store name is required');
  }

  const token = await getIdToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(
    `${API_URL}/api/search?q=${encodeURIComponent(storeName)}`,
    { method: 'GET', headers }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Health check to verify API is running
 */
export async function healthCheck() {
  const response = await fetch(`${API_URL}/api/health`, { method: 'GET' });
  if (!response.ok) throw new Error(`API health check failed: ${response.status}`);
  return response.json();
}
