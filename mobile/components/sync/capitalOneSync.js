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
      if (window.__capOneOfferHookVersion === 2) return;
      var stripCapitalOneOffers = ${stripCapitalOneOffersSource};
      var unwrapCapitalOnePayload = ${unwrapCapitalOnePayloadSource};

      function remember(text) {
        var parsed = JSON.parse(text);
        var unwrapped = unwrapCapitalOnePayload(parsed);
        var stripped = stripCapitalOneOffers(unwrapped);
        if (!stripped) {
          window.__capOneHookError = 'unrecognized';
          return;
        }
        // Keep the first usable natural feed response. Do not replace a
        // good stash with a later empty/silent body (rate-limit) or a later
        // non-empty cursor page (scroll pagination) — stash-first, no thrash.
        if (window.__capOneLastOffers && Array.isArray(window.__capOneLastOffers.offers)
            && window.__capOneLastOffers.offers.length > 0) {
          return;
        }
        window.__capOneLastOffers = stripped;
        window.__capOneHookError = '';
      }

      function watchUrl(url) {
        var value = String(url || '').toLowerCase();
        if (value.indexOf('capitaloneoffers.com') === -1) return false;
        // List XHR: /feed/<opaqueSessionToken>?… — not the HTML page /feed?
        try {
          var path = value.split('?')[0];
          var marker = path.indexOf('/feed/');
          if (marker === -1) return false;
          var after = path.slice(marker + '/feed/'.length);
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
      window.__capOneOfferHookVersion = 2;
    } catch (e) {
      window.__capOneHookError = 'unreadable';
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
