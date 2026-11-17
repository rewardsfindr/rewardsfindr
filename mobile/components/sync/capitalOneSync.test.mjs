import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BANK_LIST, FAQ_ITEMS } from '../../shared/constants.js';
import { BANK_CONFIG } from './bankConfig.js';
import { CONNECT_BANK_COPY, ONBOARDING_PAGES } from '../../lib/onboardingContent.js';
import { formatOfferExpiry } from '../../lib/savedOffers.js';
import { capitalOneRecords, replaceCardOffers } from '../../../api/lib/offers/deviceCatalog.js';
import {
  buildCapitalOneOfferCaptureJs,
  buildCapitalOneOffersVisibleJs,
  buildCapitalOneReadJs,
  stripCapitalOneOffers,
} from './capitalOneSync.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const HERE = dirname(fileURLToPath(import.meta.url));
const STORE_FIXTURE_PATHS = [
  '/cursor/stores/self/docs/capital-one-offers-fixture-redacted.json',
  '/cursor/stores/bc-d795c680-e7e9-489b-996e-4127198403b2/docs/capital-one-offers-fixture-redacted.json',
  join(
    process.env.USERPROFILE || '',
    'AppData/Local/Cursor/AgentStores/cursor_agent_stores/bc-d795c680-e7e9-489b-996e-4127198403b2/files/docs/capital-one-offers-fixture-redacted.json'
  ),
];

function readRepoFile(...parts) {
  return readFileSync(join(HERE, ...parts), 'utf8');
}

function baseFixture() {
  return {
    cursor: '<REDACTED_PAGINATION_CURSOR>',
    data: [
      {
        merchantTLD: 'adidas.com',
        merchantDisplayName: 'adidas',
        type: 'Standard',
        id: '<REDACTED_SESSION_BOUND_TILE_ID>',
        text: 'Online',
        buttonText: 'Up to 15X miles',
        offerSources: ['affiliate'],
      },
      {
        merchantTLD: 'puma.com',
        merchantDisplayName: 'PUMA',
        type: 'Standard',
        id: '<REDACTED_SESSION_BOUND_TILE_ID>',
        text: 'In-Store & Online',
        buttonText: 'Up to 18X miles',
        offerSources: ['affiliate', 'cardLinked'],
      },
      {
        merchantTLD: 'panerabread.com',
        merchantDisplayName: 'Panera Bread',
        type: 'Standard',
        id: '<REDACTED_SESSION_BOUND_TILE_ID>',
        text: 'In-Store & In-App',
        buttonText: '12X miles',
        offerSources: ['cardLinked'],
      },
      {
        merchantTLD: 'expedia.com',
        merchantDisplayName: 'Expedia',
        type: 'Showcase',
        id: '<REDACTED_SESSION_BOUND_TILE_ID>',
        text: 'Online',
        buttonText: 'Shop Now',
        rateText: 'Up to 5X miles',
        headingText: 'Save 25% or more off your dream stay! ',
        offerSources: ['affiliate'],
      },
      {
        type: 'Carousel',
        tiles: [
          {
            merchantTLD: 'hubspot.com',
            merchantDisplayName: 'HubSpot',
            id: '<REDACTED_SESSION_BOUND_TILE_ID>',
            buttonText: '30X miles',
            offerSources: ['affiliate'],
          },
        ],
      },
      {
        merchantTLD: 'capitaloneoffers.com',
        merchantDisplayName: 'Capital One Luxury Offers',
        type: 'PromotedAffiliate',
        text: 'Venture X Exclusive: earn up to 6X miles at luxury brands this holiday season',
        buttonText: 'Explore Luxury Offers',
        redirectUrl: '/feed/luxury',
        linkType: 'internal',
      },
    ],
  };
}

function loadFixture() {
  for (const path of STORE_FIXTURE_PATHS) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      if (parsed && Array.isArray(parsed.data)) return parsed;
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
    sessionToken: 'SESSION-SECRET',
    viewInstanceId: 'VIEW-SECRET',
    data: (fixture.data || []).map(tile => {
      if (tile && Array.isArray(tile.tiles)) {
        return {
          ...tile,
          tiles: tile.tiles.map(child => ({
            ...child,
            id: child.id || 'SESSION-BOUND-ID',
            accountId: 'ACCOUNT-SECRET',
          })),
        };
      }
      return {
        ...tile,
        id: tile.id || 'SESSION-BOUND-ID',
        accountId: 'ACCOUNT-SECRET',
      };
    }),
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
  new Function('window', 'document', buildCapitalOneOfferCaptureJs())(window, {});
  return { window, messages };
}

function readOffers(window, messages) {
  new Function('window', 'document', buildCapitalOneReadJs())(window, {});
  return messages.at(-1);
}

