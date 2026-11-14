// ─────────────────────────────────────────────
// FIREBASE CLIENT (Mobile)
// Firebase JS SDK initialization for React Native/Expo
// Uses AsyncStorage for auth persistence across sessions
// ─────────────────────────────────────────────
import { Platform } from 'react-native';
import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
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

function createAuth(firebaseApp) {
  if (Platform.OS === 'web') return getAuth(firebaseApp);
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch {
    return getAuth(firebaseApp);
  }
}

function initializeFirebase() {
  if (app && authInstance) return;

  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error('❌ Missing Firebase configuration. Check your .env file.');
    throw new Error('Firebase configuration incomplete');
  }

  const existingApps = getApps();
  app = existingApps.length > 0 ? existingApps[0] : initializeApp(firebaseConfig);
  authInstance = createAuth(app);
  console.log('✅ Firebase initialized for project:', firebaseConfig.projectId);
}

export const getAuthInstance = () => {
  if (!authInstance) initializeFirebase();
  return authInstance;
};
