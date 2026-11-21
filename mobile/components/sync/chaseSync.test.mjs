import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCaptureOffersJs,
  buildChaseOfferCaptureJs,
  buildListCardsJs,
  buildSwitchCardJs,
  mapChaseCustomerOffers,
  mergeDetectedCards,
  nextChaseCardPosition,
} from './chaseSync.js';

class El {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.children = children;
    for (const child of children) child.parent = this;
  }

  get id() { return this.attrs.id || ''; }
  set id(value) { this.attrs.id = value; }

  get innerText() {
    if (this.attrs.text != null) return this.attrs.text;
    return this.children.map(child => child.innerText).filter(Boolean).join(' ');
  }

  set innerText(value) { this.attrs.text = value; }

  get textContent() { return this.innerText; }

  getAttribute(name) {
    return this.attrs[name] == null ? null : String(this.attrs[name]);
  }

  setAttribute(name, value) { this.attrs[name] = String(value); }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const found = [];
    walk(this, selector, found);
    return found;
  }

  click() {}

  dispatchEvent() {}
}

function walk(el, selector, found) {
  for (const child of el.children) {
    if (matches(child, selector)) found.push(child);
    walk(child, selector, found);
  }
}

function matches(el, selector) {
  let rest = selector;
  if (rest.startsWith('#')) return el.id === rest.slice(1);
  const tag = rest.match(/^[a-zA-Z0-9-]+/);
  if (tag) {
    if (el.tagName.toLowerCase() !== tag[0].toLowerCase()) return false;
    rest = rest.slice(tag[0].length);
  }
  if (rest.startsWith('.')) {
    const className = rest.slice(1);
    return String(el.attrs.class || '').split(/\s+/).includes(className);
  }
  while (rest.startsWith('[')) {
    const end = rest.indexOf(']');
    const body = rest.slice(1, end);
    rest = rest.slice(end + 1);
    if (body.includes('$=')) {
      const [name, raw] = body.split('$=');
      const expected = raw.replace(/^"|"$/g, '');
      if (!String(el.attrs[name] || '').endsWith(expected)) return false;
    } else {
      const [name, raw] = body.split('=');
      const expected = raw.replace(/^"|"$/g, '');
      if (String(el.attrs[name] || '') !== expected) return false;
    }
  }
  return rest === '';
}

function page(roots) {
  return {
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const found = [];
      for (const root of roots) {
        if (matches(root, selector)) found.push(root);
        walk(root, selector, found);
      }
      return found;
    },
  };
}

function runScript(script, document) {
  const messages = [];
  const window = {
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  messages.window = window;
  new Function('window', 'document', script)(window, document);
  return messages;
}

class FakeXHR {
  constructor() {
    this.status = 200;
    this.responseText = '';
    this.listeners = {};
  }

  open(_method, url) { this.url = url; }

  send() {
    (this.listeners.load || []).forEach(listener => listener());
  }

  addEventListener(name, listener) {
    this.listeners[name] = this.listeners[name] || [];
    this.listeners[name].push(listener);
  }
}

async function waitForMessage(messages, timeoutMs = 4000) {
  const started = Date.now();
  while (messages.length === 0 && Date.now() - started < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return messages[0];
}

function chaseHub({ chooseChangesPage = true } = {}) {
  const options = [
    { label: 'Checking' },
    { label: 'Flex (...1111)' },
    { label: 'Sapphire Reserve (...2222)', selected: true },
  ];
  const button = new El('DIV', {
    id: 'select-credit-card-account',
    role: 'button',
    'aria-expanded': 'false',
    text: 'Sapphire Reserve (...2222)',
  });
  const menu = new El('UL', { id: 'select-credit-card-account-menu' });
  const optionEls = options.map((option, index) => {
    const children = option.selected
      ? [new El('SVG', { 'data-testid': `user-account-option-${index}-checkmark` })]
      : [];
    const item = new El('LI', {
      role: 'option',
      'data-testid': `user-account-option-${index}`,
      text: option.label,
    }, children);
    item.click = () => {
      if (!chooseChangesPage) return;
      button.attrs.text = option.label;
      button.setAttribute('aria-expanded', 'false');
      menu.attached = false;
      tiles[0].id = `${option.label}-a`;
      tiles[1].id = `${option.label}-b`;
    };
    return item;
  });
  menu.children = optionEls;
  menu.attached = false;

  button.click = () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', open ? 'false' : 'true');
    menu.attached = !open;
  };

  const tiles = [
    new El('DIV', { 'data-testid': 'commerce-tile', id: 'reserve-a' }),
    new El('DIV', { 'data-testid': 'commerce-tile', id: 'reserve-b' }),
  ];
  const grid = new El('DIV', { 'data-testid': 'grid-items-container' }, tiles);

  const document = {
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const roots = menu.attached ? [button, menu, grid] : [button, grid];
      const found = [];
      for (const root of roots) {
        if (matches(root, selector)) found.push(root);
        walk(root, selector, found);
      }
      return found;
    },
  };
  return { document, button, menu };
}

