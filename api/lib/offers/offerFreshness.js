// An offer stays searchable when its expiry is still ahead, or when the
// bank page never gave us a date. Unknown expiry must not be treated as
// "expiring soon" and must not be hidden from merchant search.

export function isCurrentOffer(data, now = new Date()) {
  if (!data) return false;
  if (data.expiryPrecision === 'unknown') return true;

  const expiresAt = data.expiresAt;
  if (expiresAt == null) return true;

  const ms = typeof expiresAt.toDate === 'function'
    ? expiresAt.toDate().getTime()
    : new Date(expiresAt).getTime();

  if (!Number.isFinite(ms)) return true;
  return ms > now.getTime();
}
