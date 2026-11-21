// Search history — AsyncStorage log backed by pure prune/dedupe helpers.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  searchHistoryKey,
  pruneSearchHistory,
  recordSearchEntry,
} from './searchHistoryLogic.js';

export {
  SEARCH_HISTORY_MAX_ENTRIES,
  SEARCH_HISTORY_MAX_AGE_MS,
  searchHistoryKey,
  pruneSearchHistory,
  recordSearchEntry,
  formatRelativeSearchTime,
} from './searchHistoryLogic.js';

async function readRaw(uid) {
  if (!uid) return [];
  const raw = await AsyncStorage.getItem(searchHistoryKey(uid));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadSearchHistory(uid, now = Date.now()) {
  const pruned = pruneSearchHistory(await readRaw(uid), now);
  if (uid) {
    // Persist prune so cold opens stay clean.
    await AsyncStorage.setItem(searchHistoryKey(uid), JSON.stringify(pruned)).catch(() => {});
  }
  return pruned;
}

export async function recordSearch(uid, query, now = Date.now()) {
  if (!uid) return [];
  const next = recordSearchEntry(await readRaw(uid), query, now);
  await AsyncStorage.setItem(searchHistoryKey(uid), JSON.stringify(next));
  return next;
}

export async function clearSearchHistory(uid) {
  if (!uid) return;
  await AsyncStorage.removeItem(searchHistoryKey(uid));
}
