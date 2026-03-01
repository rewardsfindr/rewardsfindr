// ─────────────────────────────────────────────
// FIREBASE CLIENT (Mobile)
// Firebase JS SDK initialization for React Native/Expo
// Uses EXPO_PUBLIC_ env vars injected at build time
// ─────────────────────────────────────────────
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase config from environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Lazy initialization - only initialize when actually needed
let app;
let authInstance;
let dbInstance;

function initializeFirebase() {
  if (app) return; // Already initialized
  
  // Validate required config
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error('❌ Missing Firebase configuration. Check your .env file.');
    throw new Error('Firebase configuration incomplete');
  }

  // Check if already initialized
  const apps = getApps();
  if (apps.length > 0) {
    app = apps[0];
  } else {
    app = initializeApp(firebaseConfig);
  }
  
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
  
  console.log('✅ Firebase initialized for project:', firebaseConfig.projectId);
}

// Export getters that initialize on first access
export const getAuthInstance = () => {
  if (!authInstance) initializeFirebase();
  return authInstance;
};

export const getDbInstance = () => {
  if (!dbInstance) initializeFirebase();
  return dbInstance;
};

// Legacy exports for backward compatibility
export const auth = new Proxy({}, {
  get(target, prop) {
    return getAuthInstance()[prop];
  }
});

export const db = new Proxy({}, {
  get(target, prop) {
    return getDbInstance()[prop];
  }
});
