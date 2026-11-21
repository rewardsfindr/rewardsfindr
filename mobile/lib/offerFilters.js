// Pure helpers for Offers-tab category classify + chip filters.
import { CATEGORIES } from '../shared/constants.js';
import { buildStoreLookup, findBestStoreMatch } from '../shared/offerUtils.js';

export const OFFER_CATEGORY_CHIPS = [
  { key: 'all', label: 'All' },
  { key: CATEGORIES.DINING, label: 'Food' },
  { key: CATEGORIES.GROCERY, label: 'Groceries' },
  { key: CATEGORIES.TRAVEL, label: 'Travel' },
  { key: CATEGORIES.SHOPPING, label: 'Shopping' },
  { key: CATEGORIES.GAS, label: 'Gas' },
  { key: CATEGORIES.OTHER, label: 'Other' },
];

/** Categories that have their own chip; everything else rolls into Other. */
export const OFFER_CHIP_CATEGORY_KEYS = new Set([
  CATEGORIES.DINING,
  CATEGORIES.GROCERY,
  CATEGORIES.TRAVEL,
  CATEGORIES.SHOPPING,
  CATEGORIES.GAS,
]);

const STORE_LOOKUP = buildStoreLookup();

const KEYWORD_RULES = [
  {
    category: CATEGORIES.TRAVEL,
    words: [
      'airline', 'airlines', 'airport', 'hotel', 'hotels', 'flight', 'flights',
      'airfare', 'marriott', 'hilton', 'hyatt', 'rental car', 'car rental',
      'uber', 'lyft', 'cruise',
    ],
  },
  {
    category: CATEGORIES.DINING,
    words: [
      'restaurant', 'cafe', 'coffee', 'grill', 'pizza', 'sushi', 'bakery',
      'diner', 'bistro', 'bar & grill', 'steakhouse', 'kitchen',
    ],
  },
  {
    category: CATEGORIES.GROCERY,
    words: ['supermarket', 'grocery', 'groceries', 'foods market', 'whole foods'],
  },
  {
    category: CATEGORIES.GAS,
    words: ['gas station', 'fuel', 'petroleum', 'exxon', 'chevron', 'shell'],
  },
  {
    category: CATEGORIES.SHOPPING,
    words: ['outlet', 'boutique', 'department store', 'retail'],
  },
];

export function categoryForChip(category) {
  if (OFFER_CHIP_CATEGORY_KEYS.has(category)) return category;
  return CATEGORIES.OTHER;
}

function keywordCategory(merchantName) {
  const hay = String(merchantName || '').toLowerCase();
  if (!hay) return null;
  for (const rule of KEYWORD_RULES) {
    for (const word of rule.words) {
      if (hay.includes(word)) return rule.category;
    }
  }
  return null;
}

/**
 * Client-side category for Offers chips.
 * 1) Trust stored non-other category
 * 2) Popular stores (STORES) exact/partial/fuzzy match
 * 3) Light keyword heuristics
 * 4) other
 */
export function classifyOfferCategory(offer) {
  const stored = String(offer?.category || '').toLowerCase().trim();
  if (stored && stored !== CATEGORIES.OTHER) {
    return stored;
  }

  const merchant = offer?.merchantName || offer?.merchantNameLower || '';
  const storeHit = findBestStoreMatch(merchant, STORE_LOOKUP);
  if (storeHit?.category) return storeHit.category;

  const fromKeywords = keywordCategory(merchant);
  if (fromKeywords) return fromKeywords;

  return CATEGORIES.OTHER;
}

export function banksPresentInOffers(offers) {
  const seen = new Set();
  const ordered = [];
  for (const offer of offers || []) {
    const bank = offer?.bank;
    if (!bank || seen.has(bank)) continue;
    seen.add(bank);
    ordered.push(bank);
  }
  return ordered.sort((a, b) => String(a).localeCompare(String(b)));
}

export const BANK_CHIP_LABELS = {
  chase: 'Chase',
  amex: 'Amex',
  citi: 'Citi',
  us_bank: 'US Bank',
  wells_fargo: 'Wells',
  capital_one: 'Cap One',
  bofa: 'BofA',
  bilt: 'Bilt',
};

export function bankChipLabel(bank) {
  if (!bank) return '';
  return BANK_CHIP_LABELS[bank] || String(bank).replace(/_/g, ' ');
}

export function offerMatchesFilters(offer, { category = 'all', bank = 'all' } = {}) {
  if (bank !== 'all' && offer?.bank !== bank) return false;
  if (category === 'all') return true;
  const classified = categoryForChip(classifyOfferCategory(offer));
  return classified === category;
}

export function filterOffersForChips(offers, filters) {
  return (offers || []).filter((offer) => offerMatchesFilters(offer, filters));
}

/** Merchant A–Z, then higher cashback within the same merchant. */
export function sortOffersForList(offers) {
  return [...(offers || [])].sort((a, b) => {
    const nameA = String(a?.merchantName || '').toLowerCase();
    const nameB = String(b?.merchantName || '').toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return (parseFloat(b?.cashbackAmount) || 0) - (parseFloat(a?.cashbackAmount) || 0);
  });
}

export function formatOfferReward(amount, type) {
  if (!amount) return 'Offer';
  if (type === 'percent') return `${amount}%`;
  if (type === 'points') return `${amount}X`;
  return `$${amount}`;
}
