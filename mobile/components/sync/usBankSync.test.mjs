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
  buildUsBankChallengeVisibleJs,
  buildUsBankForceLoginJs,
  buildUsBankReadJs,
  buildUsBankCaptureWhenReadyJs,
  US_BANK_CAPTURE_READY_TIMEOUT_MS,
  US_BANK_CAPTURE_POLL_MS,
  US_BANK_CAPTURE_STABLE_MS,
  US_BANK_LOGIN_URL,
  US_BANK_OFFERS_URL,
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

function installHook(href = US_BANK_OFFERS_URL) {
  const messages = [];
  const window = {
    location: { href },
    XMLHttpRequest: FakeXHR,
    ReactNativeWebView: {
      postMessage(raw) { messages.push(JSON.parse(raw)); },
    },
  };
  new Function('window', 'document', buildUsBankOfferCaptureJs())(window, {});
  return { window, messages };
}

function readOffers(window, messages) {
  if (!window.location) window.location = { href: US_BANK_OFFERS_URL };
  new Function('window', 'document', buildUsBankReadJs())(window, {});
  return messages.at(-1);
}

test('US Bank opens Account login first with offersUrl force path and is marked supported', () => {
  const usBank = BANK_LIST.find((bank) => bank.id === 'us_bank');
  assert.equal(usBank.supported, true);
  assert.equal(usBank.label, 'US Bank');
  assert.equal(BANK_LIST.some((bank) => bank.id === 'discover'), false);
  for (const id of ['capital_one', 'bofa', 'bilt']) {
    assert.equal(BANK_LIST.find((bank) => bank.id === id).supported, false);
  }
  const config = BANK_CONFIG.us_bank;
  assert.equal(config.url, US_BANK_LOGIN_URL);
  assert.equal(config.offersUrl, US_BANK_OFFERS_URL);
  assert.equal(config.loginUrl, US_BANK_LOGIN_URL);
  assert.equal(config.url, config.loginUrl);
  assert.notEqual(config.loginUrl, config.offersUrl);
  assert.ok(config.loginPaths.some((path) => path.includes('/auth/login')));
  assert.ok(config.loginPaths.some((path) => path.includes('www.usbank.com')));
  assert.ok(config.loginUrl.toLowerCase().includes('/auth/login'));
  assert.ok(config.offersPaths.some((path) => config.offersUrl.toLowerCase().includes(path.toLowerCase())));

  const faq = FAQ_ITEMS.find((item) => item.q === 'Which banks are supported?');
  const [supported, comingSoon] = faq.a.split('coming soon');
  assert.match(supported, /US Bank/);
  assert.equal(comingSoon.includes('US Bank'), false);
  assert.match(ONBOARDING_PAGES[1].body, /US Bank/);
  assert.equal(CONNECT_BANK_COPY.footnote.includes('US Bank'), false);
});

test('SyncWebView force-login and post-login goToOffers target US Bank loginUrl/offersUrl', () => {
  const syncSource = readRepoFile('..', 'SyncWebView.js');
  assert.match(syncSource, /shouldForceUsBankLogin/);
  assert.match(syncSource, /shouldForceUsBankOffersRedirect/);
  assert.match(syncSource, /goToUsBankLogin/);
  assert.match(syncSource, /buildUsBankForceLoginJs/);
  assert.match(syncSource, /US_BANK_PAGE_STATE/);
  const goToOffersBlock = syncSource.match(
    /const goToOffers = \(\) => \{[\s\S]*?\};\r?\n/,
  )?.[0] || '';
  assert.match(goToOffersBlock, /config\.offersUrl \|\| config\.url/);
  const goToLoginBlock = syncSource.match(
    /const goToUsBankLogin = \(\) => \{[\s\S]*?\};\r?\n/,
  )?.[0] || '';
  assert.match(goToLoginBlock, /config\.loginUrl \|\| US_BANK_LOGIN_URL/);
  assert.equal(BANK_CONFIG.us_bank.offersUrl, US_BANK_OFFERS_URL);
  assert.equal(BANK_CONFIG.us_bank.loginUrl, US_BANK_LOGIN_URL);
  assert.equal(BANK_CONFIG.us_bank.url, US_BANK_LOGIN_URL);
  assert.match(syncSource, /source=\{\{ uri: config\.url \}\}/);
});

