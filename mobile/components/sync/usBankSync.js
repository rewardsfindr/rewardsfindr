// ─────────────────────────────────────────────
// US BANK SYNC — JS injection strings
//
// Cash Back Deals page loads getInsights / CardLytics ads (often via a "v2"
// GraphQL operation). One shared list — no card switcher. The hook stores
// offer fields only. Activate APIs are never called or hooked.
// ─────────────────────────────────────────────

const stripUsBankOffersSource = `function stripUsBankOffers(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  function collectAds(host) {
    if (!host || typeof host !== 'object' || Array.isArray(host)) return null;
    if (Array.isArray(host.ads)) return host.ads;
    var insights = host.data && host.data.getInsights && host.data.getInsights.insights;
    if (!insights && host.getInsights) insights = host.getInsights.insights;
    if (!Array.isArray(insights)) return null;
    var ads = [];
    for (var i = 0; i < insights.length; i++) {
      var card = insights[i] && insights[i].cardDetails;
      if (!card || !Array.isArray(card.ads)) continue;
      for (var a = 0; a < card.ads.length; a++) ads.push(card.ads[a]);
    }
    return ads;
  }

  var rawAds = collectAds(parsed);
  if (!rawAds) return null;

  function stripAd(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    var offerId = item.offerId == null ? '' : String(item.offerId).trim();
    if (!offerId) return null;

    // Already flattened (stash / re-strip on read).
    if (!item.ad) {
      return {
        offerId: offerId,
        merchantName: item.merchantName == null ? '' : String(item.merchantName).trim(),
        activationState: item.activationState == null ? '' : String(item.activationState).trim(),
        endDate: item.endDate == null ? '' : String(item.endDate).trim(),
        headline: item.headline == null ? '' : String(item.headline).trim(),
        shortPreMessage: item.shortPreMessage == null ? '' : String(item.shortPreMessage).trim(),
        rewardType: item.rewardType == null ? '' : String(item.rewardType).trim(),
        rewardAmount: typeof item.rewardAmount === 'number' ? item.rewardAmount : null,
        maxRewardAmount: typeof item.maxRewardAmount === 'number' ? item.maxRewardAmount : null,
        minSpendAmount: typeof item.minSpendAmount === 'number' ? item.minSpendAmount : null,
      };
    }

    var ad = typeof item.ad === 'object' && !Array.isArray(item.ad) ? item.ad : {};
    var reward = ad.reward && typeof ad.reward === 'object' && !Array.isArray(ad.reward) ? ad.reward : null;
    var purchase = reward && reward.purchaseRequirement && typeof reward.purchaseRequirement === 'object'
      ? reward.purchaseRequirement
      : null;
    var copy = ad.assets && ad.assets.copy && ad.assets.copy.value && typeof ad.assets.copy.value === 'object'
      ? ad.assets.copy.value
      : {};
    var headline = copy.headline == null ? '' : String(copy.headline).trim();
    var shortPreMessage = copy.shortPreMessage == null ? '' : String(copy.shortPreMessage).trim();
    var out = {
      offerId: offerId,
      merchantName: ad.merchantName == null ? '' : String(ad.merchantName).trim(),
      activationState: ad.activationState == null ? '' : String(ad.activationState).trim(),
      endDate: ad.endDate == null ? '' : String(ad.endDate).trim(),
      headline: headline,
      shortPreMessage: shortPreMessage,
      rewardType: '',
      rewardAmount: null,
      maxRewardAmount: null,
      minSpendAmount: null,
    };
    if (reward) {
      out.rewardType = reward.rewardType == null ? '' : String(reward.rewardType).trim();
      if (typeof reward.rewardAmount === 'number') out.rewardAmount = reward.rewardAmount;
      else if (reward.rewardAmount != null && String(reward.rewardAmount).trim() !== '') {
        var amount = parseFloat(String(reward.rewardAmount));
        if (isFinite(amount)) out.rewardAmount = amount;
      }
      if (typeof reward.maxRewardAmount === 'number') out.maxRewardAmount = reward.maxRewardAmount;
      if (purchase && typeof purchase.minSpendAmount === 'number') out.minSpendAmount = purchase.minSpendAmount;
    }
    return out;
  }

  var ads = [];
  for (var i = 0; i < rawAds.length; i++) {
    var stripped = stripAd(rawAds[i]);
    if (stripped) ads.push(stripped);
  }
  return { ads: ads };
}`;

export const stripUsBankOffers = new Function(`return (${stripUsBankOffersSource})`)();

