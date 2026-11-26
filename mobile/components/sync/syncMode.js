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
 * Capture cover is Chase-only in Slice 0+1. Non-Chase Sync Offers must not
 * show a Chase-branded overlay (plan: other banks unchanged).
 */
export function shouldShowSyncCover({ bank, syncMode } = {}) {
  return bank === 'chase' && syncMode === SYNC_MODES.CAPTURING;
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
