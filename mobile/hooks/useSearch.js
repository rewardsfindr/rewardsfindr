// ─────────────────────────────────────────────
// useSearch — mobile
// Calls Firebase Functions API for search results
// ─────────────────────────────────────────────
import { useState } from 'react';
import { searchStore } from '../lib/api.js';

export const useSearch = () => {
  const [searchTerm, setSearchTerm]       = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [results, setResults]             = useState([]);
  const [matchMeta, setMatchMeta]         = useState(null);
  const [searching, setSearching]         = useState(false);
  const [error, setError]                 = useState(null);

  const runSearch = async (term) => {
    if (!term?.trim()) return;
    
    setSearching(true);
    setError(null);

    try {
      const data = await searchStore(term);
      
      if (!data.store) {
        // No match found
        setSelectedStore(term);
        setMatchMeta(null);
        setResults([]);
      } else {
        setSelectedStore(data.store);
        setMatchMeta({
          displayName: data.store,
          category: data.category,
          quality: data.quality,
        });
        setResults(data.cards || []);
      }
    } catch (err) {
      console.error('Search error:', err);
      setError(err.message);
      setSelectedStore(term);
      setMatchMeta(null);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSelectedStore(null);
    setMatchMeta(null);
    setResults([]);
    setError(null);
  };

  return {
    searchTerm,
    setSearchTerm,
    selectedStore,
    results,
    matchMeta,
    searching,
    error,
    handleSearch:      () => runSearch(searchTerm),
    handleQuickSearch: (name) => { setSearchTerm(name); runSearch(name); },
    clearSearch,
  };
};
