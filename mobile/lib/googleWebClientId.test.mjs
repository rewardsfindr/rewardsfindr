import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import {
  GOOGLE_SERVICES_WEB_CLIENT_ID,
  getGoogleWebClientId,
  resolveGoogleWebClientId,
} from './googleWebClientId.js';

const require = createRequire(import.meta.url);
const googleServices = require('../google-services.json');

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

describe('googleWebClientId', () => {
  it('exports a committed fallback that matches google-services.json type-3', () => {
    const fromJson = webClientIdFromGoogleServices(googleServices);
    assert.equal(GOOGLE_SERVICES_WEB_CLIENT_ID, fromJson);
    assert.match(GOOGLE_SERVICES_WEB_CLIENT_ID, /\.apps\.googleusercontent\.com$/);
  });

  it('resolveGoogleWebClientId prefers env over extra and fallback', () => {
    const envId = 'env-client.apps.googleusercontent.com';
    assert.equal(
      resolveGoogleWebClientId({
        env: envId,
        extra: 'extra-client.apps.googleusercontent.com',
      }),
      envId,
    );
  });

  it('resolveGoogleWebClientId prefers extra over fallback when env is empty', () => {
    const extraId = 'extra-client.apps.googleusercontent.com';
    assert.equal(resolveGoogleWebClientId({ env: '', extra: extraId }), extraId);
    assert.equal(resolveGoogleWebClientId({ env: '   ', extra: extraId }), extraId);
    assert.equal(resolveGoogleWebClientId({ env: null, extra: extraId }), extraId);
  });

  it('resolveGoogleWebClientId falls back to GOOGLE_SERVICES_WEB_CLIENT_ID', () => {
    assert.equal(resolveGoogleWebClientId({}), GOOGLE_SERVICES_WEB_CLIENT_ID);
    assert.equal(resolveGoogleWebClientId({ env: '', extra: '' }), GOOGLE_SERVICES_WEB_CLIENT_ID);
    assert.equal(resolveGoogleWebClientId({ env: null, extra: null }), GOOGLE_SERVICES_WEB_CLIENT_ID);
  });

  it('getGoogleWebClientId uses process.env then extra then committed fallback', () => {
    const prev = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    try {
      process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = 'env-runtime.apps.googleusercontent.com';
      assert.equal(
        getGoogleWebClientId('extra-runtime.apps.googleusercontent.com'),
        'env-runtime.apps.googleusercontent.com',
      );

      delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
      assert.equal(
        getGoogleWebClientId('extra-runtime.apps.googleusercontent.com'),
        'extra-runtime.apps.googleusercontent.com',
      );

      assert.equal(getGoogleWebClientId(), GOOGLE_SERVICES_WEB_CLIENT_ID);
      assert.equal(getGoogleWebClientId(''), GOOGLE_SERVICES_WEB_CLIENT_ID);
    } finally {
      if (prev === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
      else process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = prev;
    }
  });
});
