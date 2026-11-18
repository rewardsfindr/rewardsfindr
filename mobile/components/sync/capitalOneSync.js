// ─────────────────────────────────────────────
// CAPITAL ONE SYNC — JS injection strings
//
// Offers feed on capitaloneoffers.com loads { cursor, data[] }.
// The hook stores offer fields only from the page's natural feed
// response. Sync reads the stash — it does not issue a new list GET,
// poll, or page the cursor. Activate APIs are never called.
// ─────────────────────────────────────────────

const stripCapitalOneOffersSource = `function stripCapitalOneOffers(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!Array.isArray(parsed.data)) return null;

  function sourcesKey(list) {
    if (!Array.isArray(list)) return '';
    var cleaned = [];
    for (var i = 0; i < list.length; i++) {
      var value = list[i] == null ? '' : String(list[i]).trim().toLowerCase();
      if (!value) continue;
      if (cleaned.indexOf(value) === -1) cleaned.push(value);
    }
    cleaned.sort();
    return cleaned.join('+');
  }

  function rewardText(tile) {
    if (!tile || typeof tile !== 'object') return '';
    var button = tile.buttonText == null ? '' : String(tile.buttonText).trim();
    var rate = tile.rateText == null ? '' : String(tile.rateText).trim();
    if (/shop\\s*now|explore|learn\\s*more|see\\s*offers/i.test(button) && rate) return rate;
    if (button) return button;
    return rate;
  }

  function expiryFromProse(tile) {
    if (!tile || typeof tile !== 'object') return '';
    var blobs = [
      tile.subText, tile.headingText, tile.text, tile.buttonText, tile.rateText,
    ];
    for (var i = 0; i < blobs.length; i++) {
      var text = blobs[i] == null ? '' : String(blobs[i]);
      if (!text) continue;
      var match = text.match(/offer\\s+ends?\\s+([A-Za-z]+\\s+\\d{1,2},?\\s*\\d{4})/i)
        || text.match(/ends?\\s+([A-Za-z]+\\s+\\d{1,2},?\\s*\\d{4})/i)
        || text.match(/expires?\\s+([A-Za-z]+\\s+\\d{1,2},?\\s*\\d{4})/i);
      if (match) return String(match[1]).trim();
    }
    return '';
  }

  function stripTile(tile, sourceHint) {
    if (!tile || typeof tile !== 'object' || Array.isArray(tile)) return null;
    var tileType = tile.type == null ? '' : String(tile.type).trim();
    if (/^promotedaffiliate$/i.test(tileType)) return null;

    var merchantTLD = tile.merchantTLD == null ? '' : String(tile.merchantTLD).trim().toLowerCase();
    var merchantName = tile.merchantDisplayName == null ? '' : String(tile.merchantDisplayName).trim();
    if (!merchantTLD || !merchantName) return null;

    var source = tileType
      ? tileType.toLowerCase()
      : (sourceHint ? String(sourceHint).toLowerCase() : 'standard');
    var sources = sourcesKey(tile.offerSources);
    if (!sources) return null;

    return {
      bankOfferId: merchantTLD + '|' + source + '|' + sources,
      merchantTLD: merchantTLD,
      merchantName: merchantName,
      type: source,
      channel: tile.text == null ? '' : String(tile.text).trim(),
      rewardText: rewardText(tile),
      offerSources: Array.isArray(tile.offerSources)
        ? tile.offerSources.map(function(s) { return String(s || '').trim(); }).filter(Boolean)
        : [],
      expiryText: expiryFromProse(tile),
      isActivated: false,
    };
  }

  function collect(list, sourceHint, out) {
    if (!Array.isArray(list)) return;
    for (var i = 0; i < list.length; i++) {
      var tile = list[i];
      if (!tile || typeof tile !== 'object') continue;
      var tileType = tile.type == null ? '' : String(tile.type).trim();
      if (/^carousel$/i.test(tileType) && Array.isArray(tile.tiles)) {
        collect(tile.tiles, 'carousel', out);
        continue;
      }
      var stripped = stripTile(tile, sourceHint || tileType || 'standard');
      if (stripped) out.push(stripped);
    }
  }

  var offers = [];
  collect(parsed.data, '', offers);
  return { offers: offers };
}`;

export const stripCapitalOneOffers = new Function(`return (${stripCapitalOneOffersSource})`)();

