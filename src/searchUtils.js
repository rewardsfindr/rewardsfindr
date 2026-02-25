export const findBestStoreMatch = (searchTerm, storeCategories = {}) => {
  if (!searchTerm || !storeCategories) return null;
  
  const term = searchTerm.toLowerCase().trim();
  
  // Exact match first
  if (storeCategories[term]) return term;
  
  // Partial match
  for (const [key, category] of Object.entries(storeCategories)) {
    if (key.includes(term) || term.includes(key)) {
      return key;
    }
  }
  
  // Fuzzy match - first letter + length match
  for (const key of Object.keys(storeCategories)) {
    if (key[0] === term[0] && key.length >= term.length * 0.8) {
      return key;
    }
  }
  
  return null;
};

export const buildResultsForCategory = (category, allCards = []) => {
  if (!category || !allCards.length) return [];
  
  return allCards.map(card => ({
    ...card,
    category,
    rate: card.categoryRates?.[category] || 1
  })).sort((a, b) => b.rate - a.rate);
};
