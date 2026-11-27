import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BANK_LIST, FAQ_ITEMS } from '../../shared/constants.js';
import { BANK_CONFIG } from './bankConfig.js';
import { CONNECT_BANK_COPY, ONBOARDING_PAGES } from '../../lib/onboardingContent.js';
import { formatOfferExpiry } from '../../lib/savedOffers.js';
import { citiRecords, replaceCardOffers } from '../../lib/catalog/deviceCatalog.js';
import {
  buildCitiOfferCaptureJs,
  buildCitiOffersVisibleJs,
  buildCitiForceLoginJs,
  buildCitiReadJs,
  buildCitiCaptureWhenReadyJs,
  CITI_CAPTURE_READY_TIMEOUT_MS,
  CITI_CAPTURE_POLL_MS,
  CITI_LOGIN_URL,
  CITI_OFFERS_URL,
  stripCitiOffers,
} from './citiSync.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const HERE = dirname(fileURLToPath(import.meta.url));
const STORE_FIXTURE_PATHS = [
  '/cursor/stores/self/docs/citi-offers-fixture-redacted.json',
  '/cursor/stores/bc-d795c680-e7e9-489b-996e-4127198403b2/docs/citi-offers-fixture-redacted.json',
];

function readRepoFile(...parts) {
  return readFileSync(join(HERE, ...parts), 'utf8');
}

function baseFixture() {
  return {
    cardArtDetails: [
      {
        displayProductName: 'Citi Strata® Card - 4832',
        cardType: 'CREDIT',
        primaryAccountFlag: true,
        creditPid: '408',
      },
      {
        displayProductName: 'Citi Debit - 9999',
        cardType: 'DEBIT',
        primaryAccountFlag: false,
      },
    ],
    merchantOffers: [
      {
        displayOffersCategory: 'Featured',
        offers: [
          {
            offerId: '8cfb0cc0-0ba6-41ec-bbd5-c3280862a6e0',
            offerStatus: 'AVAILABLE',
            merchantCategory: 'HEALTHANDWELLNESS',
            merchantName: 'CVS',
            offerEndDate: 'Nov 30, 2026',
            offerExpiryDays: '14d left',
            offerDiscountType: 'ABSOLUTE',
            offerTitle: '$5 Back',
            redemptionType: 'Online_instore',
          },
          {
            offerId: '15d21ca1-170a-4758-b7a3-02220186aeb3',
            offerStatus: 'ENROLLED',
            merchantCategory: 'DINING',
            merchantName: 'Starbucks',
            offerEndDate: 'Nov 30, 2026',
            offerExpiryDays: '14d left',
            offerDiscountType: 'ABSOLUTE',
            offerTitle: '$5 Back',
            redemptionType: 'Online',
          },
          {
            offerId: 'RN-311510',
            offerStatus: 'AVAILABLE',
            merchantCategory: 'DINING',
            merchantName: 'Tea Monks - Escondido',
            offerEndDate: 'Dec 31, 2026',
            offerExpiryDays: '45d left',
            offerDiscountType: 'PERCENTAGE',
            offerTitle: '5% Back',
            redemptionType: 'Instore',
          },
        ],
      },
    ],
    totalMerchantAwards: { awardAmount: '0.00', rewardProgramId: 'DOLLARS' },
  };
}

function loadFixture() {
  for (const path of STORE_FIXTURE_PATHS) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      if (parsed && Array.isArray(parsed.merchantOffers)) return parsed;
    } catch {
      // try next path
    }
  }
  return baseFixture();
}

