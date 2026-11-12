// Persists one user's offer snapshot on the phone.
// Keyed by Firebase uid so a second account on the same device stays separate.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildSnapshotRecords, filterOffers, replaceCardOffers } from '../../api/lib/offers/deviceCatalog.js';

const storageKey = (uid) => `rewardsfindr_offers_v1_${uid}`;

export async function loadOffers(uid) {
  if (!uid) return [];
  const raw = await AsyncStorage.getItem(storageKey(uid));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCardSnapshot(uid, input) {
  if (!uid) throw new Error('You must be signed in to sync offers.');
  const existing = await loadOffers(uid);
  const records = buildSnapshotRecords(input);
  const next = replaceCardOffers(existing, {
    bank: input.bank,
    cardName: input.cardName,
    phase: input.phase,
    records,
  });
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify(next));
  return { synced: records.length };
}

export async function searchStoredOffers(uid, query) {
  const offers = await loadOffers(uid);
  return filterOffers(offers, query);
}
