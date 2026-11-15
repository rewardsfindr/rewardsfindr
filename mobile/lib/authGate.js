// ─────────────────────────────────────────────
// AUTH + ONBOARDING ROUTE GATE (pure — unit tested)
// ─────────────────────────────────────────────

export const AUTH_SCREENS = new Set(['login', 'email']);
export const ONBOARDING_SCREENS = new Set(['onboarding', 'connect-bank']);

/**
 * Decide where the root layout should send the user.
 * @param {{ user: object|null|undefined, onboardingDone: boolean|undefined, segment: string|undefined }} input
 * @returns {{ action: 'wait'|'replace'|'none', path?: string }}
 */
export function resolveAuthGate({ user, onboardingDone, segment }) {
  if (user === undefined) {
    return { action: 'wait' };
  }

  const onAuthScreen = AUTH_SCREENS.has(segment);
  const onOnboardingScreen = ONBOARDING_SCREENS.has(segment);

  if (!user) {
    if (!onAuthScreen) {
      return { action: 'replace', path: '/login' };
    }
    return { action: 'none' };
  }

  if (onboardingDone === undefined) {
    return { action: 'wait' };
  }

  if (!onboardingDone) {
    if (!onOnboardingScreen) {
      return { action: 'replace', path: '/onboarding' };
    }
    return { action: 'none' };
  }

  if (onAuthScreen || onOnboardingScreen) {
    return { action: 'replace', path: '/' };
  }

  return { action: 'none' };
}
