import React from 'react';

/**
 * ResultCard
 * A single ranked credit card result tile.
 *
 * Props:
 *   card  {object} — { cardName, issuer, rate, notes, rewardType }
 *   rank  {number} — 0-based index (controls colour: 0=green, 1=blue, 2=purple)
 */
export const ResultCard = ({ card, rank }) => (
  <div className={`result-card result-card--${rank}`}>
    <div className="result-card-top">
      <div className="result-card-info">
        <h4>{card.cardName}</h4>
        <p>{card.issuer}</p>
      </div>
      <div className="result-card-rate">
        <div className="rate-number">{card.rate}%</div>
        <div className="rate-label">
          {card.rewardType === 'points' ? 'points back' : 'cash back'}
        </div>
      </div>
    </div>
    {card.notes && (
      <div className="result-card-notes">
        <p>{card.notes}</p>
      </div>
    )}
  </div>
);
