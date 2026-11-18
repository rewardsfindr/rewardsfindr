// Pure SyncWebView navigation policy — keep bank offers in-sheet.
// Cap One (and similar) often open offers via window.open / target=_blank;
// Android may also try intent:// / market:// / mailto: escapes.
// Cloudflare Turnstile on capitaloneoffers.com uses about:blank / data: / blob:
// helpers — do not rewrite those into location.href or block subframe loads.

/** Allow same-WebView loads for http(s), about:blank, and challenge helpers. */
export function shouldAllowSyncWebViewNavigation(url) {
  const value = String(url || '');
  if (!value) return true;
  if (/^https?:\/\//i.test(value) || value === 'about:blank') return true;
  // Turnstile / bot checks load data: and blob: subframes inside the WebView.
  if (/^(data:|blob:)/i.test(value)) return true;
  return false;
}

/**
 * JS injected on onOpenWindow so the popup URL loads in the current WebView
 * instead of escaping to the system browser.
 * Returns null when there is no target URL to redirect — including about:blank
 * and Cloudflare challenge URLs that must not replace the offers document.
 */
export function buildOpenWindowRedirectJs(targetUrl) {
  if (targetUrl == null || targetUrl === '') return null;
  const value = String(targetUrl);
  if (value === 'about:blank') return null;
  if (/challenges\.cloudflare\.com/i.test(value)) return null;
  if (!/^https?:\/\//i.test(value)) return null;
  const safe = JSON.stringify(value);
  return `try { window.location.href = ${safe}; } catch (e) {} true;`;
}

/**
 * Early inject: force http(s) window.open / target=_blank navigations into the
 * same document. Leave about:blank, empty, Cloudflare, and non-http(s) opens to
 * the native handler so Turnstile can finish inside the WebView.
 */
export function buildContainOpenWindowsJs() {
  return `(function() {
  try {
    var nativeOpen = window.open ? window.open.bind(window) : null;
    function isBankHttp(url) {
      var u = String(url || '');
      if (!/^https?:\\/\\//i.test(u)) return false;
      if (u.toLowerCase().indexOf('challenges.cloudflare.com') !== -1) return false;
      return true;
    }
    function go(url) {
      if (!url) return null;
      try { window.location.href = String(url); } catch (e) {}
      return window;
    }
    window.open = function(url, name, specs) {
      if (isBankHttp(url)) return go(url);
      if (nativeOpen) return nativeOpen(url, name, specs);
      return null;
    };
    document.addEventListener('click', function(ev) {
      var el = ev.target;
      while (el && el.tagName !== 'A') el = el.parentElement;
      if (!el || !el.href) return;
      var target = (el.getAttribute('target') || '').toLowerCase();
      if (target !== '_blank' && target !== '_new') return;
      if (!isBankHttp(el.href)) return;
      ev.preventDefault();
      ev.stopPropagation();
      go(el.href);
    }, true);
  } catch (e) {}
  true;
})();`;
}