const unwrapCapitalOnePayloadSource = `function unwrapCapitalOnePayload(parsed) {
  var skipKey = {
    document: 1, frames: 1, parent: 1, top: 1, self: 1, window: 1,
    ReactNativeWebView: 1, location: 1, navigator: 1, history: 1,
    localStorage: 1, sessionStorage: 1, cursor: 1,
  };

  function hostOf(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!Array.isArray(value.data)) return null;
    return value;
  }

  function walk(value, depth, seen) {
    if (!value || typeof value !== 'object') return null;
    if (typeof Node === 'function' && value instanceof Node) return null;
    if (seen.indexOf(value) !== -1) return null;
    seen.push(value);
    if (seen.length > 2500) return null;
    var host = hostOf(value);
    if (host) return host;
    if (depth > 7) return null;
    var keys = [];
    try { keys = Object.keys(value); } catch (e) { return null; }
    keys.sort(function(a, b) {
      function rank(key) {
        return /offer|feed|tile|state|store|payload|data|response/i.test(key) ? 0 : 1;
      }
      return rank(a) - rank(b);
    });
    for (var i = 0; i < keys.length; i++) {
      if (seen.length > 2500) break;
      var key = keys[i];
      if (skipKey[key]) continue;
      var child;
      try { child = value[key]; } catch (e) { continue; }
      if (!child || typeof child !== 'object') continue;
      var found = walk(child, depth + 1, seen);
      if (found) return found;
    }
    return null;
  }

  return walk(parsed, 0, []);
}`;

