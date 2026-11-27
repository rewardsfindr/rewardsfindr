// ─────────────────────────────────────────────
// SYNC MODE — pure helpers for Slice 0+1
// Auth → Capturing → NeedsInput / Failed / Done
// ─────────────────────────────────────────────

export const SYNC_MODES = Object.freeze({
  AUTH: 'auth',
  CAPTURING: 'capturing',
  NEEDS_INPUT: 'needsInput',
  FAILED: 'failed',
  DONE: 'done',
});

export const STEP_TIMEOUT_MS = 60_000;
export const AUTO_START_DEBOUNCE_MS = 400;
/** While AUTH, re-inject hook/page/card probes until auto-start can fire. */
export const AUTH_REPROBE_MS = 1_500;
export const CHASE_OFFER_HOOK_VERSION = 7;

/** True when href contains any of the configured Chase offers path needles. */
export function urlMatchesAnyPath(url, paths = []) {
  const href = String(url || '').toLowerCase();
  if (!href) return false;
  return (paths || []).some((p) => {
    const needle = String(p || '').toLowerCase();
    return needle.length > 0 && href.includes(needle);
  });
}

/**
 * Chase auto-start / resume gate. Never starts solely because !onLoginPage.
 * First start: syncMode === auth and !autoStartConsumed.
 * Resume: syncMode === needsInput (consumed flag ignored).
 */
export function shouldAutoStartChase({
  bank,
  syncMode,
  onOffersPage,
  onLoginPage,
  hasCards,
  hookReady,
  syncStarted,
  autoStartConsumed,
  visible = true,
} = {}) {
  if (!visible) return false;
  if (bank !== 'chase') return false;
  if (syncStarted) return false;
  if (onLoginPage) return false;
  if (!onOffersPage) return false;
  if (!hasCards) return false;
  if (!hookReady) return false;

  if (syncMode === SYNC_MODES.NEEDS_INPUT) return true;
  if (syncMode === SYNC_MODES.AUTH) return !autoStartConsumed;
  return false;
}

/**
 * Advance syncMode for a named event. Unknown events leave mode unchanged.
 */
export function nextSyncMode(mode, event) {
  switch (event) {
    case 'sheet_open':
    case 'sheet_reset':
      return SYNC_MODES.AUTH;

    case 'ready_auto_start':
    case 'resume_after_input':
    case 'try_again':
    case 'sync_offers':
      if (
        mode === SYNC_MODES.AUTH
        || mode === SYNC_MODES.NEEDS_INPUT
        || mode === SYNC_MODES.FAILED
      ) {
        return SYNC_MODES.CAPTURING;
      }
      return mode;

    case 'login_detected':
      if (mode === SYNC_MODES.CAPTURING) return SYNC_MODES.NEEDS_INPUT;
      return mode;

    case 'step_timeout':
    case 'capture_error':
      if (mode === SYNC_MODES.CAPTURING) return SYNC_MODES.FAILED;
      return mode;

    case 'walk_complete':
    case 'cancel_confirmed':
      if (mode === SYNC_MODES.CAPTURING || mode === SYNC_MODES.NEEDS_INPUT) {
        return SYNC_MODES.DONE;
      }
      return mode;

    default:
      return mode;
  }
}

/** True when abort keeps some cards but the walk did not finish. */
export function isPartialAbort({ syncedCount = 0, totalCards = 0 } = {}) {
  const synced = Number(syncedCount) || 0;
  const total = Number(totalCards) || 0;
  return synced > 0 && (total <= 0 || synced < total);
}

export function partialAbortCopy({ syncedCount = 0, totalCards = 0 } = {}) {
  const synced = Number(syncedCount) || 0;
  const total = Number(totalCards) || 0;
  if (total > 0) return `Saved ${synced} of ${total} cards. You can sync again later for the rest.`;
  return `Saved ${synced} card${synced === 1 ? '' : 's'}. You can sync again later for the rest.`;
}