test('home BankGrid treats supported US Bank as tappable (+ Add), not Coming Soon', () => {
  const usBank = BANK_LIST.find((bank) => bank.id === 'us_bank');
  assert.equal(usBank.supported, true);
  const syncingBank = null;
  const disabled = !usBank.supported || syncingBank === usBank.id;
  assert.equal(disabled, false);
  assert.equal(usBank.supported ? '+ Add' : 'Coming Soon', '+ Add');
});

test('SyncWebView wires US Bank capture/when-ready/save like Wells Fargo', () => {
  const syncSource = readRepoFile('..', 'SyncWebView.js');
  assert.match(syncSource, /buildUsBankOfferCaptureJs/);
  assert.match(syncSource, /buildUsBankOffersVisibleJs/);
  assert.match(syncSource, /buildUsBankChallengeVisibleJs/);
  assert.match(syncSource, /buildUsBankCaptureWhenReadyJs/);
  assert.match(syncSource, /US_BANK_CAPTURE_READY_TIMEOUT_MS/);
  assert.match(syncSource, /bank === 'us_bank'/);
  assert.match(syncSource, /US_BANK_ON_OFFERS/);
  assert.match(syncSource, /US_BANK_PAGE_STATE/);
  assert.match(syncSource, /US_BANK_CHALLENGE/);
  assert.match(syncSource, /isAutoBank/);
  assert.match(syncSource, /US_BANK_CAPTURE_UNAVAILABLE/);
  assert.match(syncSource, /US_BANK_OFFERS/);
  assert.match(syncSource, /bank: 'us_bank'/);
  assert.equal(typeof buildUsBankOffersVisibleJs(), 'string');
  assert.match(buildUsBankOffersVisibleJs(), /US_BANK_ON_OFFERS/);
  assert.match(buildUsBankOffersVisibleJs(), /signedIn/);
  assert.match(buildUsBankChallengeVisibleJs(), /US_BANK_CHALLENGE/);
  assert.match(buildUsBankChallengeVisibleJs(), /sec-cpt-if/);
  // Challenge handler must lift to NeedsInput — never auto-click Continue.
  assert.match(syncSource, /US_BANK_CHALLENGE[\s\S]{0,400}NEEDS_INPUT/);
  assert.doesNotMatch(buildUsBankChallengeVisibleJs(), /click\(/);
});

test('US_BANK_CHALLENGE posts when Arkose adaptive iframe is present', () => {
  const messages = [];
  const window = {
    ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
  };
  const document = {
    body: { innerText: 'Account login\nWe are logging you in…' },
    getElementById(id) {
      return id === 'sec-cpt-if'
        ? { src: 'https://client-api.arkoselabs.com/adaptive' }
        : null;
    },
    querySelector() { return null; },
  };
  new Function('window', 'document', buildUsBankChallengeVisibleJs())(window, document);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'US_BANK_CHALLENGE');
  assert.equal(messages[0].present, true);
});

test('US_BANK_CHALLENGE stays silent on plain login form', () => {
  const messages = [];
  const window = {
    ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
  };
  const document = {
    body: { innerText: 'Account login\nUsername\nPassword\nLog in' },
    getElementById() { return null; },
    querySelector() { return null; },
  };
  new Function('window', 'document', buildUsBankChallengeVisibleJs())(window, document);
  assert.equal(messages.length, 0);
});

