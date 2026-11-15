// ─────────────────────────────────────────────
// ONBOARDING FLAGS
// Per-user AsyncStorage flag so first-run carousel
// + soft bank sync only show once per account.
// ─────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createOnboardingStore, onboardingKeyFor } from './onboardingStoreLogic.js';

const store = createOnboardingStore(AsyncStorage);

export { onboardingKeyFor };
export const subscribeOnboarding = store.subscribeOnboarding.bind(store);
export const getOnboardingComplete = store.getOnboardingComplete.bind(store);
export const setOnboardingComplete = store.setOnboardingComplete.bind(store);
export const clearOnboardingComplete = store.clearOnboardingComplete.bind(store);
