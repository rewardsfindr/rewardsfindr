// ─────────────────────────────────────────────
// CHASE SYNC — JS injection strings
// The card control is a closed listbox button,
// #select-credit-card-account. Options exist only
// while that menu is open, as li[role=option]
// inside #select-credit-card-account-menu.
// The old mds-select markup is still handled.
// ─────────────────────────────────────────────

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
      var href = (location.href || '').toLowerCase();
      var loginNeedles = ${JSON.stringify(loginPaths.map(p => String(p).toLowerCase()))};
      var offerNeedles = ${JSON.stringify(offerPaths.map(p => String(p).toLowerCase()))};
      var onLogin = loginNeedles.some(function(p) { return p && href.indexOf(p) !== -1; });
      var onOffers = !onLogin && (
        offerNeedles.some(function(p) { return p && href.indexOf(p) !== -1; })
        || document.querySelectorAll('[data-testid="commerce-tile"]').length > 0
        || !!document.querySelector('[data-testid="grid-items-container"]')
      );
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'PAGE_STATE',
        onOffers: onOffers,
        onLogin: onLogin && !onOffers,
      }));
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

// Reads the offers grid and posts structured tiles. The full document is
// never sent. bankOfferId prefers the stable FIGG id over the carousel prefix.
export const buildCaptureOffersJs = () => `
  (function() {
    try {
      function cardLabel() {
        var sel = document.querySelector('mds-select[id="select-credit-card-account"]');
        if (sel) {
          var selectedOpt = sel.querySelector('mds-select-option[selected="true"]');
          if (selectedOpt) return selectedOpt.getAttribute('label') || '';
        }
        var current = document.querySelector('#select-credit-card-account');
        return current ? (current.innerText || '').replace(/\\s+/g, ' ').trim() : '';
      }

      function offerId(el) {
        var id = el.getAttribute('id') || '';
        var match = id.match(/FIGG:\\d+/i);
        if (match) return match[0].toUpperCase();
        return id;
      }

      var tiles = document.querySelectorAll('[data-testid="commerce-tile"]');
      var grid = document.querySelector('[data-testid="grid-items-container"]');
      var offers = [];

      tiles.forEach(function(el) {
        var merchantEl = el.querySelector('.titleTagVariant2Container') || el.querySelector('span.r9jbijk');
        var valueEl = el.querySelector('.subtitleTagVariant2Container') || el.querySelector('span.r9jbijj');
        var daysEl = el.querySelector('[data-testid="days-left-banner"]');
        var text = (el.innerText || '').toLowerCase();
        var hasOnline = text.indexOf('online') !== -1;
        var hasInStore = text.indexOf('in-store') !== -1 || text.indexOf('in store') !== -1;
        offers.push({
          bankOfferId: offerId(el),
          tileId: el.getAttribute('id') || '',
          merchantName: merchantEl ? merchantEl.textContent.trim() : '',
          valueText: valueEl ? valueEl.textContent.trim() : '',
          daysLeft: daysEl ? daysEl.textContent.trim() : '',
          isActivated: !!el.querySelector('[data-testid="offer-tile-alert-container-success"]'),
          purchaseType: hasOnline && hasInStore ? 'both' : hasOnline ? 'online' : hasInStore ? 'in-store' : null,
        });
      });

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CAPTURE_OFFERS',
        gridFound: !!grid || tiles.length > 0,
        tileCount: tiles.length,
        offers: offers,
        cardLabel: cardLabel(),
      }));
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

export const buildSwitchCardJs = (index, timeoutMs = 3500) => `
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
        legacyTarget.click();
        legacy.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(function(resolve) { setTimeout(resolve, ${timeoutMs}); });
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
      target.click();

      var label = '';
      var started = Date.now();
      var stable = 0;
      var lastSig = beforeSig;
      while (Date.now() - started < ${timeoutMs}) {
        await new Promise(function(resolve) { setTimeout(resolve, 200); });
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
