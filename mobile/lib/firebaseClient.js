// ─────────────────────────────────────────────
// FIREBASE CLIENT (Mobile)
// Firebase JS SDK initialization for React Native/Expo
// Uses AsyncStorage for auth persistence across sessions
// ─────────────────────────────────────────────
import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let app;
let authInstance;
let dbInstance;

function initializeFirebase() {
  if (app) return;

  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error('❌ Missing Firebase configuration. Check your .env file.');
    throw new Error('Firebase configuration incomplete');
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    app = existingApps[0];
    authInstance = getAuth(app);
  } else {
    app = initializeApp(firebaseConfig);
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  }

  dbInstance = getFirestore(app);
  console.log('✅ Firebase initialized for project:', firebaseConfig.projectId);
}

export const getAuthInstance = () => {
  if (!authInstance) initializeFirebase();
  return authInstance;
};

export const getDbInstance = () => {
  if (!dbInstance) initializeFirebase();
  return dbInstance;
};

// Proxy exports for backward compatibility
export const auth = new Proxy({}, {
  get(target, prop) { return getAuthInstance()[prop]; }
});

export const db = new Proxy({}, {
  get(target, prop) { return getDbInstance()[prop]; }
});
