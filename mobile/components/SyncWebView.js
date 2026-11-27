// ─────────────────────────────────────────────────────────────────
// SYNC WEBVIEW MODAL — orchestrator
// Handles modal UI, state, and message routing.
//
// Shared syncMode machine + Chase/Wells/Citi/Amex auto-start. Cover during
// capturing; re-show WebView on auth / needsInput; Sync Offers remains
// for US Bank and as Chase/Wells/Citi/Amex failure fallback.
//
// Amex sync flow:
//   1. User lands on offers page → AMEX_CARDS_DETECTED fires with all cards
//   2. User taps Sync → we switch to first non-active card
//   3. Card switch triggers ReadOffersHubPresentation API → CAPTURE_JSON
//   4. Parsed offers are saved on this phone for that card and phase
//   5. Switch to next unvisited card → repeat until all cards captured
//      (active card on sync press is captured last)
//   6. Transition to enrolled page → reuse same card list → repeat cycle
//   7. All phases done → onSuccess + onClose
//
// Chase, Amex, Wells Fargo, Citi, and US Bank each save a structured snapshot on the phone.
//
// Key timing note for Amex:
//   Amex fires ReadOffersHubPresentation (REPLACE) BEFORE CARD_SWITCHED
//   comes back from the JS timeout. So we must set window.__amexJsonCaptureArmed
//   = true IMMEDIATELY in switchToNextAmexCard, not in the CARD_SWITCHED handler.
// ─────────────────────────────────────────────────────────────────
import React, { useRef, useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { saveCardSnapshot } from '../lib/offerStore.js';
import { replaceCardPass } from '../lib/savedOffers.js';
import { colors, radii } from '../shared/theme.js';

import { BANK_CONFIG }                                    from './sync/bankConfig.js';
import {
  DETECT_CARDS_JS,
  buildPageStateJs,
  buildListCardsJs,
  buildSwitchCardJs,
  buildCaptureOffersJs,
  buildChaseCaptureWhenReadyJs,
  buildChaseOfferCaptureJs,
  buildChaseHookReadyProbeJs,
  buildChasePauseCaptureJs,
  nextChaseCardPosition,
  mergeDetectedCards,
  CHASE_SWITCH_TIMEOUT_MS,
  CHASE_CAPTURE_READY_TIMEOUT_MS,
  CHASE_CAPTURE_POLL_MS,
} from './sync/chaseSync.js';
import {
  AMEX_OPEN_AND_DETECT_JS,
  AMEX_SWITCH_TIMEOUT_MS,
  buildAmexSwitchCardJs,
  buildAmexJsonCaptureJs,
  buildAmexClearFiltersJs,
  amexHandleLoadEnd,
  applyAmexCardsDetected,
} from './sync/amexSync.js';
import {
  buildWellsFargoDealsVisibleJs,
  buildWellsFargoOfferCaptureJs,
  buildWellsAppPromoDismissJs,
  buildWellsCaptureWhenReadyJs,
  WELLS_CAPTURE_READY_TIMEOUT_MS,
  WELLS_CAPTURE_POLL_MS,
} from './sync/wellsFargoSync.js';import {
  buildCitiOfferCaptureJs,
  buildCitiOffersVisibleJs,
  buildCitiForceLoginJs,
  buildCitiReadJs,
  buildCitiCaptureWhenReadyJs,
  CITI_CAPTURE_READY_TIMEOUT_MS,
  CITI_CAPTURE_POLL_MS,
  CITI_LOGIN_URL,
} from './sync/citiSync.js';
import { buildUsBankOfferCaptureJs, buildUsBankOffersVisibleJs, buildUsBankReadJs } from './sync/usBankSync.js';
import { parseCardLabel }                                 from './sync/cardLabel.js';
import {
  SYNC_MODES,
  STEP_TIMEOUT_MS,
  AUTO_START_DEBOUNCE_MS,
  AUTH_REPROBE_MS,
  CHASE_OFFER_HOOK_VERSION,
  shouldAutoStartChase,
  shouldAutoStartWells,
  shouldAutoStartCiti,
  shouldAutoStartAmex,
  nextSyncMode,
  isPartialAbort,
  partialAbortCopy,
  shouldShowSyncCover,
  planChaseNeedsInputResume,
  planAmexNeedsInputResume,
  shouldForceChaseOffersRedirect,
  shouldForceCitiLogin,
  shouldForceCitiOffersRedirect,
  chaseCoverProgress,
  amexCoverProgress,
  urlMatchesAnyPath,
} from './sync/syncMode.js';
import BankLogoIcon from './BankLogoIcon.js';

function citiCardLabelFromOffers(payload) {
  const raw = String(payload?.selectedCard?.displayProductName || '').trim();
  if (!raw) return 'Citi Card';
  const dashed = raw.match(/^(.*?)(?:\s*[-–—]\s*)(\d{4})\s*$/);
  if (dashed) return `${dashed[1].trim()} (...${dashed[2]})`;
  return raw;
}

// Non-Chase banks that still use CARD_SWITCHED + delayed capture.
const POST_SWITCH_DELAY_MS = 2500;
const MAX_SWITCH_RETRIES   = 3;

export default function SyncWebView({ visible, bank, onClose, onSuccess }) {
  const webViewRef = useRef(null);

  const cardOptionsRef      = useRef([]);
  const cardIndexRef        = useRef(0);
  const visitedCardsRef     = useRef(new Set());
  const initialActiveRef    = useRef(null);
  const syncedCardsRef      = useRef([]);
  const cardsDiscovered     = useRef(false);
  const switchRetriesRef    = useRef(0);
  const syncedCountRef      = useRef(0);
  const chaseRefreshRef     = useRef(false);
  const offersRedirectRef   = useRef(false);
  const offersSeenRef       = useRef(false);
  const onOffersPageRef     = useRef(false);
  const onLoginPageRef      = useRef(false);
  const captureArmed        = useRef(false);
  const syncStartedRef      = useRef(false);
  const syncPhaseRef        = useRef('eligible');
  const pendingCardLabelRef = useRef(null);
  const amexWaitRef         = useRef(null);
  const amexExpectedRef     = useRef(null);
  const syncModeRef         = useRef(SYNC_MODES.AUTH);
  const autoStartConsumedRef = useRef(false);
  const stepTimerRef        = useRef(null);
  const autoStartDebounceRef = useRef(null);
  const postSwitchTimeoutRef = useRef(null);
  const startingChaseRef    = useRef(false);
  const startingWellsRef    = useRef(false);
  const startingCitiRef     = useRef(false);
  const startingAmexRef     = useRef(false);
  const citiSignedInRef     = useRef(false);
  const citiLoginForcedRef  = useRef(false);
  const amexCardsReadyRef   = useRef(false);

  const [syncMode, setSyncMode]             = useState(SYNC_MODES.AUTH);
  const [syncing, setSyncing]               = useState(false);
  const [switching, setSwitching]           = useState(false);
  const [syncStarted, setSyncStarted]       = useState(false);
  const [pageLoaded, setPageLoaded]         = useState(false);
  const [onOffersPage, setOnOffersPage]     = useState(false);
  const [onLoginPage, setOnLoginPage]       = useState(false);
  const [citiSignedIn, setCitiSignedIn]     = useState(false);
  const [amexCardsReady, setAmexCardsReady] = useState(false);
  const [chaseHookReady, setChaseHookReady] = useState(false);
  const [currentCard, setCurrentCard]       = useState(null);
  const [currentUrl, setCurrentUrl]         = useState('');
  const [cardCount, setCardCount]           = useState(0);
  const [cardIndexUi, setCardIndexUi]       = useState(0);
  const [syncedUiCount, setSyncedUiCount]   = useState(0);
  const [progressPeak, setProgressPeak]     = useState(0);
  const [syncPhaseUi, setSyncPhaseUi]       = useState('eligible');
  const [failMessage, setFailMessage]       = useState('');

  const config = BANK_CONFIG[bank] || BANK_CONFIG.chase;

  const setMode = (mode) => {
    syncModeRef.current = mode;
    setSyncMode(mode);
  };

  const clearStepTimer = () => {
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  const clearPostSwitchTimeout = () => {
    if (postSwitchTimeoutRef.current) {
      clearTimeout(postSwitchTimeoutRef.current);
      postSwitchTimeoutRef.current = null;
    }
  };

  const clearAutoStartDebounce = () => {
    if (autoStartDebounceRef.current) {
      clearTimeout(autoStartDebounceRef.current);
      autoStartDebounceRef.current = null;
    }
  };

  const armStepTimer = () => {
    clearStepTimer();
    if (bank !== 'chase' && bank !== 'wells_fargo' && bank !== 'citi' && bank !== 'amex') return;
    stepTimerRef.current = setTimeout(() => {
      if (syncModeRef.current !== SYNC_MODES.CAPTURING) return;
      if (bank === 'wells_fargo') {
        failWellsCapture('Sync timed out. Try again, or sync manually from the deals page.');
        return;
      }
      if (bank === 'citi') {
        failCitiCapture('Sync timed out. Try again, or sync manually from the Merchant Offers page.');
        return;
      }
      if (bank === 'amex') {
        failAmexCapture('Sync timed out on this card. Try again, or sync manually from the offers page.');
        return;
      }
      failChaseCapture('Sync timed out on this card. Try again, or sync manually from the offers page.');
    }, STEP_TIMEOUT_MS);
  };

  const disarmChaseWalk = () => {
    clearStepTimer();
    clearPostSwitchTimeout();
    captureArmed.current = false;
    syncStartedRef.current = false;
    startingChaseRef.current = false;
    setSyncStarted(false);
    setSyncing(false);
    setSwitching(false);
  };

  const disarmWellsCapture = () => {
    clearStepTimer();
    syncStartedRef.current = false;
    startingWellsRef.current = false;
    setSyncStarted(false);
    setSyncing(false);
    setSwitching(false);
  };

  const disarmCitiCapture = () => {
    clearStepTimer();
    syncStartedRef.current = false;
    startingCitiRef.current = false;
    setSyncStarted(false);
    setSyncing(false);
    setSwitching(false);
  };

  const clearAmexWait = () => {
    if (amexWaitRef.current) clearTimeout(amexWaitRef.current);
    amexWaitRef.current = null;
  };

  const clearAmexArm = () => {
    clearAmexWait();
    captureArmed.current = false;
    webViewRef.current?.injectJavaScript(
      `clearTimeout(window.__amexQuietTimer); window.__amexBest = null; window.__amexJsonCaptureArmed = false; true;`,
    );
  };

  const disarmAmexCapture = () => {
    clearStepTimer();
    clearAmexArm();
    syncStartedRef.current = false;
    startingAmexRef.current = false;
    setSyncStarted(false);
    setSyncing(false);
    setSwitching(false);
  };

  const failChaseCapture = (message) => {
    if (bank !== 'chase') return;
    disarmChaseWalk();
    setFailMessage(message || 'Auto-sync stopped. Try again, or sync manually from the offers page.');
    setMode(SYNC_MODES.FAILED);
  };

  const failWellsCapture = (message) => {
    if (bank !== 'wells_fargo') return;
    disarmWellsCapture();
    setFailMessage(message || 'Auto-sync stopped. Try again, or sync manually from the deals page.');
    setMode(SYNC_MODES.FAILED);
  };

  const failCitiCapture = (message) => {
    if (bank !== 'citi') return;
    disarmCitiCapture();
    setFailMessage(message || 'Auto-sync stopped. Try again, or sync manually from the Merchant Offers page.');
    setMode(SYNC_MODES.FAILED);
  };

  const failAmexCapture = (message) => {
    if (bank !== 'amex') return;
    disarmAmexCapture();
    setFailMessage(message || 'Auto-sync stopped. Try again, or sync manually from the offers page.');
    setMode(SYNC_MODES.FAILED);
  };

  const pauseForNeedsInput = () => {
    if (bank !== 'chase' && bank !== 'wells_fargo' && bank !== 'citi' && bank !== 'amex') return;
    if (syncModeRef.current !== SYNC_MODES.CAPTURING) return;
    clearStepTimer();
    clearPostSwitchTimeout();
    captureArmed.current = false;
    syncStartedRef.current = false;
    startingChaseRef.current = false;
    startingWellsRef.current = false;
    startingCitiRef.current = false;
    startingAmexRef.current = false;
    setSyncStarted(false);
    setSyncing(false);
    setSwitching(false);
    if (bank === 'chase') {
      webViewRef.current?.injectJavaScript(buildChasePauseCaptureJs());
    }
    if (bank === 'amex') {
      clearAmexArm();
    }
    setMode(SYNC_MODES.NEEDS_INPUT);
  };

  const enterCapturing = () => {
    setFailMessage('');
    setMode(SYNC_MODES.CAPTURING);
    setSyncStarted(true);
    syncStartedRef.current = true;
    armStepTimer();
  };

  useEffect(() => {
    if (!visible) {
      clearStepTimer();
      clearPostSwitchTimeout();
      clearAutoStartDebounce();
      cardOptionsRef.current      = [];
      cardIndexRef.current        = 0;
      visitedCardsRef.current     = new Set();
      initialActiveRef.current    = null;
      syncedCardsRef.current      = [];
      cardsDiscovered.current     = false;
      switchRetriesRef.current    = 0;
      syncedCountRef.current      = 0;
      chaseRefreshRef.current     = false;
      offersRedirectRef.current   = false;
      offersSeenRef.current       = false;
      onOffersPageRef.current     = false;
      onLoginPageRef.current      = false;
      captureArmed.current        = false;
      syncStartedRef.current      = false;
      syncPhaseRef.current        = 'eligible';
      pendingCardLabelRef.current = null;
      autoStartConsumedRef.current = false;
      startingChaseRef.current    = false;
      startingWellsRef.current    = false;
      startingCitiRef.current     = false;
      startingAmexRef.current     = false;
      citiSignedInRef.current     = false;
      citiLoginForcedRef.current  = false;
      amexCardsReadyRef.current   = false;
      syncModeRef.current         = SYNC_MODES.AUTH;
      if (amexWaitRef.current) clearTimeout(amexWaitRef.current);
      amexWaitRef.current         = null;
      setMode(SYNC_MODES.AUTH);
      setCurrentCard(null);
      setCurrentUrl('');
      setSyncing(false);
      setSwitching(false);
      setSyncStarted(false);
      setPageLoaded(false);
      setOnOffersPage(false);
      setOnLoginPage(false);
      setCitiSignedIn(false);
      setAmexCardsReady(false);
      setChaseHookReady(false);
      setCardCount(0);
      setCardIndexUi(0);
      setSyncedUiCount(0);
      setProgressPeak(0);
      setSyncPhaseUi('eligible');
      setFailMessage('');
    }
  }, [visible]);

  useEffect(() => {
    onOffersPageRef.current = onOffersPage;
    if (onOffersPage) offersSeenRef.current = true;
  }, [onOffersPage]);

  useEffect(() => {
    onLoginPageRef.current = onLoginPage;
  }, [onLoginPage]);

  useEffect(() => {
    citiSignedInRef.current = citiSignedIn;
  }, [citiSignedIn]);

  useEffect(() => {
    amexCardsReadyRef.current = amexCardsReady;
  }, [amexCardsReady]);

  // Chase / Wells / Citi / Amex: login mid-capture → NeedsInput (MFA pre-empts step timer).
  useEffect(() => {
    if (!visible || (bank !== 'chase' && bank !== 'wells_fargo' && bank !== 'citi' && bank !== 'amex')) return;
    if (onLoginPage && syncModeRef.current === SYNC_MODES.CAPTURING) {
      pauseForNeedsInput();
    }
  }, [visible, bank, onLoginPage]);

  const switchToNextAmexCard = () => {
    const cards   = cardOptionsRef.current;
    const visited = visitedCardsRef.current;
    const next = cards.find(c => !visited.has(c.testId) && c.testId !== initialActiveRef.current)
      ?? cards.find(c => !visited.has(c.testId));
    if (!next) return false;

    const idx = cards.indexOf(next);
    cardIndexRef.current = idx;
    setCardIndexUi(idx);
    setSwitching(true);
    armStepTimer();

    // Arm BOTH the RN ref AND the window flag BEFORE injecting switch JS.
    // Amex fires ReadOffersHubPresentation (REPLACE) immediately when the card
    // switches — well before the CARD_SWITCHED message comes back.
    captureArmed.current = true;
    webViewRef.current?.injectJavaScript(`clearTimeout(window.__amexQuietTimer); window.__amexBest = null; window.__amexJsonCaptureArmed = true; true;`);
    webViewRef.current?.injectJavaScript(buildAmexClearFiltersJs());
    webViewRef.current?.injectJavaScript(buildAmexSwitchCardJs(next.testId, AMEX_SWITCH_TIMEOUT_MS));
    return true;
  };

  const advanceAmexSync = (capturedTestId) => {
    if (capturedTestId) visitedCardsRef.current.add(capturedTestId);
    if (visitedCardsRef.current.size < cardOptionsRef.current.length) {
      switchToNextAmexCard();
      return;
    }
    if (syncPhaseRef.current === 'eligible') {
      visitedCardsRef.current  = new Set();
      initialActiveRef.current = null;
      cardOptionsRef.current   = [];
      syncPhaseRef.current     = 'enrolled';
      setSyncPhaseUi('enrolled');
      cardsDiscovered.current  = false;
      setAmexCardsReady(false);
      amexCardsReadyRef.current = false;
      armStepTimer();
      webViewRef.current?.injectJavaScript(`window.location.replace(${JSON.stringify(config.enrolledUrl)}); true;`);
      return;
    }
    const total = syncedCardsRef.current.reduce((sum, card) => sum + card.count, 0);
    clearStepTimer();
    setMode(SYNC_MODES.DONE);
    onSuccess(total, syncedCardsRef.current);
    onClose();
  };

  const handleNavigationStateChange = (navState) => {
    if (!navState.url) return;
    setCurrentUrl(navState.url);
    const url      = navState.url.toLowerCase();
    const onLogin  = urlMatchesAnyPath(url, config.loginPaths);
    if (config.useAmexCardSwitcher) {
      // Phase-aware offers: enrolled is a substring of eligible — check enrolled first.
      const onEnrolled = !onLogin && url.includes(String(config.enrolledPath || '').toLowerCase());
      const onEligible = !onLogin && !onEnrolled
        && url.includes(String(config.eligiblePath || '').toLowerCase());
      const phaseMatch =
        (syncPhaseRef.current === 'enrolled' && onEnrolled)
        || (syncPhaseRef.current === 'eligible' && onEligible);
      const onOffers = phaseMatch && (onEligible || onEnrolled);
      setOnOffersPage(onOffers);
      setOnLoginPage(onLogin && !onOffers);
      if (onLogin && !onOffers && syncModeRef.current === SYNC_MODES.CAPTURING) {
        pauseForNeedsInput();
      }
      return;
    }
    const onOffers = !onLogin && urlMatchesAnyPath(url, config.offersPaths);
    if (bank === 'chase') {
      webViewRef.current?.injectJavaScript(buildPageStateJs(config.loginPaths, config.offersPaths));
      // While waiting to start, always mirror URL leave/return so auto-start
      // cannot fire on a non-offers page (cards-detected signal alone was sticky).
      const waiting =
        syncModeRef.current === SYNC_MODES.AUTH
        || syncModeRef.current === SYNC_MODES.NEEDS_INPUT;
      if (waiting || onOffers || onLogin || !config.useCardsDetectedAsOffersSignal) {
        setOnOffersPage(onOffers);
        setOnLoginPage(onLogin && !onOffers);
      }
      return;
    }
    if (onOffers || onLogin || !config.useCardsDetectedAsOffersSignal) {
      setOnOffersPage(onOffers);
      setOnLoginPage(onLogin && !onOffers);
    }
  };

  const handleLoadEnd = (syntheticEvent) => {
    const url = (syntheticEvent?.nativeEvent?.url || currentUrl).toLowerCase();
    setPageLoaded(true);

    if (bank === 'chase') {
      webViewRef.current?.injectJavaScript(buildChaseOfferCaptureJs());
      webViewRef.current?.injectJavaScript(buildChaseHookReadyProbeJs());
      webViewRef.current?.injectJavaScript(buildPageStateJs(config.loginPaths, config.offersPaths));
      webViewRef.current?.injectJavaScript(DETECT_CARDS_JS);
      return;
    }

    if (bank === 'wells_fargo') {
      webViewRef.current?.injectJavaScript(buildWellsFargoOfferCaptureJs());
      webViewRef.current?.injectJavaScript(buildWellsAppPromoDismissJs());
      webViewRef.current?.injectJavaScript(buildWellsFargoDealsVisibleJs());
      if (!url) return;
      const onLogin = (config.loginPaths || []).some(p => url.includes(p.toLowerCase()));
      const onOffers = !onLogin && (config.offersPaths || []).some(p => url.includes(p.toLowerCase()));
      setOnOffersPage(onOffers);
      setOnLoginPage(onLogin && !onOffers);
      return;
    }

    if (bank === 'citi') {
      webViewRef.current?.injectJavaScript(buildCitiOfferCaptureJs());
      webViewRef.current?.injectJavaScript(buildCitiOffersVisibleJs());
      if (!url) return;
      const onLogin = (config.loginPaths || []).some(p => url.includes(p.toLowerCase()));
      const onOffers = !onLogin && (config.offersPaths || []).some(p => url.includes(p.toLowerCase()));
      setOnOffersPage(onOffers);
      setOnLoginPage(onLogin && !onOffers);
      return;
    }

    if (bank === 'us_bank') {
      webViewRef.current?.injectJavaScript(buildUsBankOfferCaptureJs());
      webViewRef.current?.injectJavaScript(buildUsBankOffersVisibleJs());
      if (!url) return;
      const onLogin = (config.loginPaths || []).some(p => url.includes(p.toLowerCase()));
      const onOffers = !onLogin && (config.offersPaths || []).some(p => url.includes(p.toLowerCase()));
      setOnOffersPage(onOffers);
      setOnLoginPage(onLogin && !onOffers);
      return;
    }

    if (bank === 'amex') {
      const { onOffersPage: onOffers, onLogin } = amexHandleLoadEnd({
        url,
        config,
        syncPhase:        syncPhaseRef.current,
        cardsDiscovered:  cardsDiscovered.current,
        injectJavaScript: (js) => webViewRef.current?.injectJavaScript(js),
      });
      setOnOffersPage(onOffers);
      setOnLoginPage(!!onLogin && !onOffers);
      if (onLogin && !onOffers && syncModeRef.current === SYNC_MODES.CAPTURING) {
        pauseForNeedsInput();
        return;
      }
      if (onOffers) {
        offersRedirectRef.current = false;
        // Fresh offers paint — cards may reappear after MFA / phase nav.
        // Clear ready until AMEX_CARDS_DETECTED so auto-start stays honest.
        if (!syncStartedRef.current) {
          setAmexCardsReady(false);
          amexCardsReadyRef.current = false;
        }
        webViewRef.current?.injectJavaScript(buildAmexJsonCaptureJs());
      } else if (!onLogin) {
        goToOffers();
      }
    }
  };

  const goToOffers = () => {
    if (offersRedirectRef.current || syncStartedRef.current) return;
    const target = config.offersUrl || config.url;
    if (!target) return;
    offersRedirectRef.current = true;
    webViewRef.current?.injectJavaScript(`window.location.replace(${JSON.stringify(target)}); true;`);
  };

  const goToCitiLogin = () => {
    if (bank !== 'citi') return;
    if (citiLoginForcedRef.current || syncStartedRef.current) return;
    citiLoginForcedRef.current = true;
    const target = config.loginUrl || CITI_LOGIN_URL;
    webViewRef.current?.injectJavaScript(buildCitiForceLoginJs(target));
  };

  /** Shared Chase start path for auto-start, Sync Offers, and Try again. */
  const startChaseCapture = () => {
    if (bank !== 'chase') return;
    if (startingChaseRef.current || syncStartedRef.current) return;
    startingChaseRef.current = true;
    autoStartConsumedRef.current = true;
    chaseRefreshRef.current = false;
    syncedCountRef.current = 0;
    setSyncedUiCount(0);
    setProgressPeak(0);
    enterCapturing();
    webViewRef.current?.injectJavaScript(buildChaseOfferCaptureJs());
    webViewRef.current?.injectJavaScript(buildChaseHookReadyProbeJs());
    webViewRef.current?.injectJavaScript(buildListCardsJs());
    startingChaseRef.current = false;
  };

  /** Shared Wells start path for auto-start, Sync Offers, and Try again. */
  const startWellsCapture = () => {
    if (bank !== 'wells_fargo') return;
    if (startingWellsRef.current || syncStartedRef.current) return;
    startingWellsRef.current = true;
    autoStartConsumedRef.current = true;
    setCurrentCard('Wells Fargo');
    enterCapturing();
    // Install/refresh hook, then poll stash/DOM like Chase when-ready — first
    // auto-start often races WELLS_ON_DEALS before getDeals stash lands.
    webViewRef.current?.injectJavaScript(buildWellsFargoOfferCaptureJs());
    webViewRef.current?.injectJavaScript(
      buildWellsCaptureWhenReadyJs(WELLS_CAPTURE_READY_TIMEOUT_MS, WELLS_CAPTURE_POLL_MS),
    );
    startingWellsRef.current = false;
  };

  /** Shared Citi start path for auto-start, Sync Offers, and Try again. */
  const startCitiCapture = () => {
    if (bank !== 'citi') return;
    if (startingCitiRef.current || syncStartedRef.current) return;
    startingCitiRef.current = true;
    autoStartConsumedRef.current = true;
    setCurrentCard('Citi Card');
    enterCapturing();
    // Install/refresh hook, then poll stash like Wells when-ready — first
    // auto-start often races CITI_ON_OFFERS before merchant-offers stash lands.
    webViewRef.current?.injectJavaScript(buildCitiOfferCaptureJs());
    webViewRef.current?.injectJavaScript(
      buildCitiCaptureWhenReadyJs(CITI_CAPTURE_READY_TIMEOUT_MS, CITI_CAPTURE_POLL_MS),
    );
    startingCitiRef.current = false;
  };

  /**
   * Shared Amex start path for auto-start, Sync Offers, and Try again.
   * Requires cards already detected; re-injects JSON capture before arm-before-switch
   * so first auto-start does not race a missing interceptor.
   */
  const startAmexCapture = () => {
    if (bank !== 'amex') return;
    if (startingAmexRef.current || syncStartedRef.current) return;
    const cards = cardOptionsRef.current;
    if (cards.length === 0) {
      // Cards not in ref yet — re-open detect (when-ready) instead of failing loudly
      // on auto-start; Sync Offers still alerts when the user taps manually.
      console.log('[amex-auto-start] cards missing in ref; re-detect');
      cardsDiscovered.current = false;
      setAmexCardsReady(false);
      amexCardsReadyRef.current = false;
      webViewRef.current?.injectJavaScript(buildAmexJsonCaptureJs());
      webViewRef.current?.injectJavaScript(AMEX_OPEN_AND_DETECT_JS);
      if (syncModeRef.current === SYNC_MODES.FAILED) {
        Alert.alert('No cards found', 'Please wait for the page to fully load.');
      }
      return;
    }
    startingAmexRef.current = true;
    autoStartConsumedRef.current = true;
    visitedCardsRef.current = new Set();
    syncedCountRef.current = 0;
    setSyncedUiCount(0);
    setProgressPeak(0);
    const activeCard = cards.find(c => c.selected) ?? cards[0];
    initialActiveRef.current = activeCard.testId;
    enterCapturing();
    webViewRef.current?.injectJavaScript(buildAmexJsonCaptureJs());
    webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
    switchToNextAmexCard();
    startingAmexRef.current = false;
  };

  /**
   * Resume Amex after MFA: clear arm, continue eligible→enrolled walk from the
   * next unsaved card — never Chase planChaseNeedsInputResume.
   */
  const resumeAmexCapture = () => {
    if (bank !== 'amex') return;
    if (startingAmexRef.current || syncStartedRef.current) return;
    const plan = planAmexNeedsInputResume({
      cardOptionsLength: cardOptionsRef.current.length,
      visitedCount: visitedCardsRef.current.size,
      syncPhase: syncPhaseRef.current,
    });
    if (plan.action === 'full_start') {
      startAmexCapture();
      return;
    }
    startingAmexRef.current = true;
    enterCapturing();
    webViewRef.current?.injectJavaScript(buildAmexJsonCaptureJs());
    clearAmexArm();
    if (plan.action === 'phase_to_enrolled') {
      advanceAmexSync(null);
      startingAmexRef.current = false;
      return;
    }
    if (!initialActiveRef.current) {
      const active = cardOptionsRef.current.find(c => c.selected) ?? cardOptionsRef.current[0];
      initialActiveRef.current = active?.testId ?? null;
    }
    webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
    switchToNextAmexCard();
    startingAmexRef.current = false;
  };

  /** Resume after MFA: re-arm capture on the current unsaved card (no same-card switch). */
  const resumeChaseCapture = () => {
    if (bank !== 'chase') return;
    if (startingChaseRef.current || syncStartedRef.current) return;
    const plan = planChaseNeedsInputResume({
      cardOptionsLength: cardOptionsRef.current.length,
      syncedCount: syncedCountRef.current,
      cardIndex: cardIndexRef.current,
    });
    if (plan.action === 'full_start') {
      startChaseCapture();
      return;
    }
    startingChaseRef.current = true;
    enterCapturing();
    if (Number.isInteger(plan.position)) {
      cardIndexRef.current = plan.position;
      setCardIndexUi(plan.position);
      const label = cardOptionsRef.current[plan.position]?.label;
      if (label) setCurrentCard(label);
    }
    // Do not switchChaseCard(current) — same-card menu click → CARD_SWITCH_ERROR → failed.
    webViewRef.current?.injectJavaScript(buildChaseOfferCaptureJs());
    webViewRef.current?.injectJavaScript(buildChaseHookReadyProbeJs());
    captureArmed.current = true;
    armStepTimer();
    webViewRef.current?.injectJavaScript(
      buildChaseCaptureWhenReadyJs(CHASE_CAPTURE_READY_TIMEOUT_MS, CHASE_CAPTURE_POLL_MS),
    );
    startingChaseRef.current = false;
  };

  const handleSyncPress = () => {
    if (bank === 'chase') {
      if (syncModeRef.current === SYNC_MODES.FAILED) {
        setMode(nextSyncMode(SYNC_MODES.FAILED, 'sync_offers'));
      }
      startChaseCapture();
      return;
    }

    if (bank === 'wells_fargo') {
      if (syncModeRef.current === SYNC_MODES.FAILED) {
        setMode(nextSyncMode(SYNC_MODES.FAILED, 'sync_offers'));
      }
      startWellsCapture();
      return;
    }

    if (bank === 'citi') {
      if (syncModeRef.current === SYNC_MODES.FAILED) {
        setMode(nextSyncMode(SYNC_MODES.FAILED, 'sync_offers'));
      }
      startCitiCapture();
      return;
    }

    if (bank === 'amex') {
      if (syncModeRef.current === SYNC_MODES.FAILED) {
        setMode(nextSyncMode(SYNC_MODES.FAILED, 'sync_offers'));
      }
      const cards = cardOptionsRef.current;
      if (cards.length === 0) {
        Alert.alert('No cards found', 'Please wait for the page to fully load.');
        webViewRef.current?.injectJavaScript(AMEX_OPEN_AND_DETECT_JS);
        return;
      }
      startAmexCapture();
      return;
    }

    setSyncStarted(true);
    syncStartedRef.current = true;
    setMode(SYNC_MODES.CAPTURING);

    if (bank === 'us_bank') {
      setCurrentCard('US Bank');
      webViewRef.current?.injectJavaScript(buildUsBankOfferCaptureJs());
      webViewRef.current?.injectJavaScript(buildUsBankReadJs());
      return;
    }
  };

  const handleTryAgain = () => {
    if (bank === 'wells_fargo') {
      if (!onOffersPage || onLoginPage) {
        disarmWellsCapture();
        setFailMessage('');
        setMode(SYNC_MODES.AUTH);
        return;
      }
      setMode(nextSyncMode(SYNC_MODES.FAILED, 'try_again'));
      startWellsCapture();
      return;
    }
    if (bank === 'citi') {
      if (!onOffersPage || onLoginPage || citiSignedIn !== true) {
        disarmCitiCapture();
        setFailMessage('');
        setMode(SYNC_MODES.AUTH);
        return;
      }
      setMode(nextSyncMode(SYNC_MODES.FAILED, 'try_again'));
      startCitiCapture();
      return;
    }
    if (bank === 'amex') {
      const ready = onOffersPage && !onLoginPage && amexCardsReady
        && (cardCount > 0 || cardOptionsRef.current.length > 0);
      if (!ready) {
        disarmAmexCapture();
        setFailMessage('');
        setMode(SYNC_MODES.AUTH);
        return;
      }
      setMode(nextSyncMode(SYNC_MODES.FAILED, 'try_again'));
      startAmexCapture();
      return;
    }
    if (bank !== 'chase') return;
    const ready = onOffersPage && chaseHookReady && (cardCount > 0 || cardOptionsRef.current.length > 0);
    if (!ready) {
      disarmChaseWalk();
      setFailMessage('');
      setMode(SYNC_MODES.AUTH);
      return;
    }
    setMode(nextSyncMode(SYNC_MODES.FAILED, 'try_again'));
    startChaseCapture();
  };

  // Chase auto-start / NeedsInput resume — debounced, once per open (resume allowed).
  useEffect(() => {
    if (!visible || bank !== 'chase') return;
    clearAutoStartDebounce();

    const hasCards = cardCount > 0 || cardOptionsRef.current.length > 0;
    const gateInput = {
      bank,
      syncMode,
      onOffersPage,
      onLoginPage,
      hasCards,
      hookReady: chaseHookReady,
      syncStarted: syncStartedRef.current,
      autoStartConsumed: autoStartConsumedRef.current,
      visible,
    };
    const gate = shouldAutoStartChase(gateInput);
    if (!gate) {
      if (syncMode === SYNC_MODES.AUTH || syncMode === SYNC_MODES.NEEDS_INPUT) {
        console.log('[chase-auto-start] waiting', {
          syncMode,
          onOffersPage,
          onLoginPage,
          hasCards,
          hookReady: chaseHookReady,
          autoStartConsumed: autoStartConsumedRef.current,
          syncStarted: syncStartedRef.current,
        });
      }
      return;
    }

    autoStartDebounceRef.current = setTimeout(() => {
      const stillHasCards = cardCount > 0 || cardOptionsRef.current.length > 0;
      const still = shouldAutoStartChase({
        bank,
        syncMode: syncModeRef.current,
        onOffersPage: onOffersPageRef.current,
        onLoginPage: onLoginPageRef.current,
        hasCards: stillHasCards,
        hookReady: chaseHookReady,
        syncStarted: syncStartedRef.current,
        autoStartConsumed: autoStartConsumedRef.current,
        visible: true,
      });
      if (!still) return;
      console.log('[chase-auto-start] firing', { syncMode: syncModeRef.current });
      if (syncModeRef.current === SYNC_MODES.NEEDS_INPUT) {
        resumeChaseCapture();
      } else {
        startChaseCapture();
      }
    }, AUTO_START_DEBOUNCE_MS);

    return () => clearAutoStartDebounce();
  }, [
    visible,
    bank,
    syncMode,
    onOffersPage,
    onLoginPage,
    cardCount,
    chaseHookReady,
    pageLoaded,
  ]);

  // Wells auto-start / NeedsInput resume — debounced, once per open (resume allowed).
  // Resume re-runs startWellsCapture when deals-ready again (no Chase walk planner).
  useEffect(() => {
    if (!visible || bank !== 'wells_fargo') return;
    clearAutoStartDebounce();

    const gateInput = {
      bank,
      syncMode,
      onOffersPage,
      onLoginPage,
      syncStarted: syncStartedRef.current,
      autoStartConsumed: autoStartConsumedRef.current,
      visible,
    };
    const gate = shouldAutoStartWells(gateInput);
    if (!gate) {
      if (syncMode === SYNC_MODES.AUTH || syncMode === SYNC_MODES.NEEDS_INPUT) {
        console.log('[wells-auto-start] waiting', {
          syncMode,
          onOffersPage,
          onLoginPage,
          autoStartConsumed: autoStartConsumedRef.current,
          syncStarted: syncStartedRef.current,
        });
      }
      return;
    }

    autoStartDebounceRef.current = setTimeout(() => {
      const still = shouldAutoStartWells({
        bank,
        syncMode: syncModeRef.current,
        onOffersPage: onOffersPageRef.current,
        onLoginPage: onLoginPageRef.current,
        syncStarted: syncStartedRef.current,
        autoStartConsumed: autoStartConsumedRef.current,
        visible: true,
      });
      if (!still) return;
      console.log('[wells-auto-start] firing', { syncMode: syncModeRef.current });
      startWellsCapture();
    }, AUTO_START_DEBOUNCE_MS);

    return () => clearAutoStartDebounce();
  }, [
    visible,
    bank,
    syncMode,
    onOffersPage,
    onLoginPage,
    pageLoaded,
  ]);

  // Citi auto-start / NeedsInput resume — requires honest signedIn + offers surface.
  // Resume re-runs startCitiCapture / read when signed-in on offers again.
  useEffect(() => {
    if (!visible || bank !== 'citi') return;
    clearAutoStartDebounce();

    const gateInput = {
      bank,
      syncMode,
      onOffersPage,
      onLoginPage,
      signedIn: citiSignedIn,
      syncStarted: syncStartedRef.current,
      autoStartConsumed: autoStartConsumedRef.current,
      visible,
    };
    const gate = shouldAutoStartCiti(gateInput);
    if (!gate) {
      if (syncMode === SYNC_MODES.AUTH || syncMode === SYNC_MODES.NEEDS_INPUT) {
        console.log('[citi-auto-start] waiting', {
          syncMode,
          onOffersPage,
          onLoginPage,
          signedIn: citiSignedIn,
          autoStartConsumed: autoStartConsumedRef.current,
          syncStarted: syncStartedRef.current,
        });
      }
      return;
    }

    autoStartDebounceRef.current = setTimeout(() => {
      const still = shouldAutoStartCiti({
        bank,
        syncMode: syncModeRef.current,
        onOffersPage: onOffersPageRef.current,
        onLoginPage: onLoginPageRef.current,
        signedIn: citiSignedInRef.current,
        syncStarted: syncStartedRef.current,
        autoStartConsumed: autoStartConsumedRef.current,
        visible: true,
      });
      if (!still) return;
      console.log('[citi-auto-start] firing', { syncMode: syncModeRef.current });
      startCitiCapture();
    }, AUTO_START_DEBOUNCE_MS);

    return () => clearAutoStartDebounce();
  }, [
    visible,
    bank,
    syncMode,
    onOffersPage,
    onLoginPage,
    citiSignedIn,
    pageLoaded,
  ]);

  // Amex auto-start / NeedsInput resume — requires amexCardsReady + offers surface.
  // Resume continues eligible→enrolled walk (not Chase planner).
  useEffect(() => {
    if (!visible || bank !== 'amex') return;
    clearAutoStartDebounce();

    const gateInput = {
      bank,
      syncMode,
      onOffersPage,
      onLoginPage,
      amexCardsReady,
      syncStarted: syncStartedRef.current,
      autoStartConsumed: autoStartConsumedRef.current,
      visible,
    };
    const gate = shouldAutoStartAmex(gateInput);
    if (!gate) {
      if (syncMode === SYNC_MODES.AUTH || syncMode === SYNC_MODES.NEEDS_INPUT) {
        console.log('[amex-auto-start] waiting', {
          syncMode,
          onOffersPage,
          onLoginPage,
          amexCardsReady,
          autoStartConsumed: autoStartConsumedRef.current,
          syncStarted: syncStartedRef.current,
        });
      }
      return;
    }

    autoStartDebounceRef.current = setTimeout(() => {
      const still = shouldAutoStartAmex({
        bank,
        syncMode: syncModeRef.current,
        onOffersPage: onOffersPageRef.current,
        onLoginPage: onLoginPageRef.current,
        amexCardsReady: amexCardsReadyRef.current,
        syncStarted: syncStartedRef.current,
        autoStartConsumed: autoStartConsumedRef.current,
        visible: true,
      });
      if (!still) return;
      console.log('[amex-auto-start] firing', { syncMode: syncModeRef.current });
      if (syncModeRef.current === SYNC_MODES.NEEDS_INPUT) {
        resumeAmexCapture();
      } else {
        startAmexCapture();
      }
    }, AUTO_START_DEBOUNCE_MS);

    return () => clearAutoStartDebounce();
  }, [
    visible,
    bank,
    syncMode,
    onOffersPage,
    onLoginPage,
    amexCardsReady,
    cardCount,
    pageLoaded,
  ]);

  // While AUTH/NeedsInput, keep re-probing hook + page + cards until gates open.
  // Chase SPA/microapp loads can miss a one-shot inject on first loadEnd.
  useEffect(() => {
    if (!visible || bank !== 'chase') return;
    if (syncMode !== SYNC_MODES.AUTH && syncMode !== SYNC_MODES.NEEDS_INPUT) return;
    if (syncStartedRef.current) return;

    const reprobe = () => {
      if (syncStartedRef.current) return;
      if (syncModeRef.current !== SYNC_MODES.AUTH && syncModeRef.current !== SYNC_MODES.NEEDS_INPUT) {
        return;
      }
      webViewRef.current?.injectJavaScript(buildChaseOfferCaptureJs());
      webViewRef.current?.injectJavaScript(buildChaseHookReadyProbeJs());
      webViewRef.current?.injectJavaScript(buildPageStateJs(config.loginPaths, config.offersPaths));
      webViewRef.current?.injectJavaScript(DETECT_CARDS_JS);
    };

    reprobe();
    const id = setInterval(reprobe, AUTH_REPROBE_MS);
    return () => clearInterval(id);
  }, [visible, bank, syncMode, config.loginPaths, config.offersPaths]);

  // Citi SPA can paint merchantoffers before Sign Off chrome is in innerText.
  // Re-inject visibility until honest signedIn flips (Chase/Wells reprobes stay separate).
  useEffect(() => {
    if (!visible || bank !== 'citi') return;
    if (syncMode !== SYNC_MODES.AUTH && syncMode !== SYNC_MODES.NEEDS_INPUT) return;
    if (syncStartedRef.current) return;

    const reprobe = () => {
      if (syncStartedRef.current) return;
      if (syncModeRef.current !== SYNC_MODES.AUTH && syncModeRef.current !== SYNC_MODES.NEEDS_INPUT) {
        return;
      }
      if (citiSignedInRef.current === true && onOffersPageRef.current) return;
      webViewRef.current?.injectJavaScript(buildCitiOffersVisibleJs());
    };

    reprobe();
    const id = setInterval(reprobe, AUTH_REPROBE_MS);
    return () => clearInterval(id);
  }, [visible, bank, syncMode]);

  // Amex SPA can paint offers before the card combobox is ready. Re-open detect
  // until amexCardsReady (Chase/Citi reprobes stay separate).
  useEffect(() => {
    if (!visible || bank !== 'amex') return;
    if (syncMode !== SYNC_MODES.AUTH && syncMode !== SYNC_MODES.NEEDS_INPUT) return;
    if (syncStartedRef.current) return;

    const reprobe = () => {
      if (syncStartedRef.current) return;
      if (syncModeRef.current !== SYNC_MODES.AUTH && syncModeRef.current !== SYNC_MODES.NEEDS_INPUT) {
        return;
      }
      if (amexCardsReadyRef.current && onOffersPageRef.current) return;
      if (!onOffersPageRef.current) return;
      webViewRef.current?.injectJavaScript(buildAmexJsonCaptureJs());
      webViewRef.current?.injectJavaScript(AMEX_OPEN_AND_DETECT_JS);
    };

    reprobe();
    const id = setInterval(reprobe, AUTH_REPROBE_MS);
    return () => clearInterval(id);
  }, [visible, bank, syncMode, onOffersPage, amexCardsReady]);

  const switchChaseCard = (position) => {
    cardIndexRef.current = position;
    setCardIndexUi(position);
    setSwitching(true);
    switchRetriesRef.current = 0;
    armStepTimer();
    webViewRef.current?.injectJavaScript(buildChaseOfferCaptureJs());
    webViewRef.current?.injectJavaScript(
      buildSwitchCardJs(cardOptionsRef.current[position].index, CHASE_SWITCH_TIMEOUT_MS),
    );
  };

  const finishChaseSuccess = () => {
    clearStepTimer();
    setMode(SYNC_MODES.DONE);
    const total = syncedCardsRef.current.reduce((sum, c) => sum + c.count, 0);
    onSuccess(total, syncedCardsRef.current);
    onClose();
  };

  const abortCaptureConfirmed = () => {
    const partial = isPartialAbort({
      syncedCount: syncedCountRef.current,
      totalCards: cardOptionsRef.current.length || cardCount,
    });
    const cards = [...syncedCardsRef.current];
    const syncedCount = syncedCountRef.current;
    const totalCards = cardOptionsRef.current.length || cardCount;
    disarmChaseWalk();
    setMode(SYNC_MODES.DONE);
    if (partial && cards.length > 0) {
      const offerTotal = cards.reduce((sum, c) => sum + c.count, 0);
      onSuccess(offerTotal, cards);
      Alert.alert('Sync stopped', partialAbortCopy({ syncedCount, totalCards }));
    }
    onClose();
  };

  const abortWellsCaptureConfirmed = () => {
    disarmWellsCapture();
    setMode(SYNC_MODES.DONE);
    onClose();
  };

  const abortCitiCaptureConfirmed = () => {
    disarmCitiCapture();
    setMode(SYNC_MODES.DONE);
    onClose();
  };

  const abortAmexCaptureConfirmed = () => {
    const cardsLen = cardOptionsRef.current.length || cardCount;
    const totalCards = cardsLen > 0 ? cardsLen * 2 : 0;
    const partial = isPartialAbort({
      syncedCount: syncedCountRef.current,
      totalCards,
    });
    const cards = [...syncedCardsRef.current];
    const syncedCount = syncedCountRef.current;
    disarmAmexCapture();
    setMode(SYNC_MODES.DONE);
    if (partial && cards.length > 0) {
      const offerTotal = cards.reduce((sum, c) => sum + c.count, 0);
      onSuccess(offerTotal, cards);
      Alert.alert('Sync stopped', partialAbortCopy({ syncedCount, totalCards }));
    }
    onClose();
  };

  const requestClose = () => {
    if (syncModeRef.current === SYNC_MODES.CAPTURING && bank === 'chase') {
      Alert.alert(
        'Stop syncing?',
        syncedCountRef.current > 0
          ? 'Cards already saved will be kept. You can sync again later for the rest.'
          : 'Stop syncing Chase offers?',
        [
          { text: 'Keep syncing', style: 'cancel' },
          { text: 'Stop', style: 'destructive', onPress: abortCaptureConfirmed },
        ],
      );
      return;
    }
    if (syncModeRef.current === SYNC_MODES.CAPTURING && bank === 'wells_fargo') {
      Alert.alert(
        'Stop syncing?',
        'Stop syncing Wells Fargo offers?',
        [
          { text: 'Keep syncing', style: 'cancel' },
          { text: 'Stop', style: 'destructive', onPress: abortWellsCaptureConfirmed },
        ],
      );
      return;
    }
    if (syncModeRef.current === SYNC_MODES.CAPTURING && bank === 'citi') {
      Alert.alert(
        'Stop syncing?',
        'Stop syncing Citi offers?',
        [
          { text: 'Keep syncing', style: 'cancel' },
          { text: 'Stop', style: 'destructive', onPress: abortCitiCaptureConfirmed },
        ],
      );
      return;
    }
    if (syncModeRef.current === SYNC_MODES.CAPTURING && bank === 'amex') {
      Alert.alert(
        'Stop syncing?',
        syncedCountRef.current > 0
          ? 'Cards already saved will be kept. You can sync again later for the rest.'
          : 'Stop syncing Amex offers?',
        [
          { text: 'Keep syncing', style: 'cancel' },
          { text: 'Stop', style: 'destructive', onPress: abortAmexCaptureConfirmed },
        ],
      );
      return;
    }
    onClose();
  };

  const handleCaptureResult = async ({ payload, cardLabel, phase, capturedTestId, tileCount, partial }) => {
    setSyncing(true);
    const user = getAuthInstance().currentUser;
    if (!user) throw new Error('You must be signed in to sync offers.');

    const { cardName, cardLast4 } = parseCardLabel(cardLabel);
    const fullCardName = cardName
      ? (cardLast4 ? `${cardName} (...${cardLast4})` : cardName)
      : null;

    const isAmex = bank === 'amex';
    const isWells = bank === 'wells_fargo';
    const isCiti = bank === 'citi';
    const isUsBank = bank === 'us_bank';
    if (!isAmex && !isWells && !isCiti && !isUsBank && !fullCardName) {
      throw new Error('Could not read the Chase card name. Nothing was saved.');
    }
    const result = await saveCardSnapshot(user.uid, isWells
      ? {
          bank: 'wells_fargo',
          cardName: 'Wells Fargo',
          cardLast4: null,
          phase: '',
          json: payload,
        }
      : isUsBank
      ? {
          bank: 'us_bank',
          cardName: 'US Bank',
          cardLast4: null,
          phase: '',
          json: payload,
        }
      : isCiti
      ? {
          bank: 'citi',
          cardName: fullCardName || 'Citi Card',
          cardLast4,
          phase: '',
          json: payload,
        }
      : isAmex
      ? {
          bank,
          cardName: fullCardName || 'Amex Card',
          cardLast4,
          phase,
          json: payload,
        }
      : {
          bank,
          cardName: fullCardName,
          cardLast4,
          phase: '',
          gridFound: true,
          tileCount,
          partial,
          rawOffers: payload,
        });

    const savedCard = {
      cardName: isWells ? 'Wells Fargo' : isUsBank ? 'US Bank' : (fullCardName || 'Unknown Card'),
      count: result.synced ?? 0,
      phase: isWells || isCiti || isUsBank ? '' : phase,
    };
    syncedCardsRef.current = replaceCardPass(syncedCardsRef.current, savedCard);
    setSyncing(false);

    if (bank === 'wells_fargo' || bank === 'citi' || bank === 'us_bank') {
      const total = syncedCardsRef.current.reduce((sum, card) => sum + card.count, 0);
      setMode(SYNC_MODES.DONE);
      onSuccess(total, syncedCardsRef.current);
      onClose();
      return;
    }

    if (bank === 'amex') {
      syncedCountRef.current += 1;
      setSyncedUiCount(syncedCountRef.current);
      armStepTimer();
      advanceAmexSync(capturedTestId);
      return;
    }

    syncedCountRef.current += 1;
    setSyncedUiCount(syncedCountRef.current);
    const totalCards = cardOptionsRef.current.length;
    const nextPos = nextChaseCardPosition(cardIndexRef.current, totalCards, syncedCountRef.current);
    if (nextPos !== null) {
      switchChaseCard(nextPos);
    } else {
      finishChaseSuccess();
    }
  };

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'CHASE_HOOK_READY' && bank === 'chase') {
        if (data.version === CHASE_OFFER_HOOK_VERSION) setChaseHookReady(true);
        return;
      }

      if (data.type === 'CHASE_CAPTURE_UNAVAILABLE' && bank === 'chase') {
        if (!syncStartedRef.current) return;
        const nextPos = nextChaseCardPosition(cardIndexRef.current, cardOptionsRef.current.length, syncedCountRef.current);
        if (!chaseRefreshRef.current && nextPos !== null && nextPos !== cardIndexRef.current) {
          chaseRefreshRef.current = true;
          switchChaseCard(nextPos);
          return;
        }
        failChaseCapture(
          data.hookError
            ? 'Chase offer response was not captured. ' + data.hookError
            : 'Chase offer response was not captured. Stay on the offers page and try again.'
        );
        return;
      }

      if (data.type === 'PAGE_STATE') {
        setOnOffersPage(!!data.onOffers);
        setOnLoginPage(!!data.onLogin && !data.onOffers);
        if (data.onOffers) offersRedirectRef.current = false;
        if (data.onLogin && !data.onOffers && syncModeRef.current === SYNC_MODES.CAPTURING && bank === 'chase') {
          pauseForNeedsInput();
          return;
        }
        if (
          bank === 'chase'
          && shouldForceChaseOffersRedirect({
            onOffers: !!data.onOffers,
            onLogin: !!data.onLogin && !data.onOffers,
            onOffersUrl: !!data.onOffersUrl,
            offersSeen: offersSeenRef.current || !!data.onOffers,
            syncStarted: syncStartedRef.current,
          })
        ) {
          goToOffers();
        }
        return;
      }

      if (data.type === 'CARDS_LISTED') {
        if (!syncStartedRef.current) return;
        const cards = Array.isArray(data.cards) ? data.cards : [];
        if (data.error || cards.length === 0) {
          if (bank === 'chase') {
            failChaseCapture(data.error || 'Open the offers page and try again. Nothing was changed.');
          } else {
            syncStartedRef.current = false;
            captureArmed.current = false;
            setSyncStarted(false);
            setSyncing(false);
            setSwitching(false);
            Alert.alert('Could not read Chase cards', data.error || 'Open the offers page and try again. Nothing was changed.');
          }
          return;
        }
        cardOptionsRef.current = cards;
        cardsDiscovered.current = true;
        setCardCount(cards.length);
        const activeIdx = cards.findIndex(card => card.selected || card.label === data.selectedLabel);
        cardIndexRef.current = activeIdx >= 0 ? activeIdx : 0;
        setCardIndexUi(cardIndexRef.current);
        setCurrentCard(data.selectedLabel || cards[cardIndexRef.current].label);
        captureArmed.current = true;
        armStepTimer();
        webViewRef.current?.injectJavaScript(
          buildChaseCaptureWhenReadyJs(CHASE_CAPTURE_READY_TIMEOUT_MS, CHASE_CAPTURE_POLL_MS),
        );
        return;
      }

      if (data.type === 'CARDS_DETECTED') {
        const hasCards = data.cards?.length > 0;
        const merged = mergeDetectedCards(cardOptionsRef.current, data.cards);
        if (hasCards && merged !== cardOptionsRef.current) {
          cardOptionsRef.current  = merged;
          cardsDiscovered.current = true;
          setCardCount(data.cards.length);
          const activeIdx = data.cards.findIndex(c => c.label === data.selectedLabel);
          cardIndexRef.current = activeIdx >= 0 ? activeIdx : 0;
          setCardIndexUi(cardIndexRef.current);
        }
        setCurrentCard(data.selectedLabel || null);
        if (config.useCardsDetectedAsOffersSignal && hasCards) setOnOffersPage(true);
        return;
      }

      if (data.type === 'AMEX_CARDS_DETECTED') {
        const hasCards = data.cards?.length > 0;
        if (hasCards) {
          console.log('[amex-cards]', {
            count: data.cards.length,
            cards: data.cards.map((c) => ({
              label: c.label,
              last4: c.last4,
              testId: c.testId,
              selected: c.selected,
            })),
          });
        } else if (data.error) {
          console.log('[amex-cards] empty', { error: data.error });
        }
        // Chase-shaped latch: empty detects must not set cardsDiscovered, or a
        // later honest list never populates cardOptionsRef and auto-start stalls.
        const applied = applyAmexCardsDetected({
          cards: data.cards,
          cardsDiscovered: cardsDiscovered.current,
          cardOptions: cardOptionsRef.current,
        });
        if (applied.populated) {
          cardOptionsRef.current = applied.cardOptions;
          setCardCount(applied.cardOptions.length);
          cardIndexRef.current = applied.selectedIndex;
          setCardIndexUi(applied.selectedIndex);
        }
        cardsDiscovered.current = applied.cardsDiscovered;
        setCurrentCard(data.selectedLabel || null);
        if (applied.amexCardsReady) {
          setAmexCardsReady(true);
          amexCardsReadyRef.current = true;
        }

        if (hasCards && syncPhaseRef.current === 'enrolled' && syncStartedRef.current) {
          const activeCard = data.cards?.find(c => c.selected) ?? cardOptionsRef.current[0];
          initialActiveRef.current = activeCard?.testId ?? null;
          webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
          switchToNextAmexCard();
        }
        return;
      }

      if (data.type === 'CARD_SWITCHED') {
        setSwitching(false);
        setCurrentCard(data.cardLabel || null);
        if (bank === 'amex') {
          pendingCardLabelRef.current = data.cardLabel || null;
          amexExpectedRef.current = data.expectedTestId || null;
          setSyncing(true);
          clearAmexWait();
          amexWaitRef.current = setTimeout(() => {
            if (!syncStartedRef.current || !captureArmed.current) return;
            captureArmed.current = false;
            webViewRef.current?.injectJavaScript(`clearTimeout(window.__amexQuietTimer); window.__amexBest = null; window.__amexJsonCaptureArmed = false; true;`);
            advanceAmexSync(amexExpectedRef.current);
          }, 5000);
        } else if (bank === 'chase') {
          // Poll hooked stash as soon as customer-offers lands — no fixed 2.5s sleep.
          clearPostSwitchTimeout();
          captureArmed.current = true;
          setSyncing(true);
          armStepTimer();
          webViewRef.current?.injectJavaScript(
            buildChaseCaptureWhenReadyJs(CHASE_CAPTURE_READY_TIMEOUT_MS, CHASE_CAPTURE_POLL_MS),
          );
        } else {
          clearPostSwitchTimeout();
          postSwitchTimeoutRef.current = setTimeout(() => {
            if (syncModeRef.current !== SYNC_MODES.CAPTURING) return;
            captureArmed.current = true;
            armStepTimer();
            webViewRef.current?.injectJavaScript(buildCaptureOffersJs());
          }, POST_SWITCH_DELAY_MS);
        }
        return;
      }

      if (data.type === 'CARD_SWITCH_ERROR') {
        if (bank === 'chase') {
          failChaseCapture(data.message || 'Card switch failed.');
          return;
        }
        if (bank === 'amex') {
          failAmexCapture(data.message || 'Card switch failed.');
          return;
        }
        syncStartedRef.current = false;
        setSyncStarted(false);
        setSwitching(false);
        captureArmed.current = false;
        webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
        setMode(SYNC_MODES.AUTH);
        Alert.alert('Card Switch Failed', data.message);
        return;
      }

      if (data.type === 'ERROR') {
        if (bank === 'chase' && syncStartedRef.current) {
          failChaseCapture(data.message || 'Capture error.');
          return;
        }
        if (bank === 'amex' && syncStartedRef.current) {
          failAmexCapture(data.message || 'Capture error.');
          return;
        }
        syncStartedRef.current = false;
        setSyncStarted(false);
        captureArmed.current = false;
        webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
        setMode(SYNC_MODES.AUTH);
        Alert.alert('Capture Error', data.message);
        return;
      }

      if (data.type === 'WELLS_ON_DEALS' && bank === 'wells_fargo') {
        offersRedirectRef.current = false;
        setOnLoginPage(false);
        setOnOffersPage(true);
        return;
      }

      if (data.type === 'WELLS_CAPTURE_UNAVAILABLE' && bank === 'wells_fargo') {
        if (!syncStartedRef.current) return;
        failWellsCapture(
          'Could not read Wells Fargo deals. Stay on the deals page and try again. Nothing was changed.'
        );
        return;
      }

      if (data.type === 'WELLS_DEALS' && bank === 'wells_fargo') {
        if (!syncStartedRef.current) return;
        clearStepTimer();
        await handleCaptureResult({
          payload: data.deals,
          cardLabel: 'Wells Fargo',
          phase: '',
        });
        return;
      }

      if (data.type === 'CITI_PAGE_STATE' && bank === 'citi') {
        const onOffers = data.onOffers === true;
        const signedIn = data.signedIn === true;
        const onLoginForm = data.onLoginForm === true;
        const expired = data.expired === true;
        if (onOffers) offersRedirectRef.current = false;
        setOnOffersPage(onOffers);
        setCitiSignedIn(signedIn);
        setOnLoginPage(onLoginForm || (expired && !signedIn && !onOffers));
        if (signedIn) setOnLoginPage(false);

        const waiting =
          syncModeRef.current === SYNC_MODES.AUTH
          || syncModeRef.current === SYNC_MODES.NEEDS_INPUT;
        if (
          waiting
          && shouldForceCitiLogin({
            expired,
            onLoginForm,
            signedIn,
            syncStarted: syncStartedRef.current,
            loginForced: citiLoginForcedRef.current,
          })
        ) {
          goToCitiLogin();
          return;
        }
        if (
          waiting
          && shouldForceCitiOffersRedirect({
            onOffers,
            signedIn,
            onLoginForm,
            syncStarted: syncStartedRef.current,
            offersRedirected: offersRedirectRef.current,
          })
        ) {
          goToOffers();
        }
        return;
      }

      if (data.type === 'CITI_ON_OFFERS' && bank === 'citi') {
        // Legacy offers-only signal (still emitted alongside CITI_PAGE_STATE).
        offersRedirectRef.current = false;
        setOnOffersPage(true);
        const signedIn = data.signedIn === true;
        setCitiSignedIn(signedIn);
        if (signedIn) setOnLoginPage(false);
        return;
      }

      if (data.type === 'CITI_CAPTURE_UNAVAILABLE' && bank === 'citi') {
        if (!syncStartedRef.current) return;
        failCitiCapture(
          'Could not read Citi offers. Stay on the Merchant Offers page and try again. Nothing was changed.'
        );
        return;
      }

      if (data.type === 'CITI_OFFERS' && bank === 'citi') {
        if (!syncStartedRef.current) return;
        clearStepTimer();
        const cardLabel = citiCardLabelFromOffers(data.offers);
        setCurrentCard(cardLabel);
        await handleCaptureResult({
          payload: data.offers,
          cardLabel,
          phase: '',
        });
        return;
      }

      if (data.type === 'US_BANK_ON_OFFERS' && bank === 'us_bank') {
        offersRedirectRef.current = false;
        setOnLoginPage(false);
        setOnOffersPage(true);
        return;
      }

      if (data.type === 'US_BANK_CAPTURE_UNAVAILABLE' && bank === 'us_bank') {
        if (!syncStartedRef.current) return;
        syncStartedRef.current = false;
        setSyncStarted(false);
        setSyncing(false);
        setSwitching(false);
        setMode(SYNC_MODES.AUTH);
        Alert.alert(
          'Could not read US Bank offers',
          'Stay on the Cash Back Deals page and try again. Nothing was changed.'
        );
        return;
      }

      if (data.type === 'US_BANK_OFFERS' && bank === 'us_bank') {
        if (!syncStartedRef.current) return;
        await handleCaptureResult({
          payload: data.offers,
          cardLabel: 'US Bank',
          phase: '',
        });
        return;
      }

      // ── Amex JSON capture ─────────────────────────────────────
      if (data.type === 'CAPTURE_JSON' && bank === 'amex') {
        if (!captureArmed.current) return;
        captureArmed.current = false;

        const cards = cardOptionsRef.current;
        const capturedCard = cards.find(c =>
          data.cardLabel && (c.label + (c.last4 ? ` (...${c.last4})` : '')) === data.cardLabel
        );
        const capturedTestId = capturedCard?.testId ?? null;
        clearAmexWait();
        clearStepTimer();
        if (capturedTestId && visitedCardsRef.current.has(capturedTestId)) {
          if (visitedCardsRef.current.size < cardOptionsRef.current.length) switchToNextAmexCard();
          return;
        }

        await handleCaptureResult({
          payload:         data.json,
          cardLabel:       data.cardLabel,
          phase:           syncPhaseRef.current,
          capturedTestId,
        });
        return;
      }

      // ── Chase structured capture ──────────────────────────────
      if (data.type !== 'CAPTURE_OFFERS' || bank !== 'chase' || !captureArmed.current) return;
      captureArmed.current = false;
      if (!data.gridFound) {
        failChaseCapture('Open the offers page and try again. Nothing was changed.');
        return;
      }
      await handleCaptureResult({
        payload:   data.offers || [],
        cardLabel: data.cardLabel,
        phase:     '',
        tileCount: data.tileCount ?? (data.offers || []).length,
        partial:   data.partial === true,
      });

    } catch (err) {
      captureArmed.current        = false;
      syncStartedRef.current      = false;
      pendingCardLabelRef.current = null;
      webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
      setSyncStarted(false);
      setSyncing(false);
      setSwitching(false);
      console.error(`[SyncWebView] handleMessage error:`, err.message);
      if (bank === 'chase') {
        failChaseCapture(err.message);
      } else if (bank === 'wells_fargo') {
        failWellsCapture(err.message);
      } else if (bank === 'citi') {
        failCitiCapture(err.message);
      } else if (bank === 'amex') {
        failAmexCapture(err.message);
      } else {
        setMode(SYNC_MODES.AUTH);
        Alert.alert('Sync Failed', err.message);
      }
    }
  };

  const { cardName } = parseCardLabel(currentCard);
  const cardsInPhase = cardCount || cardOptionsRef.current.length || 1;
  // Amex walks eligible then enrolled — cover total is cards × 2 phases.
  const totalCards   = bank === 'amex' ? cardsInPhase * 2 : cardsInPhase;
  const phaseLabel   = syncPhaseUi === 'enrolled' ? 'activated' : 'eligible';
  const showCover    = shouldShowSyncCover({ bank, syncMode });
  const coverProgressFn = bank === 'amex' ? amexCoverProgress : chaseCoverProgress;
  const coverProgress = coverProgressFn({
    syncedCount: syncedUiCount,
    totalCards,
    inFlight: showCover && (bank === 'chase' || bank === 'amex') && (syncing || switching),
  });
  const progressFrac = Math.max(progressPeak, coverProgress.rawFrac);
  const autoFailed   = (bank === 'chase' || bank === 'wells_fargo' || bank === 'citi' || bank === 'amex') && syncMode === SYNC_MODES.FAILED;
  const autoAuth     = (bank === 'chase' || bank === 'wells_fargo' || bank === 'citi' || bank === 'amex') && syncMode === SYNC_MODES.AUTH;
  const autoNeeds    = (bank === 'chase' || bank === 'wells_fargo' || bank === 'citi' || bank === 'amex') && syncMode === SYNC_MODES.NEEDS_INPUT;

  useEffect(() => {
    if (!showCover) return;
    setProgressPeak((peak) => Math.max(peak, coverProgress.rawFrac));
  }, [showCover, coverProgress.rawFrac]);

  const phaseCardIndex = Math.min(
    cardsInPhase,
    (cardIndexUi >= 0 ? cardIndexUi : 0) + 1,
  );
  const statusText = switching
    ? `Switching card...`
    : syncing
      ? bank === 'amex'
        ? `Syncing ${phaseLabel} offers — ${cardName || 'card'} (${phaseCardIndex} of ${cardsInPhase})...`
        : `Syncing ${phaseLabel} offers — ${cardName || 'card'} (${coverProgress.coverIndex} of ${totalCards})...`
      : `Processing...`;

  const renderSyncButton = () => (
    <TouchableOpacity style={s.syncBtn} onPress={handleSyncPress}>
      <Text style={s.syncBtnText}>Sync Offers</Text>
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (autoFailed) {
      return (
        <View style={s.failedFooter}>
          <TouchableOpacity style={s.syncBtn} onPress={handleTryAgain}>
            <Text style={s.syncBtnText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBtn} onPress={handleSyncPress}>
            <Text style={s.secondaryBtnText}>Sync Offers</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (showCover) {
      return (
        <TouchableOpacity style={s.cancelBtn} onPress={requestClose}>
          <Text style={s.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      );
    }

    if (autoNeeds) {
      return (
        <Text style={s.helperText}>Confirm it is you to continue syncing</Text>
      );
    }

    if (autoAuth) {
      return (
        <Text style={s.helperText}>
          {bank === 'wells_fargo'
            ? 'Waiting for the deals page to load for sync to begin'
            : bank === 'citi'
              ? 'Waiting for Merchant Offers to load for sync to begin'
              : bank === 'amex'
                ? 'Waiting for Amex cards to load for sync to begin'
                : 'Waiting for the offers page to load for sync to begin'}
        </Text>
      );
    }

    if (syncStarted) {
      return (
        <View style={s.statusRow}>
          <ActivityIndicator size="small" color={colors.primary} style={s.spinner} />
          <Text style={s.statusText}>{statusText}</Text>
        </View>
      );
    }

    const ready = onOffersPage && pageLoaded && (bank !== 'amex' || amexCardsReady);
    if (ready) return renderSyncButton();
    return null;
  };

  const coverCardLabel = cardName || currentCard || 'card';
  const coverIndex = bank === 'amex' ? phaseCardIndex : coverProgress.coverIndex;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={requestClose}>
      <View style={s.overlay}>
        <SafeAreaView style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <TouchableOpacity onPress={requestClose} style={s.closeBtn} hitSlop={12}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>{config.label.replace(/ Offers$/, '') || config.label}</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={s.body}>
            <WebView
              ref={webViewRef}
              source={{ uri: config.url }}
              injectedJavaScriptBeforeContentLoaded={
                bank === 'chase' ? buildChaseOfferCaptureJs()
                : bank === 'wells_fargo'
                  ? `${buildWellsFargoOfferCaptureJs()}\n${buildWellsAppPromoDismissJs()}`
                : bank === 'citi' ? buildCitiOfferCaptureJs()
                : bank === 'us_bank' ? buildUsBankOfferCaptureJs()
                : undefined
              }
              onMessage={handleMessage}
              onNavigationStateChange={handleNavigationStateChange}
              onLoadStart={(event) => {
                setPageLoaded(false);
                if (bank === 'chase') {
                  // Do not clear chaseHookReady on every load (Auth hang).
                  // While AUTH/NeedsInput, clear onOffersPage when the URL leaves
                  // the hub so capture cannot start on the wrong page.
                  const url = String(event?.nativeEvent?.url || currentUrl || '');
                  const waiting =
                    syncModeRef.current === SYNC_MODES.AUTH
                    || syncModeRef.current === SYNC_MODES.NEEDS_INPUT;
                  if (urlMatchesAnyPath(url, config.loginPaths)) {
                    setOnLoginPage(true);
                    setOnOffersPage(false);
                  } else if (urlMatchesAnyPath(url, config.offersPaths)) {
                    setOnOffersPage(true);
                    setOnLoginPage(false);
                  } else if (waiting && url) {
                    setOnOffersPage(false);
                  }
                  return;
                }
                if (bank === 'amex') {
                  const url = String(event?.nativeEvent?.url || currentUrl || '').toLowerCase();
                  const waiting =
                    syncModeRef.current === SYNC_MODES.AUTH
                    || syncModeRef.current === SYNC_MODES.NEEDS_INPUT;
                  if (urlMatchesAnyPath(url, config.loginPaths)) {
                    setOnLoginPage(true);
                    setOnOffersPage(false);
                  } else if (waiting && url) {
                    const onEnrolled = url.includes(String(config.enrolledPath || '').toLowerCase());
                    const onEligible = !onEnrolled
                      && url.includes(String(config.eligiblePath || '').toLowerCase());
                    const phaseMatch =
                      (syncPhaseRef.current === 'enrolled' && onEnrolled)
                      || (syncPhaseRef.current === 'eligible' && onEligible);
                    setOnOffersPage(phaseMatch && (onEligible || onEnrolled));
                    setOnLoginPage(false);
                  }
                  return;
                }
                setOnOffersPage(false);
                setOnLoginPage(false);
                if (bank === 'citi') {
                  setCitiSignedIn(false);
                  citiSignedInRef.current = false;
                }
              }}
              onLoadEnd={handleLoadEnd}
              style={s.webview}
              incognito={false}
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={true}
            />
            {showCover ? (
              <View style={s.cover} pointerEvents="auto">
                <BankLogoIcon bankId={bank} size={56} />
                <Text style={s.coverTitle}>
                  {bank === 'wells_fargo'
                    ? 'Syncing Wells Fargo offers…'
                    : bank === 'citi'
                      ? 'Syncing Citi offers…'
                      : bank === 'amex'
                        ? 'Syncing Amex offers…'
                        : 'Syncing Chase offers...'}
                </Text>
                {bank === 'chase' || bank === 'amex' ? (
                  <>
                    <Text style={s.coverSub}>
                      {bank === 'amex'
                        ? `${coverCardLabel} · card ${coverIndex} of ${cardsInPhase} · ${phaseLabel}`
                        : `${coverCardLabel} · card ${coverIndex} of ${totalCards}`}
                      {syncedUiCount > 0 ? ` · ${syncedUiCount} saved` : ''}
                    </Text>
                    <View style={s.progressTrack}>
                      <View style={[s.progressFill, { width: `${Math.round(progressFrac * 100)}%` }]} />
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
          <View style={s.footer}>
            {autoFailed ? (
              <View style={s.failBanner}>
                <Text style={s.failTitle}>Could not finish sync</Text>
                <Text style={s.failBody}>
                  {failMessage
                    || (bank === 'wells_fargo'
                      ? 'Auto-sync stopped. Try again, or sync manually from the deals page.'
                      : bank === 'citi'
                        ? 'Auto-sync stopped. Try again, or sync manually from the Merchant Offers page.'
                        : 'Auto-sync stopped. Try again, or sync manually from the offers page.')}
                </Text>
              </View>
            ) : null}
            {renderFooter()}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:         { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:           { height: '87%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  handle:          { width: 40, height: 4, backgroundColor: colors.border, borderRadius: radii.full, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.disabledBg, alignItems: 'center', justifyContent: 'center' },
  closeBtnText:    { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  headerTitle:     { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  body:            { flex: 1, position: 'relative' },
  webview:         { flex: 1 },
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(240,247,238,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 2,
  },
  coverTitle:      { marginTop: 18, fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  coverSub:        { marginTop: 8, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  progressTrack:   { marginTop: 18, alignSelf: 'stretch', height: 8, borderRadius: radii.full, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: colors.primaryLight, borderRadius: radii.full },
  failBanner:      { marginBottom: 12 },
  failTitle:       { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  failBody:        { marginTop: 6, fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  footer:          { minHeight: 56, padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: 'white' },
  syncBtn:         { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  syncBtnDisabled: { backgroundColor: colors.disabledBg },
  syncBtnText:     { color: 'white', fontSize: 16, fontWeight: '700' },
  secondaryBtn:    { marginTop: 10, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center', backgroundColor: 'white' },
  secondaryBtnText:{ color: colors.primary, fontSize: 16, fontWeight: '700' },
  cancelBtn:       { borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center', backgroundColor: 'white' },
  cancelBtnText:   { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  failedFooter:    { gap: 0 },
  helperText:      { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, paddingVertical: 6 },
  statusRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  spinner:         { marginRight: 10 },
  statusText:      { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
});
