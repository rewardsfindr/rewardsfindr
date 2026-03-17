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
    captureMaxBytes: 200000,
    useCardsDetectedAsOffersSignal: true,
  },
  amex: {
    // Entry URL — redirects to login if not authenticated
    url: 'https://www.americanexpress.com/en-us/benefits/offers/',
    // After login Amex lands on global.americanexpress.com/offers (with query params)
    // We navigate here to ensure we're on the eligible offers tab
    offersUrl: 'https://global.americanexpress.com/offers',
    // Activated/enrolled offers page
    enrolledUrl: 'https://global.americanexpress.com/offers/enrolled',
    label: 'Amex Offers',
    color: '#007ac1',
    // eligiblePath: matches global.americanexpress.com/offers (with or without query params)
    // MUST NOT match enrolledPath — check enrolled first in amexHandleLoadEnd
    // MUST NOT match americanexpress.com/en-us/benefits/offers (marketing page)
    eligiblePath: 'global.americanexpress.com/offers',
    enrolledPath: 'global.americanexpress.com/offers/enrolled',
    offersPaths: ['global.americanexpress.com/offers'],
    loginPaths: ['/account/login', '/login', '/sign-in', '/identity', '/auth', '/challenge', 'two-step-verification'],
    // Real offer rows are direct DIV children of this container
    gridSelector: '[data-testid="listViewContainer"]',
    captureMaxBytes: 500000,
    useAmexCardSwitcher: true,
  },
};
