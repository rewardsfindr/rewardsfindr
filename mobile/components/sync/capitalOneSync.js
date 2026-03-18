// ─────────────────────────────────────────────────────────────────────────────
// Capital One Sync — Feed interceptor + auto-pagination
//
// How it works:
//   1. loadEnd fires on capitaloneoffers.com → inject CAP1_FEED_INTERCEPTOR_JS
//      - patches window.fetch, guards with __cap1FetchPatched
//      - posts CAP1_INTERCEPTOR_READY when installed
//   2. User taps Sync → SyncWebView calls buildCap1StartSyncJs(currentUrl)
//      - resets accumulator: window.__cap1Offers = []
//      - sets window.__cap1Armed = true
//      - fires fetch(currentUrl) to kick off capture
//   3. Interceptor catches the fetch:
//      - calls fetchAndAccumulate(url) directly
//      - returns stub Response([]) so the page doesn't crash
//   4. fetchAndAccumulate:
//      - fetches page of tiles via _origFetch, appends to __cap1Offers
//      - posts CAP1_PROGRESS { count } each page (for status display)
//      - if response has nextCursor → builds next URL, recurses
//      - if no nextCursor → posts CAP1_CAPTURE_COMPLETE { offers, count }
//
// Response shape variants:
//   Variant A: top-level array of tiles (initial load)
//   Variant B: { tiles: [...], nextCursor: 'base64...' } (load-more pages)
//   Variant C: { feed: [...], nextCursor: '...' } (defensive)
//
// Tile types: Standard, Hero, Showcase (flat), Carousel (nested .tiles[])
//
// Multi-card note:
//   Capital One offers are card-specific — each card has a unique viewInstanceId
//   in its feed URL. We capture whichever feed is currently open in the WebView.
//   The user must navigate to each card's feed to sync multiple cards.
//   TODO: detect Capital One's card switcher UI and auto-cycle cards.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injected once after any capitaloneoffers.com page loads.
 * Patches window.fetch to intercept /feed requests.
 * Safe to re-inject — guarded by window.__cap1FetchPatched.
 */
export const CAP1_FEED_INTERCEPTOR_JS = `
(function() {
  if (window.__cap1FetchPatched) return;
  window.__cap1FetchPatched = true;
  window.__cap1Offers = [];
  window.__cap1Armed = false;

  const _origFetch = window.fetch.bind(window);

  async function fetchAndAccumulate(url) {
    let response;
    try {
      response = await _origFetch(url);
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CAP1_ERROR',
        error: 'fetch_failed: ' + e.message,
      }));
      return;
    }

    let json;
    try {
      const text = await response.text();
      json = JSON.parse(text);
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CAP1_ERROR',
        error: 'parse_failed: ' + e.message,
      }));
      return;
    }

    // Handle observed response shapes
    let tiles = [];
    let nextCursor = null;

    if (Array.isArray(json)) {
      tiles = json;                            // Variant A
    } else if (json && Array.isArray(json.tiles)) {
      tiles = json.tiles;                      // Variant B
      nextCursor = json.nextCursor || null;
    } else if (json && Array.isArray(json.feed)) {
      tiles = json.feed;                       // Variant C (defensive)
      nextCursor = json.nextCursor || null;
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CAP1_ERROR',
        error: 'unknown_shape:' + JSON.stringify(Object.keys(json || {})),
      }));
      return;
    }

    window.__cap1Offers = window.__cap1Offers.concat(tiles);

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'CAP1_PROGRESS',
      count: window.__cap1Offers.length,
    }));

    if (nextCursor) {
      try {
        const parsed = new URL(url);
        const params = parsed.searchParams;
        params.set('cursor', nextCursor);
        // Paginated endpoint uses /feed/{sessionToken}?params pattern
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        const sessionToken = pathParts.length >= 2 ? pathParts[1] : '';
        const nextUrl = sessionToken
          ? parsed.origin + '/feed/' + encodeURIComponent(sessionToken) + '?' + params.toString()
          : parsed.origin + '/feed?' + params.toString();
        await fetchAndAccumulate(nextUrl);
      } catch (e) {
        // URL build failed — report what we have so far
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CAP1_CAPTURE_COMPLETE',
          offers: window.__cap1Offers,
          count: window.__cap1Offers.length,
          note: 'cursor_url_build_failed',
        }));
      }
    } else {
      // All pages exhausted
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CAP1_CAPTURE_COMPLETE',
        offers: window.__cap1Offers,
        count: window.__cap1Offers.length,
      }));
    }
  }

  window.fetch = async function(url, opts) {
    const urlStr = typeof url === 'string' ? url : (url && url.url) || '';
    if (window.__cap1Armed && urlStr.includes('capitaloneoffers.com/feed')) {
      window.__cap1Armed = false;
      fetchAndAccumulate(urlStr);
      // Return stub so the page doesn't crash
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return _origFetch(url, opts);
  };

  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAP1_INTERCEPTOR_READY' }));
})();
true;
`;

/**
 * Arms the interceptor and fires the initial feed fetch.
 * Call this when the user taps "Sync Offers".
 * @param {string} feedUrl - the current /feed URL (with viewInstanceId etc.)
 */
export function buildCap1StartSyncJs(feedUrl) {
  const escaped = feedUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `
(function() {
  window.__cap1Offers = [];
  window.__cap1Armed = true;
  fetch('${escaped}').catch(function(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'CAP1_ERROR',
      error: 'start_fetch_failed: ' + e.message,
    }));
  });
})();
true;
`;
}

/**
 * Handles loadEnd for Capital One pages.
 * @returns {{ onFeedPage: boolean }}
 */
export function cap1HandleLoadEnd({ url }) {
  const lower = (url || '').toLowerCase();
  return { onFeedPage: lower.includes('capitaloneoffers.com') };
}
