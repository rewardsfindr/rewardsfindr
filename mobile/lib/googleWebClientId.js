// Resolve the Google OAuth web client id for native Google Sign-In.
// Order: EXPO_PUBLIC_GOOGLE_CLIENT_ID → app.config extra → committed
// type-3 client from google-services.json (public in the APK).
// Pure module (no expo-constants) so node:test can import it.

/** Type-3 OAuth web client from mobile/google-services.json. */
export const GOOGLE_SERVICES_WEB_CLIENT_ID =
  '963869613685-7u94c53t5grma47e1qnt5b0hucfa3bi5.apps.googleusercontent.com';

/**
 * Pure resolver for tests and runtime.
 * @param {{ env?: string|null, extra?: string|null }} [opts]
 */
export function resolveGoogleWebClientId({ env, extra } = {}) {
  const fromEnv = (env != null ? String(env) : '').trim();
  if (fromEnv) return fromEnv;

  const fromExtra = (extra != null ? String(extra) : '').trim();
  if (fromExtra) return fromExtra;

  return GOOGLE_SERVICES_WEB_CLIENT_ID;
}

/**
 * Runtime helper: env from process.env, optional Expo `extra.googleWebClientId`.
 * Callers that have expo-constants should pass the extra value in.
 */
export function getGoogleWebClientId(extra) {
  return resolveGoogleWebClientId({
    env: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    extra,
  });
}
