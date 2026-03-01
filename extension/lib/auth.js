// ─────────────────────────────────────────────
// AUTHENTICATION
// Uses Chrome Identity API + Firebase REST API
// Can't use Firebase SDK in extensions due to CSP
// ─────────────────────────────────────────────

const FIREBASE_API_KEY = 'AIzaSyBVe-sMZEm_vGZtMc5hBu6xJZJLtQZqZqM';
const FIREBASE_AUTH_DOMAIN = 'rewardsfindr-dev.firebaseapp.com';

/**
 * Sign in with Google using Chrome Identity API
 * Returns Firebase ID token
 */
export async function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    // Get Google OAuth token from Chrome
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!token) {
        reject(new Error('No token returned'));
        return;
      }

      try {
        // Exchange Google token for Firebase token
        const response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postBody: `id_token=${token}&providerId=google.com`,
              requestUri: `https://${FIREBASE_AUTH_DOMAIN}`,
              returnIdpCredential: true,
              returnSecureToken: true,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Firebase auth failed');
        }

        // Get user info from Google
        const userInfoResponse = await fetch(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const userInfo = await userInfoResponse.json();

        resolve({
          firebaseToken: data.idToken,
          refreshToken: data.refreshToken,
          email: userInfo.email,
          name: userInfo.name,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Sign out
 */
export async function signOut() {
  return new Promise((resolve, reject) => {
    chrome.identity.clearAllCachedAuthTokens(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}
