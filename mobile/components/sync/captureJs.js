// ─────────────────────────────────────────────
// CAPTURE JS — shared offer HTML capture
// Works for both Chase and Amex.
// Reads card label from whichever bank is active.
// ─────────────────────────────────────────────

export const buildCaptureJs = (gridSelector, maxBytes = 200000) => `
  (function() {
    try {
      var html = null;
      var MAX = ${maxBytes || 200000};

      // DEBUG: log what page we are on
      console.log('[CaptureJS] URL:', window.location.href);
      console.log('[CaptureJS] gridSelector:', '${gridSelector || "(none)"}');

      ${gridSelector ? `
      var grid = document.querySelector('${gridSelector}');
      console.log('[CaptureJS] grid found:', !!grid, 'innerHTML length:', grid ? grid.innerHTML.length : 0);
      if (grid && grid.innerHTML.length > 500) { html = grid.outerHTML; }
      ` : ''}

      if (!html) {
        console.log('[CaptureJS] gridSelector miss, trying fallbacks...');
        var selectors = ['[data-testid*="offer"]','[class*="offers"]','[id*="offers"]','main','[role="main"]'];
        for (var i = 0; i < selectors.length; i++) {
          var el = document.querySelector(selectors[i]);
          if (el && el.innerHTML.length > 500) {
            console.log('[CaptureJS] fallback matched:', selectors[i], 'length:', el.innerHTML.length);
            html = el.outerHTML;
            break;
          }
        }
      }

      if (!html) {
        console.log('[CaptureJS] all fallbacks missed, using documentElement');
        html = document.documentElement.outerHTML;
      }

      var truncated = html.length > MAX;
      if (truncated) html = html.substring(0, MAX);
      console.log('[CaptureJS] html length:', html.length, 'truncated:', truncated);

      // Count listViewRow elements as a quick sanity check
      var rowCount = (html.match(/listViewRow/g) || []).length;
      console.log('[CaptureJS] listViewRow occurrences in captured html:', rowCount);

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
        console.log('[CaptureJS] Amex cardLabel:', cardLabel);
      }

      // Chase: read from mds-select
      if (!cardLabel) {
        var chaseSel = document.querySelector('mds-select[id="select-credit-card-account"]');
        if (chaseSel) {
          var selectedOpt = chaseSel.querySelector('mds-select-option[selected="true"]');
          if (selectedOpt) cardLabel = selectedOpt.getAttribute('label') || '';
          console.log('[CaptureJS] Chase cardLabel:', cardLabel);
        }
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAPTURE_HTML', html: html, cardLabel: cardLabel }));
      console.log('[CaptureJS] CAPTURE_HTML posted');
    } catch(e) {
      console.log('[CaptureJS] ERROR:', e.message);
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