// Installed before the offers page runs. A matching feed response is
// reduced to offer fields. The raw response never leaves the page.
// Never issues a list GET of its own — only watches the page's traffic.
export const buildCapitalOneOfferCaptureJs = () => `
  (function() {
    try {
      if (window.__capOneOfferHookVersion === 5) return;
      var stripCapitalOneOffers = ${stripCapitalOneOffersSource};
      var unwrapCapitalOnePayload = ${unwrapCapitalOnePayloadSource};

      function mergeOfferPages(existing, incoming) {
        var seen = {};
        var out = [];
        function add(list) {
          if (!Array.isArray(list)) return;
          for (var i = 0; i < list.length; i++) {
            var offer = list[i];
            if (!offer || !offer.bankOfferId) continue;
            var id = String(offer.bankOfferId);
            if (seen[id]) continue;
            seen[id] = 1;
            out.push(offer);
          }
        }
        add(existing);
        add(incoming);
        return { offers: out };
      }

      function remember(text) {
        var parsed = JSON.parse(text);
        var unwrapped = unwrapCapitalOnePayload(parsed);
        var stripped = stripCapitalOneOffers(unwrapped);
        if (!stripped) {
          window.__capOneHookError = 'unrecognized';
          return;
        }
        // Never stash/wipe on empty (rate-limit silent). Merge later
        // non-empty "View More" / cursor pages by bankOfferId.
        if (!Array.isArray(stripped.offers) || stripped.offers.length === 0) {
          if (!(window.__capOneLastOffers && window.__capOneLastOffers.offers
              && window.__capOneLastOffers.offers.length > 0)) {
            window.__capOneHookError = 'empty';
          }
          return;
        }
        if (window.__capOneLastOffers && Array.isArray(window.__capOneLastOffers.offers)
            && window.__capOneLastOffers.offers.length > 0) {
          window.__capOneLastOffers = mergeOfferPages(
            window.__capOneLastOffers.offers,
            stripped.offers
          );
        } else {
          window.__capOneLastOffers = stripped;
        }
        window.__capOneHookError = '';
      }

      function onOffersHost() {
        try {
          var host = String((window.location && window.location.hostname) || '').toLowerCase();
          return host.indexOf('capitaloneoffers.com') !== -1;
        } catch (e) {
          return false;
        }
      }

      function watchUrl(url) {
        var value = String(url || '').toLowerCase();
        if (!value) return false;
        // Absolute list URLs include the host; mobile SPAs often use relative /feed/<token>.
        var absolute = value.indexOf('http://') === 0 || value.indexOf('https://') === 0;
        if (absolute) {
          if (value.indexOf('capitaloneoffers.com') === -1) return false;
        } else if (!onOffersHost()) {
          return false;
        }
        // List XHR: /feed/<opaqueSessionToken>?… — not the HTML page /feed?
        try {
          var path = value.split('?')[0];
          var marker = path.indexOf('/feed/');
          if (marker === -1) return false;
          var after = path.slice(marker + '/feed/'.length).replace(/\\/+$/, '');
          return after.length > 0 && after.indexOf('/') === -1;
        } catch (e) {
          return value.indexOf('/feed/') !== -1;
        }
      }

      function maybeRemember(text, requireUrlMatch, url) {
        var body = String(text || '');
        if (!body) {
          if (requireUrlMatch) window.__capOneHookError = 'silent';
          return;
        }
        if (requireUrlMatch || body.indexOf('merchantTLD') !== -1 || body.indexOf('merchantDisplayName') !== -1) {
          try { remember(body); }
          catch (e) {
            if (requireUrlMatch || watchUrl(url)) window.__capOneHookError = 'unreadable';
          }
        }
      }

      function watchSend(xhr, url) {
        if (!watchUrl(url)) return;
        xhr.addEventListener('load', function() {
          if (xhr.status < 200 || xhr.status >= 300) return;
          maybeRemember(xhr.responseText, true, url);
        });
      }

      var OrigXHR = window.XMLHttpRequest;
      var proto = OrigXHR && OrigXHR.prototype;
      if (proto && proto.open && proto.send && !proto.__capOneOfferHooked) {
        var protoOpen = proto.open;
        var protoSend = proto.send;
        proto.open = function(method, url) {
          try { this.__capOneUrl = url || ''; } catch (e) {}
          return protoOpen.apply(this, arguments);
        };
        proto.send = function() {
          try { watchSend(this, this.__capOneUrl); } catch (e) {}
          return protoSend.apply(this, arguments);
        };
        proto.__capOneOfferHooked = true;
      }

      function PatchedXHR() {
        var xhr = new OrigXHR();
        var url = '';
        var origOpen = xhr.open;
        var origSend = xhr.send;
        if (origOpen) {
          xhr.open = function(method, nextUrl) {
            url = nextUrl || '';
            return origOpen.apply(xhr, arguments);
          };
        }
        if (origSend) {
          xhr.send = function() {
            try { watchSend(xhr, url); } catch (e) {}
            return origSend.apply(xhr, arguments);
          };
        }
        return xhr;
      }
      if (OrigXHR) {
        PatchedXHR.prototype = OrigXHR.prototype;
        window.XMLHttpRequest = PatchedXHR;
      }

      if (window.fetch) {
        var origFetch = window.fetch;
        window.fetch = function(input, init) {
          var url = (typeof input === 'string' ? input : (input && input.url)) || '';
          var pending = origFetch.apply(window, arguments);
          if (!watchUrl(url)) return pending;
          return pending.then(function(response) {
            if (response.ok) {
              response.clone().text().then(function(text) {
                maybeRemember(text, true, url);
              });
            }
            return response;
          });
        };
      }
      window.__capOneOfferHookVersion = 5;
    } catch (e) {
      window.__capOneHookError = 'unreadable';
    }
  })();
  true;
`;

