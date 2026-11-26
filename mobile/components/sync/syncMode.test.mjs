import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SYNC_MODES,
  STEP_TIMEOUT_MS,
  AUTH_REPROBE_MS,
  shouldAutoStartChase,
  shouldAutoStartWells,
  shouldAutoStartCiti,
  nextSyncMode,
  isPartialAbort,
  partialAbortCopy,
  shouldShowSyncCover,
  planChaseNeedsInputResume,
  shouldForceChaseOffersRedirect,
  chaseCoverProgress,
  urlMatchesAnyPath,
} from './syncMode.js';
import { BANK_CONFIG } from './bankConfig.js';

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

test('AUTH_REPROBE_MS is 1.5 seconds', () => {
  assert.equal(AUTH_REPROBE_MS, 1_500);
});

test('Chase offersPaths match classic and live CPO hub URLs', () => {
  const paths = BANK_CONFIG.chase.offersPaths;
  assert.equal(
    urlMatchesAnyPath(
      'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub',
      paths,
    ),
    true,
  );
  assert.equal(
    urlMatchesAnyPath(
      'https://secure.chase.com/web/.../cpo/offerAndShopping/chaseOffers/offerHub',
      paths,
    ),
    true,
  );
  assert.equal(
    urlMatchesAnyPath('https://secure.chase.com/web/auth/#/logon/logon/chaseOnlinePassword', paths),
    false,
  );
});

