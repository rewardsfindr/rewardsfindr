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
    // Entry URL — Capital One main site. Loading www.capitalone.com first
    // avoids the ERR_NAME_NOT_RESOLVED DNS failure that occurs when navigating
    // directly to verified.capitalone.com in a cold WebView session.
    // The Sign In button on this page redirects naturally to verified.capitalone.com.
    url: 'https://www.capitalone.com',
    // After login, "Go to Offers Page" navigates to the account dashboard.
    // The user then taps "View All Offers" on their card natively, which
    // opens capitaloneoffers.com/feed?viewInstanceId=... with a valid session.
    // We cannot deep-link directly to capitaloneoffers.com — it requires
    // a viewInstanceId that is card-specific and session-generated.
    offersUrl: 'https://myaccount.capitalone.com',
    label: 'Capital One Offers',
    color: '#d03027',
    offersPaths: ['capitaloneoffers.com/feed'],
    loginPaths: ['/auth/signin', '/sign-in', '/login', '/auth', '/signin', 'verified.capitalone.com'],
    captureMaxBytes: 2000000,
    useCapitalOneFeedInterceptor: true,
  },
};
