// ─────────────────────────────────────────────
// AMEX SYNC — JS injection strings + load handler
//
// Amex uses a combobox + listbox pattern:
//   [data-testid="simple_switcher_combobox"]
//   [role="option"][data-testid*="CARD_PRODUCT"]  ← eligible page
//   [role="option"]                               ← enrolled page (numeric testIds)
//
// Card switching:
//   1. Click combobox to open listbox
//   2. Click target option by data-testid (CARD_PRODUCT)
//      OR fall back to first [role="option"] (enrolled page uses numeric testIds)
//   3. Wait for re-render, confirm via display label
//
// Two-phase sync:
//   Phase 1 (eligible)  → global.americanexpress.com/offers
//   Phase 2 (enrolled)  → global.americanexpress.com/offers/enrolled
//
// IMPORTANT: enrolledPath is a substring of eligiblePath so we ALWAYS
// check enrolled first and make them mutually exclusive.
//
// JSON capture strategy:
//   Instead of capturing DOM HTML, we intercept the ReadOffersHubPresentation
//   XHR/fetch response that Amex already fires when the page loads or when
//   the card switcher changes the selected card.
//   The interceptor is injected once on page load and posts CAPTURE_JSON
//   when the next matching response arrives.
//
// Key timing note:
//   Amex fires ReadOffersHubPresentation (REPLACE) BEFORE CARD_SWITCHED comes
//   back. So window.__amexJsonCaptureArmed must be set BEFORE injecting the
//   switch JS — not in the CARD_SWITCHED handler.
// ─────────────────────────────────────────────

const DETECT_CARDS_INNER = `
  (function detectAmexCards() {
    var options = document.querySelectorAll('[role="option"][data-testid*="CARD_PRODUCT"]');
    if (!options.length) options = document.querySelectorAll('[role="option"]');
    var cards = [];
    options.forEach(function(opt, i) {
      var nameEl   = opt.querySelector('[data-testid="simple_switcher_display_name"]');
      var numEl    = opt.querySelector('[data-testid="simple_switcher_display_number_val"]');
      var name     = nameEl ? nameEl.innerText.trim() : '';
      var numRaw   = numEl  ? numEl.innerText.trim()  : '';
      var last4    = numRaw.replace(/[^\\d]/g, '').slice(-4);
      var selected = opt.getAttribute('aria-selected') === 'true';
      var testId   = opt.getAttribute('data-testid') || '';
      cards.push({ label: name, last4: last4, testId: testId, index: i, selected: selected });
    });
    var selectedCard = cards.find(function(c) { return c.selected; });
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'AMEX_CARDS_DETECTED',
      cards: cards,
      selectedLabel: selectedCard ? selectedCard.label + ' (...' + selectedCard.last4 + ')' : '',
    }));
  })()
`;

export const AMEX_OPEN_AND_DETECT_JS = `
  (function() {
    try {
      var combobox = document.querySelector('[data-testid="simple_switcher_combobox"]');
      if (!combobox) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'AMEX_CARDS_DETECTED', cards: [], selectedLabel: '', error: 'Combobox not found' }));
        return;
      }
      var alreadyOpen = combobox.getAttribute('aria-expanded') === 'true';
      if (alreadyOpen) {
        ${DETECT_CARDS_INNER}
        return;
      }
      combobox.click();
      setTimeout(function() {
        ${DETECT_CARDS_INNER}
      }, 600);
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'AMEX_CARDS_DETECTED', cards: [], selectedLabel: '', error: e.message }));
    }
  })();
  true;
`;

