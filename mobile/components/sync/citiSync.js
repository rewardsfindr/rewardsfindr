// ─────────────────────────────────────────────
// CITI SYNC — JS injection strings
//
// Merchant Offers page loads a JSON body with merchantOffers[] categories.
// The hook stores offer fields + the selected credit card label only.
// Activate / enroll APIs are never called or hooked.
// ─────────────────────────────────────────────

const stripCitiOffersSource = `function stripCitiOffers(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!Array.isArray(parsed.merchantOffers)) return null;

  function stripOffer(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    var offerId = item.offerId == null ? '' : String(item.offerId).trim();
    if (!offerId) return null;
    return {
      offerId: offerId,
      offerStatus: item.offerStatus == null ? '' : String(item.offerStatus).trim(),
      merchantName: item.merchantName == null ? '' : String(item.merchantName).trim(),
      offerTitle: item.offerTitle == null ? '' : String(item.offerTitle).trim(),
      offerDiscountType: item.offerDiscountType == null ? '' : String(item.offerDiscountType).trim(),
      offerEndDate: item.offerEndDate == null ? '' : String(item.offerEndDate).trim(),
      offerExpiryDays: item.offerExpiryDays == null ? '' : String(item.offerExpiryDays).trim(),
    };
  }

  var categories = [];
  for (var c = 0; c < parsed.merchantOffers.length; c++) {
    var group = parsed.merchantOffers[c];
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
    if (!Array.isArray(group.offers)) return null;
    var offers = [];
    for (var i = 0; i < group.offers.length; i++) {
      var stripped = stripOffer(group.offers[i]);
      if (stripped) offers.push(stripped);
    }
    categories.push({
      displayOffersCategory: group.displayOffersCategory == null
        ? ''
        : String(group.displayOffersCategory).trim(),
      offers: offers,
    });
  }

  function pickCreditCard(list) {
    if (!Array.isArray(list)) return null;
    var credit = null;
    var primary = null;
    for (var i = 0; i < list.length; i++) {
      var card = list[i];
      if (!card || typeof card !== 'object' || Array.isArray(card)) continue;
      var cardType = String(card.cardType || '').toUpperCase();
      if (cardType && cardType !== 'CREDIT') continue;
      var name = card.displayProductName == null ? '' : String(card.displayProductName).trim();
      if (!name) continue;
      var picked = { displayProductName: name, cardType: 'CREDIT' };
      if (!credit) credit = picked;
      if (card.primaryAccountFlag === true) primary = picked;
    }
    return primary || credit;
  }

  var selectedCard = pickCreditCard(parsed.cardArtDetails);
  if (!selectedCard && parsed.selectedCard && typeof parsed.selectedCard === 'object' && !Array.isArray(parsed.selectedCard)) {
    var keptName = parsed.selectedCard.displayProductName == null
      ? ''
      : String(parsed.selectedCard.displayProductName).trim();
    if (keptName) selectedCard = { displayProductName: keptName, cardType: 'CREDIT' };
  }
  return {
    selectedCard: selectedCard,
    merchantOffers: categories,
  };
}`;

export const stripCitiOffers = new Function(`return (${stripCitiOffersSource})`)();

// A merchant-offers body may wrap the list. Walk until merchantOffers is found.
const unwrapCitiPayloadSource = `function unwrapCitiPayload(parsed) {
  var skipKey = {
    accountId: 1, cltId: 1, dctId: 1, checkSum: 1, checksum: 1,
    document: 1, frames: 1, parent: 1, top: 1, self: 1, window: 1,
    ReactNativeWebView: 1, location: 1, navigator: 1, history: 1,
    localStorage: 1, sessionStorage: 1,
  };

  function hostOf(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!Array.isArray(value.merchantOffers)) return null;
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
        return /offer|merchant|card|state|store|payload|data|response/i.test(key) ? 0 : 1;
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

// Installed before the offers page runs. A matching merchant-offers response is
// reduced to offer fields. The raw response never leaves the page.
export const buildCitiOfferCaptureJs = () => `
  (function() {
    try {
      if (window.__citiOfferHookVersion === 1) return;
      var stripCitiOffers = ${stripCitiOffersSource};
      var unwrapCitiPayload = ${unwrapCitiPayloadSource};

      function remember(text) {
        var parsed = JSON.parse(text);
        var unwrapped = unwrapCitiPayload(parsed);
        var stripped = stripCitiOffers(unwrapped);
        if (!stripped) {
          window.__citiHookError = 'unrecognized';
          return;
        }
        window.__citiLastOffers = stripped;
        window.__citiHookError = '';
      }

      // Exact XHR path was not in the capture. Match merchant-offer responses by
      // URL fragment when present; otherwise accept a body that strips cleanly.
      function watchUrl(url) {
        var value = String(url || '').toLowerCase();
        return value.indexOf('merchantoffer') !== -1
          || value.indexOf('merchant-offer') !== -1
          || value.indexOf('products-offers') !== -1;
      }

      function maybeRemember(text, requireUrlMatch, url) {
        var body = String(text || '');
        if (requireUrlMatch || body.indexOf('merchantOffers') !== -1) {
          try { remember(body); }
          catch (e) {
            if (requireUrlMatch || watchUrl(url)) window.__citiHookError = 'unreadable';
          }
        }
      }

      function watchSend(xhr, url) {
        xhr.addEventListener('load', function() {
          if (xhr.status < 200 || xhr.status >= 300) return;
          maybeRemember(xhr.responseText, watchUrl(url), url);
        });
      }

      var OrigXHR = window.XMLHttpRequest;
      var proto = OrigXHR && OrigXHR.prototype;
      if (proto && proto.open && proto.send && !proto.__citiOfferHooked) {
        var protoOpen = proto.open;
        var protoSend = proto.send;
        proto.open = function(method, url) {
          try { this.__citiUrl = url || ''; } catch (e) {}
          return protoOpen.apply(this, arguments);
        };
        proto.send = function() {
          try { watchSend(this, this.__citiUrl); } catch (e) {}
          return protoSend.apply(this, arguments);
        };
        proto.__citiOfferHooked = true;
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
          return pending.then(function(response) {
            if (response.ok) {
              response.clone().text().then(function(text) {
                maybeRemember(text, watchUrl(url), url);
              });
            }
            return response;
          });
        };
      }
      window.__citiOfferHookVersion = 1;
    } catch (e) {
      window.__citiHookError = 'unreadable';
    }
  })();
  true;
