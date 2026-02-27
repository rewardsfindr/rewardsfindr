import React from 'react';
import { CreditCard } from 'lucide-react';
import { CARDS } from '../shared/constants.js';

/**
 * Header
 * Props:
 *   storeLookupSize  {number}      — total store key count
 *   onSignIn         {func}        — called when Sign In button clicked
 *   onSignOut        {func}        — called when Sign Out button clicked
 *   user             {object|null} — null = signed out; Firebase user object = signed in
 */
export const Header = ({ storeLookupSize, onSignIn, onSignOut, user }) => (
  <div className="panel header">
    <div className="header-top">
      <div className="header-icon-wrap">
        <CreditCard color="white" size={28} />
      </div>
      <h1 className="header-title">RewardsFindr</h1>
      <div className="header-actions">
        {user ? (
          <div className="header-user">
            {user.photoURL && (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                className="header-avatar"
                referrerPolicy="no-referrer"
              />
            )}
            <span className="header-user-name">
              {user.displayName || user.email}
            </span>
            <button className="btn-signout" onClick={onSignOut}>
              Sign Out
            </button>
          </div>
        ) : (
          <button className="btn-signin" onClick={onSignIn}>
            Sign In with Google
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
