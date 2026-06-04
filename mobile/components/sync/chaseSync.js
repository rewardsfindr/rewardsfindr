// ─────────────────────────────────────────────
// CHASE SYNC — JS injection strings
// Chase uses a custom web component dropdown:
//   mds-select[id="select-credit-card-account"]
// CARDS_DETECTED fires before onLoadEnd (SPA).
//
// FIX: Chase is a SPA — the offers page shell loads first,
// then the mds-select dropdown renders asynchronously.
// DETECT_CARDS_JS_POLL retries every 500ms for up to 10s
// so we reliably detect cards even when the DOM isn't ready
// at onLoadEnd time.
// ─────────────────────────────────────────────

export const CHASE_CREDIT_CARD_KEYWORDS = [
  'sapphire', 'freedom', 'flex', 'slate', 'ink', 'visa', 'united', 'marriott',
  'hyatt', 'southwest', 'amazon', 'prime', 'disney', 'starbucks', 'ihg',
  'british', 'aeroplan', 'reserve', 'preferred', 'unlimited', 'plus',
];

// One-shot version (kept for reference, not used in SyncWebView)
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

// Polling version — retries every 500ms for up to 10s (20 attempts).
// Use this in SyncWebView handleLoadEnd for Chase because the SPA
// renders mds-select asynchronously after the initial page load.
export const DETECT_CARDS_JS_POLL = `
  (function() {
    if (window.__chaseDetectRunning) return;
    window.__chaseDetectRunning = true;
    var KEYWORDS = ${JSON.stringify(CHASE_CREDIT_CARD_KEYWORDS)};
    var attempts = 0;
    var MAX_ATTEMPTS = 20;
    var INTERVAL_MS = 500;

    var interval = setInterval(function() {
      attempts++;
      try {
        var sel = document.querySelector('mds-select[id="select-credit-card-account"]');
        if (sel) {
          clearInterval(interval);
          window.__chaseDetectRunning = false;
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

        if (attempts >= MAX_ATTEMPTS) {
          clearInterval(interval);
          window.__chaseDetectRunning = false;
          // Post empty so SyncWebView knows detection finished with no cards
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CARDS_DETECTED',
            cards: [],
            selectedLabel: null,
          }));
        }
      } catch(e) {
        clearInterval(interval);
        window.__chaseDetectRunning = false;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CARDS_DETECTED',
          cards: [],
          selectedLabel: null,
          error: e.message,
        }));
      }
    }, INTERVAL_MS);
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
