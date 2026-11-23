import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SYNC_MODES,
  STEP_TIMEOUT_MS,
  shouldAutoStartChase,
  nextSyncMode,
  isPartialAbort,
  partialAbortCopy,
  shouldShowSyncCover,
  planChaseNeedsInputResume,
} from './syncMode.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const readyGate = {
  bank: 'chase',
  syncMode: SYNC_MODES.AUTH,
  onOffersPage: true,
  onLoginPage: false,
  hasCards: true,
  hookReady: true,
  syncStarted: false,
  autoStartConsumed: false,
  visible: true,
};

test('STEP_TIMEOUT_MS is 60 seconds', () => {
  assert.equal(STEP_TIMEOUT_MS, 60_000);
});

test('gate false if login', () => {
  assert.equal(shouldAutoStartChase({ ...readyGate, onLoginPage: true }), false);
});

test('gate false without cards', () => {
  assert.equal(shouldAutoStartChase({ ...readyGate, hasCards: false }), false);
});

test('gate false without hook', () => {
  assert.equal(shouldAutoStartChase({ ...readyGate, hookReady: false }), false);
});

test('gate false without offers page', () => {
  assert.equal(shouldAutoStartChase({ ...readyGate, onOffersPage: false }), false);
});

test('gate false when already syncing', () => {
  assert.equal(shouldAutoStartChase({ ...readyGate, syncStarted: true }), false);
});

test('gate true once in auth; consumed blocks second start', () => {
  assert.equal(shouldAutoStartChase(readyGate), true);
  assert.equal(
    shouldAutoStartChase({ ...readyGate, autoStartConsumed: true }),
    false,
  );
});

test('needsInput resume allows start even if consumed', () => {
  assert.equal(
    shouldAutoStartChase({
      ...readyGate,
      syncMode: SYNC_MODES.NEEDS_INPUT,
      autoStartConsumed: true,
    }),
    true,
  );
});

test('non-Chase banks never auto-start', () => {
  for (const bank of ['amex', 'wells_fargo', 'citi', 'us_bank']) {
    assert.equal(shouldAutoStartChase({ ...readyGate, bank }), false);
  }
});

test('mode: capturing + login → needsInput', () => {
  assert.equal(
    nextSyncMode(SYNC_MODES.CAPTURING, 'login_detected'),
    SYNC_MODES.NEEDS_INPUT,
  );
});

test('mode: capturing + step timeout → failed', () => {
  assert.equal(
    nextSyncMode(SYNC_MODES.CAPTURING, 'step_timeout'),
    SYNC_MODES.FAILED,
  );
});

test('mode: capturing + capture error → failed', () => {
  assert.equal(
    nextSyncMode(SYNC_MODES.CAPTURING, 'capture_error'),
    SYNC_MODES.FAILED,
  );
});

test('mode: failed + syncOffers → capturing', () => {
  assert.equal(
    nextSyncMode(SYNC_MODES.FAILED, 'sync_offers'),
    SYNC_MODES.CAPTURING,
  );
});

test('mode: failed + try_again → capturing', () => {
  assert.equal(
    nextSyncMode(SYNC_MODES.FAILED, 'try_again'),
    SYNC_MODES.CAPTURING,
  );
});

test('mode: needsInput + resume → capturing', () => {
  assert.equal(
    nextSyncMode(SYNC_MODES.NEEDS_INPUT, 'resume_after_input'),
    SYNC_MODES.CAPTURING,
  );
});

test('mode: auth ignores login_detected', () => {
  assert.equal(
    nextSyncMode(SYNC_MODES.AUTH, 'login_detected'),
    SYNC_MODES.AUTH,
  );
});

test('partial abort retains synced cards and is not full', () => {
  assert.equal(isPartialAbort({ syncedCount: 2, totalCards: 4 }), true);
  assert.equal(isPartialAbort({ syncedCount: 4, totalCards: 4 }), false);
  assert.equal(isPartialAbort({ syncedCount: 0, totalCards: 4 }), false);
  assert.match(partialAbortCopy({ syncedCount: 1, totalCards: 4 }), /Saved 1 of 4/);
});

test('capture cover is Chase-only; non-Chase capturing stays uncovered', () => {
  assert.equal(
    shouldShowSyncCover({ bank: 'chase', syncMode: SYNC_MODES.CAPTURING }),
    true,
  );
  assert.equal(
    shouldShowSyncCover({ bank: 'chase', syncMode: SYNC_MODES.AUTH }),
    false,
  );
  for (const bank of ['amex', 'wells_fargo', 'citi', 'us_bank']) {
    assert.equal(
      shouldShowSyncCover({ bank, syncMode: SYNC_MODES.CAPTURING }),
      false,
      `${bank} must not show Chase capture cover`,
    );
  }
});

test('NeedsInput resume arms capture on current card without switching', () => {
  assert.deepEqual(
    planChaseNeedsInputResume({
      cardOptionsLength: 4,
      syncedCount: 1,
      cardIndex: 1,
    }),
    { action: 'arm_capture', position: 1 },
  );
  assert.notEqual(
    planChaseNeedsInputResume({
      cardOptionsLength: 4,
      syncedCount: 1,
      cardIndex: 1,
    }).action,
    'switch_card',
  );
});

test('NeedsInput resume falls back to full_start when walk is done or empty', () => {
  assert.deepEqual(
    planChaseNeedsInputResume({
      cardOptionsLength: 4,
      syncedCount: 4,
      cardIndex: 3,
    }),
    { action: 'full_start' },
  );
  assert.deepEqual(
    planChaseNeedsInputResume({
      cardOptionsLength: 0,
      syncedCount: 0,
      cardIndex: 0,
    }),
    { action: 'full_start' },
  );
});

test('SyncWebView gates cover and resume to Chase helpers (no same-card switch)', () => {
  const src = readFileSync(join(HERE, '..', 'SyncWebView.js'), 'utf8');
  assert.match(src, /shouldShowSyncCover/);
  assert.match(src, /planChaseNeedsInputResume/);
  assert.match(src, /Do not switchChaseCard\(current\)/);
  assert.doesNotMatch(
    src,
    /resumeChaseCapture[\s\S]*?switchChaseCard\(pos\)/,
  );
  assert.match(src, /showCover\s*=\s*shouldShowSyncCover/);
});