function loadFixtureWithSecrets() {
  const fixture = loadFixture();
  return {
    ...fixture,
    accountId: 'ACCOUNT-SECRET',
    cltId: 'CLT-SECRET',
    dctId: 'DCT-SECRET',
    cardArtDetails: (fixture.cardArtDetails || []).map((card, index) => ({
      ...card,
      accountId: 'ACCOUNT-SECRET',
      cltId: 'CLT-SECRET',
      dctId: 'DCT-SECRET',
      ...(index === 0 ? {} : {}),
    })).concat(fixture.cardArtDetails?.some(card => String(card.cardType).toUpperCase() === 'DEBIT')
      ? []
      : [{ displayProductName: 'Citi Debit - 9999', cardType: 'DEBIT', primaryAccountFlag: false }]),
    merchantOffers: (fixture.merchantOffers || []).map(group => ({
      ...group,
      offers: (group.offers || []).map(offer => ({
        ...offer,
        accountId: 'OFFER-ACCOUNT-SECRET',
      })),
    })),
  };
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

function installHook() {
  const messages = [];
  const window = {
    XMLHttpRequest: FakeXHR,
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildCitiOfferCaptureJs())(window, {});
  return { window, messages };
}

function readOffers(window, messages) {
  new Function('window', 'document', buildCitiReadJs())(window, {});
  return messages.at(-1);
}

test('Citi opens Merchant Offers and is marked supported', () => {
  const citi = BANK_LIST.find(bank => bank.id === 'citi');
  assert.equal(citi.supported, true);
  assert.equal(citi.label, 'Citi');
  for (const id of ['capital_one', 'bofa', 'bilt']) {
    assert.equal(BANK_LIST.find(bank => bank.id === id).supported, false);
  }
  assert.equal(BANK_LIST.some(bank => bank.id === 'discover'), false);
  assert.equal(BANK_LIST.find(bank => bank.id === 'us_bank').supported, true);
  const config = BANK_CONFIG.citi;
  assert.equal(
    config.url,
    'https://online.citi.com/US/nga/products-offers/merchantoffers'
  );
  assert.equal(config.offersUrl, config.url);
  assert.equal(config.offersUrl, CITI_OFFERS_URL);
  assert.equal(config.loginUrl, CITI_LOGIN_URL);
  assert.equal(config.loginUrl, 'https://online.citi.com/US/ag/signon');
  assert.ok(config.loginPaths.length > 0);
  assert.equal(
    config.offersPaths.some(path => config.url.toLowerCase().includes(path.toLowerCase())),
    true
  );

  const faq = FAQ_ITEMS.find(item => item.q === 'Which banks are supported?');
  const [supported, comingSoon] = faq.a.split('coming soon');
  assert.match(supported, /Citi/);
  assert.equal(comingSoon.includes('Citi'), false);
  assert.match(ONBOARDING_PAGES[1].body, /Citi/);
  assert.equal(CONNECT_BANK_COPY.footnote.includes('Citi'), false);
});

test('home BankGrid treats supported Citi as tappable (+ Add), not Coming Soon', () => {
  const citi = BANK_LIST.find(bank => bank.id === 'citi');
  assert.equal(citi.supported, true);
  assert.equal(citi.supported ? '+ Add' : 'Coming Soon', '+ Add');

  const bankGridSource = readRepoFile('..', 'BankGrid.js');
  assert.match(bankGridSource, /visibleHomeBanks/);
  assert.match(bankGridSource, /onSyncBankPress/);
  assert.match(bankGridSource, /Sync Bank/);
  assert.match(bankGridSource, /onSyncPress\(bank\.id\)/);
  assert.equal(bankGridSource.includes('Coming Soon'), false);

  const homeBanksSource = readRepoFile('..', 'homeBanks.js');
  assert.match(homeBanksSource, /pickerBanks/);
  assert.equal(homeBanksSource.includes("id === 'citi'") || homeBanksSource.includes('BANK_LIST'), true);

  const homeSource = readRepoFile('..', '..', 'app', 'index.js');
  assert.match(homeSource, /BankGrid/);
  assert.match(homeSource, /BankPickerSheet/);
  assert.match(homeSource, /SyncWebView/);
  assert.match(homeSource, /onSyncPress=\{setSyncBank\}/);
  assert.match(homeSource, /bank=\{syncBank\}/);
});

test('SyncWebView wires Citi capture/read/save the same way as Wells Fargo', () => {
  const syncSource = readRepoFile('..', 'SyncWebView.js');
  assert.match(syncSource, /buildCitiOfferCaptureJs/);
  assert.match(syncSource, /buildCitiOffersVisibleJs/);
  assert.match(syncSource, /buildCitiReadJs/);
  assert.match(syncSource, /buildCitiCaptureWhenReadyJs/);
  assert.match(syncSource, /CITI_CAPTURE_READY_TIMEOUT_MS/);
  assert.match(syncSource, /bank === 'citi'/);
  assert.match(syncSource, /CITI_ON_OFFERS/);
  assert.match(syncSource, /CITI_CAPTURE_UNAVAILABLE/);
  assert.match(syncSource, /CITI_OFFERS/);
  assert.match(syncSource, /bank: 'citi'/);
  assert.equal(typeof buildCitiOffersVisibleJs(), 'string');
  assert.match(buildCitiOffersVisibleJs(), /CITI_ON_OFFERS/);
  assert.equal(BANK_CONFIG.citi.url, 'https://online.citi.com/US/nga/products-offers/merchantoffers');
  const startCitiBlock = syncSource.match(
    /const startCitiCapture = \(\) => \{[\s\S]*?startingCitiRef\.current = false;\r?\n  \};/,
  )?.[0] || '';
  assert.match(startCitiBlock, /buildCitiCaptureWhenReadyJs/);
  assert.doesNotMatch(startCitiBlock, /buildCitiReadJs\(\)/);
});

test('capture-when-ready posts as soon as the merchant-offers stash lands', async () => {
  assert.ok(CITI_CAPTURE_POLL_MS <= 150);
  assert.ok(CITI_CAPTURE_READY_TIMEOUT_MS >= 2000);

  const messages = [];
  const window = {
    __citiLastOffers: null,
    ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
  };
  new Function('window', 'document', buildCitiCaptureWhenReadyJs(500, 40))(window, {});
  await new Promise(r => setTimeout(r, 80));
  assert.equal(messages.length, 0);

  window.__citiLastOffers = {
    selectedCard: { displayProductName: 'Citi Strata® Card - 4832', cardType: 'CREDIT' },
    merchantOffers: [{
      displayOffersCategory: 'Featured',
      offers: [{
        offerId: 'READYOFFER1',
        merchantName: 'Ready Cafe',
        offerTitle: '5% Back',
        offerStatus: 'AVAILABLE',
        offerDiscountType: 'PERCENT',
        offerEndDate: '',
        offerExpiryDays: '',
      }],
    }],
  };
  await new Promise(r => setTimeout(r, 120));
  assert.equal(messages.at(-1)?.type, 'CITI_OFFERS');
  assert.equal(
    messages.at(-1)?.offers.merchantOffers[0].offers[0].offerId,
    'READYOFFER1',
  );
});

test('capture-when-ready times out with CITI_CAPTURE_UNAVAILABLE when stash never lands', async () => {
  const messages = [];
  const window = {
    ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
  };
  new Function('window', 'document', buildCitiCaptureWhenReadyJs(120, 40))(window, {});
  await new Promise(r => setTimeout(r, 220));
  assert.equal(messages.at(-1)?.type, 'CITI_CAPTURE_UNAVAILABLE');
});

test('Citi offers-visible posts honest signedIn (never force true from URL alone)', () => {
  const visibleJs = buildCitiOffersVisibleJs();
  assert.match(visibleJs, /signedIn:\s*!!signedIn/);
  assert.doesNotMatch(visibleJs, /signedIn:\s*signedIn\s*\|\|\s*onOffers/);
  assert.match(visibleJs, /sign\\s\*off/i);
  assert.match(visibleJs, /CITI_PAGE_STATE/);
  assert.match(visibleJs, /onLoginForm/);
  assert.match(visibleJs, /expired/);
  // SyncWebView auto path must require signedIn === true before start.
  const syncSource = readRepoFile('..', 'SyncWebView.js');
  assert.match(syncSource, /shouldAutoStartCiti/);
  assert.match(syncSource, /startCitiCapture/);
  assert.match(syncSource, /data\.signedIn === true/);
  // AUTH re-probe re-injects visibility until Sign Off chrome is seen.
  assert.match(syncSource, /buildCitiOffersVisibleJs\(\)/);
  assert.match(
    syncSource,
    /Citi SPA can paint merchantoffers before Sign Off[\s\S]*?AUTH_REPROBE_MS/,
  );
});

test('pageNotFound / signed-out shell marks expired; login form and Sign Off do not', () => {
  function probe(href, bodyText) {
    const messages = [];
    const window = {
      location: { href },
      ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
    };
    const document = { body: { innerText: bodyText } };
    new Function('window', 'document', buildCitiOffersVisibleJs())(window, document);
    return messages.find(m => m.type === 'CITI_PAGE_STATE');
  }

  const dead = probe(
    'https://online.citi.com/US/ag/pageNotFound',
    'Hmm... looks like that information isn\'t here. Sign On Credit Cards Banking',
  );
  assert.equal(dead.expired, true);
  assert.equal(dead.signedIn, false);
  assert.equal(dead.onLoginForm, false);
  assert.equal(dead.onOffers, false);

  const staleOffers = probe(
    'https://online.citi.com/US/nga/products-offers/merchantoffers',
    'Sign On\nMerchant Offers\nProducts',
  );
  assert.equal(staleOffers.onOffers, true);
  assert.equal(staleOffers.signedIn, false);
  assert.equal(staleOffers.expired, true);
  assert.equal(staleOffers.onLoginForm, false);

  const loginForm = probe(
    'https://online.citi.com/US/ag/signon',
    'User ID\nPassword\nRemember me\nSign On\nForgot User ID or Password',
  );
  assert.equal(loginForm.onLoginForm, true);
  assert.equal(loginForm.expired, false);
  assert.equal(loginForm.signedIn, false);

  const happy = probe(
    'https://online.citi.com/US/nga/products-offers/merchantoffers',
    'Sign Off\nMerchant Offers\nFeatured\nCVS',
  );
  assert.equal(happy.onOffers, true);
  assert.equal(happy.signedIn, true);
  assert.equal(happy.expired, false);
  assert.equal(happy.onLoginForm, false);
});

test('force-login clears storage best-effort and navigates to official sign-on', () => {
  assert.equal(CITI_LOGIN_URL, 'https://online.citi.com/US/ag/signon');
  const forceJs = buildCitiForceLoginJs();
  assert.match(forceJs, /localStorage/);
  assert.match(forceJs, /sessionStorage/);
  assert.match(forceJs, /online\.citi\.com\/US\/ag\/signon/);

  let replaced = '';
  let clearedLocal = false;
  let clearedSession = false;
  const window = {
    localStorage: { clear() { clearedLocal = true; } },
    sessionStorage: { clear() { clearedSession = true; } },
    location: {
      replace(url) { replaced = url; },
      href: 'https://online.citi.com/US/ag/pageNotFound',
    },
  };
  const document = { cookie: 'a=1; b=2' };
  new Function('window', 'document', buildCitiForceLoginJs(CITI_LOGIN_URL))(window, document);
  assert.equal(clearedLocal, true);
  assert.equal(clearedSession, true);
  assert.equal(replaced, CITI_LOGIN_URL);
});

test('stripCitiOffers keeps offer fields and the selected credit card only', () => {
  const fixture = loadFixtureWithSecrets();
  const stripped = stripCitiOffers(fixture);
  assert.equal(stripped.selectedCard.displayProductName, 'Citi Strata® Card - 4832');
  assert.equal(stripped.selectedCard.cardType, 'CREDIT');
  assert.ok(stripped.merchantOffers[0].offers.length >= 3);
  const posted = JSON.stringify(stripped);
  for (const secret of ['ACCOUNT-SECRET', 'CLT-SECRET', 'DCT-SECRET', 'OFFER-ACCOUNT-SECRET', 'totalMerchantAwards', 'creditPid']) {
    assert.equal(posted.includes(secret), false);
  }
  assert.equal(posted.includes('Citi Debit'), false);
});

test('a missing Citi end date is not labeled expiring soon', () => {
  const [offer] = citiRecords({
    cardName: 'Citi Strata® Card',
    json: {
      merchantOffers: [{
        displayOffersCategory: 'Featured',
        offers: [{
          offerId: 'NODATE0001',
          offerStatus: 'AVAILABLE',
          merchantName: 'Uber',
          offerDiscountType: 'ABSOLUTE',
          offerTitle: '$2 Back',
        }],
      }],
    },
    now: NOW,
  });
  assert.equal(offer.expiryPrecision, 'unknown');
  assert.equal(formatOfferExpiry(offer), '');
});

test('hooks merchant-offers XHR and posts fields without secrets', () => {
  const { window, messages } = installHook();
  const fixture = loadFixtureWithSecrets();
  const xhr = new window.XMLHttpRequest();
  xhr.open('GET', '/US/nga/products-offers/merchantoffers/api');
  xhr.responseText = JSON.stringify(fixture);
  xhr.send();

  const message = readOffers(window, messages);
  assert.equal(message.type, 'CITI_OFFERS');
  assert.equal(message.offers.selectedCard.displayProductName, 'Citi Strata® Card - 4832');
  assert.equal(message.offers.merchantOffers[0].offers[0].offerId, '8cfb0cc0-0ba6-41ec-bbd5-c3280862a6e0');
  const posted = JSON.stringify(message);
  for (const secret of ['ACCOUNT-SECRET', 'CLT-SECRET', 'DCT-SECRET', 'creditPid', 'totalMerchantAwards']) {
    assert.equal(posted.includes(secret), false);
  }
  assert.equal(buildCitiOfferCaptureJs().toLowerCase().includes('activate'), false);
});

test('does not capture a failed response or an unrecognized body', () => {
  const { window, messages } = installHook();

  const failed = new window.XMLHttpRequest();
  failed.open('GET', '/US/nga/products-offers/merchantoffers?token=SECRETTOKEN');
  failed.status = 500;
  failed.responseText = JSON.stringify({ body: 'SECRET-BODY', merchantOffers: [] });
  failed.send();
  const afterFailure = readOffers(window, messages);
  assert.equal(afterFailure.type, 'CITI_CAPTURE_UNAVAILABLE');
  assert.equal(JSON.stringify(afterFailure).includes('SECRET'), false);

  const unrecognized = new window.XMLHttpRequest();
  unrecognized.open('GET', '/US/nga/products-offers/merchantoffers');
  unrecognized.responseText = JSON.stringify({ foo: 'SECRET-BODY' });
  unrecognized.send();
  const afterUnrecognized = readOffers(window, messages);
  assert.equal(afterUnrecognized.type, 'CITI_CAPTURE_UNAVAILABLE');
  assert.equal(JSON.stringify(afterUnrecognized).includes('SECRET-BODY'), false);
});

test('an empty merchantOffers list posts capture unavailable and does not look like a wipe', () => {
  const { window, messages } = installHook();
  const xhr = new window.XMLHttpRequest();
  xhr.open('GET', '/US/nga/products-offers/merchantoffers/api');
  xhr.responseText = JSON.stringify({
    cardArtDetails: [{
      displayProductName: 'Citi Strata® Card - 4832',
      cardType: 'CREDIT',
      primaryAccountFlag: true,
    }],
    merchantOffers: [],
  });
  xhr.send();
  const empty = readOffers(window, messages);
  assert.equal(empty.type, 'CITI_CAPTURE_UNAVAILABLE');

  const emptyGroups = [];
  const window2 = {
    __citiLastOffers: {
      selectedCard: { displayProductName: 'Citi Strata® Card - 4832', cardType: 'CREDIT' },
      merchantOffers: [
        { displayOffersCategory: 'Featured', offers: [] },
        { displayOffersCategory: 'Dining', offers: [] },
      ],
    },
    ReactNativeWebView: {
      postMessage(raw) { emptyGroups.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildCitiReadJs())(window2, {});
  assert.equal(emptyGroups.length, 1);
  assert.equal(emptyGroups[0].type, 'CITI_CAPTURE_UNAVAILABLE');
});

test('reads a stashed merchantOffers list from the page when the hook is empty', () => {
  const messages = [];
  const fixture = stripCitiOffers(loadFixture());
  const window = {
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
    pageModel: {
      payload: {
        accountId: 'ACCOUNT-SECRET',
        merchantOffers: fixture.merchantOffers,
        selectedCard: fixture.selectedCard,
      },
    },
  };
  // Rehydrate as raw shape the unwrap walk expects
  window.pageModel.payload = {
    accountId: 'ACCOUNT-SECRET',
    cardArtDetails: [{
      displayProductName: 'Citi Strata® Card - 4832',
      cardType: 'CREDIT',
      primaryAccountFlag: true,
      accountId: 'ACCOUNT-SECRET',
    }],
    merchantOffers: fixture.merchantOffers,
  };
  new Function('window', 'document', buildCitiReadJs())(window, {});
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'CITI_OFFERS');
  assert.equal(messages[0].offers.merchantOffers[0].offers[0].merchantName, 'CVS');
  assert.equal(JSON.stringify(messages[0]).includes('ACCOUNT-SECRET'), false);
});

test('maps the redacted fixture into citi catalog rows and dedupes offerId', () => {
  const stripped = stripCitiOffers(loadFixture());
  // Add a duplicate category entry like the live payload
  stripped.merchantOffers.push({
    displayOffersCategory: 'Dining',
    offers: [stripped.merchantOffers[0].offers[1]],
  });
  const records = citiRecords({
    cardName: 'Citi Strata® Card',
    cardLast4: '4832',
    json: stripped,
    now: NOW,
  });
  assert.equal(records.length, 3);
  assert.equal(records.filter(offer => offer.bankOfferId === '15d21ca1-170a-4758-b7a3-02220186aeb3').length, 1);
  const enrolled = records.find(offer => offer.merchantName === 'Starbucks');
  assert.equal(enrolled.isActivated, true);
  assert.equal(enrolled.bank, 'citi');
  assert.equal(enrolled.cardName, 'Citi Strata® Card');
  assert.equal(enrolled.cashbackAmount, 5);
  assert.equal(enrolled.cashbackType, 'fixed');
  const percent = records.find(offer => offer.merchantName === 'Tea Monks - Escondido');
  assert.equal(percent.cashbackAmount, 5);
  assert.equal(percent.cashbackType, 'percent');
  assert.equal(percent.expiryDate, '2026-12-31T00:00:00.000Z');
  assert.equal(percent.isActivated, false);
});

test('hooks merchant-offers on fetch and ignores a non-2xx response', async () => {
  const messages = [];
  let ok = false;
  const fixture = loadFixtureWithSecrets();
  const window = {
    XMLHttpRequest: FakeXHR,
    fetch() {
      return Promise.resolve({
        ok,
        clone() { return this; },
        text() { return Promise.resolve(JSON.stringify(fixture)); },
      });
    },
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildCitiOfferCaptureJs())(window, {});

  await window.fetch('/US/nga/products-offers/merchantoffers/api');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(readOffers(window, messages).type, 'CITI_CAPTURE_UNAVAILABLE');

  ok = true;
  await window.fetch('/US/nga/products-offers/merchantoffers/api');
  await new Promise(resolve => setTimeout(resolve, 0));
  const message = readOffers(window, messages);
  assert.equal(message.type, 'CITI_OFFERS');
  assert.equal(message.offers.merchantOffers[0].offers[0].merchantName, 'CVS');
  assert.equal(JSON.stringify(message).includes('ACCOUNT-SECRET'), false);
});

test('replaceCardOffers for Citi replaces one card and leaves other banks', () => {
  const existing = [
    { id: 'c', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
    { id: 'w', bank: 'wells_fargo', cardName: 'Wells Fargo', phase: '', merchantName: 'Old Shop' },
    { id: 'ci', bank: 'citi', cardName: 'Citi Strata® Card', phase: '', merchantName: 'Old Citi' },
  ];
  const records = citiRecords({
    cardName: 'Citi Strata® Card',
    json: stripCitiOffers(loadFixture()),
    now: NOW,
  });
  const next = replaceCardOffers(existing, {
    bank: 'citi',
    cardName: 'Citi Strata® Card',
    phase: '',
    records,
  });
  assert.equal(next.some(offer => offer.bank === 'chase' && offer.merchantName === 'Nike'), true);
  assert.equal(next.some(offer => offer.bank === 'wells_fargo' && offer.merchantName === 'Old Shop'), true);
  assert.equal(next.some(offer => offer.bank === 'citi' && offer.merchantName === 'Old Citi'), false);
  assert.equal(next.filter(offer => offer.bank === 'citi').length, records.length);
  assert.equal(next.some(offer => offer.bank === 'citi' && offer.merchantName === 'CVS'), true);
});
