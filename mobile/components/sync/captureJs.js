// ─────────────────────────────────────────────
// CAPTURE JS — shared offer HTML capture
// Works for both Chase and Amex.
// Reads card label from whichever bank is active.
// ─────────────────────────────────────────────

export const buildCaptureJs = (gridSelector) => `
  (function() {
    try {
      var html = null;
      var MAX = 200000;
      ${gridSelector ? `
      var grid = document.querySelector('${gridSelector}');
      if (grid && grid.innerHTML.length > 500) { html = grid.outerHTML; }
      ` : ''}
      if (!html) {
        var selectors = ['[data-testid*="offer"]','[class*="offers"]','[id*="offers"]','main','[role="main"]'];
        for (var i = 0; i < selectors.length; i++) {
          var el = document.querySelector(selectors[i]);
          if (el && el.innerHTML.length > 500) { html = el.outerHTML; break; }
        }
      }
      if (!html) html = document.documentElement.outerHTML;
      if (html.length > MAX) html = html.substring(0, MAX);

      var cardLabel = '';

      // Amex: read from combobox display
      var amexDisplay = document.querySelector('[data-testid="simple_switcher_selected_option_display"]');
      if (amexDisplay) {
        var nameEl = amexDisplay.querySelector('[data-testid="simple_switcher_display_name"]');
        var numEl  = amexDisplay.querySelector('[data-testid="simple_switcher_display_number_val"]');
        var name   = nameEl ? nameEl.innerText.trim() : '';
        var numRaw = numEl  ? numEl.innerText.trim()  : '';
        var last4  = numRaw.replace(/[^\\d]/g, '').slice(-4);
        cardLabel  = name + (last4 ? ' (...' + last4 + ')' : '');
      }

      // Chase: read from mds-select
      if (!cardLabel) {
        var chaseSel = document.querySelector('mds-select[id="select-credit-card-account"]');
        if (chaseSel) {
          var selectedOpt = chaseSel.querySelector('mds-select-option[selected="true"]');
          if (selectedOpt) cardLabel = selectedOpt.getAttribute('label') || '';
        }
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAPTURE_HTML', html: html, cardLabel: cardLabel }));
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: e.message }));
    }
  })();
  true;
`;

export const parseCardLabel = (label) => {
  if (!label) return { cardName: null, cardLast4: null };
  const match = label.match(/^(.+?)\s*\(\.\.\.([\w\d]+)\)\s*$/);
  if (match) return { cardName: match[1].trim(), cardLast4: match[2] };
  return { cardName: label.trim(), cardLast4: null };
};
