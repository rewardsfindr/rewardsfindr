import React from 'react';
import { Search, Loader } from 'lucide-react';
import { POPULAR_STORES } from '../shared/constants.js';

/**
 * SearchBar
 * Props:
 *   searchTerm    {string}
 *   onChange      {func}  — called with new string value
 *   onSearch      {func}  — fires the search (button click or Enter)
 *   onQuickSearch {func}  — fires search for a popular store chip
 *   searching     {bool}
 */
export const SearchBar = ({ searchTerm, onChange, onSearch, onQuickSearch, searching }) => (
  <div className="panel">
    <div className="search-input-wrap">
      <input
        type="text"
        className="search-input"
        value={searchTerm}
        onChange={(e) => onChange(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && onSearch()}
        placeholder="Search for any store..."
        disabled={searching}
      />
      <button className="search-btn" onClick={onSearch} disabled={searching}>
        {searching
          ? <Loader className="spin-icon" size={20} />
          : <Search size={20} />}
      </button>
    </div>
    <p className="popular-label">Popular Stores:</p>
    <div className="popular-chips">
      {POPULAR_STORES.map((name) => (
        <button
          key={name}
          className="chip-btn"
          onClick={() => onQuickSearch(name)}
          disabled={searching}
        >
          {name}
        </button>
      ))}
    </div>
  </div>
);
