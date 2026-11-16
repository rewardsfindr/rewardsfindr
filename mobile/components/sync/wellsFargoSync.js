// ─────────────────────────────────────────────
// WELLS FARGO SYNC — JS injection strings
//
// One deals list, no card switcher. The page loads deals from
// /deals-portal/as/getDeals. The hook stores offer fields only.
// activateCLDeal is never called or hooked.
// ─────────────────────────────────────────────

const stripWellsDealsSource = `function stripWellsDeals(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  var available = parsed.availableDeals;
  if (!available || typeof available !== 'object' || Array.isArray(available)) return null;
  if (!Array.isArray(available.cardlyticsEligibleDeals)) return null;
  if (available.activatedDeals != null && !Array.isArray(available.activatedDeals)) return null;
  var earned = parsed.earnedDeals;
  if (earned != null) {
    if (typeof earned !== 'object' || Array.isArray(earned)) return null;
    if (earned.deals != null && !Array.isArray(earned.deals)) return null;
  }

  function stripDeal(item) {
    var details = item && item.merchantDealDetails && typeof item.merchantDealDetails === 'object'
      ? item.merchantDealDetails
      : {};
    return {
      isActivated: !!(item && item.isActivated === true),
      merchantDealDetails: {
        merchantOfferId: details.merchantOfferId,
        merchantName: details.merchantName,
        dealAmount: details.dealAmount,
        amountType: details.amountType,
        shortDescription: details.shortDescription,
        expirationDate: details.expirationDate,
      },
    };
  }

  return {
    availableDeals: {
      cardlyticsEligibleDeals: available.cardlyticsEligibleDeals.map(stripDeal),
      activatedDeals: (available.activatedDeals || []).map(stripDeal),
    },
    earnedDeals: {
      deals: ((earned && earned.deals) || []).map(stripDeal),
    },
  };
}`;

export const stripWellsDeals = new Function(`return (${stripWellsDealsSource})`)();

// A getDeals body may wrap the deals object. Walk until availableDeals or
// merchantDealDetails is found, then hand that object to stripWellsDeals.
// allowEmpty is only for the network response: a real empty list may replace
// the card. A search of the page ignores empty shells so visible tiles remain.
const unwrapWellsPayloadSource = `function unwrapWellsPayload(parsed, allowEmpty) {
  var skipKey = {
    checkSum: 1, checksum: 1, expiredDeals: 1, longDescription: 1,
    imageUrl: 1, imageURL: 1, vendorName: 1, document: 1, frames: 1,
    parent: 1, top: 1, self: 1, window: 1, ReactNativeWebView: 1,
    location: 1, navigator: 1, history: 1, localStorage: 1, sessionStorage: 1,
  };

  function hostOf(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var available = value.availableDeals && typeof value.availableDeals === 'object' && !Array.isArray(value.availableDeals)
      ? value.availableDeals
      : value;
    if (!Array.isArray(available.cardlyticsEligibleDeals)) return null;
    if (!allowEmpty && available.cardlyticsEligibleDeals.length === 0) return null;
    return {
      availableDeals: {
        cardlyticsEligibleDeals: available.cardlyticsEligibleDeals,
        activatedDeals: Array.isArray(available.activatedDeals) ? available.activatedDeals : [],
      },
      earnedDeals: value.earnedDeals && Array.isArray(value.earnedDeals.deals)
        ? { deals: value.earnedDeals.deals }
        : { deals: [] },
    };
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
        return /deal|state|store|metadata|initial|cache|payload|data/i.test(key) ? 0 : 1;
      }
      return rank(a) - rank(b);
    });
    var nested = [];
    for (var i = 0; i < keys.length; i++) {
      if (seen.length > 2500) break;
      var key = keys[i];
      if (skipKey[key]) continue;
      var child;
      try { child = value[key]; } catch (e) { continue; }
      if (!child || typeof child !== 'object') continue;
      if (child.merchantDealDetails && typeof child.merchantDealDetails === 'object' && child.merchantDealDetails.merchantOfferId) {
        nested.push(child);
        continue;
      }
      var found = walk(child, depth + 1, seen);
      if (!found) continue;
      if (found.availableDeals) return found;
      if (found.deals) nested = nested.concat(found.deals);
    }
    if (!nested.length) return null;
    return { deals: nested };
  }

  var found = walk(parsed, 0, []);
  if (!found) return null;
  if (found.availableDeals) return found;
  return {
    availableDeals: { cardlyticsEligibleDeals: found.deals, activatedDeals: [] },
    earnedDeals: { deals: [] },
  };
}`;

