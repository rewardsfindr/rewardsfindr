import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK_LIST, FAQ_ITEMS } from '../../shared/constants.js';
import { BANK_CONFIG } from './bankConfig.js';
import { formatOfferExpiry } from '../../lib/savedOffers.js';
import { wellsFargoRecords } from '../../../api/lib/offers/deviceCatalog.js';
import {
  buildWellsFargoOfferCaptureJs,
  buildWellsFargoReadJs,
} from './wellsFargoSync.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

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

function installHook() {
  const messages = [];
  const window = {
    XMLHttpRequest: FakeXHR,
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildWellsFargoOfferCaptureJs())(window, {});
  return { window, messages };
}

function readDeals(window, messages) {
  new Function('window', 'document', buildWellsFargoReadJs())(window, {});
  return messages.at(-1);
}

function samplePayload() {
  return {
    checkSum: 'CHECKSUM-SECRET',
    availableDeals: {
      cardlyticsEligibleDeals: [{
        vendorName: 'VENDOR-SECRET',
        isActivated: false,
        merchantDealDetails: {
          merchantOfferId: 'PCTOFFER01',
          merchantName: 'Starbucks',
          dealAmount: 10,
          amountType: '%',
          shortDescription: 'Special offer',
          expirationDate: '2026-06-30',
          longDescription: 'LONG-SECRET',
          imageUrl: 'https://images.example/secret.png',
          checkSum: 'DETAIL-CHECKSUM',
        },
      }],
      activatedDeals: [],
    },
    earnedDeals: { deals: [] },
    expiredDeals: {
      deals: [{
        merchantDealDetails: {
          merchantOfferId: 'EXPIRED001',
          merchantName: 'Old Navy',
        },
      }],
    },
  };
}

test('Wells Fargo opens the sign-on page and syncs from the deals portal', () => {
  const wells = BANK_LIST.find(bank => bank.id === 'wells_fargo');
  assert.equal(wells.supported, true);
  assert.equal(wells.label, 'Wells Fargo');
  for (const id of ['capital_one', 'us_bank', 'bofa', 'bilt']) {
    assert.equal(BANK_LIST.find(bank => bank.id === id).supported, false);
  }
  assert.equal(BANK_LIST.some(bank => bank.id === 'discover'), false);
  const usBank = BANK_LIST.find(bank => bank.id === 'us_bank');
  assert.equal(usBank.label, 'US Bank');
  assert.equal(usBank.supported, false);
  assert.equal(BANK_LIST.find(bank => bank.id === 'citi').supported, true);
  const config = BANK_CONFIG.wells_fargo;
  assert.equal(
    config.url,
    'https://connect.secure.wellsfargo.com/auth/login/ulink?serviceType=dealsportal'
  );
  assert.equal(config.url.includes('web.secure.wellsfargo.com'), false);
  assert.equal(config.offersUrl, config.url);
  assert.ok(config.loginPaths.length > 0);
  assert.equal(config.loginPaths.some(path => config.url.toLowerCase().includes(path.toLowerCase())), true);

  const faq = FAQ_ITEMS.find(item => item.q === 'Which banks are supported?');
  const [supported, comingSoon] = faq.a.split('coming soon');
  assert.match(supported, /Wells Fargo/);
  assert.equal(comingSoon.includes('Wells Fargo'), false);
  assert.match(faq.a, /Capital One/);
  assert.match(faq.a, /US Bank/);
  assert.match(faq.a, /Bilt/);
  assert.equal(faq.a.includes('Discover'), false);
});

test('a missing Wells Fargo expiration is not labeled expiring soon', () => {
  const [offer] = wellsFargoRecords({
    json: {
      availableDeals: {
        cardlyticsEligibleDeals: [{
          isActivated: false,
          merchantDealDetails: {
            merchantOfferId: 'NODATE0001',
            merchantName: 'Uber',
            dealAmount: 2,
            amountType: '$',
            shortDescription: '$2 back',
          },
        }],
      },
    },
    now: NOW,
  });
  assert.equal(offer.expiryPrecision, 'unknown');
  assert.equal(formatOfferExpiry(offer), '');
});

