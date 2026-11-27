// Resolve the Google OAuth web client id for native Google Sign-In.
// Order: EXPO_PUBLIC_GOOGLE_CLIENT_ID → app.config extra → committed
// type-3 client from google-services.json (public in the APK).
import Constants from 'expo-constants';

/** Type-3 OAuth web client from mobile/google-services.json. */
export const GOOGLE_SERVICES_WEB_CLIENT_ID =
  '963869613685-7u94c53t5grma47e1qnt5b0hucfa3bi5.apps.googleusercontent.com';

export function getGoogleWebClientId() {
  const fromEnv = (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
  if (fromEnv) return fromEnv;

  const extra =
    Constants.expoConfig?.extra?.googleWebClientId ||
    Constants.manifest?.extra?.googleWebClientId ||
    Constants.manifest2?.extra?.expoClient?.extra?.googleWebClientId;
  const fromExtra = (extra != null ? String(extra) : '').trim();
  if (fromExtra) return fromExtra;

  return GOOGLE_SERVICES_WEB_CLIENT_ID;
}