const readRenderedDealsSource = `function readRenderedDeals(doc, listName) {
  listName = listName || 'available';
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;

  function textOf(el) {
    return String((el && (el.innerText || el.textContent)) || '').replace(/\\s+/g, ' ').trim();
  }

  function rewardFromText(text) {
    var percent = text.match(/(\\d+(?:\\.\\d+)?)\\s*%\\s*cash\\s*back/i);
    if (percent) {
      return { dealAmount: parseFloat(percent[1]), amountType: '%', shortDescription: percent[0] };
    }
    var dollars = text.match(/\\$\\s*(\\d+(?:\\.\\d+)?)\\s*cash\\s*back/i);
    if (dollars) {
      return { dealAmount: parseFloat(dollars[1]), amountType: '$', shortDescription: dollars[0] };
    }
    return null;
  }

  function merchantFromText(text, card) {
    var cleaned = text
      .replace(/\\bactivated\\b/ig, ' ')
      .replace(/\\bearned\\b/ig, ' ')
      .replace(/\\bactivate\\b/ig, ' ')
      .replace(/\\+/g, ' ')
      .replace(/\\$?\\d+(?:\\.\\d+)?\\s*%?\\s*cash\\s*back/ig, ' ')
      .replace(/\\bexpires\\b[^a-z0-9]*\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}/ig, ' ')
      .replace(/\\b\\d+\\s*days?\\s*left\\b/ig, ' ')
      .replace(/\\b(online only|subscription only|pay at pump only|in store only)\\b/ig, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
    if (cleaned) return cleaned.slice(0, 80);
    var image = card && card.querySelector ? card.querySelector('img') : null;
    var alt = image && image.getAttribute ? image.getAttribute('alt') : '';
    return String(alt || '').trim().slice(0, 80);
  }

  function offerIdFrom(card) {
    var nodes = [card];
    try {
      var marked = card.querySelectorAll('[data-merchant-offer-id], [data-offer-id], [data-deal-id], [id]');
      for (var i = 0; i < marked.length && i < 30; i++) nodes.push(marked[i]);
    } catch (e) {}
    var names = ['data-id', 'data-merchant-offer-id', 'data-offer-id', 'data-deal-id'];
    for (var n = 0; n < nodes.length; n++) {
      if (!nodes[n] || !nodes[n].getAttribute) continue;
      for (var a = 0; a < names.length; a++) {
        var value = nodes[n].getAttribute(names[a]);
        if (value && String(value).trim()) return String(value).trim();
      }
    }
    for (var m = 0; m < nodes.length; m++) {
      if (!nodes[m] || !nodes[m].getAttribute) continue;
      var id = nodes[m].getAttribute('id');
      if (id && /^[A-Za-z0-9]{8,20}$/.test(id)) return id;
    }
    return '';
  }

  var buttons = [];
  try { buttons = doc.querySelectorAll('button, a, [role="button"], input[type="button"]'); }
  catch (e) { return null; }
  var offers = [];
  var seenIds = [];
  for (var b = 0; b < buttons.length; b++) {
    var raw = textOf(buttons[b]);
    var buttonText = raw.replace(/^\\+\\s*/, '').toLowerCase();
    var card = buttons[b];
    var text = raw;
    var ownDeals = (raw.match(/cash\\s*back/ig) || []).length;
    if (ownDeals !== 1) {
      if (buttonText !== 'activate') continue;
      for (var up = 0; up < 8 && card; up++) {
        text = textOf(card);
        if ((text.match(/cash\\s*back/ig) || []).length === 1 && text.length < 700) break;
        card = card.parentElement;
      }
    }
    if (!card || (text.match(/cash\\s*back/ig) || []).length !== 1 || text.length >= 700) continue;
    if (listName === 'available' && !/\\bactivate\\b/i.test(text)) continue;
    var reward = rewardFromText(text);
    var merchantName = merchantFromText(text, card);
    if (!reward || !merchantName) continue;
    var expiryMatch = text.match(/expires\\s+(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})/i);
    var offerId = offerIdFrom(card);
    if (!offerId) {
      offerId = [merchantName, reward.dealAmount, reward.amountType, expiryMatch ? expiryMatch[1] : ''].join('|');
    }
    if (seenIds.indexOf(offerId) !== -1) continue;
    seenIds.push(offerId);
    offers.push({
      isActivated: listName !== 'available',
      merchantDealDetails: {
        merchantOfferId: offerId,
        merchantName: merchantName,
        dealAmount: reward.dealAmount,
        amountType: reward.amountType,
        shortDescription: reward.shortDescription,
        expirationDate: expiryMatch ? expiryMatch[1] : '',
      },
    });
  }
  if (!offers.length) return null;
  return {
    availableDeals: {
      cardlyticsEligibleDeals: listName === 'available' ? offers : [],
      activatedDeals: listName === 'activated' ? offers : [],
    },
    earnedDeals: { deals: listName === 'earned' ? offers : [] },
  };
}`;

