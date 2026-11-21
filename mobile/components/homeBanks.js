// ─────────────────────────────────────────────
// HOME BANK HELPERS
// Progressive Sync Bank row + picker membership.
// ─────────────────────────────────────────────
import { BANK_LIST } from '../shared/constants.js';

/** Banks shown on Home, in catalog order. */
export function visibleHomeBanks(syncedBanks = {}) {
  const linked = new Set(Object.keys(syncedBanks || {}));
  return BANK_LIST.filter((bank) => linked.has(bank.id));
}

/** Supported banks not yet on Home (picker rows). */
export function pickerBanks(syncedBanks = {}) {
  const linked = new Set(Object.keys(syncedBanks || {}));
  return BANK_LIST.filter((bank) => bank.supported && !linked.has(bank.id));
}

/** Whether the trailing Sync Bank cell should render. */
export function canAddMoreBanks(syncedBanks = {}) {
  return pickerBanks(syncedBanks).length > 0;
}
