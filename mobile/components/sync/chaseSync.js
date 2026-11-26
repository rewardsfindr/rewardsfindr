// ─────────────────────────────────────────────
// CHASE SYNC — JS injection strings
// The card control is a closed listbox button,
// #select-credit-card-account. Options exist only
// while that menu is open, as li[role=option]
// inside #select-credit-card-account-menu.
// The old mds-select markup is still handled.
// ─────────────────────────────────────────────

import { CHASE_OFFER_HOOK_VERSION } from './syncMode.js';

export { CHASE_OFFER_HOOK_VERSION };

export const CHASE_CREDIT_CARD_KEYWORDS = [
  'sapphire', 'freedom', 'flex', 'slate', 'ink', 'visa', 'united', 'marriott',
  'hyatt', 'southwest', 'amazon', 'prime', 'disney', 'starbucks', 'ihg',
  'british', 'aeroplan', 'reserve', 'preferred', 'unlimited', 'plus',
];

// The WebView address often drops the #/merchantOffers hash, so the sheet
// has to ask the page itself whether the offers hub is showing.
export const buildPageStateJs = (loginPaths = [], offerPaths = []) => `
  (function() {
    try {
      if (window.__rfPageStateTimer) clearInterval(window.__rfPageStateTimer);
      var loginNeedles = ${JSON.stringify(loginPaths.map(p => String(p).toLowerCase()))};
      var offerNeedles = ${JSON.stringify(offerPaths.map(p => String(p).toLowerCase()))};
      function report() {
        var href = (location.href || '').toLowerCase();
        var onLogin = loginNeedles.some(function(p) { return p && href.indexOf(p) !== -1; });
        var onOffersUrl = offerNeedles.some(function(p) { return p && href.indexOf(p) !== -1; });
        var offersVisible = document.querySelectorAll('[data-testid="commerce-tile"]').length > 0
          || !!document.querySelector('[data-testid="grid-items-container"]')
          || !!document.querySelector('#select-credit-card-account');
        var onOffers = !onLogin && offersVisible;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAGE_STATE',
          onOffers: onOffers,
          onLogin: onLogin && !onOffers,
          onOffersUrl: onOffersUrl,
        }));
        return onOffers;
      }
      if (!report()) {
        var tries = 0;
        window.__rfPageStateTimer = setInterval(function() {
          tries += 1;
          if (report() || tries >= 15) clearInterval(window.__rfPageStateTimer);
        }, 400);
      }
    } catch (e) {}
  })();
  true;
`;

export const DETECT_CARDS_JS = `
  (function() {
    try {
      var KEYWORDS = ${JSON.stringify(CHASE_CREDIT_CARD_KEYWORDS)};
      var sel = document.querySelector('mds-select[id="select-credit-card-account"]');
      if (sel) {
        var opts = sel.querySelectorAll('mds-select-option');
        var cards = [];
        opts.forEach(function(opt, i) {
          var rawLabel = opt.getAttribute('label') || '';
          var lowerLabel = rawLabel.toLowerCase();
          var isCreditCard = KEYWORDS.some(function(k) { return lowerLabel.indexOf(k) !== -1; });
          if (!isCreditCard) return;
          var value = opt.getAttribute('value') || String(i);
          cards.push({ label: rawLabel, value: value, index: i });
        });
        var selectedOpt = sel.querySelector('mds-select-option[selected="true"]');
        var selectedLabel = selectedOpt ? (selectedOpt.getAttribute('label') || '') : '';
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CARDS_DETECTED',
          cards: cards,
          selectedLabel: selectedLabel,
        }));
        return;
      }
      var current = document.querySelector('#select-credit-card-account');
      var currentLabel = current ? (current.innerText || '').replace(/\\s+/g, ' ').trim() : '';
      if (currentLabel) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CARDS_DETECTED',
          cards: [{ label: currentLabel, value: '0', index: 0 }],
          selectedLabel: currentLabel,
        }));
        return;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARDS_DETECTED', cards: [], selectedLabel: null }));
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARDS_DETECTED', cards: [], selectedLabel: null, error: e.message }));
    }
  })();
  true;
`;

// Source stays a string so the WebView receives JavaScript. Hermes toString()
// would inject "[bytecode]", which the page then reads as an undefined name.
const readChaseCardLabelSource = `function readChaseCardLabel() {
  var sel = document.querySelector('mds-select[id="select-credit-card-account"]');
  if (sel) {
    var selectedOpt = sel.querySelector('mds-select-option[selected="true"]');
    if (selectedOpt) return selectedOpt.getAttribute('label') || '';
  }
  var current = document.querySelector('#select-credit-card-account');
  return current ? (current.innerText || '').replace(/\\s+/g, ' ').trim() : '';
}`;