/**
 * Capture cover for banks with auto-start (Chase + Wells + Citi + Amex).
 * Manual Sync Offers banks (US Bank) stay uncovered until their auto slice lands.
 */
export function shouldShowSyncCover({ bank, syncMode } = {}) {
  return (
    (bank === 'chase' || bank === 'wells_fargo' || bank === 'citi' || bank === 'amex')
    && syncMode === SYNC_MODES.CAPTURING
  );
}

/**
 * Wells Fargo auto-start / resume gate. Requires a positive deals surface
 * (onOffersPage / WELLS_ON_DEALS) — never starts solely because !onLoginPage.
 * First start: syncMode === auth and !autoStartConsumed.
 * Resume: syncMode === needsInput (consumed flag ignored).
 */
export function shouldAutoStartWells({
  bank,
  syncMode,
  onOffersPage,
  onLoginPage,
  syncStarted,
  autoStartConsumed,
  visible = true,
} = {}) {
  if (!visible) return false;
  if (bank !== 'wells_fargo') return false;
  if (syncStarted) return false;
  if (onLoginPage) return false;
  if (!onOffersPage) return false;

  if (syncMode === SYNC_MODES.NEEDS_INPUT) return true;
  if (syncMode === SYNC_MODES.AUTH) return !autoStartConsumed;
  return false;
}

/**
 * Citi auto-start / resume gate. Requires offers surface AND honest signedIn
 * (Sign Off chrome) — never starts on merchantoffers URL alone.
 * First start: syncMode === auth and !autoStartConsumed.
 * Resume: syncMode === needsInput (consumed flag ignored).
 */
export function shouldAutoStartCiti({
  bank,
  syncMode,
  onOffersPage,
  onLoginPage,
  signedIn,
  syncStarted,
  autoStartConsumed,
  visible = true,
} = {}) {
  if (!visible) return false;
  if (bank !== 'citi') return false;
  if (syncStarted) return false;
  if (onLoginPage) return false;
  if (!onOffersPage) return false;
  if (signedIn !== true) return false;

  if (syncMode === SYNC_MODES.NEEDS_INPUT) return true;
  if (syncMode === SYNC_MODES.AUTH) return !autoStartConsumed;
  return false;
}

/**
 * Amex auto-start / resume gate. Requires offers surface AND amexCardsReady
 * (AMEX_CARDS_DETECTED with cards) — never Chase hasCards+hookReady, never
 * !onLoginPage alone.
 * First start: syncMode === auth and !autoStartConsumed.
 * Resume: syncMode === needsInput (consumed flag ignored).
 */
export function shouldAutoStartAmex({
  bank,
  syncMode,
  onOffersPage,
  onLoginPage,
  amexCardsReady,
  syncStarted,
  autoStartConsumed,
  visible = true,
} = {}) {
  if (!visible) return false;
  if (bank !== 'amex') return false;
  if (syncStarted) return false;
  if (onLoginPage) return false;
  if (!onOffersPage) return false;
  if (!amexCardsReady) return false;

  if (syncMode === SYNC_MODES.NEEDS_INPUT) return true;
  if (syncMode === SYNC_MODES.AUTH) return !autoStartConsumed;
  return false;
}

/**
 * One-shot redirect onto the offers hub while AUTH. After the user has already
 * been on offers (offersSeen), do not yank them back — stay interactive and
 * wait for them to return before auto-start.
 */
export function shouldForceChaseOffersRedirect({
  onOffers = false,
  onLogin = false,
  onOffersUrl = false,
  offersSeen = false,
  syncStarted = false,
} = {}) {
  if (syncStarted) return false;
  if (onOffers || onLogin || onOffersUrl) return false;
  if (offersSeen) return false;
  return true;
}

/**
 * Expired / signed-out Citi shell → one-shot navigate to official sign-on.
 * Do not fire when the real User ID / Password form is already visible, or
 * when the session is honestly signed in (happy path stays on Merchant Offers).
 */