test('reads deals from initialState when the getDeals stash is empty', () => {
  const messages = [];
  const window = {
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
    initialState: {
      metadata: {
        deals: {
          checkSum: 'CHECKSUM-SECRET',
          availableDeals: {
            cardlyticsEligibleDeals: [{
              vendorName: 'VENDOR-SECRET',
              isActivated: false,
              merchantDealDetails: {
                merchantOfferId: 'UBEROFFER1',
                merchantName: 'Uber',
                dealAmount: 10,
                amountType: '%',
                shortDescription: '10% cash back',
                expirationDate: '11/30/2026',
                imageUrl: 'https://images.example/secret.png',
              },
            }],
          },
        },
      },
    },
  };
  new Function('window', 'document', buildWellsFargoReadJs())(window, {});
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'WELLS_DEALS');
  const deal = messages[0].deals.availableDeals.cardlyticsEligibleDeals[0];
  assert.equal(deal.merchantDealDetails.merchantOfferId, 'UBEROFFER1');
  assert.equal(deal.merchantDealDetails.merchantName, 'Uber');
  assert.equal(deal.merchantDealDetails.dealAmount, 10);
  const posted = JSON.stringify(messages[0]);
  assert.equal(posted.includes('CHECKSUM-SECRET'), false);
  assert.equal(posted.includes('VENDOR-SECRET'), false);
  assert.equal(posted.includes('secret.png'), false);
  assert.equal(posted.includes('activateCLDeal'), false);
});

test('hooks getDeals on XHR and posts offer fields without the raw payload', () => {
  const { window, messages } = installHook();
  const captureJs = buildWellsFargoOfferCaptureJs();
  assert.equal(captureJs.includes('getDeals'), true);
  assert.equal(captureJs.includes('activateCLDeal'), false);

  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', '/deals-portal/as/getDeals');
  xhr.responseText = JSON.stringify(samplePayload());
  xhr.send();

  const message = readDeals(window, messages);
  assert.equal(message.type, 'WELLS_DEALS');
  assert.equal(message.deals.availableDeals.cardlyticsEligibleDeals[0].merchantDealDetails.merchantOfferId, 'PCTOFFER01');
  assert.equal(message.deals.availableDeals.cardlyticsEligibleDeals[0].merchantDealDetails.merchantName, 'Starbucks');
  const posted = JSON.stringify(message);
  for (const secret of ['CHECKSUM-SECRET', 'DETAIL-CHECKSUM', 'VENDOR-SECRET', 'LONG-SECRET', 'secret.png', 'Old Navy', 'expiredDeals']) {
    assert.equal(posted.includes(secret), false);
  }
});

test('does not capture activateCLDeal, a failed getDeals response, or an unrecognized body', async () => {
  const { window, messages } = installHook();

  const activate = new window.XMLHttpRequest();
  activate.open('POST', '/deals-portal/as/activateCLDeal');
  activate.responseText = JSON.stringify(samplePayload());
  activate.send();
  assert.equal(readDeals(window, messages).type, 'WELLS_CAPTURE_UNAVAILABLE');

  const failed = new window.XMLHttpRequest();
  failed.open('POST', '/deals-portal/as/getDeals?session=SECRETTOKEN');
  failed.status = 500;
  failed.responseText = JSON.stringify({ body: 'SECRET-BODY', availableDeals: { cardlyticsEligibleDeals: [] } });
  failed.send();
  const afterFailure = readDeals(window, messages);
  assert.equal(afterFailure.type, 'WELLS_CAPTURE_UNAVAILABLE');
  assert.equal(JSON.stringify(afterFailure).includes('SECRET'), false);

  const unrecognized = new window.XMLHttpRequest();
  unrecognized.open('GET', '/deals-portal/as/getDeals');
  unrecognized.responseText = JSON.stringify({ foo: 'SECRET-BODY' });
  unrecognized.send();
  const afterUnrecognized = readDeals(window, messages);
  assert.equal(afterUnrecognized.type, 'WELLS_CAPTURE_UNAVAILABLE');
  assert.equal(JSON.stringify(afterUnrecognized).includes('SECRET-BODY'), false);
});

