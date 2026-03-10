// ─────────────────────────────────────────────
// SHARED CONSTANTS — mobile copy
// Keep in sync with ../src/shared/constants.js in the web app.
// When updating cards or stores, update BOTH files.
// ─────────────────────────────────────────────
export const CATEGORIES = {
  GROCERY:       'grocery',
  DINING:        'dining',
  GAS:           'gas',
  DRUGSTORE:     'drugstore',
  TRAVEL:        'travel',
  SHOPPING:      'shopping',
  ENTERTAINMENT: 'entertainment',
  HEALTH:        'health',
  SUBSCRIPTION:  'subscription',
  OTHER:         'other',
};

export const BANKS = {
  AMEX:        'amex',
  CHASE:       'chase',
  CITI:        'citi',
  BOFA:        'bofa',
  CAPITAL_ONE: 'capital_one',
  DISCOVER:    'discover',
  WELLS_FARGO: 'wells_fargo',
  BILT:        'bilt',
};

export const CARDS = [
  {
    id: 'amex_blue_cash_preferred',
    cardName: 'Blue Cash Preferred\u00ae',
    issuer: 'American Express',
    bank: BANKS.AMEX,
    annualFee: 95,
    categoryRates: {
      [CATEGORIES.GROCERY]: 6,
      [CATEGORIES.DINING]: 1,
      [CATEGORIES.GAS]: 3,
      [CATEGORIES.DRUGSTORE]: 1,
      [CATEGORIES.TRAVEL]: 1,
      [CATEGORIES.SHOPPING]: 1,
      [CATEGORIES.OTHER]: 1,
    },
    notes: '6% at U.S. supermarkets (up to $6,000/yr), 3% on gas.',
    rewardType: 'cashback',
  },
  {
    id: 'chase_sapphire_preferred',
    cardName: 'Sapphire Preferred\u00ae',
    issuer: 'Chase',
    bank: BANKS.CHASE,
    annualFee: 95,
    categoryRates: {
      [CATEGORIES.DINING]: 3,
      [CATEGORIES.TRAVEL]: 3,
      [CATEGORIES.GROCERY]: 3,
      [CATEGORIES.GAS]: 2,
      [CATEGORIES.DRUGSTORE]: 1,
      [CATEGORIES.SHOPPING]: 1,
      [CATEGORIES.OTHER]: 1,
    },
    notes: '3x points on dining, travel, and online grocery.',
    rewardType: 'points',
  },
  {
    id: 'citi_custom_cash',
    cardName: 'Custom Cash\u00ae',
    issuer: 'Citi',
    bank: BANKS.CITI,
    annualFee: 0,
    categoryRates: {
      [CATEGORIES.GROCERY]: 5,
      [CATEGORIES.DINING]: 5,
      [CATEGORIES.GAS]: 5,
      [CATEGORIES.DRUGSTORE]: 5,
      [CATEGORIES.TRAVEL]: 1,
      [CATEGORIES.SHOPPING]: 1,
      [CATEGORIES.OTHER]: 1,
    },
    notes: '5% on top eligible spend category each billing cycle.',
    rewardType: 'cashback',
  },
  {
    id: 'chase_freedom_flex',
    cardName: 'Freedom Flex\u00ae',
    issuer: 'Chase',
    bank: BANKS.CHASE,
    annualFee: 0,
    categoryRates: {
      [CATEGORIES.DINING]: 3,
      [CATEGORIES.DRUGSTORE]: 3,
      [CATEGORIES.GROCERY]: 5,
      [CATEGORIES.GAS]: 5,
      [CATEGORIES.TRAVEL]: 5,
      [CATEGORIES.SHOPPING]: 1,
      [CATEGORIES.OTHER]: 1,
    },
    notes: '5% on rotating quarterly categories, 3% on dining and drugstores.',
    rewardType: 'cashback',
  },
  {
    id: 'amex_gold',
    cardName: 'Gold Card',
    issuer: 'American Express',
    bank: BANKS.AMEX,
    annualFee: 250,
    categoryRates: {
      [CATEGORIES.DINING]: 4,
      [CATEGORIES.GROCERY]: 4,
      [CATEGORIES.TRAVEL]: 3,
      [CATEGORIES.GAS]: 1,
      [CATEGORIES.DRUGSTORE]: 1,
      [CATEGORIES.SHOPPING]: 1,
      [CATEGORIES.OTHER]: 1,
    },
    notes: '4x at restaurants and U.S. supermarkets.',
    rewardType: 'points',
  },
];