const unwrapUsBankPayloadSource = `function unwrapUsBankPayload(parsed) {
  var skipKey = {
    adServeToken: 1, sessionTokenId: 1, midAccountToken: 1, requestId: 1,
    document: 1, frames: 1, parent: 1, top: 1, self: 1, window: 1,
    ReactNativeWebView: 1, location: 1, navigator: 1, history: 1,
    localStorage: 1, sessionStorage: 1,
  };

  function hostOf(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Array.isArray(value.ads)) return value;
    if (value.data && value.data.getInsights) return value;
    if (value.getInsights && Array.isArray(value.getInsights.insights)) return { data: { getInsights: value.getInsights } };
    return null;
  }

  function walk(value, depth, seen) {
    if (!value || typeof value !== 'object') return null;
    if (typeof Node === 'function' && value instanceof Node) return null;
    if (seen.indexOf(value) !== -1) return null;
    seen.push(value);
    if (seen.length > 2500) return null;
    var host = hostOf(value);
    if (host) return host;
    if (depth > 8) return null;
    var keys = [];
    try { keys = Object.keys(value); } catch (e) { return null; }
    keys.sort(function(a, b) {
      function rank(key) {
        return /insight|getInsights|cardDetails|ads|data|payload|response|cardlytics/i.test(key) ? 0 : 1;
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

// Installed before the deals page runs. A matching getInsights / v2 response is
// reduced to offer fields. The raw response never leaves the page.
export const buildUsBankOfferCaptureJs = () => `
  (function() {
    try {
      if (window.__usBankOfferHookVersion === 1) return;
      var stripUsBankOffers = ${stripUsBankOffersSource};
      var unwrapUsBankPayload = ${unwrapUsBankPayloadSource};

      function looksLikeOffers(text) {
        var probe = String(text || '').toLowerCase();
        return probe.indexOf('getinsights') !== -1
          || probe.indexOf('carddetails') !== -1
          || probe.indexOf('cardlytics') !== -1;
      }

      // Several responses can match (dashboard insight, a filtered refetch, another
      // v2 call). Keep every offer id seen so far. A later shorter list must not
      // become the snapshot that replaces the card. Newer fields for the same id win.
      function remember(text) {
        var raw = String(text || '');
        if (!looksLikeOffers(raw)) {
          if (!window.__usBankLastOffers) window.__usBankHookError = 'unrecognized';
          return;
        }
        var parsed = JSON.parse(raw);
        var unwrapped = unwrapUsBankPayload(parsed);
        var stripped = stripUsBankOffers(unwrapped);
        var incoming = stripped && Array.isArray(stripped.ads) ? stripped.ads : [];
        if (!incoming.length) {
          if (!window.__usBankLastOffers) window.__usBankHookError = 'unrecognized';
          return;
        }
        var prev = window.__usBankLastOffers && Array.isArray(window.__usBankLastOffers.ads)
          ? window.__usBankLastOffers.ads
          : [];
        var map = {};
        var order = [];
        function take(list) {
          for (var i = 0; i < list.length; i++) {
            var ad = list[i];
            var id = ad && ad.offerId != null ? String(ad.offerId).trim() : '';
            if (!id) continue;
            if (!map[id]) order.push(id);
            map[id] = ad;
          }
        }
        take(prev);
        take(incoming);
        var ads = [];
        for (var j = 0; j < order.length; j++) ads.push(map[order[j]]);
        window.__usBankLastOffers = { ads: ads };
        window.__usBankHookError = '';
      }

      // Capture named the list response "v2". Match URL fragments and/or a
      // GraphQL body that asks for getInsights / CardLytics ads.
      function watchUrl(url) {
        var value = String(url || '').toLowerCase();
        return value.indexOf('/v2') !== -1
          || value.indexOf('v2') !== -1
          || value.indexOf('getinsights') !== -1
          || value.indexOf('cardlytics') !== -1
          || value.indexOf('insights') !== -1;
      }

      function watchBody(body) {
        var text = String(body || '');
        return text.indexOf('getInsights') !== -1
          || text.indexOf('CardLytics') !== -1
          || text.indexOf('cardDetails') !== -1;
      }

      function maybeRemember(text, requireMatch, url) {
        var body = String(text || '');
        if (requireMatch || body.indexOf('getInsights') !== -1 || body.indexOf('"ads"') !== -1) {
          try { remember(body); }
          catch (e) {
            if (requireMatch || watchUrl(url)) window.__usBankHookError = 'unreadable';
          }
        }
      }

      function watchSend(xhr, url, body) {
        xhr.addEventListener('load', function() {
          if (xhr.status < 200 || xhr.status >= 300) return;
          maybeRemember(xhr.responseText, watchUrl(url) || watchBody(body), url);
        });
      }

      var OrigXHR = window.XMLHttpRequest;
      var proto = OrigXHR && OrigXHR.prototype;
      if (proto && proto.open && proto.send && !proto.__usBankOfferHooked) {
        var protoOpen = proto.open;
        var protoSend = proto.send;
        proto.open = function(method, url) {
          try { this.__usBankUrl = url || ''; } catch (e) {}
          return protoOpen.apply(this, arguments);
        };
        proto.send = function(body) {
          try { watchSend(this, this.__usBankUrl, body); } catch (e) {}
          return protoSend.apply(this, arguments);
        };
        proto.__usBankOfferHooked = true;
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
          xhr.send = function(body) {
            try { watchSend(xhr, url, body); } catch (e) {}
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
          var reqBody = init && init.body;
          var pending = origFetch.apply(window, arguments);
          return pending.then(function(response) {
            if (response.ok) {
              response.clone().text().then(function(text) {
                maybeRemember(text, watchUrl(url) || watchBody(reqBody), url);
              });
            }
            return response;
          });
        };
      }
      window.__usBankOfferHookVersion = 1;
    } catch (e) {
      window.__usBankHookError = 'unreadable';
    }
  })();
  true;
