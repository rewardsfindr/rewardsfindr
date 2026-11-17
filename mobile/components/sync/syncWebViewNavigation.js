// Pure SyncWebView navigation policy — keep bank offers in-sheet.
// Cap One (and similar) often open offers via window.open / target=_blank;
// Android may also try intent:// / market:// / mailto: escapes.

/** Allow same-WebView loads for http(s) and about:blank; block other schemes. */
export function shouldAllowSyncWebViewNavigation(url) {
  const value = String(url || '');
  if (!value) return true;
  if (/^https?:\/\//i.test(value) || value === 'about:blank') return true;
  return false;
}

/**
 * JS injected on onOpenWindow so the popup URL loads in the current WebView
 * instead of escaping to the system browser.
 * Returns null when there is no target URL to redirect.
 */
export function buildOpenWindowRedirectJs(targetUrl) {
  if (targetUrl == null || targetUrl === '') return null;
  const safe = JSON.stringify(String(targetUrl));
  return `try { window.location.href = ${safe}; } catch (e) {} true;`;
}

/**
 * Early inject: force window.open / target=_blank navigations into the same
 * document. Complements Android setSupportMultipleWindows={false} when the
 * bank page never fires onOpenWindow (or the app was on a stale Metro bundle).
 */
export function buildContainOpenWindowsJs() {
  return `(function() {
  try {
    function go(url) {
      if (!url) return null;
      try { window.location.href = String(url); } catch (e) {}
      return window;
    }
    window.open = function(url) { return go(url); };
    document.addEventListener('click', function(ev) {
      var el = ev.target;
      while (el && el.tagName !== 'A') el = el.parentElement;
      if (!el || !el.href) return;
      var target = (el.getAttribute('target') || '').toLowerCase();
      if (target !== '_blank' && target !== '_new') return;
      ev.preventDefault();
      ev.stopPropagation();
      go(el.href);
    }, true);
  } catch (e) {}
  true;
})();`;
}
