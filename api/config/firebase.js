// ─────────────────────────────────────────────
// FIREBASE ADMIN SDK INITIALIZATION
// Single source of truth for server-side Firebase
// ─────────────────────────────────────────────
import admin from 'firebase-admin';

// Initialize Firebase Admin with service account credentials from env
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
};

if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  throw new Error('Missing Firebase Admin SDK credentials in environment variables');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export const auth = admin.auth();
export const db = admin.firestore();

console.log('✅ Firebase Admin initialized for project:', serviceAccount.projectId);