// Click "View More Offers" until gone (bookmarklet-style). Also scrape visible
// feed-tile DOM into the stash so pages that never re-hit /feed/<token> still count.
export const buildCapitalOneExpandOffersJs = () => `
  (function() {
    var MAX_CLICKS = 60;
    function sleep(ms) {
      return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }
    function findMoreButton() {
      var nodes = document.querySelectorAll('button, a, [role="button"], div, span');
      for (var i = 0; i < nodes.length; i++) {
        var text = String(nodes[i].textContent || '').replace(/\\s+/g, ' ').trim();
        if (/^view\\s*more(\\s+offers)?$/i.test(text)) return nodes[i];
      }
      return null;
    }
    function clickLikeBookmarklet(el) {
      if (!el) return;
      try {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      } catch (e) {}
      var clicked = false;
      try {
        for (var key in el) {
          if (!key || key.indexOf('__react') !== 0) continue;
          var props = el[key];
          var handler = props && (props.onClick
            || (props.memoizedProps && props.memoizedProps.onClick));
          if (typeof handler === 'function') {
            handler({ preventDefault: function() {}, stopPropagation: function() {} });
            clicked = true;
            break;
          }
        }
      } catch (e) {}
      if (!clicked) {
        try { el.click(); } catch (e) {}
      }
    }
    function scrapeDomOffers() {
      var tiles = document.querySelectorAll('div[data-testid^="feed-tile-"]');
      var offers = [];
      for (var i = 0; i < tiles.length; i++) {
        var tile = tiles[i];
        var full = String(tile.textContent || '');
        var miles = '';
        var milesEl = tile.querySelector('.font-semibold') || tile.querySelector('.text-2xl');
        if (milesEl) miles = String(milesEl.textContent || '').trim();
        if (!miles || miles.indexOf('$') !== -1 || miles.length > 20) {
          var match = full.match(/(up to\\s*)?([\\d,]+\\.?\\d*)\\s*(%|x|miles|points)/i);
          if (match) {
            miles = ((match[1] || '') + match[2] + ' ' + match[3]).replace(/\\s+/g, ' ').trim();
          } else {
            miles = '';
          }
        }
        var merchantName = 'Unknown';
        var merchantTLD = '';
        var img = tile.querySelector('img');
        if (img) {
          var alt = img.getAttribute('alt');
          if (alt && alt.toLowerCase().indexOf('logo') === -1) merchantName = alt.trim();
          try {
            var src = img.getAttribute('src') || '';
            var domainMatch = src.match(/[?&]domain=([^&]+)/i);
            if (domainMatch) {
              merchantTLD = decodeURIComponent(domainMatch[1]).toLowerCase();
              if (merchantName === 'Unknown') {
                var parts = merchantTLD.split('.');
                var namePart = parts.length > 1 ? parts[parts.length - 2] : parts[0];
                merchantName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
              }
            }
          } catch (e) {}
        }
        if (!merchantTLD && merchantName !== 'Unknown') {
          merchantTLD = merchantName.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
        }
        if (!merchantTLD || !miles) continue;
        var lower = full.toLowerCase();
        var channel = 'Online';
        if (lower.indexOf('in-store') !== -1) {
          channel = lower.indexOf('online') !== -1 ? 'In-Store & Online' : 'In-Store';
        } else if (lower.indexOf('in-app') !== -1) {
          channel = 'In-App';
        }
        offers.push({
          bankOfferId: merchantTLD + '|dom|' + miles.toLowerCase().replace(/\\s+/g, ''),
          merchantTLD: merchantTLD,
          merchantName: merchantName,
          type: 'dom',
          channel: channel,
          rewardText: miles,
          offerSources: ['dom'],
          expiryText: '',
          isActivated: false,
        });
      }
      return { offers: offers };
    }
    function mergeDomIntoStash() {
      var scraped = scrapeDomOffers();
      if (!scraped.offers.length) return scraped.offers.length;
      if (!window.__capOneLastOffers || !Array.isArray(window.__capOneLastOffers.offers)) {
        window.__capOneLastOffers = scraped;
        return scraped.offers.length;
      }
      var seen = {};
      var out = [];
      function add(list) {
        for (var i = 0; i < list.length; i++) {
          var o = list[i];
          if (!o || !o.bankOfferId) continue;
          var id = String(o.bankOfferId);
          if (seen[id]) continue;
          seen[id] = 1;
          out.push(o);
        }
      }
      add(window.__capOneLastOffers.offers);
      add(scraped.offers);
      window.__capOneLastOffers = { offers: out };
      return out.length;
    }
    async function expand() {
      var clicks = 0;
      var before = (window.__capOneLastOffers && window.__capOneLastOffers.offers
        && window.__capOneLastOffers.offers.length) || 0;
      while (clicks < MAX_CLICKS) {
        try { window.scrollTo(0, document.body.scrollHeight); } catch (e) {}
        mergeDomIntoStash();
        var button = findMoreButton();
        if (!button) break;
        clicks += 1;
        try { button.scrollIntoView({ block: 'center' }); } catch (e) {}
        await sleep(500);
        clickLikeBookmarklet(button);
        var waited = 0;
        while (waited < 12) {
          await sleep(350);
          waited += 1;
          mergeDomIntoStash();
          if (findMoreButton()) break;
        }
      }
      mergeDomIntoStash();
      var after = (window.__capOneLastOffers && window.__capOneLastOffers.offers
        && window.__capOneLastOffers.offers.length) || 0;
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CAPONE_EXPAND_STATUS',
            clicks: clicks,
            stashBefore: before,
            stashAfter: after,
            domTiles: document.querySelectorAll('div[data-testid^="feed-tile-"]').length,
          }));
        }
      } catch (e) {}
      return clicks;
    }
    window.__capOneExpandOffers = expand;
    window.__capOneScrapeDomOffers = scrapeDomOffers;
  })();
  true;
`;