test('urlMatchesAnyPath is case-insensitive and ignores empty needles', () => {
  assert.equal(urlMatchesAnyPath('https://x/OfferHub', ['offerHub']), true);
  assert.equal(urlMatchesAnyPath('https://x/foo', ['', null, 'bar']), false);
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

test('capture cover is Chase + Wells + Citi; other Sync Offers banks stay uncovered', () => {
  assert.equal(
    shouldShowSyncCover({ bank: 'chase', syncMode: SYNC_MODES.CAPTURING }),
    true,
  );
  assert.equal(
    shouldShowSyncCover({ bank: 'wells_fargo', syncMode: SYNC_MODES.CAPTURING }),
    true,
  );
  assert.equal(
    shouldShowSyncCover({ bank: 'citi', syncMode: SYNC_MODES.CAPTURING }),
    true,
  );
  assert.equal(
    shouldShowSyncCover({ bank: 'chase', syncMode: SYNC_MODES.AUTH }),
    false,
  );
  assert.equal(
    shouldShowSyncCover({ bank: 'wells_fargo', syncMode: SYNC_MODES.AUTH }),
    false,
  );
  assert.equal(
    shouldShowSyncCover({ bank: 'citi', syncMode: SYNC_MODES.AUTH }),
    false,
  );
  for (const bank of ['amex', 'us_bank']) {
    assert.equal(
      shouldShowSyncCover({ bank, syncMode: SYNC_MODES.CAPTURING }),
      false,
      `${bank} must not show auto-sync capture cover`,
    );
  }
});

const wellsReadyGate = {
  bank: 'wells_fargo',
  syncMode: SYNC_MODES.AUTH,
  onOffersPage: true,
  onLoginPage: false,
  syncStarted: false,
  autoStartConsumed: false,
  visible: true,
};

test('Wells gate false if login', () => {
  assert.equal(shouldAutoStartWells({ ...wellsReadyGate, onLoginPage: true }), false);
});

test('Wells gate false without positive deals surface', () => {
  assert.equal(shouldAutoStartWells({ ...wellsReadyGate, onOffersPage: false }), false);
  assert.equal(
    shouldAutoStartWells({ ...wellsReadyGate, onOffersPage: false, onLoginPage: false }),
    false,
    'never auto-start on !onLoginPage alone',
  );
});

test('Wells gate false when already syncing', () => {
  assert.equal(shouldAutoStartWells({ ...wellsReadyGate, syncStarted: true }), false);
});

test('Wells gate true once in auth; consumed blocks second start', () => {
  assert.equal(shouldAutoStartWells(wellsReadyGate), true);
  assert.equal(
    shouldAutoStartWells({ ...wellsReadyGate, autoStartConsumed: true }),
    false,
  );
});

test('Wells needsInput resume allows start even if consumed', () => {
  assert.equal(
    shouldAutoStartWells({
      ...wellsReadyGate,
      syncMode: SYNC_MODES.NEEDS_INPUT,
      autoStartConsumed: true,
    }),
    true,
  );
});

test('non-Wells banks never pass shouldAutoStartWells', () => {
  for (const bank of ['chase', 'amex', 'citi', 'us_bank', 'capital_one']) {
    assert.equal(shouldAutoStartWells({ ...wellsReadyGate, bank }), false);
  }
});

test('Wells mode: capturing + login → needsInput; timeout/unavailable → failed', () => {
  assert.equal(
    nextSyncMode(SYNC_MODES.CAPTURING, 'login_detected'),
    SYNC_MODES.NEEDS_INPUT,
  );
  assert.equal(
    nextSyncMode(SYNC_MODES.CAPTURING, 'step_timeout'),
    SYNC_MODES.FAILED,
  );
  assert.equal(
    nextSyncMode(SYNC_MODES.CAPTURING, 'capture_error'),
    SYNC_MODES.FAILED,
  );
});

const citiReadyGate = {
  bank: 'citi',
  syncMode: SYNC_MODES.AUTH,
  onOffersPage: true,
  onLoginPage: false,
  signedIn: true,
  syncStarted: false,
  autoStartConsumed: false,
  visible: true,
};

test('Citi gate false if login', () => {
  assert.equal(shouldAutoStartCiti({ ...citiReadyGate, onLoginPage: true }), false);
});

test('Citi gate false without offers surface', () => {
  assert.equal(shouldAutoStartCiti({ ...citiReadyGate, onOffersPage: false }), false);
});

test('Citi gate false when signedIn is not true (URL alone is not enough)', () => {
  assert.equal(shouldAutoStartCiti({ ...citiReadyGate, signedIn: false }), false);
  assert.equal(shouldAutoStartCiti({ ...citiReadyGate, signedIn: undefined }), false);
  assert.equal(
    shouldAutoStartCiti({
      ...citiReadyGate,
      signedIn: false,
      onOffersPage: true,
      onLoginPage: false,
    }),
    false,
    'merchantoffers URL without honest signedIn must not auto-start',
  );
});

test('Citi gate false when already syncing', () => {
  assert.equal(shouldAutoStartCiti({ ...citiReadyGate, syncStarted: true }), false);
});

test('Citi gate true once when signedIn + offers; consumed blocks second start', () => {
  assert.equal(shouldAutoStartCiti(citiReadyGate), true);
  assert.equal(
    shouldAutoStartCiti({ ...citiReadyGate, autoStartConsumed: true }),
    false,
  );
});

test('Citi needsInput resume allows start even if consumed', () => {
  assert.equal(
    shouldAutoStartCiti({
      ...citiReadyGate,
      syncMode: SYNC_MODES.NEEDS_INPUT,
      autoStartConsumed: true,
    }),
    true,
  );
});

test('non-Citi banks never pass shouldAutoStartCiti', () => {
  for (const bank of ['chase', 'amex', 'wells_fargo', 'us_bank', 'capital_one']) {
    assert.equal(shouldAutoStartCiti({ ...citiReadyGate, bank }), false);
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

test('force offers redirect only before the hub has been seen', () => {
  assert.equal(
    shouldForceChaseOffersRedirect({
      onOffers: false,
      onLogin: false,
      onOffersUrl: false,
      offersSeen: false,
      syncStarted: false,
    }),
    true,
  );
  assert.equal(
    shouldForceChaseOffersRedirect({
      onOffers: false,
      onLogin: false,
      onOffersUrl: false,
      offersSeen: true,
      syncStarted: false,
    }),
    false,
    'after visiting offers, leaving must stay interactive',
  );
  assert.equal(
    shouldForceChaseOffersRedirect({
      onOffers: true,
      offersSeen: false,
      syncStarted: false,
    }),
    false,
  );
  assert.equal(
    shouldForceChaseOffersRedirect({
      onOffersUrl: true,
      offersSeen: false,
      syncStarted: false,
    }),
    false,
  );
});

test('cover progress tracks saved cards and never needs a backward pulse', () => {
  assert.equal(chaseCoverProgress({ syncedCount: 0, totalCards: 5, inFlight: false }).rawFrac, 0);
  assert.equal(chaseCoverProgress({ syncedCount: 0, totalCards: 5, inFlight: true }).rawFrac, 0.1);
  assert.equal(chaseCoverProgress({ syncedCount: 2, totalCards: 5, inFlight: false }).rawFrac, 0.4);
  assert.equal(chaseCoverProgress({ syncedCount: 2, totalCards: 5, inFlight: true }).rawFrac, 0.5);
  assert.equal(chaseCoverProgress({ syncedCount: 5, totalCards: 5, inFlight: true }).rawFrac, 1);
  assert.equal(chaseCoverProgress({ syncedCount: 2, totalCards: 5, inFlight: true }).coverIndex, 3);
  // Peak floor: when inFlight drops between cards, rawFrac falls to completed only —
  // UI must keep Math.max(peak, rawFrac) so the bar does not bounce.
  const midFlight = chaseCoverProgress({ syncedCount: 1, totalCards: 5, inFlight: true }).rawFrac;
  const midIdle = chaseCoverProgress({ syncedCount: 1, totalCards: 5, inFlight: false }).rawFrac;
  assert.ok(midFlight > midIdle);
  assert.equal(Math.max(midFlight, midIdle), midFlight);
});

test('SyncWebView gates cover and resume to Chase helpers (no same-card switch)', () => {
  const src = readFileSync(join(HERE, '..', 'SyncWebView.js'), 'utf8');
  assert.match(src, /shouldShowSyncCover/);
  assert.match(src, /planChaseNeedsInputResume/);
  assert.match(src, /chaseCoverProgress/);
  assert.match(src, /buildChaseCaptureWhenReadyJs/);
  assert.match(src, /Do not switchChaseCard\(current\)/);
  assert.doesNotMatch(
    src,
    /resumeChaseCapture[\s\S]*?switchChaseCard\(pos\)/,
  );
  assert.match(src, /showCover\s*=\s*shouldShowSyncCover/);
  assert.match(src, /AUTH_REPROBE_MS/);
  assert.match(src, /\[chase-auto-start\]/);
  assert.match(src, /Waiting for the offers page to load for sync to begin/);
  assert.match(src, /shouldForceChaseOffersRedirect/);
  assert.match(src, /onOffersPageRef\.current/);
  assert.doesNotMatch(
    src,
    /After sign-in, sync starts automatically/,
  );
  assert.doesNotMatch(
    src,
    /onLoadStart[\s\S]*?if \(bank === 'chase'\) setChaseHookReady\(false\)/,
  );
});

test('SyncWebView wires Wells auto-start without Chase-only gates', () => {
  const src = readFileSync(join(HERE, '..', 'SyncWebView.js'), 'utf8');
  assert.match(src, /shouldAutoStartWells/);
  assert.match(src, /startWellsCapture/);
  assert.match(src, /\[wells-auto-start\]/);
  assert.match(src, /Syncing Wells Fargo offers/);
  assert.match(src, /WELLS_CAPTURE_UNAVAILABLE[\s\S]{0,240}failWellsCapture/);
  assert.match(src, /failWellsCapture[\s\S]{0,400}SYNC_MODES\.FAILED/);
  // First capture uses when-ready poll (not one-shot read) to avoid deals race.
  assert.match(src, /buildWellsCaptureWhenReadyJs/);
  assert.match(src, /WELLS_CAPTURE_READY_TIMEOUT_MS/);
  const startWellsBlock = src.match(
    /const startWellsCapture = \(\) => \{[\s\S]*?startingWellsRef\.current = false;\n  \};/,
  )?.[0] || '';
  assert.match(startWellsBlock, /buildWellsCaptureWhenReadyJs/);
  assert.doesNotMatch(startWellsBlock, /buildWellsFargoReadJs\(\)/);
  // Mobile-app promo overlay is dismissed via Close Dialog inject (never Download).
  assert.match(src, /buildWellsAppPromoDismissJs/);
  assert.match(src, /serviceType=dealsportal|BANK_CONFIG|config\.url/);
  // Wells gate must not require Chase cards/hook readiness.
  const wellsGateBlock = src.match(
    /shouldAutoStartWells\(\{[\s\S]*?\}\)/,
  )?.[0] || '';
  assert.match(wellsGateBlock, /shouldAutoStartWells/);
  assert.doesNotMatch(wellsGateBlock, /hasCards/);
  assert.doesNotMatch(wellsGateBlock, /hookReady/);
  assert.doesNotMatch(wellsGateBlock, /chaseHookReady/);
  // AUTH_REPROBE interval stays Chase-only.
  const reprobeEffect = src.match(
    /While AUTH\/NeedsInput, keep re-probing[\s\S]*?AUTH_REPROBE_MS[\s\S]*?\}, \[visible, bank, syncMode/,
  )?.[0] || '';
  assert.match(reprobeEffect, /bank !== 'chase'/);
  assert.doesNotMatch(reprobeEffect, /wells_fargo/);
});

test('SyncWebView wires Citi auto-start with honest signedIn gate', () => {
  const src = readFileSync(join(HERE, '..', 'SyncWebView.js'), 'utf8');
  assert.match(src, /shouldAutoStartCiti/);
  assert.match(src, /startCitiCapture/);
  assert.match(src, /\[citi-auto-start\]/);
  assert.match(src, /Syncing Citi offers/);
  assert.match(src, /CITI_CAPTURE_UNAVAILABLE[\s\S]{0,240}failCitiCapture/);
  assert.match(src, /failCitiCapture[\s\S]{0,400}SYNC_MODES\.FAILED/);
  assert.match(src, /Waiting for Merchant Offers to load for sync to begin/);
  // Gate requires signedIn === true (not URL alone).
  const citiGateBlock = src.match(
    /shouldAutoStartCiti\(\{[\s\S]*?\}\)/,
  )?.[0] || '';
  assert.match(citiGateBlock, /signedIn/);
  assert.doesNotMatch(citiGateBlock, /hasCards/);
  assert.doesNotMatch(citiGateBlock, /hookReady/);
  assert.doesNotMatch(citiGateBlock, /chaseHookReady/);
  // CITI_ON_OFFERS must key off data.signedIn === true.
  assert.match(src, /data\.signedIn === true/);
  // Cap One / US Bank auto-start must not appear in this PR.
  assert.doesNotMatch(src, /shouldAutoStartUsBank/);
  assert.doesNotMatch(src, /shouldAutoStartCapitalOne|capital_one.*autoStart/);
  // AUTH_REPROBE stays Chase-only (not Citi).
  const reprobeEffect = src.match(
    /While AUTH\/NeedsInput, keep re-probing[\s\S]*?AUTH_REPROBE_MS[\s\S]*?\}, \[visible, bank, syncMode/,
  )?.[0] || '';
  assert.match(reprobeEffect, /bank !== 'chase'/);
  assert.doesNotMatch(reprobeEffect, /bank === 'citi'/);
});
