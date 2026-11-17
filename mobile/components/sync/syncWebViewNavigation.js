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
