// ─────────────────────────────────────────────
// ONBOARDING STORE LOGIC (pure factory — unit tested)
// Storage adapter: { getItem, setItem, removeItem }
// ─────────────────────────────────────────────

export const onboardingKeyFor = (uid) => `rewardsfindr_onboarding_v1_${uid}`;

export function createOnboardingStore(storage) {
  const listeners = new Set();

  function notify(uid, done) {
    listeners.forEach((fn) => {
      try {
        fn(uid, done);
      } catch {
        // ignore listener errors
      }
    });
  }

  return {
    onboardingKeyFor,

    subscribeOnboarding(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async getOnboardingComplete(uid) {
      if (!uid) return false;
      try {
        const val = await storage.getItem(onboardingKeyFor(uid));
        return val === '1';
      } catch {
        return false;
      }
    },

    async setOnboardingComplete(uid) {
      if (!uid) return;
      await storage.setItem(onboardingKeyFor(uid), '1');
      notify(uid, true);
    },

    async clearOnboardingComplete(uid) {
      if (!uid) return;
      await storage.removeItem(onboardingKeyFor(uid));
      notify(uid, false);
    },
  };
}

export function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    async getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setItem(key, value) {
      map.set(key, String(value));
    },
    async removeItem(key) {
      map.delete(key);
    },
    _map: map,
  };
}
