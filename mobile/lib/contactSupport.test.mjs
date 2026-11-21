import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SUPPORT_SUBJECTS,
  SUPPORT_SUCCESS_COPY,
  canSubmitSupportForm,
  submitSupportForm,
} from './contactSupport.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('SUPPORT_SUBJECTS covers the planned topics', () => {
  assert.deepEqual(SUPPORT_SUBJECTS, [
    'Sync or bank connection',
    'Missing or wrong offers',
    'Account or sign-in',
    'Search or results',
    'Feature request',
    'Privacy or data',
    'Other feedback',
  ]);
});

test('canSubmitSupportForm requires subject and concern', () => {
  assert.equal(canSubmitSupportForm({ subject: '', concern: '' }), false);
  assert.equal(canSubmitSupportForm({ subject: 'Other feedback', concern: '' }), false);
  assert.equal(canSubmitSupportForm({ subject: '', concern: 'Hello' }), false);
  assert.equal(canSubmitSupportForm({ subject: '  ', concern: '  hi  ' }), false);
  assert.equal(canSubmitSupportForm({ subject: 'Other feedback', concern: 'Hello' }), true);
});

test('submitSupportForm is local success only — no network', () => {
  assert.deepEqual(submitSupportForm({ subject: '', concern: '' }), { ok: false, reason: 'incomplete' });
  assert.deepEqual(
    submitSupportForm({ subject: 'Feature request', concern: 'Please add Cap One' }),
    { ok: true }
  );
  assert.equal(
    SUPPORT_SUCCESS_COPY,
    'Your concern has been successfully submitted. Thanks for reaching out.'
  );
});

test('support screen wires form + success; account pushes form not mailto', () => {
  const support = fs.readFileSync(path.join(root, 'app/account/support.js'), 'utf8');
  const account = fs.readFileSync(path.join(root, 'app/account/index.js'), 'utf8');
  const faq = fs.readFileSync(path.join(root, 'components/FAQSection.js'), 'utf8');

  assert.match(support, /SUPPORT_SUBJECTS/);
  assert.match(support, /SUPPORT_SUCCESS_COPY/);
  assert.match(support, /submitSupportForm/);
  assert.match(support, /ACCOUNT_TAB_INDEX/);
  assert.equal(support.includes('mailto:'), false);
  assert.equal(support.includes('fetch('), false);
  assert.equal(support.includes('Linking.openURL'), false);

  assert.match(account, /\/account\/support/);
  assert.equal(account.includes('SUPPORT_MAILTO'), false);
  assert.equal(account.includes('mailto:'), false);

  // FAQ footer mailto unchanged.
  assert.match(faq, /mailto:hello@rewardsfindr\.com/);
});
