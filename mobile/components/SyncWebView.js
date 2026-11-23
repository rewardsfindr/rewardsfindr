// ─────────────────────────────────────────────────────────────────
// SYNC WEBVIEW MODAL — orchestrator
// Handles modal UI, state, and message routing.
//
// Slice 0+1: shared syncMode machine + Chase auto-start when
// cards + capture hook are ready. Cover during capturing; re-show
// WebView on auth / needsInput; Sync Offers remains for non-Chase
// and as Chase failure fallback.
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
  buildChaseOfferCaptureJs,
  buildChaseHookReadyProbeJs,
  buildChasePauseCaptureJs,
  nextChaseCardPosition,
  mergeDetectedCards,
} from './sync/chaseSync.js';
import {
  AMEX_OPEN_AND_DETECT_JS,
  buildAmexSwitchCardJs,
  buildAmexJsonCaptureJs,
  buildAmexClearFiltersJs,
  amexHandleLoadEnd,
} from './sync/amexSync.js';
import { buildWellsFargoDealsVisibleJs, buildWellsFargoOfferCaptureJs, buildWellsFargoReadJs } from './sync/wellsFargoSync.js';
import { buildCitiOfferCaptureJs, buildCitiOffersVisibleJs, buildCitiReadJs } from './sync/citiSync.js';
import { buildUsBankOfferCaptureJs, buildUsBankOffersVisibleJs, buildUsBankReadJs } from './sync/usBankSync.js';
import { parseCardLabel }                                 from './sync/cardLabel.js';
import {
  SYNC_MODES,
  STEP_TIMEOUT_MS,
  AUTO_START_DEBOUNCE_MS,
  CHASE_OFFER_HOOK_VERSION,
  shouldAutoStartChase,
  nextSyncMode,
  isPartialAbort,
  partialAbortCopy,
} from './sync/syncMode.js';
import BankLogoIcon from './BankLogoIcon.js';

function citiCardLabelFromOffers(payload) {
  const raw = String(payload?.selectedCard?.displayProductName || '').trim();
  if (!raw) return 'Citi Card';
  const dashed = raw.match(/^(.*?)(?:\s*[-–—]\s*)(\d{4})\s*$/);
  if (dashed) return `${dashed[1].trim()} (...${dashed[2]})`;
  return raw;
}

