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
// Fixes applied:
//   1. Only forward responseType === 'REPLACE' to sync pipeline.
//      Amex fires UPDATE (partial) first, then REPLACE (full). We want the full one.
//   2. buildAmexJsonCaptureJs no longer auto-sets __amexJsonCaptureArmed = true.
//      Arming is now the caller's responsibility (SyncWebView sets captureArmed
//      before injecting this, and the bridge gate handles it).
//      This prevents the interceptor re-arming itself on loadEnd after sync is done.
//   3. buildAmexClearFiltersJs resets all active filters to "All" so that the
//      count captured matches what the user sees on screen (not a filtered subset).
//
// Amex's SPA may auto-navigate to /offers/enrolled during eligible phase.
// amexHandleLoadEnd gates injection on syncPhase match to ignore this.
// ─────────────────────────────────────────────

const DETECT_CARDS_INNER = `
  (function detectAmexCards() {
    var options = document.querySelectorAll('[role="option"][data-testid*="CARD_PRODUCT"]');
    console.log('[AmexDetect] CARD_PRODUCT options found:', options.length);
    var cards = [];
    options.forEach(function(opt, i) {
      var nameEl   = opt.querySelector('[data-testid="simple_switcher_display_name"]');
      var numEl    = opt.querySelector('[data-testid="simple_switcher_display_number_val"]');
      var name     = nameEl ? nameEl.innerText.trim() : '';
      var numRaw   = numEl  ? numEl.innerText.trim()  : '';
      var last4    = numRaw.replace(/[^\\d]/g, '').slice(-4);
      var selected = opt.getAttribute('aria-selected') === 'true';
      var testId   = opt.getAttribute('data-testid') || '';
      console.log('[AmexDetect] card[' + i + '] name=' + name + ' last4=' + last4 + ' selected=' + selected + ' testId=' + testId);
      cards.push({ label: name, last4: last4, testId: testId, index: i, selected: selected });
    });
    var selectedCard = cards.find(function(c) { return c.selected; });
    console.log('[AmexDetect] posting AMEX_CARDS_DETECTED count=' + cards.length + ' selected=' + (selectedCard ? selectedCard.label : 'none'));
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
      console.log('[AmexDetect] AMEX_OPEN_AND_DETECT_JS running');
      var combobox = document.querySelector('[data-testid="simple_switcher_combobox"]');
      console.log('[AmexDetect] combobox found:', !!combobox);
      if (!combobox) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'AMEX_CARDS_DETECTED', cards: [], selectedLabel: '', error: 'Combobox not found' }));
        return;
      }
      var alreadyOpen = combobox.getAttribute('aria-expanded') === 'true';
      console.log('[AmexDetect] combobox alreadyOpen:', alreadyOpen);
      if (alreadyOpen) {
        ${DETECT_CARDS_INNER}
        return;
      }
      combobox.click();
      console.log('[AmexDetect] combobox clicked, waiting 600ms for listbox...');
      setTimeout(function() {
        ${DETECT_CARDS_INNER}
      }, 600);
    } catch(e) {
      console.log('[AmexDetect] ERROR:', e.message);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'AMEX_CARDS_DETECTED', cards: [], selectedLabel: '', error: e.message }));
    }
  })();
  true;
`;

