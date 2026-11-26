import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMEX_OPEN_AND_DETECT_JS,
  AMEX_SWITCH_TIMEOUT_MS,
  buildAmexJsonCaptureJs,
  buildAmexSwitchCardJs,
} from './amexSync.js';

test('AMEX_SWITCH_TIMEOUT_MS is the prior shared Amex switch wait', () => {
  assert.equal(AMEX_SWITCH_TIMEOUT_MS, 3500);
  assert.ok(buildAmexSwitchCardJs('CARD_PRODUCT_1').includes(String(AMEX_SWITCH_TIMEOUT_MS)));
});

class El {
  constructor(attrs = {}, children = []) {
    this.attrs = { ...attrs };
    this.children = children;
  }

  get innerText() { return this.attrs.text || ''; }

  getAttribute(name) {
    return this.attrs[name] == null ? null : String(this.attrs[name]);
  }

  setAttribute(name, value) { this.attrs[name] = String(value); }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (matches(child, selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }

  click() {}
}

function matches(el, selector) {
  let rest = selector;
  while (rest.startsWith('[')) {
    const end = rest.indexOf(']');
    const body = rest.slice(1, end);
    rest = rest.slice(end + 1);
    if (body.includes('*=')) {
      const [name, raw] = body.split('*=');
      const expected = raw.replace(/^"|"$/g, '');
      if (!String(el.attrs[name] || '').includes(expected)) return false;
    } else {
      const [name, raw] = body.split('=');
      const expected = raw.replace(/^"|"$/g, '');
      if (String(el.attrs[name] || '') !== expected) return false;
    }
  }
  return rest === '';
}

function runScript(script, document, extras = {}) {
  const messages = [];
  const window = {
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
    ...extras,
  };
  new Function('window', 'document', script)(window, document);
  return { messages, window };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function amexMenu({ expanded, includeOption, testId = 'simple_switcher_product_option_CARD_PRODUCT_ABC' }) {
  const clicks = { combobox: 0, option: 0 };
  const combobox = new El({
    'data-testid': 'simple_switcher_combobox',
    'aria-expanded': expanded ? 'true' : 'false',
  });
  combobox.click = () => {
    clicks.combobox += 1;
    const open = combobox.getAttribute('aria-expanded') === 'true';
    combobox.setAttribute('aria-expanded', open ? 'false' : 'true');
  };
  const option = new El({ 'data-testid': testId, role: 'option' });
  option.click = () => { clicks.option += 1; };
  const display = new El({ 'data-testid': 'simple_switcher_selected_option_display' }, [
    new El({ 'data-testid': 'simple_switcher_display_name', text: 'Blue Cash' }),
    new El({ 'data-testid': 'simple_switcher_display_number_val', text: '1008' }),
  ]);
  const roots = [combobox, display];
  if (includeOption) roots.push(option);
  const document = {
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const found = [];
      for (const root of roots) {
        if (matches(root, selector)) found.push(root);
        found.push(...root.querySelectorAll(selector));
      }
      return found;
    },
  };
  return { document, clicks, testId };
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

function offerPayload(responseType, count) {
  return JSON.stringify({
    responseType,
    recommendedOffers: { offersList: { page1: Array.from({ length: count }, (_, index) => index) } },
  });
}

test('an already open Amex menu is used without clicking it shut', async () => {
  const menu = amexMenu({ expanded: true, includeOption: true });
  const { messages } = runScript(buildAmexSwitchCardJs(menu.testId, 20), menu.document);
  await wait(80);
  assert.equal(menu.clicks.combobox, 0);
  assert.equal(menu.clicks.option, 1);
  assert.equal(messages[0].type, 'CARD_SWITCHED');
  assert.equal(messages[0].cardLabel, 'Blue Cash (...1008)');
  assert.equal(messages[0].expectedTestId, menu.testId);
});

test('a closed Amex menu is opened once before the card is chosen', async () => {
  const menu = amexMenu({ expanded: false, includeOption: true });
  const { messages } = runScript(buildAmexSwitchCardJs(menu.testId, 20), menu.document);
  await wait(700);
  assert.equal(menu.clicks.combobox, 1);
  assert.equal(menu.clicks.option, 1);
  assert.equal(messages.at(-1).type, 'CARD_SWITCHED');
});

test('a missing Amex card reports a safe error and does not include the option id', async () => {
  const menu = amexMenu({ expanded: true, includeOption: false });
  const { messages } = runScript(buildAmexSwitchCardJs(menu.testId, 20), menu.document);
  await wait(40);
  assert.equal(messages[0].type, 'CARD_SWITCH_ERROR');
  assert.equal(messages[0].message, 'Could not open the next Amex card. Nothing else was changed.');
  assert.equal(messages[0].message.includes(menu.testId), false);
  assert.equal(menu.clicks.combobox, 0);
});

test('card detection reads an already open menu without clicking it shut', () => {
  const product = new El({
    role: 'option',
    'data-testid': 'simple_switcher_product_option_CARD_PRODUCT_ONE',
    'aria-selected': 'true',
  }, [
    new El({ 'data-testid': 'simple_switcher_display_name', text: 'Platinum' }),
    new El({ 'data-testid': 'simple_switcher_display_number_val', text: '2009' }),
  ]);
  const combobox = new El({
    'data-testid': 'simple_switcher_combobox',
    'aria-expanded': 'true',
  });
  let clicks = 0;
  combobox.click = () => { clicks += 1; };
  const document = {
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) {
      const found = [];
      for (const root of [combobox, product]) {
        if (matches(root, selector)) found.push(root);
        found.push(...root.querySelectorAll(selector));
      }
      return found;
    },
  };
  const { messages } = runScript(AMEX_OPEN_AND_DETECT_JS, document);
  assert.equal(clicks, 0);
  assert.equal(messages[0].cards[0].label, 'Platinum');
  assert.equal(messages[0].cards[0].last4, '2009');
  assert.equal(messages[0].cards[0].selected, true);
});

test('card detection falls back to every option when product options are absent', () => {
  const option = new El({
    role: 'option',
    'data-testid': 'offer-filter',
    'aria-selected': 'false',
  }, [
    new El({ 'data-testid': 'simple_switcher_display_name', text: 'Blue Cash' }),
    new El({ 'data-testid': 'simple_switcher_display_number_val', text: '1008' }),
  ]);
  const combobox = new El({
    'data-testid': 'simple_switcher_combobox',
    'aria-expanded': 'true',
  });
  const document = {
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) {
      const found = [];
      for (const root of [combobox, option]) {
        if (matches(root, selector)) found.push(root);
        found.push(...root.querySelectorAll(selector));
      }
      return found;
    },
  };
  const { messages } = runScript(AMEX_OPEN_AND_DETECT_JS, document);
  assert.equal(messages[0].cards.length, 1);
  assert.equal(messages[0].cards[0].label, 'Blue Cash');
  assert.equal(messages[0].cards[0].testId, 'offer-filter');
});