export const buildAmexSwitchCardJs = (testId, timeoutMs = 3500) => `
  (function() {
    try {
      var combobox = document.querySelector('[data-testid="simple_switcher_combobox"]');
      if (!combobox) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'Amex card menu was not found.' }));
        return;
      }
      var requested = ${JSON.stringify(testId)};
      function choose(attempt) {
        var option = document.querySelector('[data-testid="' + requested + '"]');
        if (!option) {
          if (attempt === 0) {
            combobox.click();
            setTimeout(function() { choose(1); }, 600);
            return;
          }
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'Could not open the next Amex card. Nothing else was changed.' }));
          return;
        }
        // Responses already in flight belong to the card we are leaving.
        // Bump the generation before the click so only this card's replies are saved.
        window.__amexCaptureGeneration = (window.__amexCaptureGeneration || 0) + 1;
        window.__amexBest = null;
        clearTimeout(window.__amexQuietTimer);
        option.click();
        setTimeout(function() {
          var displayEl = document.querySelector('[data-testid="simple_switcher_selected_option_display"]');
          var nameEl    = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_name"]') : null;
          var numEl     = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_number_val"]') : null;
          var name      = nameEl ? nameEl.innerText.trim() : '';
          var numRaw    = numEl  ? numEl.innerText.trim()  : '';
          var last4     = numRaw.replace(/[^\\d]/g, '').slice(-4);
          var cardLabel = name + (last4 ? ' (...' + last4 + ')' : '');
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CARD_SWITCHED',
            cardLabel: cardLabel,
            expectedTestId: requested,
          }));
        }, ${timeoutMs});
      }
      if (combobox.getAttribute('aria-expanded') === 'true') choose(1);
      else {
        combobox.click();
        setTimeout(function() { choose(0); }, 600);
      }
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: e.message }));
    }
  })();
  true;
`;

export const AMEX_READ_CARD_LABEL_JS = `
  (function() {
    var displayEl = document.querySelector('[data-testid="simple_switcher_selected_option_display"]');
    var nameEl    = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_name"]') : null;
    var numEl     = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_number_val"]') : null;
    var name      = nameEl ? nameEl.innerText.trim() : '';
    var numRaw    = numEl  ? numEl.innerText.trim()  : '';
    var last4     = numRaw.replace(/[^\\d]/g, '').slice(-4);
    return name + (last4 ? ' (...' + last4 + ')' : '');
  })()
`;

// Resets all active filter chips so the full unfiltered offer set is returned.
export const buildAmexClearFiltersJs = () => `
  (function() {
    try {
      var activeFilters = document.querySelectorAll(
        '[data-testid*="filter"][aria-pressed="true"], [data-testid*="filter"][aria-selected="true"]'
      );
      activeFilters.forEach(function(chip) { chip.click(); });
      var allChip = document.querySelector('[data-testid*="filter-all"], [data-testid*="RECOMMENDED"]');
      if (allChip && allChip.getAttribute('aria-pressed') !== 'true') {
        allChip.click();
      }
    } catch(e) { /* silent — filter clear is best-effort */ }
  })();
  true;
`;

