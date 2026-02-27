// ─────────────────────────────────────────────
// FIREBASE INIT
// Single source of truth for Firebase app, auth, and db.
// All env vars are injected by Vite (VITE_ prefix) at build time.
// Never import firebase directly elsewhere — always import from here.
// ─────────────────────────────────────────────
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth     = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db       = getFirestore(app);
