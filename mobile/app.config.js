// Expo config: keep app.json as the static base, inject Google web client id
// from EXPO_PUBLIC_GOOGLE_CLIENT_ID or google-services.json (OAuth client_type 3).
const appJson = require('./app.json');
const googleServices = require('./google-services.json');

function webClientIdFromGoogleServices(gs) {
  const clients = gs?.client || [];
  for (const client of clients) {
    for (const oauth of client.oauth_client || []) {
      if (oauth.client_type === 3 && oauth.client_id) return oauth.client_id;
    }
    const other = client.services?.appinvite_service?.other_platform_oauth_client || [];
    for (const oauth of other) {
      if (oauth.client_type === 3 && oauth.client_id) return oauth.client_id;
    }
  }
  return null;
}

const fromEnv = (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
const googleWebClientId = fromEnv || webClientIdFromGoogleServices(googleServices) || null;

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      googleWebClientId,
    },
  },
};
