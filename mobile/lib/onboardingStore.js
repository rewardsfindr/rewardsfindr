// ─────────────────────────────────────────────
// ONBOARDING FLAGS
// Per-user AsyncStorage flag so first-run carousel
// + soft bank sync only show once per account.
// ─────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (uid) => `rewardsfindr_onboarding_v1_${uid}`;

const listeners = new Set();

export function subscribeOnboarding(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(uid, done) {
  listeners.forEach((fn) => {
    try {
      fn(uid, done);
    } catch {
      // ignore listener errors
    }
  });
}

export async function getOnboardingComplete(uid) {
  if (!uid) return false;
  try {
    const val = await AsyncStorage.getItem(keyFor(uid));
    return val === '1';
  } catch {
    return false;
  }
}

export async function setOnboardingComplete(uid) {
  if (!uid) return;
  await AsyncStorage.setItem(keyFor(uid), '1');
  notify(uid, true);
}

export async function clearOnboardingComplete(uid) {
  if (!uid) return;
  await AsyncStorage.removeItem(keyFor(uid));
  notify(uid, false);
}
