import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildOpenWindowRedirectJs,
  shouldAllowSyncWebViewNavigation,
} from './syncWebViewNavigation.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function readRepoFile(...parts) {
  return readFileSync(join(HERE, ...parts), 'utf8');
}

test('shouldAllowSyncWebViewNavigation allows http(s) and about:blank', () => {
  assert.equal(shouldAllowSyncWebViewNavigation('https://www.capitalone.com/offers'), true);
  assert.equal(shouldAllowSyncWebViewNavigation('http://example.com/path'), true);
  assert.equal(shouldAllowSyncWebViewNavigation('HTTPS://BANK.EXAMPLE/'), true);
  assert.equal(shouldAllowSyncWebViewNavigation('about:blank'), true);
  assert.equal(shouldAllowSyncWebViewNavigation(''), true);
  assert.equal(shouldAllowSyncWebViewNavigation(null), true);
  assert.equal(shouldAllowSyncWebViewNavigation(undefined), true);
});

test('shouldAllowSyncWebViewNavigation blocks intent/market/mailto and other schemes', () => {
  assert.equal(shouldAllowSyncWebViewNavigation('intent://scan/#Intent;scheme=zxing;end'), false);
  assert.equal(shouldAllowSyncWebViewNavigation('market://details?id=com.example'), false);
  assert.equal(shouldAllowSyncWebViewNavigation('mailto:help@example.com'), false);
  assert.equal(shouldAllowSyncWebViewNavigation('tel:+15551212'), false);
  assert.equal(shouldAllowSyncWebViewNavigation('javascript:alert(1)'), false);
  assert.equal(shouldAllowSyncWebViewNavigation('about:srcdoc'), false);
});

test('buildOpenWindowRedirectJs injects JSON-safe location.href redirect', () => {
  assert.equal(buildOpenWindowRedirectJs(null), null);
  assert.equal(buildOpenWindowRedirectJs(''), null);
  assert.equal(buildOpenWindowRedirectJs(undefined), null);

  const url = 'https://capitaloneoffers.com/ease?x="quotes\'&';
  const js = buildOpenWindowRedirectJs(url);
  assert.match(js, /window\.location\.href = /);
  assert.match(js, /true;$/);
  // Must be JSON-stringified so quotes in the URL cannot break out of the inject.
  assert.equal(js.includes(JSON.stringify(url)), true);
  assert.equal(js.includes(`window.location.href = ${JSON.stringify(url)}`), true);
});

test('SyncWebView wires in-sheet open-window containment and load policy', () => {
  const syncSource = readRepoFile('..', 'SyncWebView.js');
  assert.match(syncSource, /shouldAllowSyncWebViewNavigation/);
  assert.match(syncSource, /buildOpenWindowRedirectJs/);
  assert.match(syncSource, /onOpenWindow=\{handleOpenWindow\}/);
  assert.match(syncSource, /onShouldStartLoadWithRequest=\{handleShouldStartLoadWithRequest\}/);
  assert.match(syncSource, /setSupportMultipleWindows=\{true\}/);
});