const SWITCH_TIMEOUT_MS    = 3500;
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

  const [syncMode, setSyncMode]             = useState(SYNC_MODES.AUTH);
  const [syncing, setSyncing]               = useState(false);
  const [switching, setSwitching]           = useState(false);
  const [syncStarted, setSyncStarted]       = useState(false);
  const [pageLoaded, setPageLoaded]         = useState(false);
  const [onOffersPage, setOnOffersPage]     = useState(false);
  const [onLoginPage, setOnLoginPage]       = useState(false);
  const [amexCardsReady, setAmexCardsReady] = useState(false);
  const [chaseHookReady, setChaseHookReady] = useState(false);
  const [currentCard, setCurrentCard]       = useState(null);
  const [currentUrl, setCurrentUrl]         = useState('');
  const [cardCount, setCardCount]           = useState(0);
  const [cardIndexUi, setCardIndexUi]       = useState(0);
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
    if (bank !== 'chase') return;
    stepTimerRef.current = setTimeout(() => {
      if (syncModeRef.current !== SYNC_MODES.CAPTURING) return;
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

  const failChaseCapture = (message) => {
    if (bank !== 'chase') return;
    disarmChaseWalk();
    setFailMessage(message || 'Auto-sync stopped. Try again, or sync manually from the offers page.');
    setMode(SYNC_MODES.FAILED);
  };

  const pauseForNeedsInput = () => {
    if (bank !== 'chase') return;
    if (syncModeRef.current !== SYNC_MODES.CAPTURING) return;
    clearStepTimer();
    clearPostSwitchTimeout();
    captureArmed.current = false;
    syncStartedRef.current = false;
    startingChaseRef.current = false;
    setSyncStarted(false);
    setSyncing(false);
    setSwitching(false);
    webViewRef.current?.injectJavaScript(buildChasePauseCaptureJs());
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
      captureArmed.current        = false;
      syncStartedRef.current      = false;
      syncPhaseRef.current        = 'eligible';
      pendingCardLabelRef.current = null;
      autoStartConsumedRef.current = false;
      startingChaseRef.current    = false;
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
      setAmexCardsReady(false);
      setChaseHookReady(false);
      setCardCount(0);
      setCardIndexUi(0);
      setSyncPhaseUi('eligible');
      setFailMessage('');
    }
  }, [visible]);

  // Chase: login mid-capture → NeedsInput (MFA pre-empts step timer).
  useEffect(() => {
    if (!visible || bank !== 'chase') return;
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

    // Arm BOTH the RN ref AND the window flag BEFORE injecting switch JS.
    // Amex fires ReadOffersHubPresentation (REPLACE) immediately when the card
    // switches — well before the CARD_SWITCHED message comes back.
    captureArmed.current = true;
    webViewRef.current?.injectJavaScript(`clearTimeout(window.__amexQuietTimer); window.__amexBest = null; window.__amexJsonCaptureArmed = true; true;`);
    webViewRef.current?.injectJavaScript(buildAmexClearFiltersJs());
    webViewRef.current?.injectJavaScript(buildAmexSwitchCardJs(next.testId, SWITCH_TIMEOUT_MS));
    return true;
  };

  const clearAmexWait = () => {
    if (amexWaitRef.current) clearTimeout(amexWaitRef.current);
    amexWaitRef.current = null;
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
      webViewRef.current?.injectJavaScript(`window.location.replace(${JSON.stringify(config.enrolledUrl)}); true;`);
      return;
    }
    const total = syncedCardsRef.current.reduce((sum, card) => sum + card.count, 0);
    setMode(SYNC_MODES.DONE);
    onSuccess(total, syncedCardsRef.current);
    onClose();
  };

  const handleNavigationStateChange = (navState) => {
    if (!navState.url) return;
    setCurrentUrl(navState.url);
    if (config.useAmexCardSwitcher) return;
    const url      = navState.url.toLowerCase();
    const onLogin  = (config.loginPaths  || []).some(p => url.includes(p.toLowerCase()));
    const onOffers = !onLogin && (config.offersPaths || []).some(p => url.includes(p.toLowerCase()));
    if (bank === 'chase') {
      webViewRef.current?.injectJavaScript(buildPageStateJs(config.loginPaths, config.offersPaths));
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
      const { onOffersPage: onOffers } = amexHandleLoadEnd({
        url,
        config,
        syncPhase:        syncPhaseRef.current,
        cardsDiscovered:  cardsDiscovered.current,
        injectJavaScript: (js) => webViewRef.current?.injectJavaScript(js),
      });
      setOnOffersPage(onOffers);
      if (onOffers) {
        offersRedirectRef.current = false;
        setAmexCardsReady(false);
        webViewRef.current?.injectJavaScript(buildAmexJsonCaptureJs());
      } else if (!(config.loginPaths || []).some(p => url.includes(p.toLowerCase()))) {
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

  /** Shared Chase start path for auto-start, Sync Offers, and Try again. */
  const startChaseCapture = () => {
    if (bank !== 'chase') return;
    if (startingChaseRef.current || syncStartedRef.current) return;
    startingChaseRef.current = true;
    autoStartConsumedRef.current = true;
    chaseRefreshRef.current = false;
    enterCapturing();
    webViewRef.current?.injectJavaScript(buildChaseOfferCaptureJs());
    webViewRef.current?.injectJavaScript(buildChaseHookReadyProbeJs());
    webViewRef.current?.injectJavaScript(buildListCardsJs());
    startingChaseRef.current = false;
  };

  /** Resume after MFA: retry current unsaved card, keep prior saves. */
  const resumeChaseCapture = () => {
    if (bank !== 'chase') return;
    if (startingChaseRef.current || syncStartedRef.current) return;
    const cards = cardOptionsRef.current;
    if (!cards.length || syncedCountRef.current >= cards.length) {
      startChaseCapture();
      return;
    }
    startingChaseRef.current = true;
    enterCapturing();
    webViewRef.current?.injectJavaScript(buildChaseOfferCaptureJs());
    const pos = cardIndexRef.current;
    if (Number.isInteger(pos) && cards[pos]) {
      switchChaseCard(pos);
    } else {
      captureArmed.current = true;
      webViewRef.current?.injectJavaScript(buildCaptureOffersJs());
    }
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

    setSyncStarted(true);
    syncStartedRef.current = true;
    setMode(SYNC_MODES.CAPTURING);

    if (bank === 'amex') {
      const cards = cardOptionsRef.current;
      if (cards.length === 0) {
        syncStartedRef.current = false;
        setSyncStarted(false);
        setMode(SYNC_MODES.AUTH);
        Alert.alert('No cards found', 'Please wait for the page to fully load.');
        return;
      }
      const activeCard = cards.find(c => c.selected) ?? cards[0];
      initialActiveRef.current = activeCard.testId;
      webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
      switchToNextAmexCard();
      return;
    }

    if (bank === 'wells_fargo') {
      setCurrentCard('Wells Fargo');
      webViewRef.current?.injectJavaScript(buildWellsFargoOfferCaptureJs());
      webViewRef.current?.injectJavaScript(buildWellsFargoReadJs());
      return;
    }

    if (bank === 'citi') {
      setCurrentCard('Citi Card');
      webViewRef.current?.injectJavaScript(buildCitiOfferCaptureJs());
      webViewRef.current?.injectJavaScript(buildCitiReadJs());
      return;
    }

    if (bank === 'us_bank') {
      setCurrentCard('US Bank');
      webViewRef.current?.injectJavaScript(buildUsBankOfferCaptureJs());
      webViewRef.current?.injectJavaScript(buildUsBankReadJs());
      return;
    }
  };

  const handleTryAgain = () => {
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
    const gate = shouldAutoStartChase({
      bank,
      syncMode,
      onOffersPage,
      onLoginPage,
      hasCards,
      hookReady: chaseHookReady,
      syncStarted: syncStartedRef.current,
      autoStartConsumed: autoStartConsumedRef.current,
      visible,
    });
    if (!gate) return;

    autoStartDebounceRef.current = setTimeout(() => {
      const stillHasCards = cardCount > 0 || cardOptionsRef.current.length > 0;
      const still = shouldAutoStartChase({
        bank,
        syncMode: syncModeRef.current,
        onOffersPage,
        onLoginPage,
        hasCards: stillHasCards,
        hookReady: chaseHookReady,
        syncStarted: syncStartedRef.current,
        autoStartConsumed: autoStartConsumedRef.current,
        visible: true,
      });
      if (!still) return;
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

  const switchChaseCard = (position) => {
    cardIndexRef.current = position;
    setCardIndexUi(position);
    setSwitching(true);
    switchRetriesRef.current = 0;
    armStepTimer();
    webViewRef.current?.injectJavaScript(buildChaseOfferCaptureJs());
    webViewRef.current?.injectJavaScript(buildSwitchCardJs(cardOptionsRef.current[position].index, 8000));
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
      advanceAmexSync(capturedTestId);
      return;
    }

    syncedCountRef.current += 1;
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
        if (!data.onOffers && !data.onLogin && !data.onOffersUrl) goToOffers();
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
        webViewRef.current?.injectJavaScript(buildCaptureOffersJs());
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
        if (!cardsDiscovered.current && hasCards && cardOptionsRef.current.length === 0) {
          cardOptionsRef.current = data.cards;
          setCardCount(data.cards.length);
          const activeIdx = data.cards.findIndex(c => c.selected);
          cardIndexRef.current = activeIdx >= 0 ? activeIdx : 0;
          setCardIndexUi(cardIndexRef.current);
        }
        if (!cardsDiscovered.current) cardsDiscovered.current = true;
        setCurrentCard(data.selectedLabel || null);
        if (hasCards) setAmexCardsReady(true);

        if (syncPhaseRef.current === 'enrolled' && syncStarted) {
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
        syncStartedRef.current = false;
        setSyncStarted(false);
        setSyncing(false);
        setSwitching(false);
        setMode(SYNC_MODES.AUTH);
        Alert.alert(
          'Could not read Wells Fargo deals',
          'Stay on the deals page and try again. Nothing was changed.'
        );
        return;
      }

      if (data.type === 'WELLS_DEALS' && bank === 'wells_fargo') {
        if (!syncStartedRef.current) return;
        await handleCaptureResult({
          payload: data.deals,
          cardLabel: 'Wells Fargo',
          phase: '',
        });
        return;
      }

      if (data.type === 'CITI_ON_OFFERS' && bank === 'citi') {
        offersRedirectRef.current = false;
        setOnLoginPage(false);
        setOnOffersPage(true);
        return;
      }

      if (data.type === 'CITI_CAPTURE_UNAVAILABLE' && bank === 'citi') {
        if (!syncStartedRef.current) return;
        syncStartedRef.current = false;
        setSyncStarted(false);
        setSyncing(false);
        setSwitching(false);
        setMode(SYNC_MODES.AUTH);
        Alert.alert(
          'Could not read Citi offers',
          'Stay on the Merchant Offers page and try again. Nothing was changed.'
        );
        return;
      }

      if (data.type === 'CITI_OFFERS' && bank === 'citi') {
        if (!syncStartedRef.current) return;
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
      } else {
        setMode(SYNC_MODES.AUTH);
        Alert.alert('Sync Failed', err.message);
      }
    }
  };

  const { cardName } = parseCardLabel(currentCard);
  const totalCards   = cardCount || cardOptionsRef.current.length || 1;
  const phaseLabel   = syncPhaseUi === 'enrolled' ? 'activated' : 'eligible';
  const progressFrac = Math.min(1, Math.max(0, (syncedCountRef.current + (syncing || switching ? 0.45 : 0)) / totalCards));
  const showCover    = syncMode === SYNC_MODES.CAPTURING;
  const chaseFailed  = bank === 'chase' && syncMode === SYNC_MODES.FAILED;
  const chaseAuth    = bank === 'chase' && syncMode === SYNC_MODES.AUTH;
  const chaseNeeds   = bank === 'chase' && syncMode === SYNC_MODES.NEEDS_INPUT;

  const statusText = switching
    ? `Switching card...`
    : syncing
      ? `Syncing ${phaseLabel} offers — ${cardName || 'card'} (${cardIndexUi + 1} of ${totalCards})...`
      : `Processing...`;

  const renderSyncButton = () => (
    <TouchableOpacity style={s.syncBtn} onPress={handleSyncPress}>
      <Text style={s.syncBtnText}>Sync Offers</Text>
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (chaseFailed) {
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

    if (showCover && bank === 'chase') {
      return (
        <TouchableOpacity style={s.cancelBtn} onPress={requestClose}>
          <Text style={s.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      );
    }

    if (chaseNeeds) {
      return (
        <Text style={s.helperText}>Confirm it is you to continue syncing</Text>
      );
    }

    if (chaseAuth) {
      return (
        <Text style={s.helperText}>
          After sign-in, sync starts automatically — no Sync Offers tap
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
  const coverIndex = Math.min(cardIndexUi + 1, totalCards);

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
                : bank === 'wells_fargo' ? buildWellsFargoOfferCaptureJs()
                : bank === 'citi' ? buildCitiOfferCaptureJs()
                : bank === 'us_bank' ? buildUsBankOfferCaptureJs()
                : undefined
              }
              onMessage={handleMessage}
              onNavigationStateChange={handleNavigationStateChange}
              onLoadStart={() => {
                setPageLoaded(false);
                setOnOffersPage(false);
                setOnLoginPage(false);
                if (bank === 'chase') setChaseHookReady(false);
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
                <Text style={s.coverTitle}>Syncing Chase offers...</Text>
                <Text style={s.coverSub}>
                  {coverCardLabel} · card {coverIndex} of {totalCards}
                </Text>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${Math.round(progressFrac * 100)}%` }]} />
                </View>
                <Text style={s.coverHint}>WebView covered · taps blocked so card switches stay clean</Text>
              </View>
            ) : null}
          </View>
          <View style={s.footer}>
            {chaseFailed ? (
              <View style={s.failBanner}>
                <Text style={s.failTitle}>Could not finish sync</Text>
                <Text style={s.failBody}>
                  {failMessage || 'Auto-sync stopped. Try again, or sync manually from the offers page.'}
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
  coverHint:       { marginTop: 14, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
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