test('a wrapped getDeals body becomes WELLS_DEALS with the merchant offer id', () => {
  const { window, messages } = installHook();
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', '/deals-portal/as/getDeals');
  xhr.responseText = JSON.stringify({
    checkSum: 'CHECKSUM-SECRET',
    metadata: {
      deals: {
        availableDeals: {
          cardlyticsEligibleDeals: [{
            isActivated: false,
            merchantDealDetails: {
              merchantOfferId: 'WRAPOFFER1',
              merchantName: 'Target',
              dealAmount: 5,
              amountType: '$',
              shortDescription: '$5 cash back',
              imageUrl: 'https://images.example/secret.png',
            },
          }],
        },
      },
    },
  });
  xhr.send();
  const message = readDeals(window, messages);
  assert.equal(message.type, 'WELLS_DEALS');
  assert.equal(
    message.deals.availableDeals.cardlyticsEligibleDeals[0].merchantDealDetails.merchantOfferId,
    'WRAPOFFER1'
  );
  assert.equal(message.deals.availableDeals.cardlyticsEligibleDeals[0].merchantDealDetails.merchantName, 'Target');
  const posted = JSON.stringify(message);
  assert.equal(posted.includes('CHECKSUM-SECRET'), false);
  assert.equal(posted.includes('secret.png'), false);
});

test('a getDeals body with the deals list at the top becomes WELLS_DEALS', () => {
  const { window, messages } = installHook();
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', '/deals-portal/as/getDeals');
  xhr.responseText = JSON.stringify({
    cardlyticsEligibleDeals: [{
      isActivated: false,
      merchantDealDetails: {
        merchantOfferId: '1000000002',
        merchantName: 'Tovala',
        dealAmount: 30,
        amountType: '%',
        shortDescription: '30% cash back',
      },
    }],
    activatedDeals: [],
  });
  xhr.send();
  const message = readDeals(window, messages);
  assert.equal(message.type, 'WELLS_DEALS');
  assert.equal(
    message.deals.availableDeals.cardlyticsEligibleDeals[0].merchantDealDetails.merchantName,
    'Tovala'
  );
});

test('finds a deals object that is not initialState.metadata.deals', () => {
  const messages = [];
  const window = {
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
    frames: [{
      pageModel: {
        deals: {
          checkSum: 'CHECKSUM-SECRET',
          availableDeals: {
            cardlyticsEligibleDeals: [{
              isActivated: false,
              merchantDealDetails: {
                merchantOfferId: 'FRAMEOFFER1',
                merchantName: 'Nike',
                dealAmount: 15,
                amountType: '%',
                shortDescription: '15% cash back',
              },
            }],
          },
        },
      },
    }],
  };
  new Function('window', 'document', buildWellsFargoReadJs())(window, {});
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'WELLS_DEALS');
  assert.equal(
    messages[0].deals.availableDeals.cardlyticsEligibleDeals[0].merchantDealDetails.merchantOfferId,
    'FRAMEOFFER1'
  );
  assert.equal(JSON.stringify(messages[0]).includes('CHECKSUM-SECRET'), false);
});

