// ─────────────────────────────────────────────
// EMAIL AUTH HELPERS (pure — unit tested)
// ─────────────────────────────────────────────

export const EMAIL_STEPS = {
  EMAIL: 'email',
  SIGN_IN: 'sign_in',
  SIGN_UP: 'sign_up',
  FORGOT: 'forgot',
  FORGOT_SENT: 'forgot_sent',
};

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  const trimmed = normalizeEmail(email);
  // Practical check: local@domain with a dot in the domain
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function validateNewPassword(password, confirm) {
  if (!password || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (password !== confirm) {
    return { ok: false, error: 'Passwords do not match.' };
  }
  return { ok: true, error: null };
}

export function mapAuthError(err) {
  const code = err?.code || '';
  if (code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (code === 'auth/user-disabled') return 'This account has been disabled.';
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Incorrect email or password.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account already exists with this email. Try signing in.';
  }
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection.';
  return err?.message || 'Something went wrong. Please try again.';
}

/**
 * Decide next email-flow step from Firebase fetchSignInMethodsForEmail.
 *
 * Firebase email enumeration protection returns [] for both new and existing
 * accounts, so an empty list must NOT mean "sign up". Only trust positive
 * signals; otherwise land on sign-in (create-account is linked from there).
 *
 * @returns {{ step?: string, error?: string }}
 */
export function resolveEmailContinue(methods) {
  const list = Array.isArray(methods) ? methods : [];
  if (list.includes('password')) {
    return { step: EMAIL_STEPS.SIGN_IN };
  }
  if (list.length > 0) {
    return {
      error: 'This email uses Google or Apple sign-in. Go back and continue with that provider.',
    };
  }
  // Empty (incl. enumeration protection) → sign-in; users create accounts via link
  return { step: EMAIL_STEPS.SIGN_IN };
}

export function resolveEmailBack(step) {
  if (step === EMAIL_STEPS.EMAIL) return { exit: true };
  if (step === EMAIL_STEPS.FORGOT || step === EMAIL_STEPS.FORGOT_SENT) {
    return { step: EMAIL_STEPS.SIGN_IN };
  }
  if (step === EMAIL_STEPS.SIGN_UP) {
    return { step: EMAIL_STEPS.SIGN_IN };
  }
  return { step: EMAIL_STEPS.EMAIL };
}
