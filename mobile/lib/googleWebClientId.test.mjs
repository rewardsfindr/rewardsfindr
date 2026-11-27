import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const googleServices = require('../google-services.json');

/** Same type-3 lookup as app.config.js (kept in sync for the dogfood fallback). */
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

describe('google-services web client id', () => {
  it('finds the type-3 OAuth client used as Google Sign-In webClientId fallback', () => {
    const id = webClientIdFromGoogleServices(googleServices);
    assert.equal(
      id,
      '963869613685-7u94c53t5grma47e1qnt5b0hucfa3bi5.apps.googleusercontent.com',
    );
    assert.match(id, /\.apps\.googleusercontent\.com$/);
  });
});