test('US_BANK_PAGE_STATE marks logged-out deals as expired; login form is not', () => {
  function run(href, text) {
    const messages = [];
    const window = {
      location: { href },
      ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
    };
    const document = { body: { innerText: text } };
    new Function('window', 'document', buildUsBankOffersVisibleJs())(window, document);
    return messages;
  }
  const dead = run(
    'https://onlinebanking.usbank.com/digital/servicing/dominjection/cashback-deals',
    'usbank\nLog in\nYour cash-back deals\nActivate deals',
  );
  const pageState = dead.find((m) => m.type === 'US_BANK_PAGE_STATE');
  assert.ok(pageState);
  assert.equal(pageState.onOffers, true);
  assert.equal(pageState.signedIn, false);
  assert.equal(pageState.onLoginForm, false);
  assert.equal(pageState.expired, true);

  const login = run(
    'https://onlinebanking.usbank.com/auth/login/?channel=mobileweb',
    'Account login\nUsername\nPassword\nLog in',
  );
  const loginState = login.find((m) => m.type === 'US_BANK_PAGE_STATE');
  assert.ok(loginState);
  assert.equal(loginState.onLoginForm, true);
  assert.equal(loginState.expired, false);
  assert.equal(loginState.signedIn, false);

  const marketing = run(
    'https://www.usbank.com/index.html',
    'END OF YEAR SAVINGS BONUS\nGet a bonus up to $500\nLog in\nEarn your bonus',
  );
  const marketingState = marketing.find((m) => m.type === 'US_BANK_PAGE_STATE');
  assert.ok(marketingState);
  assert.equal(marketingState.onLoginForm, false);
  assert.equal(marketingState.onOffers, false);
  assert.equal(marketingState.signedIn, false);
  assert.equal(marketingState.expired, true);
});

test('force login clears storage and replaces to official loginUrl', () => {
  assert.equal(US_BANK_LOGIN_URL, 'https://onlinebanking.usbank.com/auth/login/?channel=mobileweb');
  const forceJs = buildUsBankForceLoginJs();
  assert.match(forceJs, /localStorage/);
  assert.match(forceJs, /sessionStorage/);
  assert.match(forceJs, /location\.replace/);
  assert.match(forceJs, /onlinebanking\.usbank\.com\/auth\/login/);
  let replaced = null;
  const window = {
    localStorage: { clear() {} },
    sessionStorage: { clear() {} },
    location: {
      replace(url) { replaced = url; },
      href: 'https://onlinebanking.usbank.com/digital/servicing/dominjection/cashback-deals',
    },
  };
  const document = { cookie: 'a=1; b=2' };
  new Function('window', 'document', buildUsBankForceLoginJs(US_BANK_LOGIN_URL))(window, document);
  assert.equal(replaced, US_BANK_LOGIN_URL);
});

test('US_BANK_ON_OFFERS posts signedIn false on logged-out deals URL', () => {
  const messages = [];
  const window = {
    location: { href: 'https://onlinebanking.usbank.com/digital/servicing/dominjection/cashback-deals' },
    ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
  };
  const document = {
    body: {
      innerText: 'usbank\nLog in\nYour cash-back deals\nActivate deals and earn cash back',
    },
  };
  new Function('window', 'document', buildUsBankOffersVisibleJs())(window, document);
  const pageState = messages.find((m) => m.type === 'US_BANK_PAGE_STATE');
  const onOffers = messages.find((m) => m.type === 'US_BANK_ON_OFFERS');
  assert.ok(pageState);
  assert.equal(pageState.signedIn, false);
  assert.equal(pageState.expired, true);
  assert.ok(onOffers);
  assert.equal(onOffers.signedIn, false);
});

test('customer-dashboard after login is onHomeShell + signedIn (Last login must not block)', () => {
  function run(href, text) {
    const messages = [];
    const window = {
      location: { href },
      ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
    };
    const document = { body: { innerText: text } };
    new Function('window', 'document', buildUsBankOffersVisibleJs())(window, document);
    return messages.find((m) => m.type === 'US_BANK_PAGE_STATE');
  }
  const dash = run(
    'https://onlinebanking.usbank.com/digital/servicing/shellapp/#/customer-dashboard',
    'Welcome back, Rakesh.\nTax documents\nRewards\nLog out\nLast login: November 27, 12:13 a.m. CT\nAccounts\nChecking',
  );
  assert.ok(dash);
  assert.equal(dash.onOffers, false);
  assert.equal(dash.onLoginForm, false);
  assert.equal(dash.onHomeShell, true);
  assert.equal(dash.signedIn, true, 'Log out + Last login must still be signedIn');
  assert.equal(dash.expired, false);

  // Nav label "Cash Back Deals" on home must NOT flip onOffers (that started
  // capture against the short dashboard getInsights list).
  const dashNav = run(
    'https://onlinebanking.usbank.com/digital/servicing/shellapp/#/customer-dashboard',
    'Welcome back.\nCash Back Deals\nAccounts\nLog out\nLast login: November 27, 12:13 a.m. CT',
  );
  assert.ok(dashNav);
  assert.equal(dashNav.onOffers, false, 'body text Cash Back Deals is not OfferHub');
  assert.equal(dashNav.onHomeShell, true);
  assert.equal(dashNav.signedIn, true);
});