// Installed before the deals page runs. A matching getDeals response is
// reduced to offer fields. The raw response never leaves the page.
export const buildWellsFargoOfferCaptureJs = () => `
  (function() {
    try {
      if (window.__wellsOfferHookVersion === 2) return;
      var stripWellsDeals = ${stripWellsDealsSource};
      var unwrapWellsPayload = ${unwrapWellsPayloadSource};

      function remember(text) {
        var parsed = JSON.parse(text);
        var unwrapped = unwrapWellsPayload(parsed, true);
        var stripped = stripWellsDeals(unwrapped);
        if (!stripped) {
          window.__wellsHookError = 'unrecognized';
          return;
        }
        window.__wellsLastDeals = stripped;
        window.__wellsHookError = '';
      }

      function watchUrl(url) {
        return String(url || '').indexOf('getDeals') !== -1;
      }

      function watchSend(xhr, url) {
        if (!watchUrl(url)) return;
        xhr.addEventListener('load', function() {
          if (xhr.status < 200 || xhr.status >= 300) return;
          try { remember(xhr.responseText); }
          catch (e) { window.__wellsHookError = 'unreadable'; }
        });
      }

      var OrigXHR = window.XMLHttpRequest;
      var proto = OrigXHR && OrigXHR.prototype;
      if (proto && proto.open && proto.send && !proto.__wellsOfferHooked) {
        var protoOpen = proto.open;
        var protoSend = proto.send;
        proto.open = function(method, url) {
          try { this.__wellsUrl = url || ''; } catch (e) {}
          return protoOpen.apply(this, arguments);
        };
        proto.send = function() {
          try { watchSend(this, this.__wellsUrl); } catch (e) {}
          return protoSend.apply(this, arguments);
        };
        proto.__wellsOfferHooked = true;
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
                try { remember(text); } catch (e) { window.__wellsHookError = 'unreadable'; }
              });
            }
            return response;
          });
        };
      }
      window.__wellsOfferHookVersion = 2;
    } catch (e) {
      window.__wellsHookError = 'unreadable';
    }
  })();
  true;
`;

// Tells the app the deals heading is on screen, including when Wells
// lands on a URL other than the desktop deals portal.
export const buildWellsFargoDealsVisibleJs = () => `
  (function() {
    try {
      var text = document.body ? (document.body.innerText || '') : '';
      if (/my wells fargo deals/i.test(text) && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WELLS_ON_DEALS' }));
      }
    } catch (e) {}
  })();
  true;
`;

