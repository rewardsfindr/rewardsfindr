import React, { useState, useEffect } from 'react';
import { Loader, AlertCircle } from 'lucide-react';
import { CARDS } from './shared/constants.js';
import { useSearch }      from './hooks/useSearch.js';
import { Header }         from './components/Header.js';
import { SearchBar }      from './components/SearchBar.js';
import { MatchBanner }    from './components/MatchBanner.js';
import { ResultsHeader }  from './components/ResultsHeader.js';
import { ResultCard }     from './components/ResultCard.js';
import './App.css';

function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Auth state — wired to placeholder today, real Firebase Auth in next PR
  const [user, setUser] = useState(null);

  const {
    searchTerm,
    setSearchTerm,
    selectedStore,
    results,
    matchMeta,
    searching,
    handleSearch,
    handleQuickSearch,
    clearSearch,
    storeLookupSize,
  } = useSearch();

  useEffect(() => {
    try {
      if (!CARDS.length) throw new Error('Card data failed to load.');
      setLoading(false);
    } catch (e) {
      console.error('Data load error:', e);
      setError(e.message);
      setLoading(false);
    }
  }, []);

  // Placeholder — swap body for real Firebase signInWithPopup in next PR
  const handleSignIn = () => {
    setUser({ displayName: 'Guest', email: 'guest@rewardsfindr.com' });
  };

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fullscreen-center">
        <div className="loading-box">
          <Loader className="loading-icon" size={48} />
          <p>Loading rewards data…</p>
        </div>
      </div>
    );
  }

  // ─── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="fullscreen-center">
        <div className="error-box">
          <AlertCircle color="#ef4444" size={48} />
          <h2>Something went wrong</h2>
          <p>{error}</p>
          <button className="btn-retry" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="page-shell">
      <div className="page-content">

        <Header
          storeLookupSize={storeLookupSize}
          onSignIn={handleSignIn}
          user={user}
        />

        <SearchBar
          searchTerm={searchTerm}
          onChange={(val) => {
            setSearchTerm(val);
            clearSearch(); // clears selectedStore, matchMeta, results on every keystroke
          }}
          onSearch={handleSearch}
          onQuickSearch={handleQuickSearch}
          searching={searching}
        />

        <MatchBanner matchMeta={matchMeta} searching={searching} />

        {/* Store not found */}
        {selectedStore && !searching && results.length === 0 && (
          <div className="not-found-box">
            <AlertCircle color="#9ca3af" size={40} />
            <h3>Store not found</h3>
            <p>We don't have "{selectedStore}" yet. Try a different name or check spelling.</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && !searching && (
          <>
            <ResultsHeader selectedStore={selectedStore} matchMeta={matchMeta} />
            <div className="results-grid">
              {results.slice(0, 3).map((card, idx) => (
                <ResultCard key={card.id} card={card} rank={idx} />
              ))}
            </div>
          </>
        )}

        {/* How it works */}
        <div className="panel how-it-works">
          <h3>How it works</h3>
          <p>
            Search any store → see which credit cards give the best rewards there.
            No login. No tracking. Data from public card terms.
          </p>
          <div className="how-it-works-meta">
            Hobby project ·{' '}
            <a href="mailto:rewardsfindr@gmail.com">rewardsfindr@gmail.com</a>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
