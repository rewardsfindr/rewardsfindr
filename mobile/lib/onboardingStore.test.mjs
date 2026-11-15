import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemoryStorage,
  createOnboardingStore,
  onboardingKeyFor,
} from './onboardingStoreLogic.js';

test('onboardingKeyFor is namespaced per uid', () => {
  assert.equal(onboardingKeyFor('abc'), 'rewardsfindr_onboarding_v1_abc');
});

test('getOnboardingComplete is false when missing or empty uid', async () => {
  const store = createOnboardingStore(createMemoryStorage());
  assert.equal(await store.getOnboardingComplete(''), false);
  assert.equal(await store.getOnboardingComplete(null), false);
  assert.equal(await store.getOnboardingComplete('u1'), false);
});

test('setOnboardingComplete persists and notifies listeners', async () => {
  const store = createOnboardingStore(createMemoryStorage());
  const events = [];
  const unsub = store.subscribeOnboarding((uid, done) => events.push({ uid, done }));

  await store.setOnboardingComplete('u1');
  assert.equal(await store.getOnboardingComplete('u1'), true);
  assert.deepEqual(events, [{ uid: 'u1', done: true }]);

  await store.clearOnboardingComplete('u1');
  assert.equal(await store.getOnboardingComplete('u1'), false);
  assert.deepEqual(events, [
    { uid: 'u1', done: true },
    { uid: 'u1', done: false },
  ]);

  unsub();
  await store.setOnboardingComplete('u1');
  assert.equal(events.length, 2);
});

test('storage read errors are treated as incomplete', async () => {
  const store = createOnboardingStore({
    async getItem() { throw new Error('boom'); },
    async setItem() {},
    async removeItem() {},
  });
  assert.equal(await store.getOnboardingComplete('u1'), false);
});

test('returning users stay complete across store reloads', async () => {
  const memory = createMemoryStorage();
  const first = createOnboardingStore(memory);
  await first.setOnboardingComplete('u9');

  const second = createOnboardingStore(memory);
  assert.equal(await second.getOnboardingComplete('u9'), true);
});
