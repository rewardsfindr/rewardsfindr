import { useState } from 'react';
import { CARDS } from '../shared/constants.js';
import {
  buildStoreLookup,
  findBestStoreMatch,
  buildResultsForCategory,
} from '../shared/offerUtils.js';

// Built once on module load — never rebuilt on re-render
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
    await new Promise(resolve => setTimeout(resolve, 200)); // UX: prevents flash

    const match = findBestStoreMatch(term, STORE_LOOKUP);

    if (!match) {
      setSelectedStore(term);
      setMatchMeta(null);
      setResults([]);
      setSearching(false);
      return;
    }

    const cardResults = buildResultsForCategory(match.category, CARDS);
    setSelectedStore(match.displayName);
    setMatchMeta(match);
    setResults(cardResults);
    setSearching(false);
  };

  const handleSearch = () => runSearch(searchTerm);

  const handleQuickSearch = (storeName) => {
    setSearchTerm(storeName);
    runSearch(storeName);
  };

  return {
    searchTerm,
    setSearchTerm,
    selectedStore,
    results,
    matchMeta,
    searching,
    handleSearch,
    handleQuickSearch,
    storeLookupSize: Object.keys(STORE_LOOKUP).length,
  };
};
