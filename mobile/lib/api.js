// ─────────────────────────────────────────────
// API Service
// Handles all HTTP calls to Firebase Functions backend
// ─────────────────────────────────────────────

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

// Debug: Log the API URL being used
console.log('🔧 API_URL configured as:', API_URL);
console.log('🔧 EXPO_PUBLIC_API_URL env var:', process.env.EXPO_PUBLIC_API_URL);

/**
 * Search for best credit card rewards for a store
 * @param {string} storeName - Store name to search
 * @returns {Promise<{store: string, category: string, quality: string, cards: Array}>}
 */
export async function searchStore(storeName) {
  if (!storeName?.trim()) {
    throw new Error('Store name is required');
  }

  const url = `${API_URL}/api/search?q=${encodeURIComponent(storeName)}`;
  console.log('🔍 Fetching:', url);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('📡 Response status:', response.status);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Network error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Response data:', data);
    return data;
  } catch (error) {
    console.error('❌ Fetch error:', error);
    throw error;
  }
}

/**
 * Health check to verify API is running
 * @returns {Promise<{status: string, timestamp: string}>}
 */
export async function healthCheck() {
  const url = `${API_URL}/api/health`;
  console.log('🏥 Health check:', url);

  const response = await fetch(url, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`API health check failed: ${response.status}`);
  }

  return response.json();
}
