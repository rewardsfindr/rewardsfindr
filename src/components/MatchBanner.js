import React from 'react';
import { Info } from 'lucide-react';
import { MATCH_QUALITY } from '../shared/offerUtils.js';

/**
 * MatchBanner
 * Shows a yellow info strip for PARTIAL and FUZZY matches only.
 * Returns null for EXACT match or no match.
 *
 * Props:
 *   matchMeta  {object|null} — { displayName, category, quality }
 *   searching  {bool}
 */
export const MatchBanner = ({ matchMeta, searching }) => {
  if (!matchMeta || searching) return null;
  if (matchMeta.quality === MATCH_QUALITY.EXACT) return null;

  let message = null;
  if (matchMeta.quality === MATCH_QUALITY.PARTIAL) {
    message = `Showing results for "${matchMeta.displayName}"`;
  } else if (matchMeta.quality === MATCH_QUALITY.FUZZY) {
    message = `Did you mean "${matchMeta.displayName}"?`;
  }

  if (!message) return null;

  return (
    <div className="match-banner">
      <Info color="#d97706" size={20} style={{ flexShrink: 0 }} />
      <p>{message}</p>
    </div>
  );
};
