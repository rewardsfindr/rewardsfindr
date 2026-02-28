// ─────────────────────────────────────────────
// AUTH ROUTES
// Handle authentication token exchange
// ─────────────────────────────────────────────
import express from 'express';
import { auth } from '../config/firebase.js';

const router = express.Router();

/**
 * POST /api/auth/verify
 * Exchange Google OAuth token for Firebase custom token
 * Used by Chrome extension to authenticate users
 */
router.post('/verify', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'Missing idToken in request body' });
    }

    // Verify the Google OAuth token
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Create or update user record in Firebase Auth
    try {
      await auth.getUser(uid);
    } catch (error) {
      // User doesn't exist, create them
      if (error.code === 'auth/user-not-found') {
        await auth.createUser({
          uid,
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified,
          displayName: decodedToken.name
        });
      }
    }

    // Generate a custom token for this user
    const customToken = await auth.createCustomToken(uid);

    res.json({ 
      success: true,
      customToken,
      user: {
        uid,
        email: decodedToken.email,
        displayName: decodedToken.name
      }
    });
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
