// Pure helpers for home bottom tabs (no React Native imports).

export const HOME_TAB_SLOTS = [
  { id: 'home', label: 'Home', icon: 'home', iconOutline: 'home-outline', placeholder: false },
  { id: 'offers', label: 'Offers', icon: 'pricetag', iconOutline: 'pricetag-outline', placeholder: false },
  { id: 'cards', label: 'Cards', icon: 'card', iconOutline: 'card-outline', placeholder: true },
  { id: 'history', label: 'History', icon: 'time', iconOutline: 'time-outline', placeholder: false },
  { id: 'account', label: 'Account', icon: 'person', iconOutline: 'person-outline', placeholder: false },
];

export const HOME_TAB_COMING_SOON_MESSAGE = 'Coming soon';

export const ACCOUNT_TAB_INDEX = 4;
export const HOME_TAB_INDEX = 0;
export const OFFERS_TAB_INDEX = 1;
export const HISTORY_TAB_INDEX = 3;

const ROUTE_BY_TAB = {
  0: '/',
  1: '/offers',
  3: '/history',
};

const TAB_BY_SEGMENT = {
  index: 0,
  '': 0,
  offers: 1,
  history: 3,
};

/** Selected tab index on the home route (`/`). */
export function selectedHomeTabIndex() {
  return HOME_TAB_INDEX;
}

export function isPlaceholderTab(index) {
  const slot = HOME_TAB_SLOTS[index];
  return Boolean(slot?.placeholder);
}

export function isAccountTab(index) {
  return index === ACCOUNT_TAB_INDEX || HOME_TAB_SLOTS[index]?.id === 'account';
}

/** Map an expo-router segment (or path) to a tab index, or -1 when none. */
export function tabIndexForRoute(segmentOrPath) {
  if (segmentOrPath == null || segmentOrPath === '/') return HOME_TAB_INDEX;
  const raw = String(segmentOrPath).replace(/^\//, '');
  const segment = raw.split('/')[0] || '';
  if (Object.prototype.hasOwnProperty.call(TAB_BY_SEGMENT, segment)) {
    return TAB_BY_SEGMENT[segment];
  }
  return -1;
}

/** Stack path for a real (non-placeholder, non-account) tab, or null. */
export function routeForTabIndex(index) {
  return ROUTE_BY_TAB[index] ?? null;
}