// Posts offer fields from the getDeals stash, or from the deals object the
// page already rendered: any same-origin window or frame, then the deal tiles.
// The raw response never leaves the page.
export const buildWellsFargoReadJs = () => `
  (function() {
    try {
      var stripWellsDeals = ${stripWellsDealsSource};
      var unwrapWellsPayload = ${unwrapWellsPayloadSource};
      var readRenderedDeals = ${readRenderedDealsSource};

      function usable(value) {
        var stripped = value && value.availableDeals && Array.isArray(value.availableDeals.cardlyticsEligibleDeals)
          ? stripWellsDeals(value)
          : stripWellsDeals(unwrapWellsPayload(value, false));
        if (!stripped || !stripped.availableDeals) return null;
        if (!stripped.availableDeals.cardlyticsEligibleDeals.length) return null;
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

      var saved = window.__wellsLastDeals && window.__wellsLastDeals.availableDeals
        && Array.isArray(window.__wellsLastDeals.availableDeals.cardlyticsEligibleDeals)
        ? stripWellsDeals(window.__wellsLastDeals)
        : null;
      var stash = saved && saved.availableDeals.cardlyticsEligibleDeals.length ? saved : null;
      if (!stash) {
        try { stash = usable(window); } catch (e) { stash = null; }
      }
      if (!stash) {
        try { stash = fromFrames(window, document); } catch (e) { stash = null; }
      }
      function listOf(rendered, listName) {
        if (!rendered || !rendered.availableDeals) return [];
        if (listName === 'activated') return rendered.availableDeals.activatedDeals || [];
        if (listName === 'earned') return (rendered.earnedDeals && rendered.earnedDeals.deals) || [];
        return rendered.availableDeals.cardlyticsEligibleDeals || [];
      }

      function labelOf(el) {
        return String((el && (el.innerText || el.textContent)) || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      }

      function findTab(name) {
        var nodes = [];
        try { nodes = document.querySelectorAll('a, [role="tab"]'); } catch (e) { return null; }
        for (var i = 0; i < nodes.length; i++) {
          if (labelOf(nodes[i]) === name) return nodes[i];
        }
        return null;
      }

      function tabSelected(el) {
        if (!el || !el.getAttribute) return false;
        return String(el.getAttribute('aria-selected') || '').toLowerCase() === 'true';
      }

      function publish(domAvailable, domActivated, domEarned) {
        var base = stash;
        var available = domAvailable.length ? domAvailable : ((base && base.availableDeals && base.availableDeals.cardlyticsEligibleDeals) || []);
        var activated = domActivated.length ? domActivated : ((base && base.availableDeals && base.availableDeals.activatedDeals) || []);
        var earned = domEarned.length ? domEarned : ((base && base.earnedDeals && base.earnedDeals.deals) || []);
        var payload = stripWellsDeals({
          availableDeals: { cardlyticsEligibleDeals: available, activatedDeals: activated },
          earnedDeals: { deals: earned },
        });
        var count = payload && payload.availableDeals
          ? payload.availableDeals.cardlyticsEligibleDeals.length
            + payload.availableDeals.activatedDeals.length
            + ((payload.earnedDeals && payload.earnedDeals.deals) || []).length
          : 0;
        if (!payload || !count) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WELLS_CAPTURE_UNAVAILABLE' }));
          return;
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WELLS_DEALS', deals: payload }));
      }

      function readList(listName) {
        try { return listOf(readRenderedDeals(document, listName), listName); }
        catch (e) { return []; }
      }

      // The three tabs are links. Only an exact Available, Activated, or
      // Earned label is clicked. A deal card is never clicked.
      function visit(name, done) {
        var tab = findTab(name);
        if (!tab) { done([]); return; }
        if (tabSelected(tab)) { done(readList(name)); return; }
        var before = document.body ? String(document.body.innerText || '') : '';
        try { tab.click(); } catch (e) { done([]); return; }
        var tries = 0;
        (function poll() {
          tries += 1;
          var body = document.body ? String(document.body.innerText || '') : '';
          if (tabSelected(tab) || body !== before || tries > 20) {
            setTimeout(function() { done(readList(name)); }, 400);
            return;
          }
          setTimeout(poll, 100);
        })();
      }

      if (!findTab('available') && !findTab('activated') && !findTab('earned')) {
        publish(readList('available'), [], []);
        return;
      }

      visit('available', function(availableNow) {
        visit('activated', function(activatedNow) {
          visit('earned', function(earnedNow) {
            var back = findTab('available');
            if (back && !tabSelected(back)) {
              try { back.click(); } catch (e) {}
            }
            publish(availableNow, activatedNow, earnedNow);
          });
        });
      });
      return;
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'WELLS_CAPTURE_UNAVAILABLE',
      }));
    }
  })();
  true;
`;