class DeferredXHR {
  constructor() {
    this.status = 200;
    this.responseText = '';
    this.listeners = {};
  }

  open(_method, url) { this.url = url; }

  send() {}

  flush() {
    (this.listeners.load || []).forEach(listener => listener());
  }

  addEventListener(name, listener) {
    this.listeners[name] = this.listeners[name] || [];
    this.listeners[name].push(listener);
  }
}

test('a card click ignores offer responses that started on the previous card', async () => {
  const menu = amexMenu({ expanded: true, includeOption: true });
  const messages = [];
  const window = {
    XMLHttpRequest: DeferredXHR,
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildAmexJsonCaptureJs())(window, menu.document);
  window.__amexJsonCaptureArmed = true;

  const previous = new window.XMLHttpRequest();
  previous.open('GET', 'https://example.com/ReadOffersHubPresentation');
  previous.responseText = offerPayload('REPLACE', 8);
  previous.send();

  new Function('window', 'document', buildAmexSwitchCardJs(menu.testId, 20))(window, menu.document);

  const smaller = new window.XMLHttpRequest();
  smaller.open('GET', 'https://example.com/ReadOffersHubPresentation');
  smaller.responseText = offerPayload('REPLACE', 2);
  smaller.send();

  const fuller = new window.XMLHttpRequest();
  fuller.open('GET', 'https://example.com/ReadOffersHubPresentation');
  fuller.responseText = offerPayload('UPDATE', 5);
  fuller.send();

  previous.flush();
  smaller.flush();
  fuller.flush();

  await wait(950);
  const captured = messages.filter(message => message.type === 'CAPTURE_JSON');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].json.recommendedOffers.offersList.page1.length, 5);
  assert.equal(captured[0].cardLabel, 'Blue Cash (...1008)');
});

test('Amex capture keeps the fullest response and posts it once', async () => {
  const display = new El({ 'data-testid': 'simple_switcher_selected_option_display' }, [
    new El({ 'data-testid': 'simple_switcher_display_name', text: 'Platinum' }),
    new El({ 'data-testid': 'simple_switcher_display_number_val', text: '2009' }),
  ]);
  const document = {
    querySelector(selector) { return display.querySelector(selector) || (matches(display, selector) ? display : null); },
    querySelectorAll() { return []; },
  };
  const { messages, window } = runScript(buildAmexJsonCaptureJs(), document, { XMLHttpRequest: FakeXHR });
  window.__amexJsonCaptureArmed = true;

  const first = new window.XMLHttpRequest();
  first.open('GET', 'https://example.com/ReadOffersHubPresentation');
  first.responseText = offerPayload('REPLACE', 2);
  first.send();

  const larger = new window.XMLHttpRequest();
  larger.open('GET', 'https://example.com/ReadOffersHubPresentation');
  larger.responseText = offerPayload('UPDATE', 5);
  larger.send();

  const smaller = new window.XMLHttpRequest();
  smaller.open('GET', 'https://example.com/ReadOffersHubPresentation');
  smaller.responseText = offerPayload('REPLACE', 1);
  smaller.send();

  const ignored = new window.XMLHttpRequest();
  ignored.open('GET', 'https://example.com/ReadOffersHubPresentation');
  ignored.responseText = offerPayload('FILTER', 9);
  ignored.send();

  await wait(950);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'CAPTURE_JSON');
  assert.equal(messages[0].json.recommendedOffers.offersList.page1.length, 5);
  assert.equal(messages[0].cardLabel, 'Platinum (...2009)');
  assert.equal(window.__amexJsonCaptureArmed, false);
});

test('an unarmed Amex capture posts nothing', async () => {
  const document = { querySelector() { return null; }, querySelectorAll() { return []; } };
  const { messages, window } = runScript(buildAmexJsonCaptureJs(), document, { XMLHttpRequest: FakeXHR });
  const xhr = new window.XMLHttpRequest();
  xhr.open('GET', 'https://example.com/ReadOffersHubPresentation');
  xhr.responseText = offerPayload('REPLACE', 4);
  xhr.send();
  await wait(900);
  assert.deepEqual(messages, []);
});
