import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Store, CreditCard, Info, Loader, AlertCircle } from 'lucide-react';
import { findBestStoreMatch } from './searchUtils';
import './App.css';

const POPULAR_STORES = [
  { name: "Whole Foods", category: "grocery" },
  { name: "Target", category: "grocery" },
  { name: "Costco", category: "grocery" },
  { name: "Starbucks", category: "dining" },
  { name: "Chipotle", category: "dining" },
  { name: "Shell", category: "gas" },
  { name: "CVS", category: "drugstore" },
  { name: "United Airlines", category: "travel" }
];

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  const [allCards, setAllCards] = useState([]);
  const [storeCategories, setStoreCategories] = useState({});
  const [storeNames, setStoreNames] = useState([]);

  useEffect(() => {
    try {
      setLoading(true);

      // Static cards – you can expand this list later
      const cards = [
        {
          id: 'amex-bcp',
          cardName: 'Blue Cash Preferred® Card from American Express',
          issuer: 'American Express',
          categoryRates: { grocery: 6, dining: 1, gas: 3, drugstore: 1, travel: 1 },
          notes: '6% cash back at U.S. supermarkets (up to $6,000 per year).'
        },
        {
          id: 'csp',
          cardName: 'Chase Sapphire Preferred® Card',
          issuer: 'Chase',
          categoryRates: { dining: 3, travel: 3, grocery: 1, gas: 1, drugstore: 1 },
          notes: '3x points on dining and travel.'
        },
        {
          id: 'ccc',
          cardName: 'Citi Custom Cash® Card',
          issuer: 'Citi',
          categoryRates: { grocery: 5, dining: 5, gas: 5, drugstore: 5, travel: 1 },
          notes: '5% cash back in top eligible category each billing cycle (up to $500).'
        }
      ];

      // Static store → category mapping (stub of your old Firestore data)
      const stores = [
        { storeName: 'Whole Foods', category: 'grocery' },
        { storeName: 'Target', category: 'grocery' },
        { storeName: 'Costco', category: 'grocery' },
        { storeName: 'Starbucks', category: 'dining' },
        { storeName: 'Chipotle', category: 'dining' },
        { storeName: 'Shell', category: 'gas' },
        { storeName: 'CVS', category: 'drugstore' },
        { storeName: 'United Airlines', category: 'travel' }
        // TODO: paste the rest of your 60+ stores here later
      ];

      const storeLookup = {};
      const names = [];

      stores.forEach(store => {
        if (store.storeName) {
          const key = store.storeName.toLowerCase();
          storeLookup[key] = store.category;
          names.push(store.storeName);
        }
      });

      setAllCards(cards);
      setStoreCategories(storeLookup);
      setStoreNames(names);
      setError(null);
      setLoading(false);
    } catch (e) {
      console.error('Static data error:', e);
      setError('Failed to load rewards data.');
      setLoading(false);
    }
  }, []);

  const getStoreCategory = (storeName) => {
    const key = findBestStoreMatch(storeName, storeCategories);
    if (!key) return null;
    return storeCategories[key] || null;
  };

  const buildResultsForCategoryStatic = (category) => {
    const withRates = allCards.map(card => ({
      ...card,
      category,
      rate: card.categoryRates[category] ?? 1
    }));
    return withRates.sort((a, b) => b.rate - a.rate);
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;

    setSearching(true);
    await new Promise(resolve => setTimeout(resolve, 200));

    const category = getStoreCategory(searchTerm);

    if (!category) {
      const matchedName = storeNames.find(n => n.toLowerCase() === findBestStoreMatch(searchTerm, storeCategories)) || searchTerm;
      setSelectedStore(matchedName);
      setResults([]);
      setSearching(false);
      return;
    }

    const cardResults = buildResultsForCategoryStatic(category);
    setSelectedStore(searchTerm);
    setResults(cardResults);
    setSearching(false);
  };

  const handleQuickSearch = async (storeName) => {
    setSearchTerm(storeName);
    setSearching(true);

    await new Promise(resolve => setTimeout(resolve, 200));

    const category = getStoreCategory(storeName);

    if (!category) {
      const matchedName = storeNames.find(n => n.toLowerCase() === findBestStoreMatch(searchTerm, storeCategories)) || searchTerm;
      setSelectedStore(matchedName);
      setResults([]);
      setSearching(false);
      return;
    }

    const cardResults = buildResultsForCategoryStatic(category);
    setSelectedStore(storeName);
    setResults(cardResults);
    setSearching(false);
  };

  const getSuggestedStoreName = () => {
  const term = searchTerm.toLowerCase().trim();
  const exactMatch = storeCategories[term];
  if (exactMatch) return null;
  const key = findBestStoreMatch(searchTerm, storeCategories);
  if (!key) return null;
  return storeNames.find(name => name.toLowerCase() === key) || null;
};


  const suggestedStore = selectedStore && !searching
    ? getSuggestedStoreName()
    : null;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom right, #eef2ff, #fae8ff)' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader style={{ animation: 'spin 1s linear infinite', color: '#4f46e5', margin: '0 auto 1rem' }} size={48} />
          <p style={{ color: '#6b7280', fontSize: '1.125rem', fontWeight: 500 }}>Loading rewards data…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom right, #eef2ff, #fae8ff)', padding: '1rem' }}>
        <div style={{ background: 'white', borderRadius: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', padding: '2rem', textAlign: 'center', maxWidth: '28rem' }}>
          <AlertCircle style={{ color: '#ef4444', margin: '0 auto 1rem' }} size={48} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>Error</h2>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#4f46e5', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #eef2ff, #fae8ff)' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '1rem', paddingBottom: '6rem' }}>
        {/* Header */}
        <div style={{ background: 'white', borderRadius: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', padding: '1.5rem', marginBottom: '1.5rem', marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ background: 'linear-gradient(to bottom right, #4f46e5, #7c3aed)', padding: '0.75rem', borderRadius: '1rem' }}>
              <CreditCard style={{ color: 'white' }} size={28} />
            </div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', background: 'linear-gradient(to right, #4f46e5, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              RewardsFindr
            </h1>
          </div>
          <p style={{ color: '#6b7280', marginLeft: '4rem' }}>Find the best credit card rewards for any store</p>
          <div style={{ marginLeft: '4rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
            <div style={{ width: '0.5rem', height: '0.5rem', background: '#10b981', borderRadius: '9999px', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}></div>
            <span style={{ color: '#10b981', fontWeight: 500 }}>
              Connected • {allCards.length} cards • {Object.keys(storeCategories).length} stores
            </span>
          </div>
        </div>

        {/* Search Section */}
        <div style={{ background: 'white', borderRadius: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedStore(null);
                setResults([]);
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for any store..."
              disabled={searching}
              style={{ width: '100%', padding: '1rem 1.25rem', paddingRight: '3rem', borderRadius: '1rem', border: '2px solid #e5e7eb', fontSize: '1.125rem', outline: 'none' }}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'linear-gradient(to right, #4f46e5, #7c3aed)', color: 'white', padding: '0.75rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}
            >
              {searching ? <Loader style={{ animation: 'spin 1s linear infinite' }} size={20} /> : <Search size={20} />}
            </button>
          </div>

          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: 500 }}>Popular Stores:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {POPULAR_STORES.map((store) => (
              <button
                key={store.name}
                onClick={() => handleQuickSearch(store.name)}
                disabled={searching}
                style={{ padding: '0.5rem 1rem', background: 'linear-gradient(to right, #eef2ff, #fae8ff)', color: '#4338ca', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 500, border: '1px solid #c7d2fe', cursor: 'pointer' }}
              >
                {store.name}
              </button>
            ))}
          </div>
        </div>

        {/* No results + suggestion */}
        {suggestedStore && !searching && results.length > 0 && (
          <div style={{ background: '#fef3c7', border: '2px solid #fbbf24', borderRadius: '1.5rem', padding: '1.5rem', textAlign: 'center', marginBottom: '1.5rem' }}>
            <Info style={{ margin: '0 auto 0.75rem', color: '#d97706' }} size={48} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>Store Not Found</h3>
            <p style={{ color: '#6b7280', marginBottom: '0.75rem' }}>
              We don't have "{selectedStore}" in our data yet.
            </p>
            <p style={{ color: '#6b7280' }}>
              Did you mean{' '}
              <button
                onClick={() => handleQuickSearch(suggestedStore)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4f46e5',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                {suggestedStore}
              </button>
              ?
            </p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && !searching && (
          <>
            <div style={{ background: 'linear-gradient(to right, #4f46e5, #7c3aed)', borderRadius: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', padding: '1.5rem', marginBottom: '1.5rem', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <Store size={28} />
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Best Cards for {selectedStore}</h2>
              </div>
              <p style={{ opacity: 0.9, marginLeft: '2.5rem' }}>
                Category: {results[0].category.charAt(0).toUpperCase() + results[0].category.slice(1)}
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingUp style={{ color: '#4f46e5' }} />
                Top Rewards
              </h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {results.slice(0, 3).map((card, idx) => (
                  <div
                    key={card.id}
                    style={{
                      background:
                        idx === 0
                          ? 'linear-gradient(to bottom right, #10b981, #059669)'
                          : idx === 1
                          ? 'linear-gradient(to bottom right, #3b82f6, #4f46e5)'
                          : 'linear-gradient(to bottom right, #a855f7, #ec4899)',
                      borderRadius: '1rem',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      padding: '1.25rem',
                      color: 'white'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>{card.cardName}</h4>
                        <p style={{ opacity: 0.8, fontSize: '0.875rem' }}>{card.issuer}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '2.25rem', fontWeight: 900 }}>{card.rate}%</div>
                        <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>cash back</div>
                      </div>
                    </div>
                    {card.notes && (
                      <div style={{ background: 'rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(10px)', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.875rem' }}>
                        <p style={{ opacity: 0.95 }}>{card.notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* How it works */}
        <div style={{ background: 'white', borderRadius: '1.5rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.75rem' }}>How it works</h3>
          <p style={{ color: '#6b7280', lineHeight: '1.6' }}>
            Search any store → see which credit cards give the best rewards there.
            No login. No tracking. Data from public card terms.
          </p>
          <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.75rem' }}>
            Hobby project • <a href="mailto:rewardsfindr@gmail.com" style={{ color: '#4f46e5', textDecoration: 'none' }}>rewardsfindr@gmail.com</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

