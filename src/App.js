import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Store, CreditCard, Info, Loader, AlertCircle } from 'lucide-react';
import { CARDS, POPULAR_STORES } from './shared/constants.js';
import {
  buildStoreLookup,
  findBestStoreMatch,
  buildResultsForCategory,
  MATCH_QUALITY,
} from './shared/offerUtils.js';
import './App.css';

// Built once on module load — never rebuilt on re-render
const STORE_LOOKUP = buildStoreLookup();

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [results, setResults] = useState([]);
  const [matchMeta, setMatchMeta] = useState(null); // { displayName, category, quality }
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      // Validate shared data loaded correctly
      if (!CARDS.length) throw new Error('Card data failed to load.');
      if (!Object.keys(STORE_LOOKUP).length) throw new Error('Store data failed to load.');
      setLoading(false);
    } catch (e) {
      console.error('Data load error:', e);
      setError(e.message);
      setLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────
  // CORE SEARCH LOGIC
  // Shared by both manual search and quick-search buttons
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // MATCH QUALITY MESSAGE
  // Only shown for PARTIAL and FUZZY matches
  // EXACT match = silent (no message needed)
  // ─────────────────────────────────────────────
  const getMatchMessage = () => {
    if (!matchMeta || matchMeta.quality === MATCH_QUALITY.EXACT) return null;
    if (matchMeta.quality === MATCH_QUALITY.PARTIAL) {
      return `Showing results for "${matchMeta.displayName}"`;
    }
    if (matchMeta.quality === MATCH_QUALITY.FUZZY) {
      return `Did you mean "${matchMeta.displayName}"?`;
    }
    return null;
  };

  // ─────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // ERROR STATE
  // ─────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom right, #eef2ff, #fae8ff)', padding: '1rem' }}>
        <div style={{ background: 'white', borderRadius: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '2rem', textAlign: 'center', maxWidth: '28rem' }}>
          <AlertCircle style={{ color: '#ef4444', margin: '0 auto 1rem' }} size={48} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>Something went wrong</h2>
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

  // ─────────────────────────────────────────────
  // MAIN UI
  // ─────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #eef2ff, #fae8ff)' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '1rem', paddingBottom: '6rem' }}>

        {/* Header */}
        <div style={{ background: 'white', borderRadius: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '1.5rem', marginBottom: '1.5rem', marginTop: '1.5rem' }}>
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
            <div style={{ width: '0.5rem', height: '0.5rem', background: '#10b981', borderRadius: '9999px' }}></div>
            <span style={{ color: '#10b981', fontWeight: 500 }}>
              {CARDS.length} cards · {Object.keys(STORE_LOOKUP).length} stores
            </span>
          </div>
        </div>

        {/* Search */}
        <div style={{ background: 'white', borderRadius: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedStore(null);
                setMatchMeta(null);
                setResults([]);
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for any store..."
              disabled={searching}
              style={{ width: '100%', padding: '1rem 1.25rem', paddingRight: '3rem', borderRadius: '1rem', border: '2px solid #e5e7eb', fontSize: '1.125rem', outline: 'none', boxSizing: 'border-box' }}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'linear-gradient(to right, #4f46e5, #7c3aed)', color: 'white', padding: '0.75rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}
            >
              {searching
                ? <Loader style={{ animation: 'spin 1s linear infinite' }} size={20} />
                : <Search size={20} />
              }
            </button>
          </div>

          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: 500 }}>Popular Stores:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {POPULAR_STORES.map((storeName) => (
              <button
                key={storeName}
                onClick={() => handleQuickSearch(storeName)}
                disabled={searching}
                style={{ padding: '0.5rem 1rem', background: 'linear-gradient(to right, #eef2ff, #fae8ff)', color: '#4338ca', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 500, border: '1px solid #c7d2fe', cursor: 'pointer' }}
              >
                {storeName}
              </button>
            ))}
          </div>
        </div>

        {/* Match quality message — PARTIAL or FUZZY only */}
        {getMatchMessage() && !searching && (
          <div style={{ background: '#fef3c7', border: '2px solid #fbbf24', borderRadius: '1.5rem', padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Info style={{ color: '#d97706', flexShrink: 0 }} size={20} />
            <p style={{ color: '#92400e', fontWeight: 500, margin: 0 }}>{getMatchMessage()}</p>
          </div>
        )}

        {/* Store not found */}
        {selectedStore && !searching && results.length === 0 && (
          <div style={{ background: 'white', border: '2px solid #e5e7eb', borderRadius: '1.5rem', padding: '2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
            <AlertCircle style={{ color: '#9ca3af', margin: '0 auto 0.75rem' }} size={40} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.25rem' }}>Store not found</h3>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              We don't have "{selectedStore}" yet. Try a different name or check spelling.
            </p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && !searching && (
          <>
            <div style={{ background: 'linear-gradient(to right, #4f46e5, #7c3aed)', borderRadius: '1.5rem', padding: '1.5rem', marginBottom: '1.5rem', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                <Store size={28} />
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Best Cards for {selectedStore}</h2>
              </div>
              <p style={{ opacity: 0.9, marginLeft: '2.5rem', margin: '0.25rem 0 0 2.5rem', fontSize: '0.875rem' }}>
                Category: {matchMeta?.category?.charAt(0).toUpperCase() + matchMeta?.category?.slice(1)}
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingUp style={{ color: '#4f46e5' }} /> Top Rewards
              </h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {results.slice(0, 3).map((card, idx) => (
                  <div
                    key={card.id}
                    style={{
                      background: idx === 0
                        ? 'linear-gradient(to bottom right, #10b981, #059669)'
                        : idx === 1
                        ? 'linear-gradient(to bottom right, #3b82f6, #4f46e5)'
                        : 'linear-gradient(to bottom right, #a855f7, #ec4899)',
                      borderRadius: '1rem',
                      padding: '1.25rem',
                      color: 'white',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.25rem', margin: '0 0 0.25rem 0' }}>{card.cardName}</h4>
                        <p style={{ opacity: 0.8, fontSize: '0.875rem', margin: 0 }}>{card.issuer}</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '1rem' }}>
                        <div style={{ fontSize: '2.25rem', fontWeight: 900, lineHeight: 1 }}>{card.rate}%</div>
                        <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>cash back</div>
                      </div>
                    </div>
                    {card.notes && (
                      <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.875rem' }}>
                        <p style={{ opacity: 0.95, margin: 0 }}>{card.notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* How it works */}
        <div style={{ background: 'white', borderRadius: '1.5rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>How it works</h3>
          <p style={{ color: '#6b7280', lineHeight: '1.6', margin: 0 }}>
            Search any store → see which credit cards give the best rewards there.
            No login. No tracking. Data from public card terms.
          </p>
          <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.75rem' }}>
            Hobby project ·{' '}
            <a href="mailto:rewardsfindr@gmail.com" style={{ color: '#4f46e5', textDecoration: 'none' }}>
              rewardsfindr@gmail.com
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
