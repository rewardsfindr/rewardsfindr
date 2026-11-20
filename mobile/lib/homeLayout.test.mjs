import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOME_TAB_SLOTS,
  HOME_TAB_COMING_SOON_MESSAGE,
  selectedHomeTabIndex,
  isPlaceholderTab,
} from '../components/homeLayout.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('home bottom bar has exactly 5 slots with Home first', () => {
  assert.equal(HOME_TAB_SLOTS.length, 5);
  assert.equal(HOME_TAB_SLOTS[0].id, 'home');
  assert.equal(HOME_TAB_SLOTS[0].placeholder, false);
  assert.equal(selectedHomeTabIndex(), 0);
});

test('tabs 1–4 are placeholders that use Coming soon copy', () => {
  assert.equal(HOME_TAB_COMING_SOON_MESSAGE, 'Coming soon');
  for (let i = 1; i < HOME_TAB_SLOTS.length; i++) {
    assert.equal(isPlaceholderTab(i), true);
    assert.equal(HOME_TAB_SLOTS[i].placeholder, true);
  }
  assert.equal(isPlaceholderTab(0), false);
});

test('home screen wires brand, banks, and bottom tabs without top wordmark', () => {
  const index = fs.readFileSync(path.join(root, 'app/index.js'), 'utf8');
  assert.match(index, /HomeBrand/);
  assert.match(index, /HomeBottomTabBar/);
  assert.match(index, /BankGrid/);
  assert.match(index, /SearchBar/);
  assert.match(index, /HomeHeader/);
  assert.match(index, /SyncWebView/);
});
