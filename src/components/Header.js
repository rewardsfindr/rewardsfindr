import React from 'react';
import { CreditCard } from 'lucide-react';
import { CARDS } from '../shared/constants.js';

/**
 * Header
 * Props:
 *   storeLookupSize  {number}      — total store key count from buildStoreLookup
 *   onSignIn         {func}        — called when Sign In button is clicked
 *   user             {object|null} — null = signed out; object = signed-in user
 */
export const Header = ({ storeLookupSize, onSignIn, user }) => (
  <div className="panel header">
    <div className="header-top">
      <div className="header-icon-wrap">
        <CreditCard color="white" size={28} />
      </div>
      <h1 className="header-title">RewardsFindr</h1>
      <div className="header-actions">
        {user ? (
          <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
            {user.displayName || user.email}
          </span>
        ) : (
          <button className="btn-signin" onClick={onSignIn}>
            Sign In
          </button>
        )}
      </div>
    </div>
    <p className="header-subtitle">Find the best credit card rewards for any store</p>
    <div className="header-meta">
      <div className="header-meta-dot" />
      <span className="header-meta-text">
        {CARDS.length} cards · {storeLookupSize} stores
      </span>
    </div>
  </div>
);
