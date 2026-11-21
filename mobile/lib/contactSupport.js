// Pure helpers for Contact support form (unit tested).

export const SUPPORT_SUBJECTS = [
  'Sync or bank connection',
  'Missing or wrong offers',
  'Account or sign-in',
  'Search or results',
  'Feature request',
  'Privacy or data',
  'Other feedback',
];

export const SUPPORT_SUCCESS_COPY =
  'Your concern has been successfully submitted. Thanks for reaching out.';

export function canSubmitSupportForm({ subject, concern } = {}) {
  return Boolean(String(subject || '').trim() && String(concern || '').trim());
}

/** Local-only submit — no mailto, no network. */
export function submitSupportForm({ subject, concern } = {}) {
  if (!canSubmitSupportForm({ subject, concern })) {
    return { ok: false, reason: 'incomplete' };
  }
  return { ok: true };
}
