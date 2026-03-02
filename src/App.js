import React from 'react';
import './App.css';

function App() {
  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <h1>Never miss the best credit card reward again</h1>
          <p className="hero-subtitle">
            RewardsFindr automatically tracks your bank offers and shows you which card to use at any store.
            Save money on every purchase.
          </p>
          <div className="hero-cta">
            <button className="btn-primary">Download for iOS</button>
            <button className="btn-secondary">Download for Android</button>
          </div>
          <div className="hero-image-placeholder">
            {/* App screenshots will go here */}
            <div className="screenshot-placeholder">App Screenshots Coming Soon</div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works">
        <div className="container">
          <h2>How RewardsFindr Saves You Money</h2>
          <div className="features-grid">
            <div className="feature">
              <div className="feature-number">1</div>
              <h3>Connect Your Banks</h3>
              <p>
                Securely sync your Chase, Amex, and other bank offers directly in the app.
                No manual entry needed.
              </p>
            </div>
            <div className="feature">
              <div className="feature-number">2</div>
              <h3>Search Any Store</h3>
              <p>
                Before you shop, search for any store - Target, Amazon, gas stations, restaurants.
              </p>
            </div>
            <div className="feature">
              <div className="feature-number">3</div>
              <h3>See Best Card Instantly</h3>
              <p>
                Get personalized recommendations based on YOUR active offers. See exactly how much you'll save.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Money Savings Section */}
      <section className="savings">
        <div className="container">
          <h2>Real Savings, Real Users</h2>
          <div className="savings-stats">
            <div className="stat">
              <div className="stat-number">$50-500</div>
              <div className="stat-label">Average yearly savings</div>
            </div>
            <div className="stat">
              <div className="stat-number">5-15%</div>
              <div className="stat-label">Cashback on purchases</div>
            </div>
            <div className="stat">
              <div className="stat-number">3 sec</div>
              <div className="stat-label">Time to find best card</div>
            </div>
          </div>
          <div className="savings-example">
            <h3>Example: Shopping at Target</h3>
            <p>
              Without RewardsFindr: Use any card → Get 1-2% back<br />
              With RewardsFindr: See you have a Chase Freedom 5% Target offer → Get 5% back<br />
              <strong>On $100 purchase: Save extra $3-4 every time</strong>
            </p>
          </div>
        </div>
      </section>

      {/* Features List */}
      <section className="features">
        <div className="container">
          <h2>Features</h2>
          <ul className="features-list">
            <li>✅ Auto-sync offers from Chase, Amex (Capital One coming soon)</li>
            <li>✅ Search thousands of merchants instantly</li>
            <li>✅ See personalized offers based on YOUR cards</li>
            <li>✅ Works with rotating 5% categories (Chase Freedom, Discover)</li>
            <li>✅ Privacy-focused - your data is securely encrypted</li>
            <li>✅ Free forever - no subscriptions, no ads</li>
          </ul>
        </div>
      </section>

      {/* FAQ Placeholder */}
      <section className="faq">
        <div className="container">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-item">
            <h3>Is RewardsFindr free?</h3>
            <p>Yes! Completely free with no ads or hidden fees.</p>
          </div>
          <div className="faq-item">
            <h3>Which banks are supported?</h3>
            <p>Currently Chase and American Express. Capital One and Citi are coming soon.</p>
          </div>
          <div className="faq-item">
            <h3>Is my data secure?</h3>
            <p>
              Absolutely. The app only reads offer data from bank websites - never your account numbers,
              transactions, or passwords. All data is stored securely in your private Firebase account.
            </p>
          </div>
          <div className="faq-item">
            <h3>How does it compare to credit card apps?</h3>
            <p>
              Bank apps show offers for ONE card at a time. RewardsFindr shows ALL your offers across ALL cards
              when you search for a store, so you always pick the best one.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>RewardsFindr - Find the best credit card rewards for any store</p>
          <p>
            <a href="mailto:hello@rewardsfindr.com">hello@rewardsfindr.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
