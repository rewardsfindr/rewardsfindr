// Pure helpers for home bottom tabs (no React Native imports).

export const HOME_TAB_SLOTS = [
  { id: 'home', label: 'Home', icon: 'home', iconOutline: 'home-outline', placeholder: false },
  { id: 'offers', label: 'Offers', icon: 'pricetag', iconOutline: 'pricetag-outline', placeholder: true },
  { id: 'cards', label: 'Cards', icon: 'card', iconOutline: 'card-outline', placeholder: true },
  { id: 'activity', label: 'Activity', icon: 'time', iconOutline: 'time-outline', placeholder: true },
  { id: 'profile', label: 'Profile', icon: 'person', iconOutline: 'person-outline', placeholder: true },
];

export const HOME_TAB_COMING_SOON_MESSAGE = 'Coming soon';

/** Selected tab index on the home route (`/`). */
export function selectedHomeTabIndex() {
  return 0;
}

export function isPlaceholderTab(index) {
  const slot = HOME_TAB_SLOTS[index];
  return Boolean(slot?.placeholder);
}
