// ─────────────────────────────────────────────
// CHASE SYNC — JS injection strings
// Chase uses a custom web component dropdown:
//   mds-select[id="select-credit-card-account"]
// CARDS_DETECTED fires before onLoadEnd (SPA).
// ─────────────────────────────────────────────

export const CHASE_CREDIT_CARD_KEYWORDS = [
  'sapphire', 'freedom', 'flex', 'slate', 'ink', 'visa', 'united', 'marriott',
  'hyatt', 'southwest', 'amazon', 'prime', 'disney', 'starbucks', 'ihg',
  'british', 'aeroplan', 'reserve', 'preferred', 'unlimited', 'plus',
];

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
        if (!sel) return '';
        var selectedOpt = sel.querySelector('mds-select-option[selected="true"]');
        return selectedOpt ? (selectedOpt.getAttribute('label') || '') : '';
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
        var merchantEl = el.querySelector('span.r9jbijk');
        var valueEl = el.querySelector('span.r9jbijj');
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

export const buildSwitchCardJs = (index, timeoutMs = 3500) => `
  (function() {
    try {
      var sel = document.querySelector('mds-select[id="select-credit-card-account"]');
      if (!sel) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'Dropdown not found' }));
        return;
      }
      var opts = sel.querySelectorAll('mds-select-option');
      var target = opts[${index}];
      if (!target) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'Card index out of range' }));
        return;
      }
      target.click();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(function() {
        var updated = sel.querySelector('mds-select-option[selected="true"]');
        var label = updated ? (updated.getAttribute('label') || '') : '';
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CARD_SWITCHED',
          cardLabel: label,
          expectedIndex: ${index},
        }));
      }, ${timeoutMs});
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: e.message }));
    }
  })();
  true;
`;