const summarizeOfferTermsSource = `function summarizeOfferTerms(text) {
  var plain = String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\\s+/g, ' ')
    .trim();
  if (!plain) return '';

  function amount(value) {
    var number = String(value).replace(/\\.0+$/, '').replace(/(\\.[1-9]*)0+$/, '$1');
    return number;
  }

  var percent = plain.match(/(\\d+(?:\\.\\d+)?)\\s*%\\s*cash\\s*back/i);
  var fixed = plain.match(/\\$(\\d+(?:\\.\\d+)?)\\s*cash\\s*back(?!\\s*max)/i);
  var cap = plain.match(/\\$(\\d+(?:\\.\\d+)?)\\s*cash\\s*back\\s*max(?:imum)?/i)
    || plain.match(/(?:up to|maximum of|capped at|cannot exceed)\\s*\\$(\\d+(?:\\.\\d+)?)/i);
  var minimum = plain.match(/\\$(\\d+(?:\\.\\d+)?)\\s*(?:or more|\\+)/i)
    || plain.match(/(?:minimum(?:\\s+purchase)?(?:\\s+of)?|spend|purchases?(?:\\s+of)?|orders?(?:\\s+of)?)\\s*\\$(\\d+(?:\\.\\d+)?)/i);

  var reward = '';
  if (percent) reward = amount(percent[1]) + '% cash back';
  else if (fixed) reward = '$' + amount(fixed[1]) + ' cash back';
  else if (cap) reward = '$' + amount(cap[1]) + ' cash back';
  if (!reward) return plain.length <= 80 ? plain : '';

  var line = reward;
  if (minimum) line += ' on $' + amount(minimum[1]) + ' or more';
  if (percent && cap) line += ', up to $' + amount(cap[1]);
  return line;
}`;

export const summarizeOfferTerms = new Function(`return (${summarizeOfferTermsSource})`)();

const mapChaseCustomerOffersSource = `function mapChaseCustomerOffers(payload) {
  function plainText(value) {
    if (value && typeof value === 'object') {
      value = value.messageText || value.text || value.value || value.displayText || '';
    }
    return String(value == null ? '' : value)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  function rewardValue(display) {
    var fields = [
      plainText(display.shortMessageText),
      plainText(display.offerHeaderText),
      plainText(display.preMessageText),
      plainText(display.rewardDescriptionText),
      plainText(display.termsAndConditionsText),
    ];
    return summarizeOfferTerms(fields.filter(Boolean).join(' '));
  }

  var account = payload && Array.isArray(payload.customerOffers) ? payload.customerOffers[0] : null;
  if (!account || !Array.isArray(account.offers)) {
    return { gridFound: false, partial: false, offers: [] };
  }

  var offers = account.offers.map(function(offer) {
    var details = offer.offerDetails || {};
    var display = offer.offerDisplayDetails || {};
    var merchant = offer.merchantDetails || {};
    var offerId = String(offer.offerIdentifier || '').trim();
    var idSource = offerId + ' ' + String(offer.digitalInteractionDestUrlText || '');
    var figg = idSource.match(/FIGG:\\d+/i);
    var bankOfferId = figg ? figg[0].toUpperCase() : (/https?:/i.test(offerId) || offerId.length > 120 ? '' : offerId);
    var days = details.remainingDaysCount;
    return {
      bankOfferId: bankOfferId,
      merchantName: plainText(merchant.merchantName),
      valueText: rewardValue(display),
      daysLeft: days == null || days === '' ? '' : String(days) + ' days',
      expiryText: details.offerEndTimestamp || '',
      isActivated: /activat|added|enrolled/i.test(String(offer.offerStatusName || '')),
    };
  });

  return {
    gridFound: true,
    partial: account.partial === true,
    offers: offers,
  };
}`;

export const readChaseCardLabel = new Function(`return (${readChaseCardLabelSource})`)();
export const mapChaseCustomerOffers = new Function(`
  ${summarizeOfferTermsSource}
  return (${mapChaseCustomerOffersSource});
`)();

// Posts when the fetch/XHR offer hook is installed at the expected version.
export const buildChaseHookReadyProbeJs = () => `
  (function() {
    try {
      if (window.__chaseOfferHookVersion === ${CHASE_OFFER_HOOK_VERSION}) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CHASE_HOOK_READY',
          version: window.__chaseOfferHookVersion,
        }));
      }
    } catch (e) {}
  })();
  true;
`;

