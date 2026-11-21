import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOME_TAB_SLOTS,
  HOME_TAB_COMING_SOON_MESSAGE,
  ACCOUNT_TAB_INDEX,
  HOME_TAB_INDEX,
  OFFERS_TAB_INDEX,
  HISTORY_TAB_INDEX,
  selectedHomeTabIndex,
  isPlaceholderTab,
  isAccountTab,
  tabIndexForRoute,
  routeForTabIndex,
} from '../components/homeLayout.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('home bottom bar has exactly 5 slots with Home first', () => {
  assert.equal(HOME_TAB_SLOTS.length, 5);
  assert.equal(HOME_TAB_SLOTS[0].id, 'home');
  assert.equal(HOME_TAB_SLOTS[0].placeholder, false);
  assert.equal(selectedHomeTabIndex(), 0);
  assert.equal(HOME_TAB_INDEX, 0);
});

test('Offers and History are real tabs; Cards stays Coming soon; Account unchanged', () => {
  assert.equal(HOME_TAB_COMING_SOON_MESSAGE, 'Coming soon');

  assert.equal(HOME_TAB_SLOTS[1].id, 'offers');
  assert.equal(HOME_TAB_SLOTS[1].icon, 'gift');
  assert.equal(HOME_TAB_SLOTS[1].iconOutline, 'gift-outline');
  assert.equal(HOME_TAB_SLOTS[1].placeholder, false);
  assert.equal(isPlaceholderTab(OFFERS_TAB_INDEX), false);

  assert.equal(HOME_TAB_SLOTS[2].id, 'cards');
  assert.equal(HOME_TAB_SLOTS[2].icon, 'grid');
  assert.equal(HOME_TAB_SLOTS[2].iconOutline, 'grid-outline');
  assert.equal(HOME_TAB_SLOTS[2].placeholder, true);
  assert.equal(isPlaceholderTab(2), true);

  assert.equal(HOME_TAB_SLOTS[3].id, 'history');
  assert.equal(HOME_TAB_SLOTS[3].label, 'History');
  assert.equal(HOME_TAB_SLOTS[3].icon, 'time');
  assert.equal(HOME_TAB_SLOTS[3].iconOutline, 'time-outline');
  assert.equal(HOME_TAB_SLOTS[3].placeholder, false);
  assert.equal(isPlaceholderTab(HISTORY_TAB_INDEX), false);

  assert.equal(ACCOUNT_TAB_INDEX, 4);
  assert.equal(HOME_TAB_SLOTS[4].id, 'account');
  assert.equal(HOME_TAB_SLOTS[4].label, 'Account');
  assert.equal(HOME_TAB_SLOTS[4].icon, 'person');
  assert.equal(HOME_TAB_SLOTS[4].iconOutline, 'person-outline');
  assert.equal(HOME_TAB_SLOTS[4].placeholder, false);
  assert.equal(isPlaceholderTab(4), false);
  assert.equal(isAccountTab(4), true);
  assert.equal(isAccountTab(0), false);
});

test('tabIndexForRoute and routeForTabIndex map Home / Offers / History / Account', () => {
  assert.equal(tabIndexForRoute('/'), HOME_TAB_INDEX);
  assert.equal(tabIndexForRoute('index'), HOME_TAB_INDEX);
  assert.equal(tabIndexForRoute('offers'), OFFERS_TAB_INDEX);
  assert.equal(tabIndexForRoute('/offers'), OFFERS_TAB_INDEX);
  assert.equal(tabIndexForRoute('history'), HISTORY_TAB_INDEX);
  assert.equal(tabIndexForRoute('/history'), HISTORY_TAB_INDEX);
  assert.equal(tabIndexForRoute('account'), ACCOUNT_TAB_INDEX);
  assert.equal(tabIndexForRoute('/account'), ACCOUNT_TAB_INDEX);
  assert.equal(tabIndexForRoute('results'), -1);
  assert.equal(tabIndexForRoute('login'), -1);

  assert.equal(routeForTabIndex(0), '/');
  assert.equal(routeForTabIndex(1), '/offers');
  assert.equal(routeForTabIndex(3), '/history');
  assert.equal(routeForTabIndex(4), '/account');
  assert.equal(routeForTabIndex(2), null);
});

