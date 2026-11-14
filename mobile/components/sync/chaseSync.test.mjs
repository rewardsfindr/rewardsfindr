import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCaptureOffersJs,
  buildListCardsJs,
  buildSwitchCardJs,
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
  new Function('window', 'document', script)(window, document);
  return messages;
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

test('reads offer id, merchant, and value from the current Chase tiles', async () => {
  const button = new El('DIV', { id: 'select-credit-card-account', text: 'Sapphire Reserve (...2222)' });
  const tile = new El('DIV', {
    'data-testid': 'commerce-tile',
    id: 'carousel-FIGG:1894293',
  }, [
    new El('SPAN', { class: 'titleTagVariant2Container', text: 'Wander' }),
    new El('SPAN', { class: 'subtitleTagVariant2Container', text: '$350 cash back' }),
    new El('SPAN', { 'data-testid': 'days-left-banner', text: '22d left' }),
  ]);
  const grid = new El('DIV', { 'data-testid': 'grid-items-container' }, [tile]);
  const messages = runScript(buildCaptureOffersJs(), page([button, grid]));
  const message = await waitForMessage(messages);

  assert.equal(message.type, 'CAPTURE_OFFERS');
  assert.equal(message.gridFound, true);
  assert.equal(message.cardLabel, 'Sapphire Reserve (...2222)');
  assert.equal(message.offers[0].bankOfferId, 'FIGG:1894293');
  assert.equal(message.offers[0].merchantName, 'Wander');
  assert.equal(message.offers[0].valueText, '$350 cash back');
  assert.equal(message.offers[0].daysLeft, '22d left');
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