const FEED_LIST_URL = 'https://capitaloneoffers.com/feed/opaqueSessionToken?numberOfColumnsInGrid=2&viewInstanceId=VIEW&contentSlug=ease-web-l1';

test('Capital One opens captured entry URL and is marked supported', () => {
  const capOne = BANK_LIST.find(bank => bank.id === 'capital_one');
  assert.equal(capOne.supported, true);
  assert.equal(capOne.label, 'Capital One');
  for (const id of ['discover', 'bofa', 'bilt']) {
    assert.equal(BANK_LIST.find(bank => bank.id === id).supported, false);
  }
  const config = BANK_CONFIG.capital_one;
  assert.equal(config.url, 'https://www.capitalone.com/');
  assert.equal(config.offersUrl, 'https://capitaloneoffers.com/feed');
  assert.equal(config.url.includes('card-benefits/offers'), false);
  assert.ok(config.loginPaths.length > 0);
  assert.equal(
    config.offersPaths.some(path => config.offersUrl.toLowerCase().includes(path.toLowerCase())),
    true
  );

  const faq = FAQ_ITEMS.find(item => item.q === 'Which banks are supported?');
  const [supported, comingSoon] = faq.a.split('coming soon');
  assert.match(supported, /Capital One/);
  assert.equal(comingSoon.includes('Capital One'), false);
  assert.match(ONBOARDING_PAGES[1].body, /Capital One/);
  assert.equal(CONNECT_BANK_COPY.footnote.includes('Capital One'), false);
});

test('home BankGrid treats supported Capital One as tappable (+ Add), not Coming Soon', () => {
  const capOne = BANK_LIST.find(bank => bank.id === 'capital_one');
  assert.equal(capOne.supported, true);

  const syncingBank = null;
  const disabled = !capOne.supported || syncingBank === capOne.id;
  assert.equal(disabled, false);
  assert.equal(capOne.supported ? '+ Add' : 'Coming Soon', '+ Add');

  const bankGridSource = readRepoFile('..', 'BankGrid.js');
  assert.match(bankGridSource, /BANK_LIST/);
  assert.match(bankGridSource, /!bank\.supported \|\| syncing/);
  assert.match(bankGridSource, /Coming Soon/);
  assert.match(bankGridSource, /onSyncPress\(bank\.id\)/);
});

test('SyncWebView wires Capital One capture/read/save stash-first like Citi', () => {
  const syncSource = readRepoFile('..', 'SyncWebView.js');
  assert.match(syncSource, /buildCapitalOneOfferCaptureJs/);
  assert.match(syncSource, /buildCapitalOneOffersVisibleJs/);
  assert.match(syncSource, /buildCapitalOneReadJs/);
  assert.match(syncSource, /bank === 'capital_one'/);
  assert.match(syncSource, /CAPONE_ON_OFFERS/);
  assert.match(syncSource, /CAPONE_CAPTURE_UNAVAILABLE/);
  assert.match(syncSource, /CAPONE_OFFERS/);
  assert.match(syncSource, /bank: 'capital_one'/);
  assert.equal(typeof buildCapitalOneOffersVisibleJs(), 'string');
  assert.match(buildCapitalOneOffersVisibleJs(), /CAPONE_ON_OFFERS/);
  assert.equal(BANK_CONFIG.capital_one.url, 'https://www.capitalone.com/');

  const captureJs = buildCapitalOneOfferCaptureJs();
  // No activate/enroll API hooks or Activate clicks — isActivated field is fine.
  assert.equal(/activatecl|\/activate|enrolloffer|\.click\(\)/i.test(captureJs), false);
  assert.match(buildCapitalOneReadJs(), /CAPONE_CAPTURE_UNAVAILABLE/);
  // Read path must not issue a new list GET / cursor page.
  const readJs = buildCapitalOneReadJs();
  assert.equal(readJs.includes('new XMLHttpRequest'), false);
  assert.equal(readJs.includes('XMLHttpRequest('), false);
  assert.equal(/numberOfColumnsInGrid|contentSlug=ease-web-l1/.test(readJs), false);
});

