// Pure helpers for offers saved on the phone. The home screen, results
// screen, and sync sheet share these so a large catalog never travels
// through a route param and a second pass of the same card replaces the first.

export function resultsRouteParams(query, offers) {
  if (!offers || offers.length === 0) {
    return { pathname: '/results', params: { notFound: query } };
  }
  return { pathname: '/results', params: { storeName: query } };
}

export function formatOfferExpiry(offer) {
  const raw = offer?.expiryDate
    || (Number.isFinite(offer?.expiresAt) ? new Date(offer.expiresAt).toISOString() : '');
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const label = parsed.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
  return `Expires ${label}`;
}

export function summarizeSyncCards(cardResults) {
  const byCard = [];
  for (const card of cardResults || []) {
    const name = card.cardName || 'Unknown Card';
    let row = byCard.find(item => item.cardName === name);
    if (!row) {
      row = { cardName: name, available: 0, added: 0 };
      byCard.push(row);
    }
    if (card.phase === 'enrolled') row.added = card.count;
    else row.available = card.count;
  }
  return {
    cardCount: byCard.length,
    lines: byCard.map(row => `${row.cardName}: ${row.available + row.added} offers`).join('\n'),
  };
}

export function replaceCardPass(rows, savedCard) {
  const alreadySaved = rows.findIndex(card =>
    card.cardName === savedCard.cardName && card.phase === savedCard.phase
  );
  if (alreadySaved < 0) return [...rows, savedCard];
  return rows.map((card, index) => (index === alreadySaved ? savedCard : card));
}
