// ─────────────────────────────────────────────
// FIREBASE ADMIN SDK INITIALIZATION
// Single source of truth for server-side Firebase
// ─────────────────────────────────────────────
import dotenv from 'dotenv';
import admin from 'firebase-admin';

// Load .env BEFORE accessing process.env
dotenv.config();

// Initialize Firebase Admin with service account credentials from env
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID?.trim(),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL?.trim(),
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
};

if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  console.error('Missing Firebase credentials. Check your .env file.');
  console.error('PROJECT_ID:', serviceAccount.projectId ? '✓' : '✗');
  console.error('CLIENT_EMAIL:', serviceAccount.clientEmail ? '✓' : '✗');
  console.error('PRIVATE_KEY:', serviceAccount.privateKey ? '✓' : '✗');
  throw new Error('Missing Firebase Admin SDK credentials in environment variables');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export const auth = admin.auth();
export const db = admin.firestore();

console.log('✅ Firebase Admin initialized for project:', serviceAccount.projectId);
