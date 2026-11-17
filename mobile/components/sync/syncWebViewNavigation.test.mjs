import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildOpenWindowRedirectJs,
  buildContainOpenWindowsJs,
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

test('buildContainOpenWindowsJs patches window.open and target=_blank clicks', () => {
  const js = buildContainOpenWindowsJs();
  assert.match(js, /window\.open\s*=\s*function/);
  assert.match(js, /target/);
  assert.match(js, /_blank/);
  assert.match(js, /preventDefault/);
});

/** Fake window/document so the early contain inject can be executed in node. */
function installContainInject() {
  const clickListeners = [];
  const location = { href: 'https://www.capitalone.com/offers' };
  const window = {
    location,
    open() {
      throw new Error('native window.open should be overwritten by contain inject');
    },
  };
  const document = {
    addEventListener(type, handler, capture) {
      clickListeners.push({ type, handler, capture });
    },
  };
  new Function('window', 'document', buildContainOpenWindowsJs())(window, document);
  return { window, location, clickListeners };
}

test('buildContainOpenWindowsJs routes window.open and _blank clicks to location.href', () => {
  const { window, location, clickListeners } = installContainInject();

  const openResult = window.open('https://capitaloneoffers.com/ease?deal=1');
  assert.equal(location.href, 'https://capitaloneoffers.com/ease?deal=1');
  assert.equal(openResult, window);

  const click = clickListeners.find((entry) => entry.type === 'click' && entry.capture === true);
  assert.ok(click, 'contain inject must register a capturing click listener');

  let prevented = false;
  let stopped = false;
  const blankAnchor = {
    tagName: 'A',
    href: 'https://capitaloneoffers.com/ease?from=_blank',
    parentElement: null,
    getAttribute(name) {
      return name === 'target' ? '_blank' : null;
    },
  };
  click.handler({
    target: blankAnchor,
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(location.href, 'https://capitaloneoffers.com/ease?from=_blank');

  prevented = false;
  stopped = false;
  location.href = 'https://www.capitalone.com/offers';
  const nestedBlank = {
    tagName: 'SPAN',
    parentElement: {
      tagName: 'A',
      href: 'https://capitaloneoffers.com/ease?from=_new',
      parentElement: null,
      getAttribute(name) {
        return name === 'target' ? '_new' : null;
      },
    },
  };
  click.handler({
    target: nestedBlank,
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(location.href, 'https://capitaloneoffers.com/ease?from=_new');

  prevented = false;
  location.href = 'https://www.capitalone.com/offers';
  const sameTab = {
    tagName: 'A',
    href: 'https://capitaloneoffers.com/ease?same',
    parentElement: null,
    getAttribute() { return null; },
  };
  click.handler({
    target: sameTab,
    preventDefault() { prevented = true; },
    stopPropagation() {},
  });
  assert.equal(prevented, false);
  assert.equal(location.href, 'https://www.capitalone.com/offers');
});

test('SyncWebView wires in-sheet open-window containment and load policy', () => {
  const syncSource = readRepoFile('..', 'SyncWebView.js');
  assert.match(syncSource, /shouldAllowSyncWebViewNavigation/);
  assert.match(syncSource, /buildOpenWindowRedirectJs/);
  assert.match(syncSource, /buildContainOpenWindowsJs/);
  assert.match(syncSource, /onOpenWindow=\{handleOpenWindow\}/);
  assert.match(syncSource, /onShouldStartLoadWithRequest=\{handleShouldStartLoadWithRequest\}/);
  assert.match(syncSource, /setSupportMultipleWindows=\{false\}/);
});
