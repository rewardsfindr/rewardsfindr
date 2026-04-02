// ─────────────────────────────────────────────────────────────────────────────
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
// useCapitalOneFeedInterceptor: true
//   → Capital One style. Patch window.fetch on /feed,
//     auto-paginate via cursor, post CAP1_CAPTURE_COMPLETE.
//
// Neither flag (default)
//   → URL-based offers detection (future banks).
// ─────────────────────────────────────────────────────────────────────────────

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
    offersUrl: 'https://global.americanexpress.com/offers',
    enrolledUrl: 'https://global.americanexpress.com/offers/enrolled',
    label: 'Amex Offers',
    color: '#007ac1',
    eligiblePath: 'global.americanexpress.com/offers',
    enrolledPath: 'global.americanexpress.com/offers/enrolled',
    offersPaths: ['global.americanexpress.com/offers'],
    loginPaths: ['/account/login', '/login', '/sign-in', '/identity', '/auth', '/challenge', 'two-step-verification'],
    gridSelector: '[data-testid="listViewContainer"]',
    captureMaxBytes: 500000,
    useAmexCardSwitcher: true,
  },
  capitalone: {
    // Entry URL — Capital One sign-in page (verified subdomain).
    url: 'https://verified.capitalone.com/auth/signin',
    // After login, "Go to Offers Page" navigates here.
    // This is the SSO bridge on the capitalone.com domain — it carries the
    // authenticated session and redirects into capitaloneoffers.com with a
    // valid session token, avoiding a second login prompt.
    offersUrl: 'https://www.capitalone.com/card-benefits/offers',
    label: 'Capital One Offers',
    color: '#d03027',
    offersPaths: ['capitaloneoffers.com/feed', 'capitaloneoffers.com'],
    loginPaths: ['/auth/signin', '/sign-in', '/login', '/auth', '/signin'],
    captureMaxBytes: 2000000,
    useCapitalOneFeedInterceptor: true,
  },
};
