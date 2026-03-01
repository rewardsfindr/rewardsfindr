// ─────────────────────────────────────────────
// FIREBASE ADMIN SDK
// Server-side Firebase initialization for API
// ─────────────────────────────────────────────
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    // Try to load service account from file
    const serviceAccountPath = join(__dirname, 'serviceAccountKey.json');
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase Admin initialized with service account');
  } catch (error) {
    // Fallback: use environment variables (for production)
    if (process.env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
      console.log('✅ Firebase Admin initialized with application default credentials');
    } else {
      console.error('❌ Firebase Admin initialization failed:', error.message);
      console.error('Please add serviceAccountKey.json or set FIREBASE_PROJECT_ID env var');
      process.exit(1);
    }
  }
}

export default admin;