// Probe the Cap One feed chrome for a card picker / switcher and report labels.
export const buildCapitalOneDetectCardsJs = () => `
  (function() {
    try {
      var cards = [];
      var seen = {};
      function add(label, selected) {
        var name = String(label || '').replace(/\\s+/g, ' ').trim();
        if (!name || name.length < 3 || name.length > 80) return;
        if (/sign\\s*in|view more|category|filter|activate|offers for you/i.test(name)) return;
        var key = name.toLowerCase();
        if (seen[key]) return;
        seen[key] = 1;
        cards.push({ label: name, selected: !!selected });
      }
      var selects = document.querySelectorAll('select');
      for (var s = 0; s < selects.length; s++) {
        var opts = selects[s].options || [];
        for (var o = 0; o < opts.length; o++) {
          add(opts[o].text, opts[o].selected);
        }
      }
      var nodes = document.querySelectorAll(
        '[data-testid*="card"], [data-testid*="Card"], [aria-label*="card"], [aria-label*="Card"], button, [role="option"], [role="menuitem"]'
      );
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var text = String(el.getAttribute('aria-label') || el.textContent || '')
          .replace(/\\s+/g, ' ').trim();
        if (!/(\\d{4}|venture|savor|quark|spark|platinum|quicksilver|cash|miles)/i.test(text)) continue;
        var selected = el.getAttribute('aria-selected') === 'true'
          || /selected|current|active/i.test(String(el.className || ''));
        add(text, selected);
      }
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CAPONE_CARDS',
          cards: cards,
          href: String((window.location && window.location.href) || ''),
        }));
      }
    } catch (e) {}
  })();
  true;
`;

// Expand View More, then post CAPONE_OFFERS from the merged stash.
export const buildCapitalOneExpandThenReadJs = () => `
  (function() {
    try {
      try { sessionStorage.removeItem('__capOneReloadForSync'); } catch (e) {}
      ${buildCapitalOneExpandOffersJs()}
      function runRead() {
        ${buildCapitalOneReadJs()}
      }
      var expand = window.__capOneExpandOffers;
      if (typeof expand !== 'function') {
        runRead();
        return;
      }
      expand().then(function() { runRead(); }).catch(function() { runRead(); });
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAPONE_CAPTURE_UNAVAILABLE' }));
    }
  })();
  true;
`;

// Sync press helper: expand+read if stash already warm; otherwise soft-reload
// once (sessionStorage flag survives the reload) so the first feed XHR can be
// caught after Cloudflare. loadEnd then runs expand+read.
export const buildCapitalOneSyncReadOrReloadJs = () => `
  (function() {
    try {
      var reloadKey = '__capOneReloadForSync';
      var alreadyReloaded = false;
      try { alreadyReloaded = sessionStorage.getItem(reloadKey) === '1'; } catch (e) {}
      if (alreadyReloaded) {
        try { sessionStorage.removeItem(reloadKey); } catch (e) {}
        ${buildCapitalOneExpandThenReadJs()}
        return;
      }
      var ready = window.__capOneLastOffers && Array.isArray(window.__capOneLastOffers.offers)
        && window.__capOneLastOffers.offers.length > 0;
      if (ready) {
        ${buildCapitalOneExpandThenReadJs()}
        return;
      }
      try { sessionStorage.setItem(reloadKey, '1'); } catch (e) {}
      window.location.reload();
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAPONE_CAPTURE_UNAVAILABLE' }));
    }
  })();
  true;
`;

// Tells the app the Capital One offers feed chrome is on screen.
export const buildCapitalOneOffersVisibleJs = () => `
  (function() {
    try {
      var href = String((window.location && window.location.href) || '').toLowerCase();
      var text = document.body ? (document.body.innerText || '') : '';
      // Host match is enough — opaque /feed/<token> paths and query-only feeds vary.
      var onOffers = href.indexOf('capitaloneoffers.com') !== -1;
      var markers = /additional offers for you|added to card|capital one offers/i.test(text);
      if ((onOffers || markers) && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CAPONE_ON_OFFERS',
          signedIn: onOffers || markers,
        }));
      }
    } catch (e) {}
  })();
  true;
`;