// Intercepts ReadOffersHubPresentation XHR/fetch.
// Forwards REPLACE and UPDATE while window.__amexJsonCaptureArmed is true,
// keeps the fullest payload, and posts it once after the responses go quiet.
// Arming is done externally by SyncWebView — this function never auto-arms.
export const buildAmexJsonCaptureJs = () => `
  (function() {
    try {
      if (!window.__amexCallCounter) window.__amexCallCounter = 0;

      function readCardLabel() {
        var displayEl = document.querySelector('[data-testid="simple_switcher_selected_option_display"]');
        var nameEl    = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_name"]') : null;
        var numEl     = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_number_val"]') : null;
        var name      = nameEl ? nameEl.innerText.trim() : '';
        var numRaw    = numEl  ? numEl.innerText.trim()  : '';
        var last4     = numRaw.replace(/[^\\d]/g, '').slice(-4);
        return name + (last4 ? ' (...' + last4 + ')' : '');
      }

      function countOffers(parsed) {
        function count(container) {
          if (!container || !container.offersList) return 0;
          return Object.keys(container.offersList).reduce(function(sum, key) {
            var list = container.offersList[key];
            return sum + (Array.isArray(list) ? list.length : 0);
          }, 0);
        }
        return count(parsed && parsed.recommendedOffers)
          + count(parsed && parsed.addedToCardViewAll)
          + count(parsed && parsed.addedToCard);
      }

      function postBest() {
        if (!window.__amexJsonCaptureArmed || !window.__amexBest) return;
        window.__amexJsonCaptureArmed = false;
        var best = window.__amexBest;
        window.__amexBest = null;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CAPTURE_JSON',
          json: best.json,
          cardLabel: readCardLabel(),
        }));
      }

      // Amex can send the same card more than once while a page of offers
      // arrives or a filter refresh finishes. Keep the fullest payload and
      // post it once, after the responses go quiet.
      // sentGen is the capture generation when the request started. A reply
      // from the previous card must not replace this card's offers.
      function fireCapture(jsonText, sentGen) {
        var currentGen = window.__amexCaptureGeneration || 0;
        if (sentGen != null && sentGen !== currentGen) return;
        ++window.__amexCallCounter;
        try {
          var parsed = JSON.parse(jsonText);
          var responseType = parsed && parsed.responseType;
          if (responseType !== 'REPLACE' && responseType !== 'UPDATE') return;
          if (!window.__amexJsonCaptureArmed) return;
          var count = countOffers(parsed);
          if (!window.__amexBest || count >= window.__amexBest.count) {
            window.__amexBest = { json: parsed, count: count };
          }
          clearTimeout(window.__amexQuietTimer);
          window.__amexQuietTimer = setTimeout(postBest, 800);
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ERROR',
            message: 'AmexCapture JSON parse error: ' + e.message,
          }));
        }
      }

      if (!window.__amexXhrPatched) {
        window.__amexXhrPatched = true;
        var OrigXHR = window.XMLHttpRequest;
        function PatchedXHR() {
          var xhr = new OrigXHR();
          var _url = '';
          var origOpen = xhr.open.bind(xhr);
          xhr.open = function(method, url) {
            _url = url || '';
            return origOpen.apply(xhr, arguments);
          };
          var origSend = xhr.send.bind(xhr);
          xhr.send = function() {
            var sentGen = window.__amexCaptureGeneration || 0;
            if (_url.includes('ReadOffersHubPresentation')) {
              xhr.addEventListener('load', function() {
                if (xhr.status >= 200 && xhr.status < 300) fireCapture(xhr.responseText, sentGen);
              });
            }
            return origSend.apply(xhr, arguments);
          };
          return xhr;
        }
        PatchedXHR.prototype = OrigXHR.prototype;
        window.XMLHttpRequest = PatchedXHR;
      }

      if (!window.__amexFetchPatched) {
        window.__amexFetchPatched = true;
        var origFetch = window.fetch;
        window.fetch = function(input, init) {
          var url = (typeof input === 'string' ? input : (input && input.url)) || '';
          var sentGen = window.__amexCaptureGeneration || 0;
          var p = origFetch.apply(window, arguments);
          if (url.includes('ReadOffersHubPresentation')) {
            p = p.then(function(response) {
              var cloned = response.clone();
              cloned.text().then(function(text) {
                if (response.ok) fireCapture(text, sentGen);
              });
              return response;
            });
          }
          return p;
        };
      }
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'AmexCapture setup error: ' + e.message }));
    }
  })();
  true;
`;

export const amexHandleLoadEnd = ({
  url,
  config,
  syncPhase,
  cardsDiscovered,
  injectJavaScript,
}) => {
  const lower = url.toLowerCase();
  const enrolledPathLower = config.enrolledPath.toLowerCase();
  const eligiblePathLower = config.eligiblePath.toLowerCase();

  const onLogin = (config.loginPaths || []).some(p => lower.includes(p.toLowerCase()));

  const onEnrolled = !onLogin && lower.includes(enrolledPathLower);
  const onEligible = !onLogin && !onEnrolled && lower.includes(eligiblePathLower);

  const detectedPhase = onEnrolled ? 'enrolled' : 'eligible';
  const phaseMatch   = detectedPhase === syncPhase;
  const onOffersPage = phaseMatch && (onEligible || onEnrolled);

  if (onOffersPage && !cardsDiscovered) {
    injectJavaScript(AMEX_OPEN_AND_DETECT_JS);
  }

  return { onOffersPage, detectedPhase };
};
