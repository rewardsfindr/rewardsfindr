// ─────────────────────────────────────────────
// API CLIENT (Mobile)
// HTTP client for calling the Node.js backend API
// Automatically includes Firebase auth tokens
// ─────────────────────────────────────────────
import { auth } from './firebaseClient';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Get the current user's Firebase ID token
 */
async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return await user.getIdToken();
}

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  try {
    const token = await getAuthToken();
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }

    return await response.json();
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}

/**
 * Sync offers to backend
 */
export async function syncOffers(offers) {
  return apiRequest('/api/offers/sync', {
    method: 'POST',
    body: JSON.stringify({ offers }),
  });
}

/**
 * Get user's synced offers
 */
export async function getUserOffers(userId) {
  return apiRequest(`/api/offers/${userId}`);
}

/**
 * Health check (no auth required)
 */
export async function healthCheck() {
  const response = await fetch(`${API_BASE_URL}/health`);
  return await response.json();
}

console.log('✅ API client configured for:', API_BASE_URL);