// Posts offer fields from the feed stash, or from a same-origin
// window/frame that already holds the list. Never fetches /feed again.
// Raw bank JSON never leaves the page.
export const buildCapitalOneReadJs = () => `
  (function() {
    try {
      var stripCapitalOneOffers = ${stripCapitalOneOffersSource};
      var unwrapCapitalOnePayload = ${unwrapCapitalOnePayloadSource};

      function hasOffers(payload) {
        if (!payload || !Array.isArray(payload.offers)) return false;
        for (var i = 0; i < payload.offers.length; i++) {
          var id = payload.offers[i] && payload.offers[i].bankOfferId;
          if (id != null && String(id).trim() !== '') return true;
        }
        return false;
      }

      function usable(value) {
        var stripped = stripCapitalOneOffers(unwrapCapitalOnePayload(value));
        if (!hasOffers(stripped)) return null;
        return stripped;
      }

      function fromFrames(win, doc) {
        var frameList = [];
        try {
          var framed = win.frames;
          var count = framed && framed.length || 0;
          for (var i = 0; i < count; i++) {
            try { frameList.push(framed[i]); } catch (e) {}
          }
        } catch (e) {}
        if (doc && typeof doc.querySelectorAll === 'function') {
          try {
            var iframes = doc.querySelectorAll('iframe');
            for (var j = 0; j < iframes.length; j++) {
              try { if (iframes[j].contentWindow) frameList.push(iframes[j].contentWindow); } catch (e) {}
            }
          } catch (e) {}
        }
        for (var f = 0; f < frameList.length; f++) {
          try {
            var found = usable(frameList[f]);
            if (found) return found;
          } catch (e) {}
        }
        return null;
      }

      var stash = null;
      if (window.__capOneLastOffers && Array.isArray(window.__capOneLastOffers.offers)
          && window.__capOneLastOffers.offers.length > 0) {
        stash = {
          offers: window.__capOneLastOffers.offers.filter(function(o) {
            return o && o.bankOfferId && o.merchantName;
          }),
        };
      }
      if (!hasOffers(stash)) {
        try { stash = usable(window); } catch (e) { stash = null; }
      }
      if (!hasOffers(stash)) {
        try { stash = fromFrames(window, document); } catch (e) { stash = null; }
      }

      if (!hasOffers(stash)) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAPONE_CAPTURE_UNAVAILABLE' }));
        return;
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CAPONE_OFFERS',
        offers: stash,
      }));
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CAPONE_CAPTURE_UNAVAILABLE',
      }));
    }
  })();
  true;
`;

// ── Sync Offers chrome under Cap One iframe loadStart/loadEnd churn ──
// Cap One offers pages fire many subframe loads. Clearing chrome or requiring
// pageLoaded on every churn hides Sync Offers. Pure helpers below encode the
// retention rules so node tests can execute them (not only regex SyncWebView).

/** Cap One: Sync Offers ready when on the feed — ignore pageLoaded iframe flips. */
export function isCapitalOneSyncOffersReady({ onOffersPage, pageLoaded }) {
  void pageLoaded;
  return Boolean(onOffersPage);
}

/** Whether onLoadStart should clear offers chrome / pageLoaded. Cap One: no. */
export function shouldClearOffersChromeOnLoadStart(bank) {
  return bank !== 'capital_one';
}

/**
 * Cap One loadEnd chrome from a URL. Returns null for unknown/iframe URLs so
 * callers leave onOffersPage / onLoginPage unchanged (do not clear Sync Offers).
 */
export function capitalOneChromeFromLoadEndUrl(url, { loginPaths, offersPaths } = {}) {
  const lower = String(url || '').toLowerCase();
  if (!lower) return null;
  const onLogin = (loginPaths || []).some(p => lower.includes(String(p).toLowerCase()));
  const onOffers = !onLogin && (offersPaths || []).some(p => lower.includes(String(p).toLowerCase()));
  if (onOffers) return { onOffersPage: true, onLoginPage: false };
  if (onLogin) return { onOffersPage: false, onLoginPage: true };
  return null;
}