export function shouldForceCitiLogin({
  expired = false,
  onLoginForm = false,
  signedIn = false,
  syncStarted = false,
  loginForced = false,
} = {}) {
  if (syncStarted) return false;
  if (loginForced) return false;
  if (signedIn === true) return false;
  if (onLoginForm) return false;
  return expired === true;
}

/**
 * After Citi sign-on (fresh or expired→login), land on Merchant Offers before
 * capture. Only hop once honest Sign Off chrome is present (`signedIn`).
 * Do not use "login form was seen" alone — MFA / soft-token / challenge pages
 * also lack User ID + Password after the real Sign On, and must stay put.
 */
export function shouldForceCitiOffersRedirect({
  onOffers = false,
  signedIn = false,
  onLoginForm = false,
  syncStarted = false,
  offersRedirected = false,
} = {}) {
  if (syncStarted) return false;
  if (offersRedirected) return false;
  if (onOffers) return false;
  if (onLoginForm) return false;
  return signedIn === true;
}

/**
 * After MFA / NeedsInput, plan the Chase resume action.
 * Never same-card switch — buildSwitchCardJs posts CARD_SWITCH_ERROR when the
 * menu stays on the current card, which would falsely enter failed.
 */
export function planChaseNeedsInputResume({
  cardOptionsLength = 0,
  syncedCount = 0,
  cardIndex = 0,
} = {}) {
  const total = Number(cardOptionsLength) || 0;
  const synced = Number(syncedCount) || 0;
  if (total < 1 || synced >= total) {
    return { action: 'full_start' };
  }
  const pos = Number.isInteger(cardIndex) ? cardIndex : 0;
  if (pos < 0 || pos >= total) {
    return { action: 'arm_capture', position: 0 };
  }
  return { action: 'arm_capture', position: pos };
}

/**
 * Cover bar fill from cards saved + optional half-step while a card is in flight.
 * Returns rawFrac only — callers keep a peak so the bar never moves backward when
 * syncing/switching toggles between cards.
 */
export function chaseCoverProgress({ syncedCount = 0, totalCards = 1, inFlight = false } = {}) {
  const total = Math.max(1, Number(totalCards) || 1);
  const synced = Math.max(0, Math.min(total, Number(syncedCount) || 0));
  const rawFrac = inFlight && synced < total
    ? Math.min(1, (synced + 0.5) / total)
    : synced / total;
  return {
    rawFrac,
    coverIndex: Math.min(total, synced < total ? synced + 1 : Math.max(synced, 1)),
  };
}

/** Amex multi-card cover progress — same math as Chase; UI adds phase label. */
export function amexCoverProgress(args) {
  return chaseCoverProgress(args);
}

/**
 * Amex cover subtitle. Blank unless actively capturing.
 * No "eligible"/"activated", no mid-walk "N saved" — just card name + monotonic N of M.
 */
export function amexCoverStatusLine({
  syncing = false,
  cardLabel = '',
  cardIndex = 1,
  cardsInPhase = 1,
} = {}) {
  if (!syncing) return '';
  const index = Math.max(1, Number(cardIndex) || 1);
  const total = Math.max(1, Number(cardsInPhase) || 1);
  return `${cardLabel || 'card'} · card ${index} of ${total}`;
}

/**
 * After MFA / NeedsInput, plan Amex resume without Chase walk semantics.
 * Continue the current eligible→enrolled walk from the next unsaved card;
 * never claim planChaseNeedsInputResume.
 */
export function planAmexNeedsInputResume({
  cardOptionsLength = 0,
  visitedCount = 0,
  syncPhase = 'eligible',
} = {}) {
  const total = Number(cardOptionsLength) || 0;
  const visited = Number(visitedCount) || 0;
  if (total < 1) {
    return { action: 'full_start' };
  }
  if (visited < total) {
    return { action: 'continue_walk', phase: syncPhase || 'eligible' };
  }
  if (syncPhase === 'eligible') {
    return { action: 'phase_to_enrolled' };
  }
  return { action: 'full_start' };
}
