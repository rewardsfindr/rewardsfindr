import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
  PRIVACY_URL,
  TERMS_URL,
  APP_VERSION,
  emailLocalPart,
  accountDisplayName,
  accountInitials,
  syncedBanksSummary,
  formatAppVersion,
} from './accountProfile.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('support and legal links', () => {
  assert.equal(SUPPORT_EMAIL, 'hello@rewardsfindr.com');
  assert.equal(SUPPORT_MAILTO, 'mailto:hello@rewardsfindr.com');
  assert.match(PRIVACY_URL, /^https:\/\/rewardsfindr\.com\//);
  assert.match(TERMS_URL, /^https:\/\/rewardsfindr\.com\//);
});

test('APP_VERSION matches app.json', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.equal(APP_VERSION, app.expo.version);
  assert.equal(formatAppVersion(), `Version ${app.expo.version}`);
});

test('accountDisplayName fallbacks', () => {
  assert.equal(accountDisplayName({ displayName: 'Rakesh B', email: 'r@x.com' }), 'Rakesh B');
  assert.equal(accountDisplayName({ displayName: '  ', email: 'rakesh@x.com' }), 'rakesh');
  assert.equal(accountDisplayName({ displayName: '', email: '' }), 'Your account');
  assert.equal(accountDisplayName({}), 'Your account');
});

test('accountInitials from name or email', () => {
  assert.equal(accountInitials({ displayName: 'Rakesh Balasubramani' }), 'RB');
  assert.equal(accountInitials({ displayName: 'Madonna' }), 'MA');
  assert.equal(accountInitials({ displayName: '', email: 'rakesh@x.com' }), 'R');
  assert.equal(accountInitials({}), '?');
});

test('emailLocalPart', () => {
  assert.equal(emailLocalPart('a@b.com'), 'a');
  assert.equal(emailLocalPart('not-an-email'), '');
  assert.equal(emailLocalPart(''), '');
});

test('syncedBanksSummary orders by BANK_LIST and handles zero', () => {
  const empty = syncedBanksSummary({});
  assert.equal(empty.count, 0);
  assert.equal(empty.title, 'No banks synced');
  assert.equal(empty.subtitle, 'Sync from Home to save offers');

  const summary = syncedBanksSummary({
    citi: { cards: 1 },
    chase: { cards: 2 },
    wells_fargo: { cards: 1 },
  });
  assert.equal(summary.count, 3);
  assert.equal(summary.title, '3 banks synced');
  assert.equal(summary.labels, 'Chase · Citi · Wells Fargo');
  assert.equal(summary.subtitle, summary.labels);

  const one = syncedBanksSummary({ amex: {} });
  assert.equal(one.title, '1 bank synced');
});

test('account screen and tab wiring exist', () => {
  const account = fs.readFileSync(path.join(root, 'app/account.js'), 'utf8');
  const tabBar = fs.readFileSync(path.join(root, 'components/HomeBottomTabBar.js'), 'utf8');
  const layout = fs.readFileSync(path.join(root, 'app/_layout.js'), 'utf8');
  assert.match(account, /ACCOUNT_TAB_INDEX/);
  assert.match(account, /Log out/);
  assert.match(account, /signOut/);
  assert.match(account, /SUPPORT_MAILTO|hello@rewardsfindr/);
  assert.match(account, /PRIVACY_URL|TERMS_URL/);
  assert.equal(account.toLowerCase().includes('delete account'), false);
  assert.match(layout, /name="account"/);
  assert.match(tabBar, /routeForTabIndex/);
  assert.equal(tabBar.includes('onAccountPress'), false);
  const layoutHelpers = fs.readFileSync(path.join(root, 'components/homeLayout.js'), 'utf8');
  assert.match(layoutHelpers, /\/account/);
  assert.match(layoutHelpers, /account:\s*4/);
});
