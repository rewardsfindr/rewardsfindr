// ─────────────────────────────────────────────
// BANK CONFIG
// Add a new entry here to support a new bank.
//
// useCardsDetectedAsOffersSignal: true
//   → Chase-style SPA. Use JS CARDS_DETECTED message
//     to know we're on the offers page (not URL).
//
// useAmexCardSwitcher: true
//   → Amex-style combobox. Use AMEX_CARDS_DETECTED
//     and buildAmexSwitchCardJs to switch cards.
//
// Neither flag (default)
//   → URL-based offers detection (future banks).
// ─────────────────────────────────────────────

export const BANK_CONFIG = {
  chase: {
    url: 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub',
    offersUrl: 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub',
    label: 'Chase Offers',
    color: '#1a3a6b',
    offersPaths: ['/cardmember-offers', 'merchantOffers'],
    loginPaths: ['/sign-in', '/logon', '/login', '/sso', '/identify', '/challenge'],
    gridSelector: '[data-testid="grid-items-container"]',
    useCardsDetectedAsOffersSignal: true,
  },
  amex: {
    url: 'https://www.americanexpress.com/en-us/benefits/offers/',
    offersUrl: 'https://www.americanexpress.com/en-us/benefits/offers/',
    label: 'Amex Offers',
    color: '#007ac1',
    offersPaths: ['/benefits/offers'],
    loginPaths: ['/login', '/sign-in', '/identity', '/auth', '/challenge'],
    gridSelector: null,
    useAmexCardSwitcher: true,
  },
};