// Clears the offer stash when capture pauses for MFA / NeedsInput so a
// pre-pause generation cannot apply to the wrong card on resume.
export const buildChasePauseCaptureJs = () => `
  (function() {
    try {
      window.__chaseLastOfferCapture = null;
      window.__chaseHookError = '';
    } catch (e) {}
  })();
  true;
`;

// Installed before the offers page runs so the customer-offers response is
// stored as offer fields only. Sync posts that stash; it does not read tiles.
export const buildChaseOfferCaptureJs = () => `
  (function() {
    try {
      if (window.__chaseOfferHookVersion === ${CHASE_OFFER_HOOK_VERSION}) return;
      if (window.__chaseCaptureGeneration == null) window.__chaseCaptureGeneration = 0;
      var summarizeOfferTerms = ${summarizeOfferTermsSource};
      var mapChaseCustomerOffers = ${mapChaseCustomerOffersSource};

      function remember(text) {
        var parsed = JSON.parse(text);
        var mapped = mapChaseCustomerOffers(parsed);
        window.__chaseLastOfferCapture = {
          gridFound: mapped.gridFound,
          partial: mapped.partial,
          tileCount: mapped.offers.length,
          offers: mapped.offers,
        };
        window.__chaseHookError = '';
      }

      function watchUrl(url) {
        return String(url || '').indexOf('customer-offers') !== -1;
      }

      // Card switches bump this. A customer-offers reply is kept only when it
      // was started for the card currently being captured.
      function currentGeneration() {
        return window.__chaseCaptureGeneration || 0;
      }

      window.__chaseArmNextCapture = function() {
        window.__chaseCaptureGeneration = currentGeneration() + 1;
        window.__chaseLastOfferCapture = null;
        window.__chaseHookError = '';
      };

      function watchSend(xhr, url) {
        if (!watchUrl(url)) return;
        var generation = currentGeneration();
        xhr.addEventListener('load', function() {
          if (currentGeneration() !== generation) return;
          if (xhr.status < 200 || xhr.status >= 300) return;
          try { remember(xhr.responseText); }
          catch (e) { window.__chaseHookError = String(e && e.message || e); }
        });
      }

      var OrigXHR = window.XMLHttpRequest;
      var proto = OrigXHR && OrigXHR.prototype;
      if (proto && proto.open && proto.send && !proto.__chaseOfferHooked) {
        var protoOpen = proto.open;
        var protoSend = proto.send;
        proto.open = function(method, url) {
          try { this.__chaseUrl = url || ''; } catch (e) {}
          return protoOpen.apply(this, arguments);
        };
        proto.send = function() {
          try { watchSend(this, this.__chaseUrl); } catch (e) {}
          return protoSend.apply(this, arguments);
        };
        proto.__chaseOfferHooked = true;
      }

      function PatchedXHR() {
        var xhr = new OrigXHR();
        var url = '';
        var origOpen = xhr.open;
        var origSend = xhr.send;
        if (origOpen) {
          xhr.open = function(method, nextUrl) {
            url = nextUrl || '';
            return origOpen.apply(xhr, arguments);
          };
        }
        if (origSend) {
          xhr.send = function() {
            try { watchSend(xhr, url); } catch (e) {}
            return origSend.apply(xhr, arguments);
          };
        }
        return xhr;
      }
      if (OrigXHR) {
        PatchedXHR.prototype = OrigXHR.prototype;
        window.XMLHttpRequest = PatchedXHR;
      }

      if (window.fetch) {
        var origFetch = window.fetch;
        window.fetch = function(input, init) {
          var url = (typeof input === 'string' ? input : (input && input.url)) || '';
          var pending = origFetch.apply(window, arguments);
          if (!watchUrl(url)) return pending;
          var generation = currentGeneration();
          return pending.then(function(response) {
            if (currentGeneration() !== generation) return response;
            if (response.ok) {
              response.clone().text().then(function(text) {
                // Headers can arrive before the click while the body is still
                // downloading. Drop that body once the card generation moves on.
                if (currentGeneration() !== generation) return;
                try { remember(text); } catch (e) {}
              });
            }
            return response;
          });
        };
      }
      window.__chaseOfferHookVersion = ${CHASE_OFFER_HOOK_VERSION};
    } catch (e) {
      window.__chaseHookError = String(e && e.message || e);
    }
  })();
  true;
`;