test('stripCapitalOneOffers builds stable bankOfferIds and skips PromotedAffiliate', () => {
  const fixture = loadFixtureWithSecrets();
  const stripped = stripCapitalOneOffers(fixture);
  assert.ok(stripped.offers.length >= 5);
  assert.equal(stripped.offers.some(o => /luxury/i.test(o.merchantName)), false);
  assert.equal(stripped.offers[0].bankOfferId, 'adidas.com|standard|affiliate');
  assert.equal(
    stripped.offers.find(o => o.merchantName === 'PUMA').bankOfferId,
    'puma.com|standard|affiliate+cardlinked'
  );
  assert.equal(
    stripped.offers.find(o => o.merchantName === 'Expedia').bankOfferId,
    'expedia.com|showcase|affiliate'
  );
  assert.equal(
    stripped.offers.find(o => o.merchantName === 'HubSpot').bankOfferId,
    'hubspot.com|carousel|affiliate'
  );
  const posted = JSON.stringify(stripped);
  for (const secret of ['SESSION-SECRET', 'VIEW-SECRET', 'ACCOUNT-SECRET', 'SESSION-BOUND']) {
    assert.equal(posted.includes(secret), false);
  }
  assert.equal(posted.includes('cursor'), false);
  assert.equal(stripped.offers.every(o => o.isActivated === false), true);
});

test('a missing Capital One end date is not labeled expiring soon', () => {
  const [offer] = capitalOneRecords({
    json: {
      offers: [{
        bankOfferId: 'uber.com|standard|affiliate',
        merchantName: 'Uber',
        rewardText: '5X miles',
        offerSources: ['affiliate'],
        isActivated: false,
      }],
    },
    now: NOW,
  });
  assert.equal(offer.expiryPrecision, 'unknown');
  assert.equal(formatOfferExpiry(offer), '');
});

test('hooks capitaloneoffers feed XHR and posts fields without secrets', () => {
  const { window, messages } = installHook();
  const fixture = loadFixtureWithSecrets();
  const xhr = new window.XMLHttpRequest();
  xhr.open('GET', FEED_LIST_URL);
  xhr.responseText = JSON.stringify(fixture);
  xhr.send();

  const message = readOffers(window, messages);
  assert.equal(message.type, 'CAPONE_OFFERS');
  assert.equal(message.offers.offers[0].bankOfferId, 'adidas.com|standard|affiliate');
  assert.equal(message.offers.offers[0].merchantName, 'adidas');
  const posted = JSON.stringify(message);
  for (const secret of ['SESSION-SECRET', 'VIEW-SECRET', 'ACCOUNT-SECRET']) {
    assert.equal(posted.includes(secret), false);
  }
});

test('does not capture a failed response, unrecognized body, or silent empty feed', () => {
  const { window, messages } = installHook();

  const failed = new window.XMLHttpRequest();
  failed.open('GET', FEED_LIST_URL);
  failed.status = 500;
  failed.responseText = JSON.stringify({ body: 'SECRET-BODY', data: [] });
  failed.send();
  const afterFailure = readOffers(window, messages);
  assert.equal(afterFailure.type, 'CAPONE_CAPTURE_UNAVAILABLE');
  assert.equal(JSON.stringify(afterFailure).includes('SECRET'), false);

  const unrecognized = new window.XMLHttpRequest();
  unrecognized.open('GET', FEED_LIST_URL);
  unrecognized.responseText = JSON.stringify({ foo: 'SECRET-BODY' });
  unrecognized.send();
  const afterUnrecognized = readOffers(window, messages);
  assert.equal(afterUnrecognized.type, 'CAPONE_CAPTURE_UNAVAILABLE');
  assert.equal(JSON.stringify(afterUnrecognized).includes('SECRET-BODY'), false);

  const silent = new window.XMLHttpRequest();
  silent.open('GET', FEED_LIST_URL);
  silent.responseText = '';
  silent.send();
  const afterSilent = readOffers(window, messages);
  assert.equal(afterSilent.type, 'CAPONE_CAPTURE_UNAVAILABLE');
});

test('an empty data list posts capture unavailable and does not look like a wipe', () => {
  const { window, messages } = installHook();
  const xhr = new window.XMLHttpRequest();
  xhr.open('GET', FEED_LIST_URL);
  xhr.responseText = JSON.stringify({ cursor: 'x', data: [] });
  xhr.send();
  const empty = readOffers(window, messages);
  assert.equal(empty.type, 'CAPONE_CAPTURE_UNAVAILABLE');

  assert.throws(
    () => capitalOneRecords({ json: { offers: [] }, now: NOW }),
    /empty|Nothing was changed/
  );
});

test('keeps a good stash when a later empty feed arrives (rate-limit silent)', () => {
  const { window, messages } = installHook();
  const good = new window.XMLHttpRequest();
  good.open('GET', FEED_LIST_URL);
  good.responseText = JSON.stringify(loadFixture());
  good.send();

  const empty = new window.XMLHttpRequest();
  empty.open('GET', FEED_LIST_URL);
  empty.responseText = JSON.stringify({ cursor: 'x', data: [] });
  empty.send();

  const message = readOffers(window, messages);
  assert.equal(message.type, 'CAPONE_OFFERS');
  assert.ok(message.offers.offers.length >= 5);
});