test('US_BANK_ON_OFFERS posts signedIn true on OfferHub deals without Log out chrome', () => {
  const messages = [];
  const window = {
    location: { href: 'https://onlinebanking.usbank.com/digital/servicing/dominjection/cashback-deals' },
    ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
  };
  const document = {
    body: {
      // OfferHub URL without login prompt is enough — do not wait for a late load signal.
      innerText: 'Your cash-back deals\nTotal amount saved to date: $0.00\nAll deals',
    },
  };
  new Function('window', 'document', buildUsBankOffersVisibleJs())(window, document);
  const pageState = messages.find((m) => m.type === 'US_BANK_PAGE_STATE');
  const onOffers = messages.find((m) => m.type === 'US_BANK_ON_OFFERS');
  assert.ok(pageState);
  assert.equal(pageState.onOffers, true);
  assert.equal(pageState.onLoginForm, false);
  assert.equal(pageState.signedIn, true);
  assert.equal(pageState.expired, false);
  assert.ok(onOffers);
  assert.equal(onOffers.signedIn, true);
});

test('US_BANK_ON_OFFERS posts signedIn true with Log out chrome on deals', () => {
  const messages = [];
  const window = {
    location: { href: 'https://onlinebanking.usbank.com/digital/servicing/dominjection/cashback-deals' },
    ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
  };
  const document = {
    body: {
      innerText: 'usbank\nLog out\nYour cash-back deals\nTotal amount saved to date: $0.00',
    },
  };
  new Function('window', 'document', buildUsBankOffersVisibleJs())(window, document);
  const pageState = messages.find((m) => m.type === 'US_BANK_PAGE_STATE');
  const onOffers = messages.find((m) => m.type === 'US_BANK_ON_OFFERS');
  assert.ok(pageState);
  assert.equal(pageState.signedIn, true);
  assert.equal(pageState.expired, false);
  assert.ok(onOffers);
  assert.equal(onOffers.signedIn, true);
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
  const { window, messages } = installHook(US_BANK_OFFERS_URL);
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
  assert.equal(window.__usBankLastOffers, null);

  xhr.status = 200;
  xhr.responseText = JSON.stringify({ status: 'ok', hello: 'world' });
  xhr.send('{"operationName":"getInsights"}');
  const message = readOffers(window, messages);
  assert.equal(message.type, 'US_BANK_CAPTURE_UNAVAILABLE');
});

test('customer-dashboard getInsights is never stashed or captured', () => {
  const { window, messages } = installHook(
    'https://onlinebanking.usbank.com/digital/servicing/shellapp/#/customer-dashboard',
  );
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', 'https://onlinebanking.usbank.com/graphql/v2');
  xhr.responseText = JSON.stringify(loadFixture());
  xhr.send(JSON.stringify({ operationName: 'getInsights', useCaseId: 'CardLytics' }));
  assert.equal(window.__usBankLastOffers, null);

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
    location: { href: US_BANK_OFFERS_URL },
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
  assert.equal(window.__usBankLastOffers, null);
  await window.fetch('https://onlinebanking.usbank.com/graphql/v2-ok', {
    body: '{"operationName":"getInsights"}',
  });
  // give clone().text() a tick
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(window.__usBankLastOffers?.ads?.length >= 4);
  assert.equal(window.__usBankLastOffers.fromDeals, true);
});

