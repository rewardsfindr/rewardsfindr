// ─────────────────────────────────────────────
// API Service
// Handles all HTTP calls to Firebase Functions backend
// ─────────────────────────────────────────────

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Search for best credit card rewards for a store
 * @param {string} storeName - Store name to search
 * @returns {Promise<{store: string, category: string, quality: string, cards: Array}>}
 */
export async function searchStore(storeName) {
  if (!storeName?.trim()) {
    throw new Error('Store name is required');
  }

  const response = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(storeName)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Health check to verify API is running
 * @returns {Promise<{status: string, timestamp: string}>}
 */
export async function healthCheck() {
  const response = await fetch(`${API_URL}/api/health`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`API health check failed: ${response.status}`);
  }

  return response.json();
}
