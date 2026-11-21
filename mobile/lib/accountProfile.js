// Pure helpers for the Account / Profile screen (unit tested).
import { BANK_LIST } from '../shared/constants.js';

export const SUPPORT_EMAIL = 'hello@rewardsfindr.com';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
export const PRIVACY_URL = 'https://rewardsfindr.com/privacy';
export const TERMS_URL = 'https://rewardsfindr.com/terms';

/** Keep in sync with mobile/app.json → expo.version. */
export const APP_VERSION = '1.0.0';

export function emailLocalPart(email) {
  const raw = String(email || '').trim();
  if (!raw || !raw.includes('@')) return '';
  return raw.split('@')[0] || '';
}

/** displayName → else email local-part → else "Your account". */
export function accountDisplayName({ displayName, email } = {}) {
  const name = String(displayName || '').trim();
  if (name) return name;
  const local = emailLocalPart(email);
  if (local) return local;
  return 'Your account';
}

/** Initials from name (first+last), else first letter of email local-part, else "?". */
export function accountInitials({ displayName, email } = {}) {
  const name = String(displayName || '').trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const local = emailLocalPart(email);
  if (local) return local[0].toUpperCase();
  return '?';
}

/**
 * Synced banks summary from on-device map keys, ordered like Home BANK_LIST.
 * @returns {{ count: number, labels: string, title: string, subtitle: string }}
 */
export function syncedBanksSummary(syncedBanks = {}) {
  const linked = new Set(Object.keys(syncedBanks || {}));
  const ordered = BANK_LIST.filter((bank) => linked.has(bank.id));
  const count = ordered.length;
  const labels = ordered.map((bank) => bank.label).join(' · ');
  if (count === 0) {
    return {
      count: 0,
      labels: '',
      title: 'No banks synced',
      subtitle: 'Sync from Home to save offers',
    };
  }
  return {
    count,
    labels,
    title: `${count} bank${count === 1 ? '' : 's'} synced`,
    subtitle: labels,
  };
}

export function formatAppVersion(version = APP_VERSION) {
  return `Version ${version}`;
}
