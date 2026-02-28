// ─────────────────────────────────────────────
// AUTH MIDDLEWARE
// Verifies Firebase ID tokens on protected routes
// ─────────────────────────────────────────────
import { auth } from '../config/firebase.js';

/**
 * Middleware to verify Firebase ID token from Authorization header
 * Attaches decoded user info to req.user
 */
export async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified
    };
    
    next();
  } catch (error) {
    console.error('Token verification failed:', error.message);
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}