export const buildAmexSwitchCardJs = (testId, timeoutMs = 3500) => `
  (function() {
    try {
      console.log('[AmexSwitch] buildAmexSwitchCardJs running for testId=${testId} timeout=${timeoutMs}ms');
      var combobox = document.querySelector('[data-testid="simple_switcher_combobox"]');
      console.log('[AmexSwitch] combobox found:', !!combobox);
      if (!combobox) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'Amex combobox not found' }));
        return;
      }
      combobox.click();
      console.log('[AmexSwitch] combobox clicked, waiting 600ms...');
      setTimeout(function() {
        var option = document.querySelector('[data-testid="${testId}"]');
        console.log('[AmexSwitch] exact testId match found:', !!option);
        if (!option) {
          option = document.querySelector('[role="option"]');
          console.log('[AmexSwitch] fallback [role=option] found:', !!option);
        }
        if (!option) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'No switchable option found for: ${testId}' }));
          return;
        }
        option.click();
        console.log('[AmexSwitch] option clicked, waiting ${timeoutMs}ms for re-render...');
        setTimeout(function() {
          var displayEl = document.querySelector('[data-testid="simple_switcher_selected_option_display"]');
          var nameEl    = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_name"]') : null;
          var numEl     = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_number_val"]') : null;
          var name      = nameEl ? nameEl.innerText.trim() : '';
          var numRaw    = numEl  ? numEl.innerText.trim()  : '';
          var last4     = numRaw.replace(/[^\\d]/g, '').slice(-4);
          var cardLabel = name + (last4 ? ' (...' + last4 + ')' : '');
          console.log('[AmexSwitch] CARD_SWITCHED cardLabel=' + cardLabel + ' expectedTestId=${testId}');
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CARD_SWITCHED',
            cardLabel: cardLabel,
            expectedTestId: '${testId}',
          }));
        }, ${timeoutMs});
      }, 600);
    } catch(e) {
      console.log('[AmexSwitch] ERROR:', e.message);
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
// buildAmexClearFiltersJs
// Resets all active filter chips to "All" so the next
// ReadOffersHubPresentation call returns the full unfiltered offer set.
// This ensures the captured count matches what the user sees on screen.
// Safe to call even if no filters are active — it's a no-op in that case.
// ─────────────────────────────────────────────
export const buildAmexClearFiltersJs = () => `
  (function() {
    try {
      console.log('[AmexFilters] clearing active filters before capture');
      // Active filter chips have aria-pressed="true" or aria-selected="true"
      // Amex uses button chips with data-testid containing "filter"
      var activeFilters = document.querySelectorAll(
        '[data-testid*="filter"][aria-pressed="true"], [data-testid*="filter"][aria-selected="true"]'
      );
      console.log('[AmexFilters] active filter chips found:', activeFilters.length);
      activeFilters.forEach(function(chip) {
        console.log('[AmexFilters] clicking to deactivate:', chip.getAttribute('data-testid'));
        chip.click();
      });
      // Also look for any "All" chip and click it to ensure default state
      var allChip = document.querySelector('[data-testid*="filter-all"], [data-testid*="RECOMMENDED"]');
      if (allChip && allChip.getAttribute('aria-pressed') !== 'true') {
        console.log('[AmexFilters] clicking All/Recommended chip:', allChip.getAttribute('data-testid'));
        allChip.click();
      }
      console.log('[AmexFilters] filter reset complete');
    } catch(e) {
      console.log('[AmexFilters] ERROR clearing filters:', e.message);
    }
  })();
  true;