// Default switch / capture waits. Switch exits early once tiles are stable;
// capture-when-ready exits as soon as the hooked customer-offers stash lands.
export const CHASE_SWITCH_TIMEOUT_MS = 4500;
export const CHASE_CAPTURE_READY_TIMEOUT_MS = 2800;
export const CHASE_CAPTURE_POLL_MS = 120;
export const CHASE_LEGACY_SWITCH_SETTLE_MS = 900;

// Posts the last customer-offers response. The raw response never leaves the page.
export const buildCaptureOffersJs = () => `
  (function() {
    try {
      var readChaseCardLabel = ${readChaseCardLabelSource};
      var stash = window.__chaseLastOfferCapture;
      if (!stash || !stash.gridFound) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CHASE_CAPTURE_UNAVAILABLE',
          hookError: window.__chaseHookError || '',
        }));
        return;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CAPTURE_OFFERS',
        gridFound: true,
        partial: stash.partial === true,
        tileCount: stash.tileCount,
        offers: stash.offers,
        cardLabel: readChaseCardLabel() || stash.cardLabel,
      }));
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: e.message }));
    }
  })();
  true;
`;

// Poll for the hooked stash instead of a fixed post-switch sleep. Posts the same
// CAPTURE_OFFERS / CHASE_CAPTURE_UNAVAILABLE messages as buildCaptureOffersJs.
export const buildChaseCaptureWhenReadyJs = (
  timeoutMs = CHASE_CAPTURE_READY_TIMEOUT_MS,
  intervalMs = CHASE_CAPTURE_POLL_MS,
) => `
  (async function() {
    try {
      var readChaseCardLabel = ${readChaseCardLabelSource};
      var started = Date.now();
      var posted = false;
      while (Date.now() - started < ${timeoutMs}) {
        var stash = window.__chaseLastOfferCapture;
        if (stash && stash.gridFound) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CAPTURE_OFFERS',
            gridFound: true,
            partial: stash.partial === true,
            tileCount: stash.tileCount,
            offers: stash.offers,
            cardLabel: readChaseCardLabel() || stash.cardLabel,
          }));
          posted = true;
          break;
        }
        await new Promise(function(resolve) { setTimeout(resolve, ${intervalMs}); });
      }
      if (!posted) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CHASE_CAPTURE_UNAVAILABLE',
          hookError: window.__chaseHookError || '',
        }));
      }
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: e.message }));
    }
  })();
  true;
`;

// Capture starts on the card already on screen, then walks forward and wraps.
// A finished count ends the walk so the same card is not saved twice.
export function nextChaseCardPosition(currentPosition, totalCards, syncedCount) {
  if (!Number.isInteger(totalCards) || totalCards < 1) return null;
  if (!Number.isInteger(syncedCount) || syncedCount >= totalCards) return null;
  return (currentPosition + 1) % totalCards;
}

// The closed card button reports only the visible card. A later one-card
// detection must not throw away a menu list that already has the rest.
export function mergeDetectedCards(currentCards, incomingCards) {
  const current = Array.isArray(currentCards) ? currentCards : [];
  const incoming = Array.isArray(incomingCards) ? incomingCards : [];
  if (incoming.length === 0 || incoming.length < current.length) return current;
  return incoming;
}

function chaseMenuHelpers() {
  return `
    function norm(value) {
      return (value || '').replace(/\\s+/g, ' ').trim();
    }
    function last4(label) {
      var start = label.lastIndexOf('(...');
      if (start < 0) return '';
      var end = label.indexOf(')', start);
      if (end < 0) return '';
      return label.slice(start + 4, end);
    }
    function post(payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
    function tileSig() {
      var tiles = document.querySelectorAll('[data-testid="commerce-tile"]');
      var ids = [];
      for (var i = 0; i < tiles.length && i < 3; i++) ids.push(tiles[i].id || '');
      return ids.join('|') + '#' + tiles.length;
    }
    function menuButton() {
      return document.querySelector('#select-credit-card-account');
    }
    async function waitForOptions() {
      var menu = null;
      for (var i = 0; i < 25; i++) {
        menu = document.querySelector('#select-credit-card-account-menu');
        if (menu && menu.querySelector('li[role="option"]')) return menu;
        await new Promise(function(resolve) { setTimeout(resolve, 100); });
      }
      return null;
    }
    async function openMenu() {
      var button = menuButton();
      if (!button) return null;
      if (button.getAttribute('aria-expanded') !== 'true') button.click();
      return waitForOptions();
    }
    function closeMenu() {
      var button = menuButton();
      if (button && button.getAttribute('aria-expanded') === 'true') button.click();
    }
  `;
}

