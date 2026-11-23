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
export const CHASE_OFFER_HOOK_VERSION = 7;

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
