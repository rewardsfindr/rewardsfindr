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
  shouldAutoStartUsBank,
  shouldAutoStartAmex,
  nextSyncMode,
  isPartialAbort,
  partialAbortCopy,
  shouldShowSyncCover,
  planChaseNeedsInputResume,
  planAmexNeedsInputResume,
  shouldForceChaseOffersRedirect,
  shouldForceCitiLogin,
  shouldForceCitiOffersRedirect,
  shouldForceUsBankLogin,
  shouldForceUsBankOffersRedirect,
  chaseCoverProgress,
  amexCoverProgress,
  amexCoverStatusLine,
  urlMatchesAnyPath,
} from './syncMode.js';
import { BANK_CONFIG } from './bankConfig.js';
import { AMEX_SWITCH_TIMEOUT_MS } from './amexSync.js';

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

test('capture cover is Chase + Wells + Citi + Amex + US Bank', () => {
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
    shouldShowSyncCover({ bank: 'amex', syncMode: SYNC_MODES.CAPTURING }),
    true,
  );
  assert.equal(
    shouldShowSyncCover({ bank: 'us_bank', syncMode: SYNC_MODES.CAPTURING }),
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
  assert.equal(
    shouldShowSyncCover({ bank: 'amex', syncMode: SYNC_MODES.AUTH }),
    false,
  );
  assert.equal(
    shouldShowSyncCover({ bank: 'us_bank', syncMode: SYNC_MODES.AUTH }),
    false,
  );
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

const usBankReadyGate = {
  bank: 'us_bank',
  syncMode: SYNC_MODES.AUTH,
  onOffersPage: true,
  onLoginPage: false,
  signedIn: true,
  syncStarted: false,
  autoStartConsumed: false,
  visible: true,
};

test('US Bank gate false if login', () => {
  assert.equal(shouldAutoStartUsBank({ ...usBankReadyGate, onLoginPage: true }), false);
});

test('US Bank gate false without positive offers surface', () => {
  assert.equal(shouldAutoStartUsBank({ ...usBankReadyGate, onOffersPage: false }), false);
  assert.equal(
    shouldAutoStartUsBank({ ...usBankReadyGate, onOffersPage: false, onLoginPage: false }),
    false,
    'never auto-start on !onLoginPage alone',
  );
});

test('US Bank gate false without honest signedIn (URL-only deals not enough)', () => {
  assert.equal(shouldAutoStartUsBank({ ...usBankReadyGate, signedIn: false }), false);
  assert.equal(shouldAutoStartUsBank({ ...usBankReadyGate, signedIn: undefined }), false);
  assert.equal(
    shouldAutoStartUsBank({
      ...usBankReadyGate,
      onOffersPage: true,
      onLoginPage: false,
      signedIn: false,
    }),
    false,
    'cashback-deals URL while logged out must not auto-start',
  );
});

test('US Bank gate false when already syncing', () => {
  assert.equal(shouldAutoStartUsBank({ ...usBankReadyGate, syncStarted: true }), false);
});

test('US Bank gate true once in auth; consumed blocks second start', () => {
  assert.equal(shouldAutoStartUsBank(usBankReadyGate), true);
  assert.equal(
    shouldAutoStartUsBank({ ...usBankReadyGate, autoStartConsumed: true }),
    false,
  );
});

test('US Bank needsInput resume allows start even if consumed', () => {
  assert.equal(
    shouldAutoStartUsBank({
      ...usBankReadyGate,
      syncMode: SYNC_MODES.NEEDS_INPUT,
      autoStartConsumed: true,
    }),
    true,
  );
});

test('non-US-Bank banks never pass shouldAutoStartUsBank', () => {
  for (const bank of ['chase', 'amex', 'citi', 'wells_fargo', 'capital_one']) {
    assert.equal(shouldAutoStartUsBank({ ...usBankReadyGate, bank }), false);
  }
});

test('US Bank mode: capturing + login → needsInput; timeout/unavailable → failed', () => {
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

test('force Citi login only for expired shells, not happy-path or login form', () => {
  assert.equal(
    shouldForceCitiLogin({
      expired: true,
      onLoginForm: false,
      signedIn: false,
      syncStarted: false,
      loginForced: false,
    }),
    true,
  );
  assert.equal(
    shouldForceCitiLogin({
      expired: true,
      onLoginForm: true,
      signedIn: false,
      syncStarted: false,
      loginForced: false,
    }),
    false,
    'already on User ID / Password form',
  );
  assert.equal(
    shouldForceCitiLogin({
      expired: true,
      onLoginForm: false,
      signedIn: true,
      syncStarted: false,
      loginForced: false,
    }),
    false,
    'honest signed-in session must stay on Merchant Offers',
  );
  assert.equal(
    shouldForceCitiLogin({
      expired: false,
      onLoginForm: false,
      signedIn: false,
      syncStarted: false,
      loginForced: false,
    }),
    false,
  );
  assert.equal(
    shouldForceCitiLogin({
      expired: true,
      onLoginForm: false,
      signedIn: false,
      syncStarted: false,
      loginForced: true,
    }),
    false,
    'one-shot only',
  );
  assert.equal(
    shouldForceCitiLogin({
      expired: true,
      onLoginForm: false,
      signedIn: false,
      syncStarted: true,
      loginForced: false,
    }),
    false,
  );
});

test('force Citi Merchant Offers after login (fresh or expired→login)', () => {
  assert.equal(
    shouldForceCitiOffersRedirect({
      onOffers: false,
      signedIn: true,
      onLoginForm: false,
      syncStarted: false,
      offersRedirected: false,
    }),
    true,
    'signed-in off offers → Merchant Offers',
  );
  assert.equal(
    shouldForceCitiOffersRedirect({
      onOffers: false,
      signedIn: false,
      onLoginForm: true,
      syncStarted: false,
      offersRedirected: false,
    }),
    false,
    'still on login form',
  );
  assert.equal(
    shouldForceCitiOffersRedirect({
      onOffers: true,
      signedIn: true,
      onLoginForm: false,
      syncStarted: false,
      offersRedirected: false,
    }),
    false,
    'already on Merchant Offers (happy path)',
  );
  assert.equal(
    shouldForceCitiOffersRedirect({
      onOffers: false,
      signedIn: false,
      onLoginForm: false,
      syncStarted: false,
      offersRedirected: false,
    }),
    false,
  );
  assert.equal(
    shouldForceCitiOffersRedirect({
      onOffers: false,
      signedIn: true,
      onLoginForm: false,
      syncStarted: false,
      offersRedirected: true,
    }),
    false,
    'one-shot offers redirect',
  );
});

test('force US Bank login only for expired shells, not happy-path or login form', () => {
  assert.equal(
    shouldForceUsBankLogin({
      expired: true,
      onLoginForm: false,
      signedIn: false,
      syncStarted: false,
      loginForced: false,
    }),
    true,
  );
  assert.equal(
    shouldForceUsBankLogin({
      expired: true,
      onLoginForm: true,
      signedIn: false,
      syncStarted: false,
      loginForced: false,
    }),
    false,
    'already on Account login / Username+Password',
  );
  assert.equal(
    shouldForceUsBankLogin({
      expired: true,
      onLoginForm: false,
      signedIn: true,
      syncStarted: false,
      loginForced: false,
    }),
    false,
    'honest signed-in session must stay on Cash Back Deals',
  );
  assert.equal(
    shouldForceUsBankLogin({
      expired: false,
      onLoginForm: false,
      signedIn: false,
      syncStarted: false,
      loginForced: false,
    }),
    false,
  );
  assert.equal(
    shouldForceUsBankLogin({
      expired: true,
      onLoginForm: false,
      signedIn: false,
      syncStarted: false,
      loginForced: true,
    }),
    false,
    'one-shot only',
  );
  assert.equal(
    shouldForceUsBankLogin({
      expired: true,
      onLoginForm: false,
      signedIn: false,
      syncStarted: true,
      loginForced: false,
    }),
    false,
  );
});

test('force US Bank Cash Back Deals after login (fresh or expired→login)', () => {
  assert.equal(
    shouldForceUsBankOffersRedirect({
      onOffers: false,
      signedIn: true,
      onLoginForm: false,
      syncStarted: false,
      offersRedirected: false,
    }),
    true,
    'signed-in off offers → Cash Back Deals',
  );
  assert.equal(
    shouldForceUsBankOffersRedirect({
      onOffers: false,
      signedIn: false,
      onLoginForm: false,
      leftLogin: true,
      onHomeShell: true,
      syncStarted: false,
      offersRedirected: false,
    }),
    true,
    'post Account-login banking home → Cash Back Deals',
  );
  assert.equal(
    shouldForceUsBankOffersRedirect({
      onOffers: false,
      signedIn: true,
      onLoginForm: false,
      leftLogin: true,
      onHomeShell: true,
      syncStarted: false,
      offersRedirected: false,
    }),
    true,
    'customer-dashboard with Log out → Cash Back Deals',
  );
  assert.equal(
    shouldForceUsBankOffersRedirect({
      onOffers: false,
      signedIn: false,
      onLoginForm: true,
      syncStarted: false,
      offersRedirected: false,
    }),
    false,
  );
  assert.equal(
    shouldForceUsBankOffersRedirect({
      onOffers: false,
      signedIn: false,
      onLoginForm: false,
      syncStarted: false,
      offersRedirected: false,
    }),
    false,
    'must not yank off MFA / Arkose (no login form, not signedIn yet)',
  );
  assert.equal(
    shouldForceUsBankOffersRedirect({
      onOffers: false,
      signedIn: false,
      onLoginForm: false,
      leftLogin: true,
      onHomeShell: false,
      syncStarted: false,
      offersRedirected: false,
    }),
    false,
    'left login alone (MFA mid-auth) must not goToOffers',
  );
  assert.equal(
    shouldForceUsBankOffersRedirect({
      onOffers: true,
      signedIn: true,
      onLoginForm: false,
      syncStarted: false,
      offersRedirected: false,
    }),
    false,
  );
});

test('Citi offers redirect stays put on MFA / soft-token / challenge mid-auth', () => {
  // Regression: after Sign On was seen, challenge pages lack User ID+Password
  // and are not yet signedIn — must NOT one-shot goToOffers() mid-auth.
  assert.equal(
    shouldForceCitiOffersRedirect({
      onOffers: false,
      signedIn: false,
      onLoginForm: false,
      syncStarted: false,
      offersRedirected: false,
    }),
    false,
    'loginSeen-era path (no Sign Off yet) must stay — MFA/challenge',
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
  assert.match(src, /buildCitiCaptureWhenReadyJs/);
  assert.match(src, /CITI_CAPTURE_READY_TIMEOUT_MS/);
  const startCitiBlock = src.match(
    /const startCitiCapture = \(\) => \{[\s\S]*?startingCitiRef\.current = false;\r?\n  \};/,
  )?.[0] || '';
  assert.match(startCitiBlock, /buildCitiCaptureWhenReadyJs/);
  assert.doesNotMatch(startCitiBlock, /buildCitiReadJs\(\)/);
  // Gate requires signedIn === true (not URL alone).
  const citiGateBlock = src.match(
    /shouldAutoStartCiti\(\{[\s\S]*?\}\)/,
  )?.[0] || '';
  assert.match(citiGateBlock, /signedIn/);
  assert.doesNotMatch(citiGateBlock, /hasCards/);
  assert.doesNotMatch(citiGateBlock, /hookReady/);
  assert.doesNotMatch(citiGateBlock, /chaseHookReady/);
  // CITI_ON_OFFERS / PAGE_STATE must key off data.signedIn === true.
  assert.match(src, /data\.signedIn === true/);
  // Expired session → official sign-on; post-login → Merchant Offers.
  assert.match(src, /CITI_PAGE_STATE/);
  assert.match(src, /shouldForceCitiLogin/);
  assert.match(src, /shouldForceCitiOffersRedirect/);
  assert.match(src, /buildCitiForceLoginJs/);
  assert.match(src, /goToCitiLogin/);
  assert.equal(BANK_CONFIG.citi.loginUrl, 'https://online.citi.com/US/ag/signon');
  assert.equal(
    BANK_CONFIG.citi.offersUrl,
    'https://online.citi.com/US/nga/products-offers/merchantoffers',
  );
  // Cap One auto-start must not appear.
  assert.doesNotMatch(src, /shouldAutoStartCapitalOne|capital_one.*autoStart/);
  // Chase AUTH_REPROBE stays Chase-only (no Citi hooks in that effect).
  const chaseReprobeEffect = src.match(
    /While AUTH\/NeedsInput, keep re-probing[\s\S]*?AUTH_REPROBE_MS[\s\S]*?\}, \[visible, bank, syncMode/,
  )?.[0] || '';
  assert.match(chaseReprobeEffect, /bank !== 'chase'/);
  assert.doesNotMatch(chaseReprobeEffect, /buildCitiOffersVisibleJs/);
  // Citi gets its own thin visibility re-probe (Sign Off may appear after loadEnd).
  assert.match(
    src,
    /Citi SPA can paint merchantoffers before Sign Off[\s\S]*?bank !== 'citi'[\s\S]*?buildCitiOffersVisibleJs\(\)[\s\S]*?AUTH_REPROBE_MS/,
  );
});

const amexReadyGate = {
  bank: 'amex',
  syncMode: SYNC_MODES.AUTH,
  onOffersPage: true,
  onLoginPage: false,
  amexCardsReady: true,
  syncStarted: false,
  autoStartConsumed: false,
  visible: true,
};

test('Amex gate false if login', () => {
  assert.equal(shouldAutoStartAmex({ ...amexReadyGate, onLoginPage: true }), false);
});

test('Amex gate false without offers surface', () => {
  assert.equal(shouldAutoStartAmex({ ...amexReadyGate, onOffersPage: false }), false);
  assert.equal(
    shouldAutoStartAmex({ ...amexReadyGate, onOffersPage: false, onLoginPage: false }),
    false,
    'never auto-start on !onLoginPage alone',
  );
});

test('Amex gate false without amexCardsReady (not Chase hasCards+hook)', () => {
  assert.equal(shouldAutoStartAmex({ ...amexReadyGate, amexCardsReady: false }), false);
});

test('Amex gate false when already syncing', () => {
  assert.equal(shouldAutoStartAmex({ ...amexReadyGate, syncStarted: true }), false);
});

test('Amex gate true once when cards ready + offers; consumed blocks second start', () => {
  assert.equal(shouldAutoStartAmex(amexReadyGate), true);
  assert.equal(
    shouldAutoStartAmex({ ...amexReadyGate, autoStartConsumed: true }),
    false,
  );
});

test('Amex needsInput resume allows start even if consumed', () => {
  assert.equal(
    shouldAutoStartAmex({
      ...amexReadyGate,
      syncMode: SYNC_MODES.NEEDS_INPUT,
      autoStartConsumed: true,
    }),
    true,
  );
});

test('non-Amex banks never pass shouldAutoStartAmex', () => {
  for (const bank of ['chase', 'wells_fargo', 'citi', 'us_bank', 'capital_one']) {
    assert.equal(shouldAutoStartAmex({ ...amexReadyGate, bank }), false);
  }
});

test('Amex NeedsInput resume prefers cycle / continue_walk; enrolled-complete is full_start', () => {
  assert.deepEqual(
    planAmexNeedsInputResume({
      cardOptionsLength: 2,
      visitedKeyCount: 0,
      totalCards: 2,
      syncPhase: 'enrolled',
      hasCycleCard: true,
    }),
    { action: 'continue_cycle', phase: 'enrolled' },
  );
  assert.deepEqual(
    planAmexNeedsInputResume({
      cardOptionsLength: 2,
      visitedKeyCount: 1,
      totalCards: 2,
      syncPhase: 'eligible',
      hasCycleCard: false,
    }),
    { action: 'continue_walk', phase: 'eligible' },
  );
  assert.deepEqual(
    planAmexNeedsInputResume({
      cardOptionsLength: 2,
      visitedKeyCount: 2,
      totalCards: 2,
      syncPhase: 'enrolled',
      hasCycleCard: false,
    }),
    { action: 'full_start' },
  );
  assert.deepEqual(
    planAmexNeedsInputResume({
      cardOptionsLength: 0,
      visitedKeyCount: 0,
      syncPhase: 'eligible',
    }),
    { action: 'full_start' },
  );
  // Legacy visitedCount still works as alias.
  assert.deepEqual(
    planAmexNeedsInputResume({
      cardOptionsLength: 4,
      visitedCount: 1,
      syncPhase: 'eligible',
    }),
    { action: 'continue_walk', phase: 'eligible' },
  );
  // Enrolled-complete via legacy visitedCount → full_start (not phase_to_enrolled).
  assert.deepEqual(
    planAmexNeedsInputResume({
      cardOptionsLength: 4,
      visitedCount: 4,
      syncPhase: 'enrolled',
    }),
    { action: 'full_start' },
  );
  assert.notEqual(
    planAmexNeedsInputResume({
      cardOptionsLength: 4,
      visitedCount: 1,
      syncPhase: 'eligible',
    }).action,
    'arm_capture',
  );
  assert.notEqual(
    planAmexNeedsInputResume({
      cardOptionsLength: 4,
      visitedCount: 4,
      syncPhase: 'eligible',
    }).action,
    'phase_to_enrolled',
  );
});

test('amexCoverProgress matches Chase math; AMEX_SWITCH_TIMEOUT_MS stays 3500', () => {
  assert.equal(AMEX_SWITCH_TIMEOUT_MS, 3500);
  assert.equal(
    amexCoverProgress({ syncedCount: 2, totalCards: 8, inFlight: true }).rawFrac,
    chaseCoverProgress({ syncedCount: 2, totalCards: 8, inFlight: true }).rawFrac,
  );
  assert.equal(
    amexCoverProgress({ syncedCount: 0, totalCards: 4, inFlight: true }).coverIndex,
    1,
  );
});

test('amexCoverStatusLine is blank unless actively capturing; no eligible/saved noise', () => {
  assert.equal(
    amexCoverStatusLine({
      active: false,
      cardLabel: 'Blue Cash Preferred®',
      cardIndex: 1,
      cardsInPhase: 2,
    }),
    '',
  );
  assert.equal(
    amexCoverStatusLine({
      syncing: false,
      switching: true,
      cardLabel: 'Platinum Card®',
      cardIndex: 1,
      cardsInPhase: 2,
    }),
    '',
  );
  assert.equal(
    amexCoverStatusLine({
      syncing: true,
      switching: true,
      cardLabel: 'Platinum Card®',
      cardIndex: 1,
      cardsInPhase: 2,
    }),
    '',
  );
  assert.equal(
    amexCoverStatusLine({
      active: true,
      cardLabel: 'Platinum Card®',
      cardIndex: 1,
      cardsInPhase: 2,
    }),
    'Syncing Platinum Card® · 1 of 2',
  );
  assert.equal(
    amexCoverStatusLine({
      syncing: true,
      cardLabel: 'Blue Cash Preferred®',
      cardIndex: 2,
      cardsInPhase: 2,
    }),
    'Syncing Blue Cash Preferred® · 2 of 2',
  );
  assert.doesNotMatch(
    amexCoverStatusLine({
      active: true,
      cardLabel: 'Platinum Card®',
      cardIndex: 1,
      cardsInPhase: 2,
    }),
    /eligible|activated|saved/i,
  );
});

test('SyncWebView wires Amex auto-start with cards-ready gate and arm-before-switch', () => {
  const src = readFileSync(join(HERE, '..', 'SyncWebView.js'), 'utf8');
  assert.match(src, /shouldAutoStartAmex/);
  assert.match(src, /startAmexCapture/);
  assert.match(src, /resumeAmexCapture/);
  assert.match(src, /planAmexNeedsInputResume/);
  assert.match(src, /\[amex-auto-start\]/);
  assert.match(src, /Syncing Amex offers/);
  assert.match(src, /Waiting for Amex cards to load for sync to begin/);
  assert.match(src, /failAmexCapture[\s\S]{0,400}SYNC_MODES\.FAILED/);
  assert.match(src, /AMEX_SWITCH_TIMEOUT_MS/);
  assert.match(src, /amexCoverProgress/);
  assert.match(src, /abortAmexCaptureConfirmed/);
  assert.match(src, /applyAmexCardsDetected/);
  // Empty AMEX_CARDS_DETECTED must not latch cardsDiscovered (Chase-shaped).
  assert.doesNotMatch(
    src,
    /AMEX_CARDS_DETECTED[\s\S]{0,900}if \(!cardsDiscovered\.current\) cardsDiscovered\.current = true/,
  );
  // Gate requires amexCardsReady — not Chase hasCards/hookReady.
  const amexGateBlock = src.match(
    /shouldAutoStartAmex\(\{[\s\S]*?\}\)/,
  )?.[0] || '';
  assert.match(amexGateBlock, /amexCardsReady/);
  assert.doesNotMatch(amexGateBlock, /hookReady/);
  assert.doesNotMatch(amexGateBlock, /chaseHookReady/);
  assert.doesNotMatch(amexGateBlock, /hasCards/);
  // Start path preserves arm-before-switch and re-injects JSON capture.
  const startAmexBlock = src.match(
    /const startAmexCapture = \(\) => \{[\s\S]*?startingAmexRef\.current = false;\r?\n  \};/,
  )?.[0] || '';
  assert.match(startAmexBlock, /buildAmexJsonCaptureJs/);
  assert.match(startAmexBlock, /captureNextAmexCardInOrder/);
  assert.match(startAmexBlock, /__amexJsonCaptureArmed = false/);
  assert.match(startAmexBlock, /AMEX_OPEN_AND_DETECT_JS/);
  // NeedsInput resume must prefer cycle card — not Chase planner / blind next.
  const resumeAmexBlock = src.match(
    /const resumeAmexCapture = \(\) => \{[\s\S]*?startingAmexRef\.current = false;\r?\n  \};/,
  )?.[0] || '';
  assert.match(resumeAmexBlock, /planAmexNeedsInputResume/);
  assert.match(resumeAmexBlock, /resolveAmexResumeCapture/);
  assert.match(resumeAmexBlock, /amexCycleCardRef/);
  assert.match(resumeAmexBlock, /hasCycleCard/);
  assert.doesNotMatch(resumeAmexBlock, /planChaseNeedsInputResume/);
  assert.doesNotMatch(resumeAmexBlock, /phase_to_enrolled/);
  // Cap One auto-start must not appear.
  assert.doesNotMatch(src, /shouldAutoStartCapitalOne|capital_one.*autoStart/);
  // Amex gets its own open+detect re-probe (Chase/Citi stay separate).
  assert.match(
    src,
    /Amex SPA can paint offers before the card combobox[\s\S]*?bank !== 'amex'[\s\S]*?AMEX_OPEN_AND_DETECT_JS[\s\S]*?AUTH_REPROBE_MS/,
  );
  // Chase AUTH_REPROBE stays Chase-only.
  const chaseReprobeEffect = src.match(
    /While AUTH\/NeedsInput, keep re-probing[\s\S]*?AUTH_REPROBE_MS[\s\S]*?\}, \[visible, bank, syncMode/,
  )?.[0] || '';
  assert.match(chaseReprobeEffect, /bank !== 'chase'/);
  assert.doesNotMatch(chaseReprobeEffect, /AMEX_OPEN_AND_DETECT/);
});

test('SyncWebView wires US Bank auto-start without Chase-only gates', () => {
  const src = readFileSync(join(HERE, '..', 'SyncWebView.js'), 'utf8');
  assert.match(src, /shouldAutoStartUsBank/);
  assert.match(src, /startUsBankCapture/);
  assert.match(src, /\[us-bank-auto-start\]/);
  assert.match(src, /Syncing US Bank offers/);
  assert.match(src, /US_BANK_CAPTURE_UNAVAILABLE[\s\S]{0,240}failUsBankCapture/);
  assert.match(src, /failUsBankCapture[\s\S]{0,400}SYNC_MODES\.FAILED/);
  // First capture uses when-ready poll (not one-shot read) to avoid stash race.
  assert.match(src, /buildUsBankCaptureWhenReadyJs/);
  assert.match(src, /US_BANK_CAPTURE_READY_TIMEOUT_MS/);
  const startUsBankBlock = src.match(
    /const startUsBankCapture = \(\) => \{[\s\S]*?startingUsBankRef\.current = false;\r?\n  \};/,
  )?.[0] || '';
  assert.match(startUsBankBlock, /buildUsBankOfferCaptureJs/);
  assert.match(startUsBankBlock, /buildUsBankCaptureWhenReadyJs/);
  assert.doesNotMatch(startUsBankBlock, /buildUsBankReadJs\(\)/);
  // US Bank gate must not require Chase cards/hook readiness; must pass signedIn.
  const usBankGateBlock = src.match(
    /shouldAutoStartUsBank\(\{[\s\S]*?\}\)/,
  )?.[0] || '';
  assert.match(usBankGateBlock, /shouldAutoStartUsBank/);
  assert.match(usBankGateBlock, /signedIn/);
  assert.doesNotMatch(usBankGateBlock, /hasCards/);
  assert.doesNotMatch(usBankGateBlock, /hookReady/);
  assert.doesNotMatch(usBankGateBlock, /chaseHookReady/);
  // Auto-start still requires signedIn from PAGE_STATE (OfferHub sets it without Log out).
  assert.match(src, /data\.signedIn === true/);
  assert.match(src, /URL alone never marks offers-ready/);
  // Expired / signed-out → official loginUrl; signedIn / post-login home → offersUrl.
  assert.match(src, /US_BANK_PAGE_STATE/);
  assert.match(src, /shouldForceUsBankLogin/);
  assert.match(src, /shouldForceUsBankOffersRedirect/);
  assert.match(src, /usBankSawLoginRef/);
  assert.match(src, /leftLogin/);
  assert.match(src, /onHomeShell/);
  assert.match(src, /goToUsBankLogin/);
  assert.match(src, /buildUsBankForceLoginJs/);
  assert.match(src, /const goToOffers = \(\) => \{[\s\S]*?config\.offersUrl/);
  // OfferHub AUTH re-probe until signedIn + onOffers (Citi-shaped).
  assert.match(
    src,
    /US Bank OfferHub can paint cashback-deals[\s\S]*?bank !== 'us_bank'[\s\S]*?buildUsBankOffersVisibleJs[\s\S]*?AUTH_REPROBE_MS/,
  );
  // Happy / waiting path must not show Sync Offers (failed footer only).
  assert.match(src, /isAutoBank/);
  assert.match(src, /if \(isAutoBank\) return null/);
  assert.equal(
    BANK_CONFIG.us_bank.url,
    'https://onlinebanking.usbank.com/auth/login/?channel=mobileweb',
  );
  assert.equal(
    BANK_CONFIG.us_bank.offersUrl,
    'https://onlinebanking.usbank.com/digital/servicing/dominjection/cashback-deals',
  );
  assert.equal(
    BANK_CONFIG.us_bank.loginUrl,
    'https://onlinebanking.usbank.com/auth/login/?channel=mobileweb',
  );
  // Cap One stays out; Chase AUTH re-probe stays Chase-only.
  assert.doesNotMatch(src, /shouldAutoStartCapitalOne|capital_one.*autoStart/);
  const chaseReprobeEffect = src.match(
    /While AUTH\/NeedsInput, keep re-probing[\s\S]*?AUTH_REPROBE_MS[\s\S]*?\}, \[visible, bank, syncMode/,
  )?.[0] || '';
  assert.match(chaseReprobeEffect, /bank !== 'chase'/);
  assert.doesNotMatch(chaseReprobeEffect, /us_bank/);
});
