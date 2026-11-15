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

test('Wells Fargo is tappable and the sync page is the deals portal', () => {
  const wells = BANK_LIST.find(bank => bank.id === 'wells_fargo');
  assert.equal(wells.supported, true);
  assert.equal(wells.label, 'Wells Fargo');
  for (const id of ['capital_one', 'citi', 'discover', 'bofa', 'bilt']) {
    assert.equal(BANK_LIST.find(bank => bank.id === id).supported, false);
  }
  assert.equal(
    BANK_CONFIG.wells_fargo.url,
    'https://web.secure.wellsfargo.com/auth/deals-portal'
  );
  assert.deepEqual(BANK_CONFIG.wells_fargo.offersPaths, ['/auth/deals-portal']);

  const faq = FAQ_ITEMS.find(item => item.q === 'Which banks are supported?');
  const [supported, comingSoon] = faq.a.split('coming soon');
  assert.match(supported, /Wells Fargo/);
  assert.equal(comingSoon.includes('Wells Fargo'), false);
  assert.match(faq.a, /Capital One/);
  assert.match(faq.a, /Bilt/);
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