test('reads a rendered deal card that has a bank offer id and skips a card that does not', () => {
  const messages = [];
  function card(id, text) {
    const button = {
      innerText: '+ Activate',
      parentElement: null,
      getAttribute() { return null; },
      querySelectorAll() { return []; },
    };
    const tile = {
      innerText: text,
      attrs: id ? { 'data-merchant-offer-id': id } : {},
      parentElement: null,
      getAttribute(name) { return this.attrs[name] || null; },
      querySelectorAll() { return []; },
    };
    button.parentElement = tile;
    tile.button = button;
    return tile;
  }
  const withId = card('FLOORD0001', 'Floor & Decor 10% cash back Expires 11/25/26 Activate');
  const noId = card('', 'Tommy John 20% cash back Expires 12/31/26 Activate');
  const genericId = {
    innerText: 'Nike 5% cash back Expires 12/01/26 Activate',
    attrs: { id: 'nikeTile12345678' },
    parentElement: null,
    getAttribute(name) { return this.attrs[name] || null; },
    querySelectorAll() { return []; },
  };
  const wholeCard = {
    innerText: 'Sharper Image 10% cash back Expires 12/21/26 Activate',
    attrs: { 'data-id': '1000000001' },
    parentElement: null,
    getAttribute(name) { return this.attrs[name] || null; },
    querySelectorAll() { return []; },
  };
  const document = {
    querySelectorAll(selector) {
      if (String(selector).includes('button')) return [withId.button, noId.button, genericId, wholeCard];
      return [];
    },
  };
  const window = {
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildWellsFargoReadJs())(window, document);
  assert.equal(messages[0].type, 'WELLS_DEALS');
  const offers = messages[0].deals.availableDeals.cardlyticsEligibleDeals;
  assert.equal(offers.length, 2);
  assert.equal(offers[0].merchantDealDetails.merchantOfferId, 'FLOORD0001');
  assert.equal(offers[0].merchantDealDetails.merchantName, 'Floor & Decor');
  assert.equal(offers[0].merchantDealDetails.dealAmount, 10);
  assert.equal(offers[0].merchantDealDetails.amountType, '%');
  assert.equal(offers[0].merchantDealDetails.expirationDate, '11/25/26');
  assert.equal(offers[1].merchantDealDetails.merchantOfferId, '1000000001');
  assert.equal(offers[1].merchantDealDetails.merchantName, 'Sharper Image');
  assert.equal(offers[1].merchantDealDetails.expirationDate, '12/21/26');
  const posted = JSON.stringify(messages[0]);
  assert.equal(posted.includes('Tommy John|20|%|12/31/26'), false);
  assert.equal(posted.includes('nikeTile12345678'), false);
  assert.equal(posted.includes('Nike|5|%|12/01/26'), false);
});

test('keeps the getDeals bank offer id when a rendered card has no offer id', async () => {
  const messages = [];
  const state = { tab: 'available' };
  const noOfferId = {
    innerText: 'Tommy John 20% cash back Expires 12/31/26 Activate',
    attrs: { id: 'tommyTile12345678' },
    parentElement: null,
    getAttribute(name) { return this.attrs[name] || null; },
    querySelectorAll() { return []; },
    click() { throw new Error('deal clicked'); },
  };
  function tab(name) {
    const el = {
      innerText: name,
      attrs: { 'aria-selected': name === 'Available' ? 'true' : 'false' },
      parentElement: null,
      getAttribute(attr) { return this.attrs[attr] || null; },
      querySelectorAll() { return []; },
      click() {
        state.tab = name.toLowerCase();
        for (const other of tabs) other.attrs['aria-selected'] = other === el ? 'true' : 'false';
      },
    };
    return el;
  }
  const tabs = [tab('Available'), tab('Activated'), tab('Earned')];
  const document = {
    body: { get innerText() { return state.tab; } },
    querySelectorAll(selector) {
      const sel = String(selector);
      if (sel.includes('role="tab"')) return tabs;
      if (sel.includes('button')) return state.tab === 'available' ? [noOfferId] : [];
      return [];
    },
  };
  const window = {
    __wellsLastDeals: {
      availableDeals: {
        cardlyticsEligibleDeals: [{
          isActivated: false,
          merchantDealDetails: {
            merchantOfferId: 'BANKOFFER01',
            merchantName: 'Tommy John',
            dealAmount: 20,
            amountType: '%',
            shortDescription: '20% cash back',
            expirationDate: '12/31/26',
          },
        }],
        activatedDeals: [],
      },
      earnedDeals: { deals: [] },
    },
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildWellsFargoReadJs())(window, document);
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'WELLS_DEALS');
  assert.equal(
    messages[0].deals.availableDeals.cardlyticsEligibleDeals[0].merchantDealDetails.merchantOfferId,
    'BANKOFFER01'
  );
  const posted = JSON.stringify(messages[0]);
  assert.equal(posted.includes('Tommy John|20|%|12/31/26'), false);
  assert.equal(posted.includes('tommyTile12345678'), false);
});