test('reads every masked card in the open menu and leaves the current card selected', async () => {
  const { document, button } = chaseHub();
  const messages = runScript(buildListCardsJs(), document);
  const message = await waitForMessage(messages);

  assert.equal(message.error, undefined);
  assert.deepEqual(message.cards, [
    { label: 'Flex (...1111)', value: '1', index: 1, selected: false },
    { label: 'Sapphire Reserve (...2222)', value: '2', index: 2, selected: true },
  ]);
  assert.equal(message.selectedLabel, 'Sapphire Reserve (...2222)');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.innerText, 'Sapphire Reserve (...2222)');
});

test('reports a missing card menu instead of saving', async () => {
  const messages = runScript(buildListCardsJs(), page([]));
  const message = await waitForMessage(messages);
  assert.equal(message.type, 'CARDS_LISTED');
  assert.deepEqual(message.cards, []);
  assert.equal(message.error, 'Card menu not found');
});

test('switches to the requested card after its offer tiles change', async () => {
  const { document, button } = chaseHub();
  const messages = runScript(buildSwitchCardJs(1, 2000), document);
  const message = await waitForMessage(messages);

  assert.equal(message.type, 'CARD_SWITCHED');
  assert.equal(message.cardLabel, 'Flex (...1111)');
  assert.equal(message.expectedIndex, 1);
  assert.equal(button.innerText, 'Flex (...1111)');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('does not report a switch when the menu stays on the same card', async () => {
  const { document, button } = chaseHub({ chooseChangesPage: false });
  const messages = runScript(buildSwitchCardJs(1, 500), document);
  const message = await waitForMessage(messages, 2000);

  assert.equal(message.type, 'CARD_SWITCH_ERROR');
  assert.equal(message.message, 'The card menu did not switch cards');
  assert.equal(button.innerText, 'Sapphire Reserve (...2222)');
});

test('reports an index the menu does not have', async () => {
  const { document, button } = chaseHub();
  const messages = runScript(buildSwitchCardJs(9, 500), document);
  const message = await waitForMessage(messages);
  assert.equal(message.type, 'CARD_SWITCH_ERROR');
  assert.equal(message.message, 'Card index out of range');
  assert.equal(button.innerText, 'Sapphire Reserve (...2222)');
});

test('still clicks the older mds-select card menu', async () => {
  const first = new El('MDS-SELECT-OPTION', { label: 'Flex (...1111)' });
  const second = new El('MDS-SELECT-OPTION', { label: 'Sapphire Reserve (...2222)', selected: 'true' });
  const select = new El('MDS-SELECT', { id: 'select-credit-card-account' }, [first, second]);
  first.click = () => {
    first.setAttribute('selected', 'true');
    second.setAttribute('selected', 'false');
  };
  const messages = runScript(buildSwitchCardJs(0, 0), page([select]));
  const message = await waitForMessage(messages);
  assert.equal(message.type, 'CARD_SWITCHED');
  assert.equal(message.cardLabel, 'Flex (...1111)');
});

test('maps a customer-offers response and drops account fields', () => {
  const mapped = mapChaseCustomerOffers({
    primaryIndividualEnterprisePartyIdentifier: 'party',
    digitalProfileAccounts: [{ digitalAccountIdentifier: 1, maskedAccountNumber: '....2222' }],
    customerOffers: [{
      digitalAccountIdentifier: 99,
      customerOfferSessionTokenIdentifier: 'session',
      partial: false,
      offers: [{
        offerIdentifier: 'FIGG:1894293',
        offerStatusName: 'ACTIVATED',
        digitalInteractionDestUrlText: 'https://example.test/track',
        merchantDetails: { merchantName: 'Wander', merchantAddressLineText: 'hidden' },
        offerDetails: { offerEndTimestamp: '2026-06-30T00:00:00.000Z', remainingDaysCount: 22 },
        offerDisplayDetails: { rewardDescriptionText: '$350 cash back' },
      }],
    }],
  });

  assert.equal(mapped.gridFound, true);
  assert.equal(mapped.partial, false);
  assert.equal(mapped.offers.length, 1);
  assert.equal(mapped.offers[0].bankOfferId, 'FIGG:1894293');
  assert.equal(mapped.offers[0].merchantName, 'Wander');
  assert.equal(mapped.offers[0].valueText, '$350 cash back');
  const htmlValue = mapChaseCustomerOffers({
    customerOffers: [{
      partial: false,
      offers: [{
        offerIdentifier: 'FIGG:2',
        merchantDetails: { merchantName: 'Store' },
        offerDisplayDetails: {
          rewardDescriptionText: 'Earn 40% cash back on a membership.<br><br>Includes a <b>$20 cash back</b> maximum. <a href="https://example.test">Store</a>',
        },
      }],
    }],
  });
  assert.equal(htmlValue.offers[0].valueText, '40% cash back, up to $20');
  assert.equal(htmlValue.offers[0].valueText.includes('<'), false);
  const minimum = mapChaseCustomerOffers({
    customerOffers: [{
      offers: [{
        offerIdentifier: 'FIGG:3',
        merchantDetails: { merchantName: 'SeatGeek' },
        offerDisplayDetails: {
          rewardDescriptionText: 'Earn 5% cash back. Offer valid on $50 or more purchases.',
        },
      }],
    }],
  });
  assert.equal(minimum.offers[0].valueText, '5% cash back on $50 or more');
  const otherId = mapChaseCustomerOffers({
    customerOffers: [{
      offers: [{
        offerIdentifier: 'CDLX:10:20-c',
        merchantDetails: { merchantName: 'Store' },
        offerDisplayDetails: { rewardDescriptionText: '$25 cash back' },
      }],
    }],
  });
  assert.equal(otherId.offers[0].bankOfferId, 'CDLX:10:20-c');
  assert.equal(mapped.offers[0].expiryText, '2026-06-30T00:00:00.000Z');
  assert.equal(mapped.offers[0].isActivated, true);
  assert.equal(JSON.stringify(mapped).includes('session'), false);
  assert.equal(JSON.stringify(mapped).includes('digitalAccount'), false);
  assert.equal(JSON.stringify(mapped).includes('merchantAddress'), false);
});

test('reads the offer response for the open card and ignores the tiles', () => {
  const button = new El('DIV', { id: 'select-credit-card-account', text: 'Sapphire Reserve (...2222)' });
  const document = page([button]);
  const messages = [];
  const window = {
    XMLHttpRequest: FakeXHR,
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildChaseOfferCaptureJs())(window, document);

  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', 'https://secure.chase.com/svc/customer-offers');
  xhr.responseText = JSON.stringify({
    customerOffers: [{
      partial: false,
      digitalAccountIdentifier: 5,
      offers: [{
        offerIdentifier: 'FIGG:1894293',
        offerStatusName: 'AVAILABLE',
        merchantDetails: { merchantName: 'Wander' },
        offerDetails: { remainingDaysCount: 22, offerEndTimestamp: '2026-06-30T00:00:00.000Z' },
        offerDisplayDetails: { rewardDescriptionText: '$350 cash back' },
      }],
    }],
  });
  xhr.send();
  new Function('window', 'document', buildCaptureOffersJs())(window, document);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'CAPTURE_OFFERS');
  assert.equal(messages[0].cardLabel, 'Sapphire Reserve (...2222)');
  assert.equal(messages[0].offers[0].bankOfferId, 'FIGG:1894293');
  assert.equal(messages[0].offers[0].merchantName, 'Wander');
  assert.equal(messages[0].offers[0].valueText, '$350 cash back');
  assert.equal(JSON.stringify(messages[0]).includes('digitalAccount'), false);
});

function chaseOffersBody(merchant, id) {
  return JSON.stringify({
    customerOffers: [{
      partial: false,
      offers: [{
        offerIdentifier: id,
        offerStatusName: 'AVAILABLE',
        merchantDetails: { merchantName: merchant },
        offerDisplayDetails: { rewardDescriptionText: '$5 cash back' },
      }],
    }],
  });
}

class DelayedXHR extends FakeXHR {
  send() {}

  flush() {
    (this.listeners.load || []).forEach(listener => listener());
  }
}

function installChaseHook(document, XHR = FakeXHR) {
  const messages = [];
  const window = {
    XMLHttpRequest: XHR,
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildChaseOfferCaptureJs())(window, document);
  return { window, messages };
}

function postCapture(window, document) {
  new Function('window', 'document', buildCaptureOffersJs())(window, document);
}

test('does not save the previous card when the next card has no new offers response', async () => {
  const { document } = chaseHub();
  const { window, messages } = installChaseHook(document);

  const first = new window.XMLHttpRequest();
  first.open('POST', 'https://secure.chase.com/svc/customer-offers');
  first.responseText = chaseOffersBody('Wander', 'FIGG:1');
  first.send();
  postCapture(window, document);
  assert.equal(messages.at(-1).type, 'CAPTURE_OFFERS');
  assert.equal(messages.at(-1).offers[0].merchantName, 'Wander');
  assert.equal(messages.at(-1).cardLabel, 'Sapphire Reserve (...2222)');

  const beforeSwitch = messages.length;
  new Function('window', 'document', buildSwitchCardJs(1, 2000))(window, document);
  const started = Date.now();
  while (!messages.slice(beforeSwitch).some(message => message.type === 'CARD_SWITCHED') && Date.now() - started < 4000) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const cardSwitched = messages.slice(beforeSwitch).find(message => message.type === 'CARD_SWITCHED');
  assert.equal(cardSwitched.cardLabel, 'Flex (...1111)');

  postCapture(window, document);
  assert.equal(messages.at(-1).type, 'CHASE_CAPTURE_UNAVAILABLE');

  const second = new window.XMLHttpRequest();
  second.open('POST', 'https://secure.chase.com/svc/customer-offers');
  second.responseText = chaseOffersBody('Nike', 'FIGG:2');
  second.send();
  postCapture(window, document);
  assert.equal(messages.at(-1).type, 'CAPTURE_OFFERS');
  assert.equal(messages.at(-1).cardLabel, 'Flex (...1111)');
  assert.equal(messages.at(-1).offers[0].merchantName, 'Nike');
  assert.equal(messages.at(-1).offers[0].bankOfferId, 'FIGG:2');
});

test('ignores a customer-offers response that started before the card click', async () => {
  const { document } = chaseHub();
  const { window, messages } = installChaseHook(document, DelayedXHR);

  const early = new window.XMLHttpRequest();
  early.open('POST', 'https://secure.chase.com/svc/customer-offers');
  early.responseText = chaseOffersBody('Wander', 'FIGG:1');
  early.send();

  const beforeSwitch = messages.length;
  new Function('window', 'document', buildSwitchCardJs(1, 2000))(window, document);
  const started = Date.now();
  while (!messages.slice(beforeSwitch).some(message => message.type === 'CARD_SWITCHED') && Date.now() - started < 4000) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(messages.slice(beforeSwitch).some(message => message.type === 'CARD_SWITCHED'), true);

  early.flush();
  postCapture(window, document);
  assert.equal(messages.at(-1).type, 'CHASE_CAPTURE_UNAVAILABLE');
  assert.equal(JSON.stringify(messages.at(-1)).includes('Wander'), false);

  const next = new window.XMLHttpRequest();
  next.open('POST', 'https://secure.chase.com/svc/customer-offers');
  next.responseText = chaseOffersBody('Nike', 'FIGG:2');
  next.send();
  next.flush();
  postCapture(window, document);
  assert.equal(messages.at(-1).type, 'CAPTURE_OFFERS');
  assert.equal(messages.at(-1).cardLabel, 'Flex (...1111)');
  assert.equal(messages.at(-1).offers[0].merchantName, 'Nike');
});

test('ignores a fetch customer-offers body that arrives after the card click', async () => {
  const { document } = chaseHub();
  let releaseBody;
  const bodyReady = new Promise(resolve => { releaseBody = resolve; });
  let delayBody = true;
  let bodyText = chaseOffersBody('Wander', 'FIGG:1');
  const messages = [];
  const window = {
    XMLHttpRequest: FakeXHR,
    fetch() {
      const text = bodyText;
      const delayed = delayBody;
      return Promise.resolve({
        ok: true,
        clone() { return this; },
        text() {
          return delayed ? bodyReady.then(() => text) : Promise.resolve(text);
        },
      });
    },
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildChaseOfferCaptureJs())(window, document);

  await window.fetch('https://secure.chase.com/svc/customer-offers');
  window.__chaseArmNextCapture();
  releaseBody();
  await new Promise(resolve => setTimeout(resolve, 20));

  postCapture(window, document);
  assert.equal(messages.at(-1).type, 'CHASE_CAPTURE_UNAVAILABLE');
  assert.equal(JSON.stringify(messages.at(-1)).includes('Wander'), false);

  delayBody = false;
  bodyText = chaseOffersBody('Nike', 'FIGG:2');
  await window.fetch('https://secure.chase.com/svc/customer-offers');
  await new Promise(resolve => setTimeout(resolve, 20));
  postCapture(window, document);
  assert.equal(messages.at(-1).type, 'CAPTURE_OFFERS');
  assert.equal(messages.at(-1).offers[0].merchantName, 'Nike');
  assert.equal(messages.at(-1).offers[0].bankOfferId, 'FIGG:2');
});

test('asks for another card request when the offers response was missed', () => {
  const button = new El('DIV', { id: 'select-credit-card-account', text: 'Sapphire Reserve (...2222)' });
  const messages = [];
  const window = {
    ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
  };
  new Function('window', 'document', buildCaptureOffersJs())(window, page([button]));
  assert.equal(messages[0].type, 'CHASE_CAPTURE_UNAVAILABLE');
});

test('walks every card once, starting from the card already on screen', () => {
  let position = 4;
  let synced = 0;
  const visited = [];
  while (synced < 5) {
    visited.push(position);
    synced += 1;
    const next = nextChaseCardPosition(position, 5, synced);
    if (next === null) break;
    position = next;
  }
  assert.deepEqual(visited, [4, 0, 1, 2, 3]);
  assert.equal(nextChaseCardPosition(0, 1, 1), null);
});

test('keeps a full card list when a later detection only sees the open card', () => {
  const full = [
    { label: 'Flex (...1111)', index: 1 },
    { label: 'Sapphire Reserve (...2222)', index: 2 },
  ];
  const visibleOnly = [{ label: 'Sapphire Reserve (...2222)', index: 0 }];
  assert.equal(mergeDetectedCards(full, visibleOnly), full);
  assert.deepEqual(mergeDetectedCards([], visibleOnly), visibleOnly);
});
