// src/searchUtils.js
export const findBestStoreMatch = (input, storeCategories, storeNames) => {
  if (!input) return null;
  const query = input.toLowerCase().trim();

  if (storeCategories[query]) return query;

  const startsWith = storeNames.find(name =>
    name.toLowerCase().startsWith(query)
  );
  if (startsWith) return startsWith.toLowerCase();

  const contains = storeNames.find(name =>
    name.toLowerCase().includes(query)
  );
  if (contains) return contains.toLowerCase();

  return null;
};

export const buildResultsForCategory = (allCards, category) => {
  const cardResults = allCards.map(card => ({
    ...card,
    rate: card.categoryRates[category] || card.categoryRates.default || 0,
    category
  }));
  cardResults.sort((a, b) => b.rate - a.rate);
  return cardResults;
};
