// ─────────────────────────────────────────────
// useSearch — mobile
// Searches the offer snapshot saved on this phone
// ─────────────────────────────────────────────
import { useState } from 'react';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { searchStoredOffers } from '../lib/offerStore.js';

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
      const user = getAuthInstance().currentUser;
      if (!user) throw new Error('Sign in to search the offers saved on this phone.');
      const offers = await searchStoredOffers(user.uid, term);
      setSelectedStore(term);
      setMatchMeta(null);
      setResults(offers);
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