test('ignores non-feed URLs and does not hook page HTML /feed without opaque segment', () => {
  const { window, messages } = installHook();
  const page = new window.XMLHttpRequest();
  page.open('GET', 'https://capitaloneoffers.com/feed?viewInstanceId=VIEW&initialContentSlug=ease-web-l1');
  page.responseText = JSON.stringify(loadFixture());
  page.send();
  assert.equal(window.__capOneLastOffers, undefined);

  const other = new window.XMLHttpRequest();
  other.open('GET', 'https://www.capitalone.com/api/something');
  other.responseText = JSON.stringify(loadFixture());
  other.send();
  assert.equal(window.__capOneLastOffers, undefined);

  const after = readOffers(window, messages);
  assert.equal(after.type, 'CAPONE_CAPTURE_UNAVAILABLE');
});

test('maps the redacted fixture into capital_one catalog rows with stable ids', () => {
  const stripped = stripCapitalOneOffers(loadFixture());
  const records = capitalOneRecords({ json: stripped, now: NOW });
  assert.ok(records.length >= 5);
  assert.equal(records.every(o => o.bank === 'capital_one'), true);
  assert.equal(records.every(o => o.cardName === 'Capital One'), true);
  assert.equal(records.every(o => o.isActivated === false), true);
  const adidas = records.find(o => o.merchantName === 'adidas');
  assert.equal(adidas.bankOfferId, 'adidas.com|standard|affiliate');
  assert.equal(adidas.cashbackAmount, 15);
  assert.equal(adidas.cashbackType, 'points');
  assert.match(adidas.offerDescription, /15X miles/i);
  const expedia = records.find(o => o.merchantName === 'Expedia');
  assert.equal(expedia.cashbackAmount, 5);
  assert.match(expedia.offerDescription, /5X miles/i);
  // Session-bound raw tile ids must never become bankOfferId.
  assert.equal(records.some(o => o.bankOfferId.includes('REDACTED_SESSION')), false);
});

test('hooks feed on fetch and ignores a non-2xx response', async () => {
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
  new Function('window', 'document', buildCapitalOneOfferCaptureJs())(window, {});

  await window.fetch(FEED_LIST_URL);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(readOffers(window, messages).type, 'CAPONE_CAPTURE_UNAVAILABLE');

  ok = true;
  await window.fetch(FEED_LIST_URL);
  await new Promise(resolve => setTimeout(resolve, 0));
  const message = readOffers(window, messages);
  assert.equal(message.type, 'CAPONE_OFFERS');
  assert.equal(message.offers.offers[0].merchantName, 'adidas');
  assert.equal(JSON.stringify(message).includes('SESSION-SECRET'), false);
});

test('replaceCardOffers for Capital One replaces one card and leaves other banks', () => {
  const existing = [
    { id: 'c', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
    { id: 'w', bank: 'wells_fargo', cardName: 'Wells Fargo', phase: '', merchantName: 'Old Shop' },
    { id: 'ci', bank: 'citi', cardName: 'Citi Strata® Card', phase: '', merchantName: 'Old Citi' },
    { id: 'co', bank: 'capital_one', cardName: 'Capital One', phase: '', merchantName: 'Old Cap One' },
  ];
  const records = capitalOneRecords({
    json: stripCapitalOneOffers(loadFixture()),
    now: NOW,
  });
  const next = replaceCardOffers(existing, {
    bank: 'capital_one',
    cardName: 'Capital One',
    phase: '',
    records,
  });
  assert.equal(next.some(offer => offer.bank === 'chase' && offer.merchantName === 'Nike'), true);
  assert.equal(next.some(offer => offer.bank === 'wells_fargo' && offer.merchantName === 'Old Shop'), true);
  assert.equal(next.some(offer => offer.bank === 'citi' && offer.merchantName === 'Old Citi'), true);
  assert.equal(next.some(offer => offer.bank === 'capital_one' && offer.merchantName === 'Old Cap One'), false);
  assert.equal(next.filter(offer => offer.bank === 'capital_one').length, records.length);
  assert.equal(next.some(offer => offer.bank === 'capital_one' && offer.merchantName === 'adidas'), true);
});

test('capitalOneRecords refuses unrecognized and incomplete payloads', () => {
  assert.throws(
    () => capitalOneRecords({ json: { foo: 1 }, now: NOW }),
    /not recognized|Nothing was changed/
  );
  assert.throws(
    () => capitalOneRecords({
      json: { offers: [{ bankOfferId: '', merchantName: 'X', rewardText: '1X' }] },
      now: NOW,
    }),
    /no offer id|Nothing was changed/
  );
});
