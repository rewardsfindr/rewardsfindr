// ─────────────────────────────────────────────────────────────────
// SYNC WEBVIEW MODAL — orchestrator
// Handles modal UI, state, and message routing.
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
// Chase, Amex, Wells Fargo, Citi, and Capital One each save a structured snapshot on the phone.
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
import { DETECT_CARDS_JS, buildPageStateJs, buildListCardsJs, buildSwitchCardJs, buildCaptureOffersJs, buildChaseOfferCaptureJs, nextChaseCardPosition, mergeDetectedCards } from './sync/chaseSync.js';
import {
  AMEX_OPEN_AND_DETECT_JS,
  buildAmexSwitchCardJs,
  buildAmexJsonCaptureJs,
  buildAmexClearFiltersJs,
  amexHandleLoadEnd,
} from './sync/amexSync.js';
import { buildWellsFargoDealsVisibleJs, buildWellsFargoOfferCaptureJs, buildWellsFargoReadJs } from './sync/wellsFargoSync.js';
import { buildCitiOfferCaptureJs, buildCitiOffersVisibleJs, buildCitiReadJs } from './sync/citiSync.js';
import { buildCapitalOneOfferCaptureJs, buildCapitalOneOffersVisibleJs, buildCapitalOneReadJs } from './sync/capitalOneSync.js';
import { parseCardLabel }                                 from './sync/cardLabel.js';
import {
  buildOpenWindowRedirectJs,
  shouldAllowSyncWebViewNavigation,
  buildContainOpenWindowsJs,
} from './sync/syncWebViewNavigation.js';

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

  const [syncing, setSyncing]               = useState(false);
  const [switching, setSwitching]           = useState(false);
  const [syncStarted, setSyncStarted]       = useState(false);
  const [pageLoaded, setPageLoaded]         = useState(false);
  const [onOffersPage, setOnOffersPage]     = useState(false);
  const [onLoginPage, setOnLoginPage]       = useState(false);
  const [amexCardsReady, setAmexCardsReady] = useState(false);
  const [currentCard, setCurrentCard]       = useState(null);
  const [currentUrl, setCurrentUrl]         = useState('');
  const [cardCount, setCardCount]           = useState(0);
  const [cardIndexUi, setCardIndexUi]       = useState(0);
  const [syncPhaseUi, setSyncPhaseUi]       = useState('eligible');

  const config = BANK_CONFIG[bank] || BANK_CONFIG.chase;

  useEffect(() => {
    if (!visible) {
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
      if (amexWaitRef.current) clearTimeout(amexWaitRef.current);
      amexWaitRef.current         = null;
      setCurrentCard(null);
      setCurrentUrl('');
      setSyncing(false);
      setSwitching(false);
      setSyncStarted(false);
      setPageLoaded(false);
      setOnOffersPage(false);
      setOnLoginPage(false);
      setAmexCardsReady(false);
      setCardCount(0);
      setCardIndexUi(0);
      setSyncPhaseUi('eligible');
    }
  }, [visible]);

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

  // Cap One (and similar) often open offers via window.open / target=_blank.
  // Android WebView defaults to multiple windows; without this handler the
  // new URL leaves the sheet and opens the phone browser.
  const handleOpenWindow = (event) => {
    const targetUrl = event?.nativeEvent?.targetUrl;
    const js = buildOpenWindowRedirectJs(targetUrl);
    if (!js || !webViewRef.current) return;
    webViewRef.current.injectJavaScript(js);
  };

  const handleShouldStartLoadWithRequest = (request) =>
    shouldAllowSyncWebViewNavigation(request?.url);

  const handleLoadEnd = (syntheticEvent) => {
    const url = (syntheticEvent?.nativeEvent?.url || currentUrl).toLowerCase();
    setPageLoaded(true);

    if (bank === 'chase') {
      webViewRef.current?.injectJavaScript(buildChaseOfferCaptureJs());
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

    if (bank === 'capital_one') {
      webViewRef.current?.injectJavaScript(buildCapitalOneOfferCaptureJs());
      webViewRef.current?.injectJavaScript(buildCapitalOneOffersVisibleJs());
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

  const handleSyncPress = () => {
    setSyncStarted(true);
    syncStartedRef.current = true;

    if (bank === 'amex') {
      const cards = cardOptionsRef.current;
      if (cards.length === 0) {
        syncStartedRef.current = false;
        setSyncStarted(false);
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

    if (bank === 'capital_one') {
      setCurrentCard('Capital One');
      webViewRef.current?.injectJavaScript(buildCapitalOneOfferCaptureJs());
      webViewRef.current?.injectJavaScript(buildCapitalOneReadJs());
      return;
    }

    chaseRefreshRef.current = false;
    webViewRef.current?.injectJavaScript(buildChaseOfferCaptureJs());
    webViewRef.current?.injectJavaScript(buildListCardsJs());
  };

  const switchChaseCard = (position) => {
    cardIndexRef.current = position;
    setCardIndexUi(position);
    setSwitching(true);
    switchRetriesRef.current = 0;
    webViewRef.current?.injectJavaScript(buildChaseOfferCaptureJs());
    webViewRef.current?.injectJavaScript(buildSwitchCardJs(cardOptionsRef.current[position].index, 8000));
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
    const isCapOne = bank === 'capital_one';
    if (!isAmex && !isWells && !isCiti && !isCapOne && !fullCardName) {
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
      : isCiti
      ? {
          bank: 'citi',
          cardName: fullCardName || 'Citi Card',
          cardLast4,
          phase: '',
          json: payload,
        }
      : isCapOne
      ? {
          bank: 'capital_one',
          cardName: 'Capital One',
          cardLast4: null,
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
      cardName: isWells ? 'Wells Fargo' : isCapOne ? 'Capital One' : (fullCardName || 'Unknown Card'),
      count: result.synced ?? 0,
      phase: isWells || isCiti || isCapOne ? '' : phase,
    };
    syncedCardsRef.current = replaceCardPass(syncedCardsRef.current, savedCard);
    setSyncing(false);

    if (bank === 'wells_fargo' || bank === 'citi' || bank === 'capital_one') {
      const total = syncedCardsRef.current.reduce((sum, card) => sum + card.count, 0);
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
      const total = syncedCardsRef.current.reduce((sum, c) => sum + c.count, 0);
      onSuccess(total, syncedCardsRef.current);
      onClose();
    }
  };

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'CHASE_CAPTURE_UNAVAILABLE' && bank === 'chase') {
        if (!syncStartedRef.current) return;
        const nextPos = nextChaseCardPosition(cardIndexRef.current, cardOptionsRef.current.length, syncedCountRef.current);
        if (!chaseRefreshRef.current && nextPos !== null && nextPos !== cardIndexRef.current) {
          chaseRefreshRef.current = true;
          switchChaseCard(nextPos);
          return;
        }
        syncStartedRef.current = false;
        captureArmed.current = false;
        setSyncStarted(false);
        setSyncing(false);
        setSwitching(false);
        Alert.alert(
          'Capture Error',
          data.hookError
            ? 'Chase offer response was not captured. ' + data.hookError
            : 'Chase offer response was not captured. Stay on the offers page and try again. Nothing was changed.'
        );
        return;
      }

      if (data.type === 'PAGE_STATE') {
        setOnOffersPage(!!data.onOffers);
        setOnLoginPage(!!data.onLogin && !data.onOffers);
        if (data.onOffers) offersRedirectRef.current = false;
        if (!data.onOffers && !data.onLogin && !data.onOffersUrl) goToOffers();
        return;
      }

      if (data.type === 'CARDS_LISTED') {
        if (!syncStartedRef.current) return;
        const cards = Array.isArray(data.cards) ? data.cards : [];
        if (data.error || cards.length === 0) {
          syncStartedRef.current = false;
          captureArmed.current = false;
          setSyncStarted(false);
          setSyncing(false);
          setSwitching(false);
          Alert.alert('Could not read Chase cards', data.error || 'Open the offers page and try again. Nothing was changed.');
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
          setTimeout(() => {
            captureArmed.current = true;
            webViewRef.current?.injectJavaScript(buildCaptureOffersJs());
          }, POST_SWITCH_DELAY_MS);
        }
        return;
      }

      if (data.type === 'CARD_SWITCH_ERROR') {
        syncStartedRef.current = false;
        setSyncStarted(false);
        setSwitching(false);
        captureArmed.current = false;
        webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
        Alert.alert('Card Switch Failed', data.message);
        return;
      }

      if (data.type === 'ERROR') {
        syncStartedRef.current = false;
        setSyncStarted(false);
        captureArmed.current = false;
        webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
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

      if (data.type === 'CAPONE_ON_OFFERS' && bank === 'capital_one') {
        offersRedirectRef.current = false;
        setOnLoginPage(false);
        setOnOffersPage(true);
        return;
      }

      if (data.type === 'CAPONE_CAPTURE_UNAVAILABLE' && bank === 'capital_one') {
        if (!syncStartedRef.current) return;
        syncStartedRef.current = false;
        setSyncStarted(false);
        setSyncing(false);
        setSwitching(false);
        Alert.alert(
          'Could not read Capital One offers',
          'Stay on the offers page and try again. Nothing was changed.'
        );
        return;
      }

      if (data.type === 'CAPONE_OFFERS' && bank === 'capital_one') {
        if (!syncStartedRef.current) return;
        await handleCaptureResult({
          payload: data.offers,
          cardLabel: 'Capital One',
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
        syncStartedRef.current = false;
        setSyncStarted(false);
        setSyncing(false);
        setSwitching(false);
        Alert.alert('Could not read Chase offers', 'Open the offers page and try again. Nothing was changed.');
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
      Alert.alert('Sync Failed', err.message);
    }
  };

  const { cardName } = parseCardLabel(currentCard);
  const totalCards   = cardCount || 1;
  const phaseLabel   = syncPhaseUi === 'enrolled' ? 'activated' : 'eligible';

  const statusText = switching
    ? `⏳ Switching card...`
    : syncing
      ? `🔄 Syncing ${phaseLabel} offers — ${cardName || 'card'} (${cardIndexUi + 1} of ${totalCards})...`
      : `⚡ Processing...`;

  const renderSyncButton = () => (
    <TouchableOpacity style={s.syncBtn} onPress={handleSyncPress}>
      <Text style={s.syncBtnText}>Sync Offers</Text>
    </TouchableOpacity>
  );

  const renderFooter = () => {
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

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={s.overlay}>
        <SafeAreaView style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={12}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>{config.label}</Text>
            <View style={{ width: 36 }} />
          </View>
          <WebView
            ref={webViewRef}
            source={{ uri: config.url }}
            injectedJavaScriptBeforeContentLoaded={
              // Contain window.open / target=_blank in-sheet for every bank.
              // Cap One especially opens capitaloneoffers.com as a new window.
              [
                buildContainOpenWindowsJs(),
                bank === 'chase' ? buildChaseOfferCaptureJs()
                : bank === 'wells_fargo' ? buildWellsFargoOfferCaptureJs()
                : bank === 'citi' ? buildCitiOfferCaptureJs()
                : bank === 'capital_one' ? buildCapitalOneOfferCaptureJs()
                : '',
              ].filter(Boolean).join('\n')
            }
            onMessage={handleMessage}
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            // false: Android treats window.open as same-document navigation.
            // onOpenWindow remains as a fallback if a new window is still created.
            setSupportMultipleWindows={false}
            onOpenWindow={handleOpenWindow}
            onLoadStart={() => {
              setPageLoaded(false);
              setOnOffersPage(false);
              setOnLoginPage(false);
            }}
            onLoadEnd={handleLoadEnd}
            style={s.webview}
            incognito={false}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
          />
          <View style={s.footer}>
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
  webview:         { flex: 1 },
  footer:          { minHeight: 56, padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: 'white' },
  syncBtn:         { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  syncBtnDisabled: { backgroundColor: colors.disabledBg },
  syncBtnText:     { color: 'white', fontSize: 16, fontWeight: '700' },
  statusRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  spinner:         { marginRight: 10 },
  statusText:      { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
});
