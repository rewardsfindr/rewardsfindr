// Pure search-history prune / dedupe helpers (unit tested).

export const SEARCH_HISTORY_MAX_ENTRIES = 100;
export const SEARCH_HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function searchHistoryKey(uid) {
  return `rewardsfindr_search_history_v1_${uid}`;
}

export function pruneSearchHistory(entries, now = Date.now()) {
  const cutoff = now - SEARCH_HISTORY_MAX_AGE_MS;
  const cleaned = [];
  for (const entry of entries || []) {
    if (!entry || typeof entry.query !== 'string') continue;
    const query = entry.query.trim();
    if (!query) continue;
    const searchedAt = Number(entry.searchedAt);
    if (!Number.isFinite(searchedAt) || searchedAt < cutoff) continue;
    cleaned.push({ query, searchedAt });
  }
  cleaned.sort((a, b) => b.searchedAt - a.searchedAt);
  return cleaned.slice(0, SEARCH_HISTORY_MAX_ENTRIES);
}

/** Case-insensitive dedupe: newest wins at front. Skips blank queries. */
export function recordSearchEntry(entries, query, now = Date.now()) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return pruneSearchHistory(entries, now);
  const lower = trimmed.toLowerCase();
  const without = (entries || []).filter(
    (e) => String(e?.query || '').trim().toLowerCase() !== lower
  );
  return pruneSearchHistory([{ query: trimmed, searchedAt: now }, ...without], now);
}

export function formatRelativeSearchTime(searchedAt, now = Date.now()) {
  const ts = Number(searchedAt);
  if (!Number.isFinite(ts)) return '';
  const delta = Math.max(0, now - ts);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return 'Just now';
  if (delta < hour) {
    const m = Math.floor(delta / minute);
    return `${m}m ago`;
  }
  if (delta < day) {
    const h = Math.floor(delta / hour);
    return `${h}h ago`;
  }
  if (delta < 2 * day) return 'Yesterday';
  const d = Math.floor(delta / day);
  if (d < 7) return `${d} days ago`;
  if (d < 14) return '1 week ago';
  const weeks = Math.floor(d / 7);
  if (weeks < 5) return `${weeks} weeks ago`;
  return `${Math.floor(d / 30) || 1} mo ago`;
}
