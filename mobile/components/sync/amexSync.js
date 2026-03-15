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
// Amex's SPA may auto-navigate to /offers/enrolled during eligible phase.
// amexHandleLoadEnd gates injection on syncPhase match to ignore this.
// ─────────────────────────────────────────────

const DETECT_CARDS_INNER = `
  (function detectAmexCards() {
    var options = document.querySelectorAll('[role="option"][data-testid*="CARD_PRODUCT"]');
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

// buildAmexSwitchCardJs
// Tries to click the option matching testId (CARD_PRODUCT pattern, eligible page).
// Falls back to first available [role="option"] if not found (enrolled page uses
// numeric testIds that differ from eligible page testIds).
export const buildAmexSwitchCardJs = (testId, timeoutMs = 3500) => `
  (function() {
    try {
      var combobox = document.querySelector('[data-testid="simple_switcher_combobox"]');
      if (!combobox) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'Amex combobox not found' }));
        return;
      }
      combobox.click();
      setTimeout(function() {
        // Try exact testId match first (eligible page CARD_PRODUCT pattern)
        var option = document.querySelector('[data-testid="${testId}"]');
        // Fallback: first available [role="option"] (enrolled page numeric testIds)
        if (!option) {
          option = document.querySelector('[role="option"]');
        }
        if (!option) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'No switchable option found for: ${testId}' }));
          return;
        }
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
            expectedTestId: '${testId}',
          }));
        }, ${timeoutMs});
      }, 600);
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

// ─────────────────────────────────────────────
// buildAmexJsonCaptureJs
//
// Installs a one-shot XHR + fetch interceptor that listens for the
// ReadOffersHubPresentation API response Amex fires on every page load
// and card switch. When it fires, the raw JSON body is posted as
// CAPTURE_JSON so SyncWebView can send it directly to the API instead
// of sending DOM HTML.
//
// The interceptor fires once then removes itself (oneShot flag).
// cardLabel is read from the combobox display at fire-time so the
// label is always fresh.
// ─────────────────────────────────────────────
export const buildAmexJsonCaptureJs = () => `
  (function() {
    try {
      if (window.__amexJsonCaptureArmed) {
        console.log('[AmexCapture] already armed, skipping');
        return;
      }
      window.__amexJsonCaptureArmed = true;

      function readCardLabel() {
        var displayEl = document.querySelector('[data-testid="simple_switcher_selected_option_display"]');
        var nameEl    = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_name"]') : null;
        var numEl     = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_number_val"]') : null;
        var name      = nameEl ? nameEl.innerText.trim() : '';
        var numRaw    = numEl  ? numEl.innerText.trim()  : '';
        var last4     = numRaw.replace(/[^\\d]/g, '').slice(-4);
        return name + (last4 ? ' (...' + last4 + ')' : '');
      }

      function fireCapture(jsonText) {
        window.__amexJsonCaptureArmed = false;
        var cardLabel = readCardLabel();
        console.log('[AmexCapture] firing CAPTURE_JSON cardLabel=' + cardLabel);
        try {
          var parsed = JSON.parse(jsonText);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CAPTURE_JSON',
            json: parsed,
            cardLabel: cardLabel,
          }));
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ERROR',
            message: 'AmexCapture JSON parse error: ' + e.message,
          }));
        }
      }

      // ── XHR interceptor ──────────────────────────────
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
          if (_url.includes('ReadOffersHubPresentation') && window.__amexJsonCaptureArmed) {
            xhr.addEventListener('load', function() {
              if (xhr.status >= 200 && xhr.status < 300) {
                console.log('[AmexCapture] XHR intercepted ReadOffersHubPresentation');
                fireCapture(xhr.responseText);
              }
            });
          }
          return origSend.apply(xhr, arguments);
        };
        return xhr;
      }
      PatchedXHR.prototype = OrigXHR.prototype;
      window.XMLHttpRequest = PatchedXHR;

      // ── fetch interceptor ─────────────────────────────
      var origFetch = window.fetch;
      window.fetch = function(input, init) {
        var url = (typeof input === 'string' ? input : (input && input.url)) || '';
        var p = origFetch.apply(window, arguments);
        if (url.includes('ReadOffersHubPresentation') && window.__amexJsonCaptureArmed) {
          p = p.then(function(response) {
            var cloned = response.clone();
            cloned.text().then(function(text) {
              if (response.ok) {
                console.log('[AmexCapture] fetch intercepted ReadOffersHubPresentation');
                fireCapture(text);
              }
            });
            return response;
          });
        }
        return p;
      };

      console.log('[AmexCapture] XHR+fetch interceptor armed');
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'AmexCapture setup error: ' + e.message }));
    }
  })();
  true;
`;

// ─────────────────────────────────────────────
// amexHandleLoadEnd
// Call from SyncWebView.handleLoadEnd when bank === 'amex'.
//
// Returns:
//   onOffersPage  — whether to show Sync Offers button
//   detectedPhase — 'eligible' | 'enrolled' based on URL
//
// SyncWebView must only act on detectedPhase if it matches
// the current syncPhaseRef. Amex SPA navigates to /enrolled
// on its own during the eligible phase — we must ignore that.
// ─────────────────────────────────────────────
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

  // Check enrolled FIRST — enrolled path is a substring of eligible path
  const onEnrolled = !onLogin && lower.includes(enrolledPathLower);
  // Eligible must explicitly exclude enrolled
  const onEligible = !onLogin && !onEnrolled && lower.includes(eligiblePathLower);

  const detectedPhase = onEnrolled ? 'enrolled' : 'eligible';

  // Gate on phase match to ignore Amex SPA auto-navigation to /enrolled
  const phaseMatch   = detectedPhase === syncPhase;
  const onOffersPage = phaseMatch && (onEligible || onEnrolled);

  console.log(
    `[amexHandleLoadEnd] onLogin=${onLogin} onEligible=${onEligible} onEnrolled=${onEnrolled}`,
    `syncPhase=${syncPhase} detectedPhase=${detectedPhase} phaseMatch=${phaseMatch} cardsDiscovered=${cardsDiscovered}`
  );

  if (onOffersPage && !cardsDiscovered) {
    console.log('[amexHandleLoadEnd] injecting AMEX_OPEN_AND_DETECT_JS');
    injectJavaScript(AMEX_OPEN_AND_DETECT_JS);
  }

  return { onOffersPage, detectedPhase };
};