// Opens the card menu, reads every option, then closes it without choosing.
export const buildListCardsJs = () => `
  (async function() {
    ${chaseMenuHelpers()}
    try {
      var button = menuButton();
      if (!button) {
        post({ type: 'CARDS_LISTED', cards: [], selectedLabel: null, error: 'Card menu not found' });
        return;
      }
      var menu = await openMenu();
      var opts = menu ? Array.from(menu.querySelectorAll('li[role="option"]')) : [];
      if (!opts.length) {
        closeMenu();
        post({ type: 'CARDS_LISTED', cards: [], selectedLabel: norm(button.innerText), error: 'No cards in the menu' });
        return;
      }
      var cards = [];
      opts.forEach(function(opt, i) {
        var label = norm(opt.innerText);
        if (label.indexOf('(...') === -1) return;
        cards.push({
          label: label,
          value: String(i),
          index: i,
          selected: !!opt.querySelector('[data-testid$="-checkmark"]'),
        });
      });
      closeMenu();
      var selected = cards.find(function(card) { return card.selected; });
      post({
        type: 'CARDS_LISTED',
        cards: cards,
        selectedLabel: selected ? selected.label : norm(menuButton().innerText),
      });
    } catch (e) {
      post({ type: 'CARDS_LISTED', cards: [], selectedLabel: null, error: e.message });
    }
  })();
  true;
`;

export const buildSwitchCardJs = (index, timeoutMs = CHASE_SWITCH_TIMEOUT_MS) => `
  (async function() {
    ${chaseMenuHelpers()}
    try {
      var legacy = document.querySelector('mds-select[id="select-credit-card-account"]');
      if (legacy) {
        var legacyOpts = legacy.querySelectorAll('mds-select-option');
        var legacyTarget = legacyOpts[${index}];
        if (!legacyTarget) {
          post({ type: 'CARD_SWITCH_ERROR', message: 'Card index out of range' });
          return;
        }
        if (window.__chaseArmNextCapture) window.__chaseArmNextCapture();
        legacyTarget.click();
        legacy.dispatchEvent(new Event('change', { bubbles: true }));
        // Legacy select has no tile stability signal — short settle, not full timeout.
        await new Promise(function(resolve) { setTimeout(resolve, Math.min(${CHASE_LEGACY_SWITCH_SETTLE_MS}, ${timeoutMs})); });
        var updated = legacy.querySelector('mds-select-option[selected="true"]');
        post({
          type: 'CARD_SWITCHED',
          cardLabel: updated ? (updated.getAttribute('label') || '') : '',
          expectedIndex: ${index},
        });
        return;
      }

      var button = menuButton();
      if (!button) {
        post({ type: 'CARD_SWITCH_ERROR', message: 'Card menu not found' });
        return;
      }
      var beforeSig = tileSig();
      var menu = await openMenu();
      var opts = menu ? menu.querySelectorAll('li[role="option"]') : [];
      var target = opts[${index}];
      if (!target) {
        closeMenu();
        post({ type: 'CARD_SWITCH_ERROR', message: 'Card index out of range' });
        return;
      }
      var targetLabel = norm(target.innerText);
      var targetLast4 = last4(targetLabel);
      if (window.__chaseArmNextCapture) window.__chaseArmNextCapture();
      target.click();

      var label = '';
      var started = Date.now();
      var stable = 0;
      var lastSig = beforeSig;
      while (Date.now() - started < ${timeoutMs}) {
        await new Promise(function(resolve) { setTimeout(resolve, 150); });
        var current = menuButton();
        label = current ? norm(current.innerText) : '';
        var sig = tileSig();
        var labelMatches = targetLast4 ? last4(label) === targetLast4 : label === targetLabel;
        if (labelMatches && sig !== beforeSig && sig === lastSig) stable += 1;
        else stable = 0;
        lastSig = sig;
        if (stable >= 3) break;
      }
      if (targetLast4 && last4(label) !== targetLast4) {
        post({ type: 'CARD_SWITCH_ERROR', message: 'The card menu did not switch cards' });
        return;
      }
      post({ type: 'CARD_SWITCHED', cardLabel: label || targetLabel, expectedIndex: ${index} });
    } catch (e) {
      post({ type: 'CARD_SWITCH_ERROR', message: e.message });
    }
  })();
  true;
`;