test('posts capture unavailable when no rendered card has a bank offer id', () => {
  const messages = [];
  const card = {
    innerText: 'Tommy John 20% cash back Expires 12/31/26 Activate',
    attrs: { id: 'tommyTile12345678' },
    parentElement: null,
    getAttribute(name) { return this.attrs[name] || null; },
    querySelectorAll() { return []; },
  };
  const document = {
    querySelectorAll(selector) {
      if (String(selector).includes('button')) return [card];
      return [];
    },
  };
  const window = {
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildWellsFargoReadJs())(window, document);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'WELLS_CAPTURE_UNAVAILABLE');
  const posted = JSON.stringify(messages[0]);
  assert.equal(posted.includes('Tommy John|20|%|12/31/26'), false);
  assert.equal(posted.includes('tommyTile12345678'), false);
});

test('reads the activated and earned tabs and does not click a deal', async () => {
  const messages = [];
  const clicked = [];
  const state = { tab: 'available' };
  function deal(text, id) {
    return {
      innerText: text,
      attrs: { 'data-id': id },
      parentElement: null,
      getAttribute(name) { return this.attrs[name] || null; },
      querySelectorAll() { return []; },
      click() { throw new Error('deal clicked'); },
    };
  }
  const cards = {
    available: [deal('Sharper Image 10% cash back Expires 12/21/26 Activate', '1000000001')],
    activated: [deal('Little Caesars 10% cash back Expires 11/30/26 Activated', '1000000002')],
    earned: [deal('Nike 5% cash back Expires 12/01/26 Earned', '1000000003')],
  };
  function tab(name) {
    const el = {
      innerText: name,
      attrs: { 'aria-selected': name === 'Available' ? 'true' : 'false' },
      parentElement: null,
      getAttribute(name) { return this.attrs[name] || null; },
      querySelectorAll() { return []; },
      click() {
        clicked.push(name);
        state.tab = name.toLowerCase();
        for (const other of tabs) other.attrs['aria-selected'] = other === el ? 'true' : 'false';
      },
    };
    return el;
  }
  const tabs = [tab('Available'), tab('Activated'), tab('Earned')];
  const document = {
    body: { get innerText() { return state.tab; } },
    querySelectorAll(selector) {
      const sel = String(selector);
      if (sel.includes('role="tab"')) return tabs;
      if (sel.includes('button')) return cards[state.tab];
      return [];
    },
  };
  const window = {
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildWellsFargoReadJs())(window, document);
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'WELLS_DEALS');
  const eligible = messages[0].deals.availableDeals.cardlyticsEligibleDeals;
  const activated = messages[0].deals.availableDeals.activatedDeals;
  const earned = messages[0].deals.earnedDeals.deals;
  assert.equal(eligible[0].merchantDealDetails.merchantName, 'Sharper Image');
  assert.equal(eligible[0].isActivated, false);
  assert.equal(activated[0].merchantDealDetails.merchantName, 'Little Caesars');
  assert.equal(activated[0].isActivated, true);
  assert.equal(activated[0].merchantDealDetails.merchantOfferId, '1000000002');
  assert.equal(earned[0].merchantDealDetails.merchantName, 'Nike');
  assert.equal(earned[0].isActivated, true);
  assert.deepEqual(clicked, ['Activated', 'Earned', 'Available']);
});

