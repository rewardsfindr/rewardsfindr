import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANK_LIST, FAQ_ITEMS } from '../../shared/constants.js';
import { CONNECT_BANK_COPY, ONBOARDING_PAGES } from '../../lib/onboardingContent.js';
import { BANK_CONFIG } from './bankConfig.js';
import { replaceCardOffers, usBankRecords } from '../../lib/catalog/deviceCatalog.js';
import {
  buildUsBankOfferCaptureJs,
  buildUsBankOffersVisibleJs,
  buildUsBankReadJs,
  stripUsBankOffers,
} from './usBankSync.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const HERE = dirname(fileURLToPath(import.meta.url));

function readRepoFile(...parts) {
  return readFileSync(join(HERE, ...parts), 'utf8');
}

function loadFixture() {
  return JSON.parse(readFileSync(
    join(HERE, 'fixtures', 'us-bank-offers-fixture-redacted.json'),
    'utf8',
  ));
}

function loadFixtureWithSecrets() {
  const fixture = loadFixture();
  return {
    ...fixture,
    requestId: 'REQUEST-SECRET',
    sessionTokenId: 'SESSION-SECRET',
    data: {
      ...fixture.data,
      getInsights: {
        ...fixture.data.getInsights,
        insights: (fixture.data.getInsights.insights || []).map((insight) => ({
          ...insight,
          cardDetails: {
            ...insight.cardDetails,
            ads: (insight.cardDetails?.ads || []).map((item) => ({
              ...item,
              adServeToken: 'ADSERVE-SECRET',
              ad: {
                ...item.ad,
                midAccountToken: 'MID-SECRET',
                assets: {
                  ...item.ad?.assets,
                  images: [{ url: 'https://cdn.example/secret.png' }],
                  copy: {
                    ...item.ad?.assets?.copy,
                    value: {
                      ...item.ad?.assets?.copy?.value,
                      marketingCopy: '<p>LONG-SECRET</p>',
                      termsAndConditions: '<p>TERMS-SECRET</p>',
                      ctaUrl: 'https://l.cardlytics.com?token=CTA-SECRET',
                    },
                  },
                },
              },
            })),
          },
        })),
      },
    },
  };
}

class FakeXHR {
  constructor() {
    this.status = 200;
    this.responseText = '';
    this.listeners = {};
  }

  open(_method, url) { this.url = url; }