test('home screen wires brand, banks, picker, and safe-area top without HomeHeader', () => {
  const index = fs.readFileSync(path.join(root, 'app/index.js'), 'utf8');
  const tabBar = fs.readFileSync(path.join(root, 'components/HomeBottomTabBar.js'), 'utf8');
  const bankGrid = fs.readFileSync(path.join(root, 'components/BankGrid.js'), 'utf8');
  assert.match(index, /HomeBrand/);
  assert.match(index, /HomeBottomTabBar/);
  assert.match(index, /BankGrid/);
  assert.match(index, /BankPickerSheet/);
  assert.match(index, /SearchBar/);
  assert.match(index, /SyncWebView/);
  assert.match(index, /useSafeAreaInsets/);
  assert.match(index, /paddingTop:\s*insets\.top/);
  assert.match(index, /recordSearch/);
  assert.equal(index.includes('HomeHeader'), false);
  assert.equal(fs.existsSync(path.join(root, 'components/HomeHeader.js')), false);
  assert.equal(index.includes('onAccountPress'), false);
  assert.equal(index.includes('Sign Out'), false);
  assert.equal(tabBar.includes('onAccountPress'), false);
  assert.match(tabBar, /routeForTabIndex/);
  assert.match(tabBar, /router\.replace/);
  assert.equal(tabBar.includes('initials'), false);
  assert.equal(bankGrid.includes('SYNC YOUR BANKS'), false);
  assert.equal(bankGrid.includes('Sync your banks'), false);
  assert.match(bankGrid, /Sync Bank/);
  assert.equal(/Coming Soon/.test(bankGrid), false);
});

test('offers, history, and account screens exist with tab bar; layout registers routes; no tabs group', () => {
  const offers = fs.readFileSync(path.join(root, 'app/offers.js'), 'utf8');
  const history = fs.readFileSync(path.join(root, 'app/history.js'), 'utf8');
  const account = fs.readFileSync(path.join(root, 'app/account.js'), 'utf8');
  const layout = fs.readFileSync(path.join(root, 'app/_layout.js'), 'utf8');
  assert.match(offers, /HomeBottomTabBar/);
  assert.match(offers, /OFFERS_TAB_INDEX/);
  assert.match(offers, /loadOffers/);
  assert.match(offers, /enrichOffersWithCategoryKey|filterOffersForChips|OFFER_CATEGORY_CHIPS/);
  assert.match(offers, /OffersBankFilterSheet/);
  assert.match(offers, /startTransition/);
  assert.equal(offers.includes('bankChips'), false);
  assert.equal(HOME_TAB_SLOTS[1].icon, 'gift');
  assert.equal(HOME_TAB_SLOTS[2].icon, 'grid');
  assert.match(history, /HomeBottomTabBar/);
  assert.match(history, /HISTORY_TAB_INDEX/);
  assert.match(history, /loadSearchHistory/);
  assert.match(history, /Clear/);
  assert.match(account, /HomeBottomTabBar/);
  assert.match(account, /ACCOUNT_TAB_INDEX/);
  assert.match(account, /Log out/);
  assert.equal(account.toLowerCase().includes('delete account'), false);
  assert.match(layout, /name="offers"/);
  assert.match(layout, /name="history"/);
  assert.match(layout, /name="account"/);
  assert.equal(layout.includes('(tabs)'), false);
  assert.equal(fs.existsSync(path.join(root, 'app/(tabs)')), false);
});

test('home no longer mounts Popular Stores or Example Rewards', () => {
  const index = fs.readFileSync(path.join(root, 'app/index.js'), 'utf8');
  const searchBar = fs.readFileSync(path.join(root, 'components/SearchBar.js'), 'utf8');
  const constants = fs.readFileSync(path.join(root, 'shared/constants.js'), 'utf8');
  assert.equal(index.includes('ExampleRewards'), false);
  assert.equal(fs.existsSync(path.join(root, 'components/ExampleRewards.js')), false);
  assert.equal(searchBar.includes('POPULAR STORES'), false);
  assert.equal(searchBar.includes('POPULAR_STORES'), false);
  assert.equal(searchBar.includes('onChipPress'), false);
  assert.equal(constants.includes('POPULAR_STORES'), false);
  assert.equal(constants.includes('EXAMPLE_REWARDS'), false);
});
