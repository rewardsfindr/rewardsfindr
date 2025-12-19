import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Store, CreditCard, Info, Loader, AlertCircle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import './App.css';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD4h8rB-L_er1puaI9foZEJNnnqCvc2jpI",
  authDomain: "rewardsfinder1810.firebaseapp.com",
  projectId: "rewardsfinder1810",
  storageBucket: "rewardsfinder1810.firebasestorage.app",
  messagingSenderId: "793000507982",
  appId: "1:793000507982:web:2886320130981dddd2211f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

  useEffect(() => {
    const fetchFirebaseData = async () => {
      try {
        setLoading(true);
        
        // Fetch cards
        const cardsSnapshot = await getDocs(collection(db, 'cards'));
        const cards = cardsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Fetch stores
        const storesSnapshot = await getDocs(collection(db, 'stores'));
        const stores = storesSnapshot.docs.map(doc => doc.data());
        
        const storeLookup = {};
        stores.forEach(store => {
          if (store.storeName) {
            storeLookup[store.storeName.toLowerCase()] = store.category;
          }
        });
        
        setAllCards(cards);
        setStoreCategories(storeLookup);
        setLoading(false);
        
      } catch (err) {
        console.error('Firebase error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchFirebaseData();
  }, []);

  const getStoreCategory = (storeName) => {
    return storeCategories[storeName.toLowerCase().trim()] || null;
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;

    setSearching(true);
    await new Promise(resolve => setTimeout(resolve, 200));

    const category = getStoreCategory(searchTerm);
    
    if (!category) {
      setSelectedStore(searchTerm);
      setResults([]);
      setSearching(false);
      return;
    }

    const cardResults = allCards.map(card => ({
      ...card,
      rate: card.categoryRates[category] || card.categoryRates.default || 0,
      category: category
    }));

    cardResults.sort((a, b) => b.rate - a.rate);
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
      setSelectedStore(storeName);
      setResults([]);
      setSearching(false);
      return;
    }
    
    const cardResults = allCards.map(card => ({
      ...card,
      rate: card.categoryRates[category] || card.categoryRates.default || 0,
      category: category
    }));

    cardResults.sort((a, b) => b.rate - a.rate);
    setSelectedStore(storeName);
    setResults(cardResults);
    setSearching(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom right, #eef2ff, #fae8ff)' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader style={{ animation: 'spin 1s linear infinite', color: '#4f46e5', margin: '0 auto 1rem' }} size={48} />
          <p style={{ color: '#6b7280', fontSize: '1.125rem', fontWeight: 500 }}>Connecting to Firebase...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom right, #eef2ff, #fae8ff)', padding: '1rem' }}>
        <div style={{ background: 'white', borderRadius: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', padding: '2rem', textAlign: 'center', maxWidth: '28rem' }}>
          <AlertCircle style={{ color: '#ef4444', margin: '0 auto 1rem' }} size={48} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>Connection Error</h2>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#4f46e5', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            Retry Connection
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
              onChange={(e) => setSearchTerm(e.target.value)}
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

        {/* Results */}
        {selectedStore && results.length === 0 && !searching && (
          <div style={{ background: '#fef3c7', border: '2px solid #fbbf24', borderRadius: '1.5rem', padding: '1.5rem', textAlign: 'center' }}>
            <Info style={{ margin: '0 auto 0.75rem', color: '#d97706' }} size={48} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>Store Not Found</h3>
            <p style={{ color: '#6b7280' }}>We don't have "{selectedStore}" in our database yet.</p>
          </div>
        )}

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
                      background: idx === 0 ? 'linear-gradient(to bottom right, #10b981, #059669)' : idx === 1 ? 'linear-gradient(to bottom right, #3b82f6, #4f46e5)' : 'linear-gradient(to bottom right, #a855f7, #ec4899)',
                      borderRadius: '1rem',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      padding: '1.25rem',
                      color: 'white',
                      position: 'relative'
                    }}
                  >
                    {idx === 0 && (
                      <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: 'rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(10px)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        BEST
                      </div>
                    )}
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
      </div>
    </div>
  );
}

export default App;