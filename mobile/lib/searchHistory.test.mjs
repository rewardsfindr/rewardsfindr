import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEARCH_HISTORY_MAX_ENTRIES,
  SEARCH_HISTORY_MAX_AGE_MS,
  searchHistoryKey,
  pruneSearchHistory,
  recordSearchEntry,
  formatRelativeSearchTime,
} from './searchHistoryLogic.js';

const DAY = 24 * 60 * 60 * 1000;

test('searchHistoryKey is namespaced per uid', () => {
  assert.equal(searchHistoryKey('abc'), 'rewardsfindr_search_history_v1_abc');
});

test('caps are 100 entries and 30 days', () => {
  assert.equal(SEARCH_HISTORY_MAX_ENTRIES, 100);
  assert.equal(SEARCH_HISTORY_MAX_AGE_MS, 30 * DAY);
});

test('pruneSearchHistory drops old and over-cap entries', () => {
  const now = Date.UTC(2026, 10, 20);
  const entries = [];
  for (let i = 0; i < 110; i++) {
    entries.push({ query: `q${i}`, searchedAt: now - i * 1000 });
  }
  entries.push({ query: 'ancient', searchedAt: now - 31 * DAY });
  entries.push({ query: '  ', searchedAt: now });
  entries.push({ query: 'bad', searchedAt: 'nope' });

  const pruned = pruneSearchHistory(entries, now);
  assert.equal(pruned.length, 100);
  assert.equal(pruned[0].query, 'q0');
  assert.equal(pruned[99].query, 'q99');
  assert.equal(pruned.some((e) => e.query === 'ancient'), false);
});

test('recordSearchEntry dedupes case-insensitively and skips blank', () => {
  const now = 1_000_000;
  const start = [
    { query: 'Target', searchedAt: now - 5000 },
    { query: 'Nike', searchedAt: now - 4000 },
  ];
  const next = recordSearchEntry(start, '  target  ', now);
  assert.deepEqual(next, [
    { query: 'target', searchedAt: now },
    { query: 'Nike', searchedAt: now - 4000 },
  ]);
  assert.deepEqual(recordSearchEntry(start, '   ', now), pruneSearchHistory(start, now));
});

test('formatRelativeSearchTime covers recent buckets', () => {
  const now = Date.UTC(2026, 10, 20, 12);
  assert.equal(formatRelativeSearchTime(now - 30_000, now), 'Just now');
  assert.equal(formatRelativeSearchTime(now - 5 * 60_000, now), '5m ago');
  assert.equal(formatRelativeSearchTime(now - 2 * 60 * 60_000, now), '2h ago');
  assert.equal(formatRelativeSearchTime(now - DAY, now), 'Yesterday');
  assert.equal(formatRelativeSearchTime(now - 3 * DAY, now), '3 days ago');
  assert.equal(formatRelativeSearchTime(now - 8 * DAY, now), '1 week ago');
});
