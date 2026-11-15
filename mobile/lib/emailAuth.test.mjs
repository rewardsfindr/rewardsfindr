import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_STEPS,
  isValidEmail,
  mapAuthError,
  normalizeEmail,
  resolveEmailBack,
  resolveEmailContinue,
  validateNewPassword,
} from './emailAuth.js';

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Alex@RewardsFindr.COM '), 'alex@rewardsfindr.com');
});

test('isValidEmail accepts normal addresses and rejects junk', () => {
  assert.equal(isValidEmail('you@email.com'), true);
  assert.equal(isValidEmail('  you@email.com  '), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail(''), false);
});

test('validateNewPassword enforces length and match', () => {
  assert.deepEqual(validateNewPassword('short', 'short'), {
    ok: false,
    error: 'Password must be at least 8 characters.',
  });
  assert.deepEqual(validateNewPassword('password1', 'password2'), {
    ok: false,
    error: 'Passwords do not match.',
  });
  assert.deepEqual(validateNewPassword('password1', 'password1'), {
    ok: true,
    error: null,
  });
});

test('mapAuthError maps known Firebase codes', () => {
  assert.equal(mapAuthError({ code: 'auth/invalid-email' }), 'Enter a valid email address.');
  assert.equal(mapAuthError({ code: 'auth/wrong-password' }), 'Incorrect email or password.');
  assert.equal(mapAuthError({ code: 'auth/invalid-credential' }), 'Incorrect email or password.');
  assert.equal(
    mapAuthError({ code: 'auth/email-already-in-use' }),
    'An account already exists with this email. Try signing in.',
  );
  assert.equal(mapAuthError({ code: 'auth/weak-password' }), 'Password must be at least 6 characters.');
  assert.equal(mapAuthError({ code: 'auth/too-many-requests' }), 'Too many attempts. Try again later.');
  assert.equal(mapAuthError({ code: 'auth/network-request-failed' }), 'Network error. Check your connection.');
  assert.equal(mapAuthError({ message: 'boom' }), 'boom');
  assert.equal(mapAuthError({}), 'Something went wrong. Please try again.');
});

test('resolveEmailContinue trusts password/social signals but treats empty as sign-in', () => {
  // Enumeration protection returns [] for existing and new accounts — never assume sign-up
  assert.deepEqual(resolveEmailContinue([]), { step: EMAIL_STEPS.SIGN_IN });
  assert.deepEqual(resolveEmailContinue(null), { step: EMAIL_STEPS.SIGN_IN });
  assert.deepEqual(resolveEmailContinue(['password']), { step: EMAIL_STEPS.SIGN_IN });
  assert.deepEqual(resolveEmailContinue(['password', 'google.com']), { step: EMAIL_STEPS.SIGN_IN });
  assert.deepEqual(resolveEmailContinue(['google.com']), {
    error: 'This email uses Google or Apple sign-in. Go back and continue with that provider.',
  });
  assert.deepEqual(resolveEmailContinue(['apple.com']), {
    error: 'This email uses Google or Apple sign-in. Go back and continue with that provider.',
  });
});

test('resolveEmailBack keeps forgot and sign-up reachable from sign-in', () => {
  assert.deepEqual(resolveEmailBack(EMAIL_STEPS.EMAIL), { exit: true });
  assert.deepEqual(resolveEmailBack(EMAIL_STEPS.FORGOT), { step: EMAIL_STEPS.SIGN_IN });
  assert.deepEqual(resolveEmailBack(EMAIL_STEPS.FORGOT_SENT), { step: EMAIL_STEPS.SIGN_IN });
  assert.deepEqual(resolveEmailBack(EMAIL_STEPS.SIGN_UP), { step: EMAIL_STEPS.SIGN_IN });
  assert.deepEqual(resolveEmailBack(EMAIL_STEPS.SIGN_IN), { step: EMAIL_STEPS.EMAIL });
});