`;

// Official US Bank mobile-web sign-on. Used when expired cookies leave Cash
// Back Deals / home / not-found as a signed-out shell (same idea as Citi).
export const US_BANK_LOGIN_URL = 'https://onlinebanking.usbank.com/auth/login/?channel=mobileweb';
export const US_BANK_OFFERS_URL = 'https://onlinebanking.usbank.com/digital/servicing/dominjection/cashback-deals';

// Detect Arkose / adaptive "Confirm you're a person" on the login shell.
// Emulator/automation clicks are rejected — RN only uses this to uncover and
// show NeedsInput copy so a human can tap Continue once. Never auto-click.
export const buildUsBankChallengeVisibleJs = () => `
  (function() {
    try {
      if (!window.ReactNativeWebView) return;
      var iframe = document.getElementById('sec-cpt-if')
        || document.querySelector('iframe[src*="adaptive"]')
        || document.querySelector('iframe[src*="arkoselabs"]')
        || document.querySelector('iframe[src*="funcaptcha"]');
      var text = document.body ? (document.body.innerText || '') : '';
      var challengeText = /confirm\\s*you'?re\\s*a\\s*person/i.test(text)
        || /i'?m\\s*a\\s*person/i.test(text);
      if (iframe || challengeText) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'US_BANK_CHALLENGE',
          present: true,
        }));
      }
    } catch (e) {}
  })();
  true;
`;

// Page probe for AUTH: offers surface, honest signedIn, real login form, and
// expired/signed-out shells that must be forced to loginUrl.
export const buildUsBankOffersVisibleJs = () => `
  (function() {
    try {
      var href = String((window.location && window.location.href) || '').toLowerCase();
      var text = document.body ? (document.body.innerText || '') : '';
      var leading = text.slice(0, 1200);
      var onOffers = href.indexOf('cashback-deals') !== -1
        || href.indexOf('dominjection/cashback-deals') !== -1
        || /cash\\s*back\\s*deals/i.test(text);
      // Honest signed-in chrome only — never force true from URL match alone.
      var signedIn = (/log\\s*out/i.test(text) || /sign\\s*off/i.test(text))
        && !/log\\s*in/i.test(leading)
        && !/sign\\s*on/i.test(leading);
      // Real Account login form (or already on /auth/login). Arkose overlays this.
      var onLoginForm = href.indexOf('/auth/login') !== -1
        || ((/username/i.test(text) || /user\\s*id/i.test(text))
          && /password/i.test(text)
          && /log\\s*in/i.test(text));
      var pageNotFound = href.indexOf('pagenotfound') !== -1
        || href.indexOf('page-not-found') !== -1
        || /page\\s*not\\s*found/i.test(text)
        || /looks like that information isn.?t here/i.test(text);
      var onHomeShell = /\\/(home|dashboard|overview|accounts?)(\\b|\\/|\\?|#|$)/i.test(href)
        || /welcome\\s*to\\s*online\\s*banking/i.test(leading);
      // Stale cookie: not-found, logged-out deals, or home/dashboard shell.
      // Do NOT treat MFA / soft-token pages (non-login, non-offers) as expired.
      var expired = !signedIn && !onLoginForm && (
        pageNotFound
        || (onOffers && /log\\s*in/i.test(leading))
        || onHomeShell
      );
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'US_BANK_PAGE_STATE',
          onOffers: !!onOffers,
          signedIn: !!signedIn,
          onLoginForm: !!onLoginForm,
          expired: !!expired,
        }));
        // Keep legacy offers message so auto-start / older handlers still see it.
        if (onOffers) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'US_BANK_ON_OFFERS',
            signedIn: !!signedIn,
          }));
        }
      }
    } catch (e) {}
  })();
  true;