`;

// ─────────────────────────────────────────────
// buildAmexJsonCaptureJs
// Intercepts ALL ReadOffersHubPresentation calls.
// Every response is:
//   1. Posted as CAPTURE_JSON to RN (only when armed, for actual sync)
//      but ONLY when responseType === 'REPLACE' (full dataset, not partial UPDATE)
//   2. ALWAYS dumped to api/debug-dumps/ via DEBUG_DUMP message
//
// NOTE: This function no longer auto-sets __amexJsonCaptureArmed = true.
// The caller (SyncWebView via captureArmed ref) controls arming via
// window.__amexJsonCaptureArmed. This prevents re-arming after sync completes.
// ─────────────────────────────────────────────
export const buildAmexJsonCaptureJs = () => `
  (function() {
    try {
      console.log('[AmexCapture] buildAmexJsonCaptureJs called. currently armed:', !!window.__amexJsonCaptureArmed);

      if (!window.__amexCallCounter) window.__amexCallCounter = 0;

      function readCardLabel() {
        var displayEl = document.querySelector('[data-testid="simple_switcher_selected_option_display"]');
        var nameEl    = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_name"]') : null;
        var numEl     = displayEl ? displayEl.querySelector('[data-testid="simple_switcher_display_number_val"]') : null;
        var name      = nameEl ? nameEl.innerText.trim() : '';
        var numRaw    = numEl  ? numEl.innerText.trim()  : '';
        var last4     = numRaw.replace(/[^\\d]/g, '').slice(-4);
        var label     = name + (last4 ? ' (...' + last4 + ')' : '');
        console.log('[AmexCapture] readCardLabel =', label || '(empty)');
        return label;
      }

      function fireCapture(jsonText, source) {
        var seq = ++window.__amexCallCounter;
        var cardLabel = readCardLabel();
        console.log('[AmexCapture] fireCapture #' + seq + ' source=' + source + ' jsonText.length=' + jsonText.length + ' cardLabel=' + cardLabel + ' armed=' + window.__amexJsonCaptureArmed);

        try {
          var parsed = JSON.parse(jsonText);
          var responseType = parsed && parsed.responseType;
          console.log('[AmexCapture] #' + seq + ' parsed JSON top-level keys:', JSON.stringify(Object.keys(parsed)), 'responseType:', responseType);

          // ── DEBUG: always dump every call regardless of armed/responseType ──
          var safeLabel = (cardLabel || 'unknown').replace(/[^a-z0-9]/gi, '_');
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DEBUG_DUMP',
            label: 'ReadOffersHubPresentation_' + safeLabel + '_call' + seq,
            data: parsed,
          }));
          // ────────────────────────────────────────────────────────────────────

          // Fix 1: Only process full REPLACE responses, skip partial UPDATEs.
          // Amex fires UPDATE first (partial/intermediate), then REPLACE (full).
          // Capturing UPDATE gives fewer offers than what the user sees on screen.
          if (responseType !== 'REPLACE') {
            console.log('[AmexCapture] #' + seq + ' skipping — responseType is', responseType, '(only REPLACE is captured)');
            return;
          }

          // Fix 2: Only forward to sync pipeline when armed.
          // Caller sets window.__amexJsonCaptureArmed = true before injecting this
          // script (via SyncWebView captureArmed ref). We do NOT auto-set it here
          // to prevent re-arming after sync is complete.
          if (window.__amexJsonCaptureArmed) {
            window.__amexJsonCaptureArmed = false;
            console.log('[AmexCapture] #' + seq + ' posting CAPTURE_JSON to RN bridge');
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'CAPTURE_JSON',
              json: parsed,
              cardLabel: cardLabel,
            }));
          } else {
            console.log('[AmexCapture] #' + seq + ' REPLACE received but not armed — ignoring');
          }
        } catch(e) {
          console.log('[AmexCapture] #' + seq + ' JSON parse error:', e.message);
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
            console.log('[AmexCapture:XHR] open url:', _url.substring(0, 120));
            return origOpen.apply(xhr, arguments);
          };
          var origSend = xhr.send.bind(xhr);
          xhr.send = function() {
            if (_url.includes('ReadOffersHubPresentation')) {
              console.log('[AmexCapture:XHR] ReadOffersHubPresentation detected, armed=', window.__amexJsonCaptureArmed);
              xhr.addEventListener('load', function() {
                console.log('[AmexCapture:XHR] response status=' + xhr.status + ' responseText.length=' + (xhr.responseText || '').length);
                if (xhr.status >= 200 && xhr.status < 300) {
                  fireCapture(xhr.responseText, 'XHR');
                }
              });
            }
            return origSend.apply(xhr, arguments);
          };
          return xhr;
        }
        PatchedXHR.prototype = OrigXHR.prototype;
        window.XMLHttpRequest = PatchedXHR;
        console.log('[AmexCapture] XHR interceptor installed');
      } else {
        console.log('[AmexCapture] XHR interceptor already installed, re-armed only');
      }

      if (!window.__amexFetchPatched) {
        window.__amexFetchPatched = true;
        var origFetch = window.fetch;
        window.fetch = function(input, init) {
          var url = (typeof input === 'string' ? input : (input && input.url)) || '';
          if (url.includes('ReadOffersHubPresentation')) {
            console.log('[AmexCapture:fetch] ReadOffersHubPresentation detected, armed=', window.__amexJsonCaptureArmed);
          } else {
            console.log('[AmexCapture:fetch] url:', url.substring(0, 120));
          }
          var p = origFetch.apply(window, arguments);
          if (url.includes('ReadOffersHubPresentation')) {
            p = p.then(function(response) {
              console.log('[AmexCapture:fetch] response ok=' + response.ok + ' status=' + response.status);
              var cloned = response.clone();
              cloned.text().then(function(text) {
                console.log('[AmexCapture:fetch] response body length=' + text.length);
                if (response.ok) {
                  fireCapture(text, 'fetch');
                } else {
                  console.log('[AmexCapture:fetch] response not ok, skipping capture');
                }
              });
              return response;
            });
          }
          return p;
        };
        console.log('[AmexCapture] fetch interceptor installed');
      } else {
        console.log('[AmexCapture] fetch interceptor already installed, re-armed only');
      }

      console.log('[AmexCapture] interceptor ready — armed:', !!window.__amexJsonCaptureArmed);
    } catch(e) {
      console.log('[AmexCapture] SETUP ERROR:', e.message);
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

  console.log(
    `[amexHandleLoadEnd] url=${url}`,
    `| onLogin=${onLogin} onEligible=${onEligible} onEnrolled=${onEnrolled}`,
    `| syncPhase=${syncPhase} detectedPhase=${detectedPhase} phaseMatch=${phaseMatch}`,
    `| cardsDiscovered=${cardsDiscovered} onOffersPage=${onOffersPage}`
  );

  if (onOffersPage && !cardsDiscovered) {
    console.log('[amexHandleLoadEnd] injecting AMEX_OPEN_AND_DETECT_JS');
    injectJavaScript(AMEX_OPEN_AND_DETECT_JS);
  }

  return { onOffersPage, detectedPhase };
};
