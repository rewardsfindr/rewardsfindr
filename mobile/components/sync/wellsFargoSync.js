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

// Installed before the deals page runs. A matching getDeals response is
// reduced to offer fields. The raw response never leaves the page.
export const buildWellsFargoOfferCaptureJs = () => `
  (function() {
    try {
      if (window.__wellsOfferHookVersion === 1) return;
      var stripWellsDeals = ${stripWellsDealsSource};

      function remember(text) {
        var parsed = JSON.parse(text);
        var stripped = stripWellsDeals(parsed);
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
      window.__wellsOfferHookVersion = 1;
    } catch (e) {
      window.__wellsHookError = 'unreadable';
    }
  })();
  true;
`;

// Posts the last getDeals offer fields. The raw response never leaves the page.
export const buildWellsFargoReadJs = () => `
  (function() {
    try {
      var stash = window.__wellsLastDeals;
      if (!stash || !stash.availableDeals) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'WELLS_CAPTURE_UNAVAILABLE',
        }));
        return;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'WELLS_DEALS',
        deals: stash,
      }));
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'WELLS_CAPTURE_UNAVAILABLE',
      }));
    }
  })();
  true;
`;
