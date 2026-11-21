import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOME_TAB_SLOTS,
  HOME_TAB_COMING_SOON_MESSAGE,
  ACCOUNT_TAB_INDEX,
  selectedHomeTabIndex,
  isPlaceholderTab,
  isAccountTab,
} from '../components/homeLayout.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('home bottom bar has exactly 5 slots with Home first', () => {
  assert.equal(HOME_TAB_SLOTS.length, 5);
  assert.equal(HOME_TAB_SLOTS[0].id, 'home');
  assert.equal(HOME_TAB_SLOTS[0].placeholder, false);
  assert.equal(selectedHomeTabIndex(), 0);
});

test('tabs 1–3 are Coming soon placeholders; tab 4 is Account', () => {
  assert.equal(HOME_TAB_COMING_SOON_MESSAGE, 'Coming soon');
  for (let i = 1; i <= 3; i++) {
    assert.equal(isPlaceholderTab(i), true);
    assert.equal(HOME_TAB_SLOTS[i].placeholder, true);
  }
  assert.equal(isPlaceholderTab(0), false);
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

test('home screen wires brand, banks, picker, account tab, and safe-area top without HomeHeader', () => {
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
  assert.match(index, /onAccountPress/);
  assert.match(index, /Sign Out/);
  assert.match(index, /signOut/);
  assert.equal(index.includes('HomeHeader'), false);
  assert.equal(fs.existsSync(path.join(root, 'components/HomeHeader.js')), false);
  assert.match(tabBar, /onAccountPress/);
  assert.match(tabBar, /isAccountTab/);
  assert.equal(tabBar.includes('initials'), false);
  assert.equal(bankGrid.includes('SYNC YOUR BANKS'), false);
  assert.equal(bankGrid.includes('Sync your banks'), false);
  assert.match(bankGrid, /Sync Bank/);
  assert.equal(/Coming Soon/.test(bankGrid), false);
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