test('an empty available list keeps activated and earned deals on their lists', async () => {
  const activatedDeal = {
    isActivated: false,
    merchantDealDetails: {
      merchantOfferId: 'ACTIVATED1',
      merchantName: 'Nike',
      dealAmount: 15,
      amountType: '%',
      shortDescription: '15% back',
      expirationDate: '2026-08-15T00:00:00.000Z',
    },
  };
  const messages = [];
  const state = { tab: 'available' };
  const activatedCard = {
    innerText: 'Nike 15% cash back Expires 08/15/26 Activated',
    attrs: { id: 'nikeTile12345678' },
    parentElement: null,
    getAttribute(name) { return this.attrs[name] || null; },
    querySelectorAll() { return []; },
    click() { throw new Error('deal clicked'); },
  };
  function tab(name) {
    const el = {
      innerText: name,
      attrs: { 'aria-selected': name === 'Available' ? 'true' : 'false' },
      parentElement: null,
      getAttribute(attr) { return this.attrs[attr] || null; },
      querySelectorAll() { return []; },
      click() {
        state.tab = name.toLowerCase();
        for (const other of tabs) other.attrs['aria-selected'] = other === el ? 'true' : 'false';
      },
    };
    return el;
  }
  const tabs = [tab('Available'), tab('Activated'), tab('Earned')];
  const cards = {
    available: [],
    activated: [activatedCard],
    earned: [],
  };
  const document = {
    body: { get innerText() { return state.tab; } },
    querySelectorAll(selector) {
      const sel = String(selector);
      if (sel.includes('role="tab"')) return tabs;
      if (sel.includes('button')) return cards[state.tab] || [];
      return [];
    },
  };
  const window = {
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
    initialState: {
      metadata: {
        deals: {
          checkSum: 'CHECKSUM-SECRET',
          availableDeals: {
            cardlyticsEligibleDeals: [],
            activatedDeals: [activatedDeal],
          },
          earnedDeals: { deals: [] },
        },
      },
    },
  };
  new Function('window', 'document', buildWellsFargoReadJs())(window, document);
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'WELLS_DEALS');
  const deals = messages[0].deals;
  assert.deepEqual(deals.availableDeals.cardlyticsEligibleDeals, []);
  assert.deepEqual(deals.earnedDeals.deals, []);
  assert.equal(deals.availableDeals.activatedDeals[0].merchantDealDetails.merchantOfferId, 'ACTIVATED1');
  assert.equal(deals.availableDeals.activatedDeals[0].isActivated, false);
  const [stored] = wellsFargoRecords({ json: deals, now: NOW });
  assert.equal(stored.bankOfferId, 'ACTIVATED1');
  assert.equal(stored.isActivated, true);
  const posted = JSON.stringify(messages[0]);
  assert.equal(posted.includes('CHECKSUM-SECRET'), false);
  assert.equal(posted.includes('nikeTile12345678'), false);

  const earnedMessages = [];
  const earnedWindow = {
    ReactNativeWebView: {
      postMessage(raw) { earnedMessages.push(JSON.parse(raw)); },
    },
    pageModel: {
      deals: {
        availableDeals: {
          cardlyticsEligibleDeals: [],
          activatedDeals: [],
        },
        earnedDeals: {
          deals: [{
            isActivated: false,
            merchantDealDetails: {
              merchantOfferId: 'EARNED0001',
              merchantName: 'Lyft',
              dealAmount: 4,
              amountType: '$',
              shortDescription: '$4 back',
            },
          }],
        },
      },
    },
  };
  new Function('window', 'document', buildWellsFargoReadJs())(earnedWindow, {});
  assert.equal(earnedMessages.length, 1);
  assert.equal(earnedMessages[0].type, 'WELLS_DEALS');
  const earnedDeals = earnedMessages[0].deals;
  assert.deepEqual(earnedDeals.availableDeals.cardlyticsEligibleDeals, []);
  assert.deepEqual(earnedDeals.availableDeals.activatedDeals, []);
  assert.equal(earnedDeals.earnedDeals.deals[0].merchantDealDetails.merchantOfferId, 'EARNED0001');
  const [earnedStored] = wellsFargoRecords({ json: earnedDeals, now: NOW });
  assert.equal(earnedStored.bankOfferId, 'EARNED0001');
  assert.equal(earnedStored.isActivated, true);
});

test('hooks getDeals on fetch and ignores a non-2xx response', async () => {
  const messages = [];
  let ok = false;
  const window = {
    XMLHttpRequest: FakeXHR,
    fetch() {
      return Promise.resolve({
        ok,
        clone() { return this; },
        text() { return Promise.resolve(JSON.stringify(samplePayload())); },
      });
    },
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildWellsFargoOfferCaptureJs())(window, {});

  await window.fetch('/deals-portal/as/getDeals');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(readDeals(window, messages).type, 'WELLS_CAPTURE_UNAVAILABLE');

  ok = true;
  await window.fetch('/deals-portal/as/getDeals');
  await new Promise(resolve => setTimeout(resolve, 0));
  const message = readDeals(window, messages);
  assert.equal(message.type, 'WELLS_DEALS');
  assert.equal(message.deals.availableDeals.cardlyticsEligibleDeals[0].merchantDealDetails.dealAmount, 10);
  assert.equal(message.deals.availableDeals.cardlyticsEligibleDeals[0].merchantDealDetails.amountType, '%');
});
