import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  visibleHomeBanks,
  pickerBanks,
  canAddMoreBanks,
} from '../components/homeBanks.js';
import { BANK_LIST } from '../shared/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SUPPORTED_IDS = BANK_LIST.filter((b) => b.supported).map((b) => b.id);
const UNSUPPORTED_IDS = BANK_LIST.filter((b) => !b.supported).map((b) => b.id);

test('empty syncedBanks → no home bank tiles; Sync Bank still available', () => {
  assert.deepEqual(visibleHomeBanks({}), []);
  assert.equal(canAddMoreBanks({}), true);
  assert.deepEqual(
    pickerBanks({}).map((b) => b.id),
    SUPPORTED_IDS,
  );
});

test('picker lists supported banks only (no Cap One / BofA / Bilt)', () => {
  const ids = pickerBanks({}).map((b) => b.id);
  for (const id of UNSUPPORTED_IDS) {
    assert.equal(ids.includes(id), false, `${id} must not appear in picker`);
  }
  assert.ok(ids.includes('chase'));
  assert.ok(ids.includes('amex'));
  assert.ok(ids.includes('citi'));
  assert.ok(ids.includes('us_bank'));
  assert.ok(ids.includes('wells_fargo'));
});

test('successful sync meta adds a home tile and hides bank from picker', () => {
  const afterChase = {
    chase: { cards: 3, lastSyncedAt: Date.now() },
  };
  assert.deepEqual(visibleHomeBanks(afterChase).map((b) => b.id), ['chase']);
  assert.equal(pickerBanks(afterChase).some((b) => b.id === 'chase'), false);
  assert.equal(canAddMoreBanks(afterChase), true);

  const afterTwo = {
    ...afterChase,
    amex: { cards: 1, lastSyncedAt: Date.now() },
  };
  assert.deepEqual(visibleHomeBanks(afterTwo).map((b) => b.id), ['chase', 'amex']);
  assert.equal(pickerBanks(afterTwo).some((b) => b.id === 'amex'), false);
});

test('cancel / empty map does not invent home tiles', () => {
  assert.deepEqual(visibleHomeBanks({}), []);
  assert.deepEqual(visibleHomeBanks(null), []);
  assert.deepEqual(visibleHomeBanks(undefined), []);
});

test('home banks stay in BANK_LIST catalog order', () => {
  const messy = {
    wells_fargo: { cards: 1, lastSyncedAt: 1 },
    chase: { cards: 2, lastSyncedAt: 1 },
    us_bank: { cards: 1, lastSyncedAt: 1 },
  };
  assert.deepEqual(
    visibleHomeBanks(messy).map((b) => b.id),
    ['chase', 'us_bank', 'wells_fargo'],
  );
});

test('all supported banks linked → Sync Bank cell hidden', () => {
  const all = Object.fromEntries(
    SUPPORTED_IDS.map((id) => [id, { cards: 1, lastSyncedAt: 1 }]),
  );
  assert.equal(canAddMoreBanks(all), false);
  assert.deepEqual(pickerBanks(all), []);
  assert.deepEqual(visibleHomeBanks(all).map((b) => b.id), SUPPORTED_IDS);
});

test('BankGrid renders linked banks + Sync Bank; no Coming Soon on Home', () => {
  const bankGrid = fs.readFileSync(path.join(root, 'components/BankGrid.js'), 'utf8');
  assert.match(bankGrid, /visibleHomeBanks/);
  assert.match(bankGrid, /canAddMoreBanks/);
  assert.match(bankGrid, /onSyncBankPress/);
  assert.match(bankGrid, /Sync Bank/);
  assert.equal(/Coming Soon/.test(bankGrid), false);
  assert.equal(bankGrid.includes('BANK_LIST.map'), false);
});

test('BankPickerSheet is opaque white Choose a bank; no subtitle; uses logos', () => {
  const sheet = fs.readFileSync(path.join(root, 'components/BankPickerSheet.js'), 'utf8');
  assert.match(sheet, /Choose a bank/);
  assert.match(sheet, /pickerBanks/);
  assert.match(sheet, /BankLogoIcon/);
  assert.match(sheet, /colors\.bgCard/);
  assert.equal(sheet.includes('supported banks only'), false);
  assert.equal(/Coming Soon/.test(sheet), false);
});

test('Home opens picker from Sync Bank; select → SyncWebView; success writes syncedBanks', () => {
  const index = fs.readFileSync(path.join(root, 'app/index.js'), 'utf8');
  assert.match(index, /BankPickerSheet/);
  assert.match(index, /pickerOpen/);
  assert.match(index, /onSyncBankPress/);
  assert.match(index, /setPickerOpen\(false\)/);
  assert.match(index, /setSyncBank\(bankId\)/);
  assert.match(index, /handleSyncSuccess/);
  assert.match(index, /setSyncedBanks/);
  // Cancel path: closing SyncWebView clears syncBank without writing meta
  assert.match(index, /onClose=\{\(\) => setSyncBank\(null\)\}/);
});
