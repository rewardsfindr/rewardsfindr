// ─────────────────────────────────────────────
// AMEX SYNC — JS injection strings + load handler
//
// Amex uses a combobox + listbox pattern:
//   [data-testid="simple_switcher_combobox"]
//   [role="option"][data-testid*="CARD_PRODUCT"]
//
// Card switching:
//   1. Click combobox to open listbox
//   2. Click the target option by data-testid
//   3. Wait for re-render, then confirm via display label
//
// CARD_PRODUCT filter excludes checking/savings accounts.
//
// Two-phase sync:
//   Phase 1 (eligible)  → global.americanexpress.com/offers (with query params)
//   Phase 2 (enrolled)  → global.americanexpress.com/offers/enrolled
//
// IMPORTANT: enrolledPath is a substring of eligiblePath so we ALWAYS
// check enrolled first and make them mutually exclusive.
//
// Amex's SPA may auto-navigate to /offers/enrolled during eligible phase.
// amexHandleLoadEnd returns detectedPhase so SyncWebView can ignore it
// when syncPhase is still 'eligible'.
//
// All Amex-specific URL detection logic lives in amexHandleLoadEnd()
// so SyncWebView stays bank-agnostic.
// ─────────────────────────────────────────────

const DETECT_CARDS_INNER = `
  (function detectAmexCards() {
    var options = document.querySelectorAll('[role="option"][data-testid*="CARD_PRODUCT"]');
    var cards = [];
    options.forEach(function(opt, i) {
      var nameEl  = opt.querySelector('[data-testid="simple_switcher_display_name"]');
      var numEl   = opt.querySelector('[data-testid="simple_switcher_display_number_val"]');
      var name    = nameEl ? nameEl.innerText.trim() : '';
      var numRaw  = numEl  ? numEl.innerText.trim()  : '';
      var last4   = numRaw.replace(/[^\\d]/g, '').slice(-4);
      var selected = opt.getAttribute('aria-selected') === 'true';
      var testId  = opt.getAttribute('data-testid') || '';
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
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'Amex combobox not found' }));
        return;
      }
      combobox.click();
      setTimeout(function() {
        var option = document.querySelector('[data-testid="${testId}"]');
        if (!option) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'Amex option not found: ${testId}' }));
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

  // detectedPhase is purely URL-based
  const detectedPhase = onEnrolled ? 'enrolled' : 'eligible';

  // onOffersPage only true when detectedPhase matches the current sync phase.
  // This prevents Amex's own SPA navigation to /enrolled from showing
  // the Sync button or injecting card detection during the eligible phase.
  const phaseMatch   = detectedPhase === syncPhase;
  const onOffersPage = phaseMatch && (onEligible || onEnrolled);

  console.log(
    `[amexHandleLoadEnd] onLogin=${onLogin} onEligible=${onEligible} onEnrolled=${onEnrolled}`,
    `syncPhase=${syncPhase} detectedPhase=${detectedPhase} phaseMatch=${phaseMatch} cardsDiscovered=${cardsDiscovered}`
  );

  // Only inject card detection when phase matches and cards not yet found
  if (onOffersPage && !cardsDiscovered) {
    console.log('[amexHandleLoadEnd] injecting AMEX_OPEN_AND_DETECT_JS');
    injectJavaScript(AMEX_OPEN_AND_DETECT_JS);
  }

  return { onOffersPage, detectedPhase };
};
