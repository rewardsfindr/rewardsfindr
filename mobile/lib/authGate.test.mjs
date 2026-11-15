import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthGate } from './authGate.js';

test('waits while auth is loading', () => {
  assert.deepEqual(
    resolveAuthGate({ user: undefined, onboardingDone: undefined, segment: undefined }),
    { action: 'wait' },
  );
});

test('unsigned users are sent to login unless already on auth screens', () => {
  assert.deepEqual(
    resolveAuthGate({ user: null, onboardingDone: undefined, segment: undefined }),
    { action: 'replace', path: '/login' },
  );
  assert.deepEqual(
    resolveAuthGate({ user: null, onboardingDone: undefined, segment: 'index' }),
    { action: 'replace', path: '/login' },
  );
  assert.deepEqual(
    resolveAuthGate({ user: null, onboardingDone: undefined, segment: 'login' }),
    { action: 'none' },
  );
  assert.deepEqual(
    resolveAuthGate({ user: null, onboardingDone: undefined, segment: 'email' }),
    { action: 'none' },
  );
});

test('signed-in users wait until onboarding flag loads', () => {
  assert.deepEqual(
    resolveAuthGate({ user: { uid: 'u1' }, onboardingDone: undefined, segment: 'login' }),
    { action: 'wait' },
  );
});

test('first-run users are sent to onboarding from login or home', () => {
  assert.deepEqual(
    resolveAuthGate({ user: { uid: 'u1' }, onboardingDone: false, segment: 'login' }),
    { action: 'replace', path: '/onboarding' },
  );
  assert.deepEqual(
    resolveAuthGate({ user: { uid: 'u1' }, onboardingDone: false, segment: undefined }),
    { action: 'replace', path: '/onboarding' },
  );
  assert.deepEqual(
    resolveAuthGate({ user: { uid: 'u1' }, onboardingDone: false, segment: 'onboarding' }),
    { action: 'none' },
  );
  assert.deepEqual(
    resolveAuthGate({ user: { uid: 'u1' }, onboardingDone: false, segment: 'connect-bank' }),
    { action: 'none' },
  );
});

test('completed users leave auth and onboarding screens for home', () => {
  assert.deepEqual(
    resolveAuthGate({ user: { uid: 'u1' }, onboardingDone: true, segment: 'login' }),
    { action: 'replace', path: '/' },
  );
  assert.deepEqual(
    resolveAuthGate({ user: { uid: 'u1' }, onboardingDone: true, segment: 'email' }),
    { action: 'replace', path: '/' },
  );
  assert.deepEqual(
    resolveAuthGate({ user: { uid: 'u1' }, onboardingDone: true, segment: 'onboarding' }),
    { action: 'replace', path: '/' },
  );
  assert.deepEqual(
    resolveAuthGate({ user: { uid: 'u1' }, onboardingDone: true, segment: 'connect-bank' }),
    { action: 'replace', path: '/' },
  );
  assert.deepEqual(
    resolveAuthGate({ user: { uid: 'u1' }, onboardingDone: true, segment: undefined }),
    { action: 'none' },
  );
  assert.deepEqual(
    resolveAuthGate({ user: { uid: 'u1' }, onboardingDone: true, segment: 'results' }),
    { action: 'none' },
  );
});