`;

// Clear same-origin storage + best-effort cookies, then open official login.
// HttpOnly cookies cannot be cleared from JS; navigating to loginUrl still
// presents Account login when the session is dead.
export const buildUsBankForceLoginJs = (loginUrl = US_BANK_LOGIN_URL) => `
  (function() {
    try {
      try { window.localStorage && window.localStorage.clear(); } catch (e) {}
      try { window.sessionStorage && window.sessionStorage.clear(); } catch (e) {}
      try {
        var cookies = String(document.cookie || '').split(';');
        for (var i = 0; i < cookies.length; i++) {
          var part = cookies[i];
          var eq = part.indexOf('=');
          var name = (eq === -1 ? part : part.slice(0, eq)).replace(/^\\s+|\\s+$/g, '');
          if (!name) continue;
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.usbank.com';
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.onlinebanking.usbank.com';
        }
      } catch (e) {}
      window.location.replace(${JSON.stringify(String(loginUrl || US_BANK_LOGIN_URL))});
    } catch (e) {
      try { window.location.href = ${JSON.stringify(String(loginUrl || US_BANK_LOGIN_URL))}; } catch (e2) {}
    }
  })();
  true;
`;

// Poll for stash / page offers instead of a fixed sleep after offers-ready.
// Matches Chase/Wells capture-when-ready: auto-start often fires on
// US_BANK_ON_OFFERS before getInsights stash lands.
export const US_BANK_CAPTURE_READY_TIMEOUT_MS = 2800;
export const US_BANK_CAPTURE_POLL_MS = 120;

// Shared helpers + runUsBankCapture() for one-shot read and when-ready.
// The raw getInsights response never leaves the page.
const usBankCaptureBodySource = `
      var stripUsBankOffers = ${stripUsBankOffersSource};
      var unwrapUsBankPayload = ${unwrapUsBankPayloadSource};

      function usable(value) {
        return stripUsBankOffers(unwrapUsBankPayload(value));
      }

      function hasOffers(payload) {
        if (!payload || !Array.isArray(payload.ads)) return false;
        for (var i = 0; i < payload.ads.length; i++) {
          var id = payload.ads[i] && payload.ads[i].offerId;
          if (id != null && String(id).trim() !== '') return true;
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
        var stash = window.__usBankLastOffers && Array.isArray(window.__usBankLastOffers.ads)
          ? stripUsBankOffers(window.__usBankLastOffers)
          : null;
        if (!stash || !hasOffers(stash)) {
          try { stash = usable(window); } catch (e) { stash = null; }
        }
        if (!stash || !hasOffers(stash)) {
          try { stash = fromFrames(window, document); } catch (e) { stash = null; }
        }
        return stash && hasOffers(stash) ? stash : null;
      }

      function usBankCaptureReady() {
        return !!resolveStash();
      }

      function runUsBankCapture() {
        var stash = resolveStash();
        if (!stash) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'US_BANK_CAPTURE_UNAVAILABLE' }));
          return;
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'US_BANK_OFFERS',
          offers: stash,
        }));
      }
`;

// Posts offer fields from the getInsights stash, or from a same-origin
// window/frame that already holds the list. Raw bank JSON never leaves the page.
export const buildUsBankReadJs = () => `
  (function() {
    try {
      ${usBankCaptureBodySource}
      runUsBankCapture();
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'US_BANK_CAPTURE_UNAVAILABLE',
      }));
    }
  })();
  true;
`;

// Poll until stash / window / frames are ready, then capture.
// Posts the same US_BANK_OFFERS / US_BANK_CAPTURE_UNAVAILABLE messages as read.
export const buildUsBankCaptureWhenReadyJs = (
  timeoutMs = US_BANK_CAPTURE_READY_TIMEOUT_MS,
  intervalMs = US_BANK_CAPTURE_POLL_MS,
) => `
  (async function() {
    try {
      ${usBankCaptureBodySource}
      var started = Date.now();
      while (Date.now() - started < ${timeoutMs}) {
        if (usBankCaptureReady()) {
          runUsBankCapture();
          return;
        }
        await new Promise(function(resolve) { setTimeout(resolve, ${intervalMs}); });
      }
      if (usBankCaptureReady()) {
        runUsBankCapture();
        return;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'US_BANK_CAPTURE_UNAVAILABLE',
      }));
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'US_BANK_CAPTURE_UNAVAILABLE',
      }));
    }
  })();
  true;
`;
