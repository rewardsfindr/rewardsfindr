// ─────────────────────────────────────────────
// useSearch — mobile
// Identical logic to web app's hooks/useSearch.js.
// No platform-specific APIs — pure React state.
// ─────────────────────────────────────────────
import { useState } from 'react';
import { CARDS } from '../shared/constants.js';
import { buildStoreLookup, findBestStoreMatch, buildResultsForCategory } from '../shared/offerUtils.js';

const STORE_LOOKUP = buildStoreLookup();

export const useSearch = () => {
  const [searchTerm, setSearchTerm]       = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [results, setResults]             = useState([]);
  const [matchMeta, setMatchMeta]         = useState(null);
  const [searching, setSearching]         = useState(false);

  const runSearch = async (term) => {
    if (!term?.trim()) return;
    setSearching(true);
    await new Promise(r => setTimeout(r, 150));

    const match = findBestStoreMatch(term, STORE_LOOKUP);
    if (!match) {
      setSelectedStore(term);
      setMatchMeta(null);
      setResults([]);
    } else {
      setSelectedStore(match.displayName);
      setMatchMeta(match);
      setResults(buildResultsForCategory(match.category, CARDS));
    }
    setSearching(false);
  };

  const clearSearch = () => {
    setSelectedStore(null);
    setMatchMeta(null);
    setResults([]);
  };

  return {
    searchTerm,
    setSearchTerm,
    selectedStore,
    results,
    matchMeta,
    searching,
    handleSearch:      () => runSearch(searchTerm),
    handleQuickSearch: (name) => { setSearchTerm(name); runSearch(name); },
    clearSearch,
    storeLookupSize:   Object.keys(STORE_LOOKUP).length,
  };
};