export const STORES = [
  { storeName: 'Whole Foods',      category: CATEGORIES.GROCERY,      aliases: ['whole foods market', 'wholefoods'] },
  { storeName: 'Target',           category: CATEGORIES.GROCERY,      aliases: ['target.com'] },
  { storeName: 'Costco',           category: CATEGORIES.GROCERY,      aliases: ['costco wholesale'] },
  { storeName: 'Walmart',          category: CATEGORIES.GROCERY,      aliases: ['walmart.com', 'wal-mart'] },
  { storeName: 'Kroger',           category: CATEGORIES.GROCERY,      aliases: ['kroger pharmacy'] },
  { storeName: "Trader Joe's",     category: CATEGORIES.GROCERY,      aliases: ['trader joes', 'traderjoes'] },
  { storeName: 'Starbucks',        category: CATEGORIES.DINING,       aliases: ['starbucks coffee'] },
  { storeName: 'Chipotle',         category: CATEGORIES.DINING,       aliases: ['chipotle mexican grill'] },
  { storeName: "McDonald's",       category: CATEGORIES.DINING,       aliases: ['mcdonalds', 'mcdonald'] },
  { storeName: 'Chick-fil-A',      category: CATEGORIES.DINING,       aliases: ['chick fil a', 'chickfila'] },
  { storeName: 'Panera Bread',     category: CATEGORIES.DINING,       aliases: ['panera'] },
  { storeName: 'Subway',           category: CATEGORIES.DINING,       aliases: [] },
  { storeName: 'Shell',            category: CATEGORIES.GAS,          aliases: ['shell gas', 'shell station'] },
  { storeName: 'BP',               category: CATEGORIES.GAS,          aliases: ['bp gas', 'british petroleum'] },
  { storeName: 'Chevron',          category: CATEGORIES.GAS,          aliases: ['chevron gas'] },
  { storeName: 'Exxon',            category: CATEGORIES.GAS,          aliases: ['exxon mobil', 'exxonmobil'] },
  { storeName: 'CVS',              category: CATEGORIES.DRUGSTORE,    aliases: ['cvs pharmacy', 'cvs health'] },
  { storeName: 'Walgreens',        category: CATEGORIES.DRUGSTORE,    aliases: ['walgreen', 'walgreens pharmacy'] },
  { storeName: 'Rite Aid',         category: CATEGORIES.DRUGSTORE,    aliases: ['riteaid'] },
  { storeName: 'United Airlines',  category: CATEGORIES.TRAVEL,       aliases: ['united', 'ua'] },
  { storeName: 'Delta Airlines',   category: CATEGORIES.TRAVEL,       aliases: ['delta', 'delta air lines'] },
  { storeName: 'American Airlines',category: CATEGORIES.TRAVEL,       aliases: ['aa', 'american air'] },
  { storeName: 'Marriott',         category: CATEGORIES.TRAVEL,       aliases: ['marriott hotels', 'marriott bonvoy'] },
  { storeName: 'Hilton',           category: CATEGORIES.TRAVEL,       aliases: ['hilton hotels'] },
  { storeName: 'Amazon',           category: CATEGORIES.SHOPPING,     aliases: ['amazon.com', 'amazon prime'] },
  { storeName: 'Best Buy',         category: CATEGORIES.SHOPPING,     aliases: ['bestbuy', 'best buy.com'] },
  { storeName: 'Nike',             category: CATEGORIES.SHOPPING,     aliases: ['nike.com', 'nike store'] },
  { storeName: 'Netflix',          category: CATEGORIES.SUBSCRIPTION, aliases: [] },
  { storeName: 'Spotify',          category: CATEGORIES.SUBSCRIPTION, aliases: [] },
  { storeName: 'Hulu',             category: CATEGORIES.SUBSCRIPTION, aliases: [] },
];

export const POPULAR_STORES = [
  'Starbucks', 'Amazon', 'Whole Foods', 'Uber', 'Target', 'Costco', "McDonald's", 'Netflix',
];

export const EXAMPLE_REWARDS = [
  { reward: '6% Back', store: 'Whole Foods', cardName: 'Blue Cash Preferred', last4: '6612', bank: 'AMEX' },
  { reward: '4% Back', store: 'Chipotle',    cardName: 'Savor Cash Rewards',  last4: '2278', bank: 'C-1' },
  { reward: '3x Points', store: 'Starbucks', cardName: 'Sapphire Preferred',  last4: '4821', bank: 'CHASE' },
];

export const BANK_LIST = [
  { id: 'chase',       label: 'Chase',           supported: true  },
  { id: 'amex',        label: 'Amex',            supported: true  },
  { id: 'capital_one', label: 'Capital One',     supported: false },
  { id: 'citi',        label: 'Citi',            supported: false },
  { id: 'discover',    label: 'Discover',        supported: false },
  { id: 'wells_fargo', label: 'Wells Fargo',     supported: false },
  { id: 'bofa',        label: 'Bank of America', supported: false },
  { id: 'bilt',        label: 'Bilt',            supported: false },
];

export const FAQ_ITEMS = [
  {
    q: 'Is RewardsFindr free?',
    a: 'Yes! Completely free with no ads or hidden fees.',
  },
  {
    q: 'Which banks are supported?',
    a: 'Currently Chase and American Express. Capital One, Citi, Discover, Wells Fargo, Bank of America, and Bilt are coming soon.',
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely. The app only reads offer data from bank websites — never your account numbers, transactions, or passwords.',
  },
  {
    q: 'How does it compare to credit card apps?',
    a: 'Bank apps show offers for ONE card at a time. RewardsFindr shows ALL your offers across ALL cards when you search for a store.',
  },
];