  send(body) {
    this.body = body;
    (this.listeners.load || []).forEach((listener) => listener());
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
  new Function('window', 'document', buildUsBankOfferCaptureJs())(window, {});
  return { window, messages };
}

function readOffers(window, messages) {
  new Function('window', 'document', buildUsBankReadJs())(window, {});
  return messages.at(-1);
}

test('US Bank opens Cash Back Deals and is marked supported', () => {
  const usBank = BANK_LIST.find((bank) => bank.id === 'us_bank');
  assert.equal(usBank.supported, true);
  assert.equal(usBank.label, 'US Bank');
  assert.equal(BANK_LIST.some((bank) => bank.id === 'discover'), false);
  for (const id of ['capital_one', 'bofa', 'bilt']) {
    assert.equal(BANK_LIST.find((bank) => bank.id === id).supported, false);
  }
  const config = BANK_CONFIG.us_bank;
  assert.equal(
    config.url,
    'https://onlinebanking.usbank.com/digital/servicing/dominjection/cashback-deals',
  );
  assert.equal(config.offersUrl, config.url);
  assert.ok(config.loginPaths.some((path) => path.includes('/auth/login')));
  assert.ok(config.offersPaths.some((path) => config.url.toLowerCase().includes(path.toLowerCase())));

  const faq = FAQ_ITEMS.find((item) => item.q === 'Which banks are supported?');
  const [supported, comingSoon] = faq.a.split('coming soon');
  assert.match(supported, /US Bank/);
  assert.equal(comingSoon.includes('US Bank'), false);
  assert.match(ONBOARDING_PAGES[1].body, /US Bank/);
  assert.equal(CONNECT_BANK_COPY.footnote.includes('US Bank'), false);
});

test('home BankGrid treats supported US Bank as tappable (+ Add), not Coming Soon', () => {
  const usBank = BANK_LIST.find((bank) => bank.id === 'us_bank');
  assert.equal(usBank.supported, true);
  const syncingBank = null;
  const disabled = !usBank.supported || syncingBank === usBank.id;
  assert.equal(disabled, false);
  assert.equal(usBank.supported ? '+ Add' : 'Coming Soon', '+ Add');
});

test('SyncWebView wires US Bank capture/read/save the same way as Wells Fargo', () => {
  const syncSource = readRepoFile('..', 'SyncWebView.js');
  assert.match(syncSource, /buildUsBankOfferCaptureJs/);
  assert.match(syncSource, /buildUsBankOffersVisibleJs/);
  assert.match(syncSource, /buildUsBankReadJs/);
  assert.match(syncSource, /bank === 'us_bank'/);
  assert.match(syncSource, /US_BANK_ON_OFFERS/);
  assert.match(syncSource, /US_BANK_CAPTURE_UNAVAILABLE/);
  assert.match(syncSource, /US_BANK_OFFERS/);
  assert.match(syncSource, /bank: 'us_bank'/);
  assert.equal(typeof buildUsBankOffersVisibleJs(), 'string');
  assert.match(buildUsBankOffersVisibleJs(), /US_BANK_ON_OFFERS/);
});

test('stripUsBankOffers keeps offer fields and strips tokens and tracking', () => {
  const fixture = loadFixtureWithSecrets();
  const stripped = stripUsBankOffers(fixture);
  assert.ok(stripped.ads.length >= 4);
  const chevron = stripped.ads.find((ad) => ad.offerId === '1000399917');
  assert.equal(chevron.merchantName, 'Chevron');
  assert.equal(chevron.activationState, 'SERVED');
  assert.equal(chevron.rewardType, 'PERCENT_AMOUNT_PURCHASE');
  assert.equal(chevron.rewardAmount, 2);
  const bonus = stripped.ads.find((ad) => ad.offerId === '1000405330');
  assert.equal(bonus.merchantName, 'Bonus Days');
  assert.equal(bonus.activationState, 'ACTIVATED');
  assert.match(bonus.headline, /2x cash back/i);
  const posted = JSON.stringify(stripped);
  for (const secret of [
    'REQUEST-SECRET', 'SESSION-SECRET', 'ADSERVE-SECRET', 'MID-SECRET',
    'CTA-SECRET', 'LONG-SECRET', 'TERMS-SECRET', 'cdn.example',
  ]) {
    assert.equal(posted.includes(secret), false);
  }
});

test('hooks getInsights / v2 XHR and posts fields without secrets', () => {
  const { window, messages } = installHook();
  const fixture = loadFixtureWithSecrets();
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', 'https://onlinebanking.usbank.com/graphql/v2');
  xhr.responseText = JSON.stringify(fixture);
  xhr.send(JSON.stringify({ operationName: 'getInsights', useCaseId: 'CardLytics' }));
  const message = readOffers(window, messages);
  assert.equal(message.type, 'US_BANK_OFFERS');
  assert.ok(message.offers.ads.length >= 4);
  const posted = JSON.stringify(message);
  assert.equal(posted.includes('SESSION-SECRET'), false);
  assert.equal(posted.includes('ADSERVE-SECRET'), false);
});

test('does not capture a failed response or an unrecognized body', () => {
  const { window, messages } = installHook();
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', 'https://onlinebanking.usbank.com/graphql/v2');
  xhr.status = 500;
  xhr.responseText = JSON.stringify(loadFixture());
  xhr.send('{"operationName":"getInsights"}');
  assert.equal(window.__usBankLastOffers, undefined);

  xhr.status = 200;
  xhr.responseText = JSON.stringify({ status: 'ok', hello: 'world' });
  xhr.send('{"operationName":"getInsights"}');
  const message = readOffers(window, messages);
  assert.equal(message.type, 'US_BANK_CAPTURE_UNAVAILABLE');
});

test('a later shorter getInsights list does not drop offers already captured', () => {
  const { window, messages } = installHook();
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', 'https://onlinebanking.usbank.com/graphql/v2');
  xhr.responseText = JSON.stringify(loadFixture());
  xhr.send(JSON.stringify({ operationName: 'getInsights', useCaseId: 'CardLytics' }));

  const shorter = {
    data: {
      getInsights: {
        insights: [{
          isDashboardInsight: true,
          cardDetails: {
            ads: [{
              offerId: '1000399917',
              ad: {
                merchantName: 'Chevron',
                activationState: 'ACTIVATED',
                endDate: '2027-01-01T04:59:59Z',
                reward: { rewardAmount: 2, rewardType: 'PERCENT_AMOUNT_PURCHASE' },
                assets: { copy: { value: { headline: '2% cash back' } } },
              },
            }],
          },
        }],
      },
    },
  };
  const xhr2 = new window.XMLHttpRequest();
  xhr2.open('POST', 'https://onlinebanking.usbank.com/graphql/v2');
  xhr2.responseText = JSON.stringify(shorter);
  xhr2.send(JSON.stringify({ operationName: 'getInsights' }));

  const message = readOffers(window, messages);
  assert.equal(message.type, 'US_BANK_OFFERS');
  const ids = message.offers.ads.map((ad) => ad.offerId);
  assert.ok(ids.includes('1000405330'));
  assert.ok(ids.includes('1000395658'));
  assert.ok(ids.includes('1000399083'));
  const chevron = message.offers.ads.find((ad) => ad.offerId === '1000399917');
  assert.equal(chevron.activationState, 'ACTIVATED');
  assert.equal(chevron.rewardAmount, 2);

  const records = usBankRecords({ json: message.offers, now: NOW });
  const existing = [
    { id: 'u', bank: 'us_bank', cardName: 'US Bank', phase: '', merchantName: 'Old US' },
  ];
  const next = replaceCardOffers(existing, {
    bank: 'us_bank',
    cardName: 'US Bank',
    phase: '',
    records,
  });
  const kept = next.filter((offer) => offer.bank === 'us_bank').map((offer) => offer.merchantName);
  assert.equal(kept.includes('Old US'), false);
  assert.equal(kept.includes('eBay'), true);
  assert.equal(kept.includes('YouTube TV'), true);
  assert.equal(kept.includes('Bonus Days'), true);
});

test('a v2 payload that is not CardLytics offers does not replace the deals list', () => {
  const { window, messages } = installHook();
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', 'https://onlinebanking.usbank.com/graphql/v2');
  xhr.responseText = JSON.stringify(loadFixture());
  xhr.send(JSON.stringify({ operationName: 'getInsights' }));

  const promos = [];
  for (let i = 0; i < 6; i += 1) {
    promos.push({
      offerId: `PROMO-${i}`,
      merchantName: `Promo ${i}`,
      headline: 'Earn $300',
      activationState: 'SERVED',
      rewardType: 'FIXED_AMOUNT_PURCHASE',
      rewardAmount: 300,
    });
  }
  const xhr2 = new window.XMLHttpRequest();
  xhr2.open('POST', 'https://onlinebanking.usbank.com/api/v2/messages');
  xhr2.responseText = JSON.stringify({ ads: promos });
  xhr2.send('{}');

  const message = readOffers(window, messages);
  const ids = message.offers.ads.map((ad) => ad.offerId);
  assert.equal(ids.some((id) => String(id).startsWith('PROMO-')), false);
  assert.ok(ids.includes('1000399917'));
});

test('an empty getInsights payload does not clear offers already captured', () => {
  const { window, messages } = installHook();
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', 'https://onlinebanking.usbank.com/graphql/v2');
  xhr.responseText = JSON.stringify(loadFixture());
  xhr.send(JSON.stringify({ operationName: 'getInsights' }));

  const xhr2 = new window.XMLHttpRequest();
  xhr2.open('POST', 'https://onlinebanking.usbank.com/graphql/v2');
  xhr2.responseText = JSON.stringify({
    data: { getInsights: { insights: [{ cardDetails: { ads: [] } }] } },
  });
  xhr2.send(JSON.stringify({ operationName: 'getInsights' }));

  const message = readOffers(window, messages);
  assert.equal(message.type, 'US_BANK_OFFERS');
  assert.ok(message.offers.ads.length >= 4);
});

test('an empty ads list posts capture unavailable and does not look like a wipe', () => {
  const { window, messages } = installHook();
  window.__usBankLastOffers = { ads: [] };
  const message = readOffers(window, messages);
  assert.equal(message.type, 'US_BANK_CAPTURE_UNAVAILABLE');
});

test('maps the redacted fixture into us_bank catalog rows and activationState', () => {
  const stripped = stripUsBankOffers(loadFixture());
  const records = usBankRecords({ json: stripped, now: NOW });
  assert.equal(records.length, 4);
  assert.equal(records[0].bank, 'us_bank');
  assert.equal(records[0].cardName, 'US Bank');
  const bonus = records.find((offer) => offer.bankOfferId === '1000405330');
  assert.equal(bonus.isActivated, true);
  assert.equal(bonus.cashbackAmount, 0);
  assert.match(bonus.offerDescription, /2x cash back/i);
  const chevron = records.find((offer) => offer.bankOfferId === '1000399917');
  assert.equal(chevron.isActivated, false);
  assert.equal(chevron.cashbackType, 'percent');
  assert.equal(chevron.cashbackAmount, 2);
  assert.equal(chevron.expiryDate, '2027-01-01T04:59:59.000Z');
  const youtube = records.find((offer) => offer.bankOfferId === '1000399083');
  assert.equal(youtube.cashbackType, 'fixed');
  assert.equal(youtube.cashbackAmount, 20);
  assert.equal(youtube.minimumSpend, 39.99);
});

test('replaceCardOffers for US Bank replaces one card and leaves other banks', () => {
  const existing = [
    { id: 'c', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
    { id: 'w', bank: 'wells_fargo', cardName: 'Wells Fargo', phase: '', merchantName: 'Old Shop' },
    { id: 'u', bank: 'us_bank', cardName: 'US Bank', phase: '', merchantName: 'Old US' },
  ];
  const records = usBankRecords({
    json: stripUsBankOffers(loadFixture()),
    now: NOW,
  });
  const next = replaceCardOffers(existing, {
    bank: 'us_bank',
    cardName: 'US Bank',
    phase: '',
    records,
  });
  assert.equal(next.some((offer) => offer.bank === 'chase' && offer.merchantName === 'Nike'), true);
  assert.equal(next.some((offer) => offer.bank === 'wells_fargo'), true);
  assert.equal(next.some((offer) => offer.bank === 'us_bank' && offer.merchantName === 'Old US'), false);
  assert.equal(next.filter((offer) => offer.bank === 'us_bank').length, 4);
});

test('hooks getInsights on fetch and ignores a non-2xx response', async () => {
  const messages = [];
  const fixture = loadFixture();
  const window = {
    fetch(input) {
      const url = typeof input === 'string' ? input : input.url;
      return Promise.resolve({
        ok: url.includes('ok'),
        clone() {
          return {
            text() { return Promise.resolve(JSON.stringify(fixture)); },
          };
        },
      });
    },
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildUsBankOfferCaptureJs())(window, {});
  await window.fetch('https://onlinebanking.usbank.com/graphql/v2-fail');
  assert.equal(window.__usBankLastOffers, undefined);
  await window.fetch('https://onlinebanking.usbank.com/graphql/v2-ok', {
    body: '{"operationName":"getInsights"}',
  });
  // give clone().text() a tick
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(window.__usBankLastOffers?.ads?.length >= 4);
});