function flatOffer(offerId, merchantName = 'Ready Cafe') {
  return {
    offerId,
    merchantName,
    activationState: 'SERVED',
    endDate: '2027-01-01T04:59:59Z',
    headline: '5% cash back',
    shortPreMessage: '',
    rewardType: 'PERCENT_AMOUNT_PURCHASE',
    rewardAmount: 5,
    maxRewardAmount: null,
    minSpendAmount: null,
  };
}

test('capture-when-ready waits until getInsights stash count stays stable', async () => {
  assert.ok(US_BANK_CAPTURE_POLL_MS <= 150);
  assert.ok(US_BANK_CAPTURE_READY_TIMEOUT_MS >= 8000);
  assert.ok(US_BANK_CAPTURE_STABLE_MS >= 800);

  const messages = [];
  const window = {
    location: { href: US_BANK_OFFERS_URL },
    __usBankLastOffers: null,
    ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
    scrollBy() {},
    scrollTo() {},
    innerHeight: 800,
  };
  const document = {
    scrollingElement: { scrollTop: 0, scrollHeight: 2400 },
    documentElement: { scrollTop: 0, scrollHeight: 2400 },
    body: { scrollTop: 0, scrollHeight: 2400 },
    querySelectorAll() { return []; },
  };
  // timeout 900 / poll 40 / stable 200 — first page must not post before growth settles
  new Function('window', 'document', buildUsBankCaptureWhenReadyJs(900, 40, 200))(window, document);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(messages.length, 0);

  window.__usBankLastOffers = { ads: [flatOffer('READYOFFER1')], fromDeals: true };
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(messages.length, 0, 'first partial page must not capture yet');

  window.__usBankLastOffers = {
    ads: [flatOffer('READYOFFER1'), flatOffer('READYOFFER2', 'Second Spot')],
    fromDeals: true,
  };
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(messages.length, 0, 'count just grew — settle clock resets');

  await new Promise((r) => setTimeout(r, 280));
  assert.equal(messages.at(-1)?.type, 'US_BANK_OFFERS');
  assert.equal(messages.at(-1)?.offers.ads.length, 2);
  assert.equal(messages.at(-1)?.offers.ads[0].offerId, 'READYOFFER1');
});

test('capture-when-ready refuses customer-dashboard even with a home stash', async () => {
  const messages = [];
  const window = {
    location: {
      href: 'https://onlinebanking.usbank.com/digital/servicing/shellapp/#/customer-dashboard',
    },
    __usBankLastOffers: {
      ads: [flatOffer('HOME1'), flatOffer('HOME2')],
      fromDeals: false,
    },
    ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
    scrollBy() {},
    scrollTo() {},
    innerHeight: 800,
  };
  const document = {
    scrollingElement: { scrollTop: 0, scrollHeight: 100 },
    documentElement: { scrollTop: 0, scrollHeight: 100 },
    body: { scrollTop: 0, scrollHeight: 100 },
    querySelectorAll() { return []; },
  };
  new Function('window', 'document', buildUsBankCaptureWhenReadyJs(400, 40, 80))(window, document);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(messages.at(-1)?.type, 'US_BANK_CAPTURE_UNAVAILABLE');
  assert.equal(messages.some((m) => m.type === 'US_BANK_OFFERS'), false);
});

test('capture-when-ready times out with US_BANK_CAPTURE_UNAVAILABLE when stash never lands', async () => {
  const messages = [];
  const window = {
    location: { href: US_BANK_OFFERS_URL },
    ReactNativeWebView: { postMessage(raw) { messages.push(JSON.parse(raw)); } },
    scrollBy() {},
    scrollTo() {},
    innerHeight: 800,
  };
  const document = {
    scrollingElement: { scrollTop: 0, scrollHeight: 100 },
    documentElement: { scrollTop: 0, scrollHeight: 100 },
    body: { scrollTop: 0, scrollHeight: 100 },
    querySelectorAll() { return []; },
  };
  new Function('window', 'document', buildUsBankCaptureWhenReadyJs(120, 40, 80))(window, document);
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(messages.at(-1)?.type, 'US_BANK_CAPTURE_UNAVAILABLE');
});