`;

// Tells the app the Merchant Offers page chrome is on screen.
export const buildCitiOffersVisibleJs = () => `
  (function() {
    try {
      var href = String((window.location && window.location.href) || '').toLowerCase();
      var text = document.body ? (document.body.innerText || '') : '';
      var onOffers = href.indexOf('/nga/products-offers/merchantoffers') !== -1
        || href.indexOf('merchantoffers') !== -1;
      // Honest signed-in chrome only — never force true from URL match alone
      // (auto-start must require signedIn === true; see citi-pr-67 guideline).
      var signedIn = /sign\\s*off/i.test(text) && !/sign\\s*on/i.test(text.slice(0, 800));
      if (onOffers && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CITI_ON_OFFERS',
          signedIn: !!signedIn,
        }));
      }
    } catch (e) {}
  })();
  true;
`;

// Poll for stash / window / frames instead of a fixed sleep after signedIn.
// Matches Wells/Chase capture-when-ready: auto-start often fires on
// CITI_ON_OFFERS before the merchant-offers stash lands.
export const CITI_CAPTURE_READY_TIMEOUT_MS = 2800;
export const CITI_CAPTURE_POLL_MS = 120;

// Shared helpers + runCitiCapture() for one-shot read and when-ready.
// Raw bank JSON never leaves the page.
const citiCaptureBodySource = `
      var stripCitiOffers = ${stripCitiOffersSource};
      var unwrapCitiPayload = ${unwrapCitiPayloadSource};

      function usable(value) {
        return stripCitiOffers(unwrapCitiPayload(value));
      }

      // Empty merchantOffers (or only empty groups) is not a successful
      // capture — mirror Wells hasListedDeals so we never wipe the card.
      function hasOffers(payload) {
        if (!payload || !Array.isArray(payload.merchantOffers)) return false;
        for (var i = 0; i < payload.merchantOffers.length; i++) {
          var offers = payload.merchantOffers[i] && payload.merchantOffers[i].offers;
          if (!Array.isArray(offers)) continue;
          for (var j = 0; j < offers.length; j++) {
            var id = offers[j] && offers[j].offerId;
            if (id != null && String(id).trim() !== '') return true;
          }
        }
        return false;
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
            if (found && hasOffers(found)) return found;
          } catch (e) {}
        }
        return null;
      }

      function resolveStash() {
        var stash = window.__citiLastOffers && Array.isArray(window.__citiLastOffers.merchantOffers)
          ? stripCitiOffers(window.__citiLastOffers)
          : null;
        if (!stash || !hasOffers(stash)) {
          try { stash = usable(window); } catch (e) { stash = null; }
        }
        if (!stash || !hasOffers(stash)) {
          try { stash = fromFrames(window, document); } catch (e) { stash = null; }
        }
        return stash && hasOffers(stash) ? stash : null;
      }

      function citiCaptureReady() {
        return !!resolveStash();
      }

      function runCitiCapture() {
        var stash = resolveStash();
        if (!stash) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CITI_CAPTURE_UNAVAILABLE' }));
          return;
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CITI_OFFERS',
          offers: stash,
        }));
      }
`;

// Posts offer fields from the merchant-offers stash, or from a same-origin
// window/frame that already holds the list. Raw bank JSON never leaves the page.
export const buildCitiReadJs = () => `
  (function() {
    try {
      ${citiCaptureBodySource}
      runCitiCapture();
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CITI_CAPTURE_UNAVAILABLE',
      }));
    }
  })();
  true;
`;

// Poll until stash / window / frames are ready, then capture.
// Posts the same CITI_OFFERS / CITI_CAPTURE_UNAVAILABLE messages as read.
export const buildCitiCaptureWhenReadyJs = (
  timeoutMs = CITI_CAPTURE_READY_TIMEOUT_MS,
  intervalMs = CITI_CAPTURE_POLL_MS,
) => `
  (async function() {
    try {
      ${citiCaptureBodySource}
      var started = Date.now();
      while (Date.now() - started < ${timeoutMs}) {
        if (citiCaptureReady()) {
          runCitiCapture();
          return;
        }
        await new Promise(function(resolve) { setTimeout(resolve, ${intervalMs}); });
      }
      if (citiCaptureReady()) {
        runCitiCapture();
        return;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CITI_CAPTURE_UNAVAILABLE',
      }));
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CITI_CAPTURE_UNAVAILABLE',
      }));
    }
  })();
  true;
`;
