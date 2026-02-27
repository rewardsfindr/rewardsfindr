import React from 'react';
import { Store, TrendingUp } from 'lucide-react';

/**
 * ResultsHeader
 * Purple gradient banner + "Top Rewards" title shown above the card list.
 *
 * Props:
 *   selectedStore  {string}
 *   matchMeta      {object} — { category, ... }
 */
export const ResultsHeader = ({ selectedStore, matchMeta }) => (
  <>
    <div className="results-header">
      <div className="results-header-top">
        <Store size={28} />
        <h2>Best Cards for {selectedStore}</h2>
      </div>
      <p className="results-header-category">
        Category:{' '}
        {matchMeta?.category?.charAt(0).toUpperCase() + matchMeta?.category?.slice(1)}
      </p>
    </div>
    <h3 className="top-rewards-title">
      <TrendingUp color="#4f46e5" /> Top Rewards
    </h3>
  </>
);
