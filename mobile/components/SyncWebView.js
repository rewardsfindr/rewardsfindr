// ─────────────────────────────────────────────────────────────────
// SYNC WEBVIEW MODAL — orchestrator
// Handles modal UI, state, and message routing.
//
// Amex sync flow:
//   1. User lands on offers page → AMEX_CARDS_DETECTED fires with all cards
//   2. User taps Sync → we switch to first non-active card
//   3. Card switch triggers ReadOffersHubPresentation API → CAPTURE_JSON
//   4. POST to /api/offers/parse → write to DB
//   5. Switch to next unvisited card → repeat until all cards captured
//      (active card on sync press is captured last)
//   6. Transition to enrolled page → reuse same card list → repeat cycle
//   7. All phases done → onSuccess + onClose
//
// Chase is completely unchanged — still uses buildCaptureJs + CAPTURE_HTML.
//
// Key timing note for Amex:
//   Amex fires ReadOffersHubPresentation (REPLACE) BEFORE CARD_SWITCHED
//   comes back from the JS timeout. So we must set window.__amexJsonCaptureArmed
//   = true IMMEDIATELY in switchToNextAmexCard, not in the CARD_SWITCHED handler.
//
// Fix (chase-sync-button):
//   Chase is a SPA — the mds-select dropdown renders async after loadEnd.
//   We now inject DETECT_CARDS_JS_POLL (polls every 500ms up to 10s) instead
//   of the one-shot DETECT_CARDS_JS so the Sync button reliably appears.
// ─────────────────────────────────────────────────────────────────
import React, { useRef, useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { colors, radii } from '../shared/theme.js';

import { BANK_CONFIG }                                    from './sync/bankConfig.js';
import { DETECT_CARDS_JS_POLL, buildSwitchCardJs }        from './sync/chaseSync.js';
import {
  AMEX_OPEN_AND_DETECT_JS,
  buildAmexSwitchCardJs,
  buildAmexJsonCaptureJs,
  buildAmexClearFiltersJs,
  amexHandleLoadEnd,
} from './sync/amexSync.js';
import { buildCaptureJs, parseCardLabel }                 from './sync/captureJs.js';

const API_BASE_URL         = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
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
  const captureArmed        = useRef(false);
  const syncPhaseRef        = useRef('eligible');
  const pendingCardLabelRef = useRef(null);

  const [syncing, setSyncing]               = useState(false);
  const [switching, setSwitching]           = useState(false);
  const [syncStarted, setSyncStarted]       = useState(false);
  const [pageLoaded, setPageLoaded]         = useState(false);
  const [onOffersPage, setOnOffersPage]     = useState(false);
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
      captureArmed.current        = false;
      syncPhaseRef.current        = 'eligible';
      pendingCardLabelRef.current = null;
      setCurrentCard(null);
      setCurrentUrl('');
      setSyncing(false);
      setSwitching(false);
      setSyncStarted(false);
      setPageLoaded(false);
      setOnOffersPage(false);
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
    webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = true; true;`);
    webViewRef.current?.injectJavaScript(buildAmexClearFiltersJs());
    webViewRef.current?.injectJavaScript(buildAmexSwitchCardJs(next.testId, SWITCH_TIMEOUT_MS));
    return true;
  };

  const handleNavigationStateChange = (navState) => {
    if (!navState.url) return;
    setCurrentUrl(navState.url);
    if (config.useAmexCardSwitcher) return;
    setPageLoaded(false);
    setOnOffersPage(false);
    if (!config.useCardsDetectedAsOffersSignal) {
      const url      = navState.url.toLowerCase();
      const onLogin  = (config.loginPaths  || []).some(p => url.includes(p.toLowerCase()));
      const onOffers = !onLogin && (config.offersPaths || []).some(p => url.includes(p.toLowerCase()));
      setOnOffersPage(onOffers);
    }
  };

  const handleLoadEnd = (syntheticEvent) => {
    const url = (syntheticEvent?.nativeEvent?.url || currentUrl).toLowerCase();
    setPageLoaded(true);

    if (bank === 'chase') {
      // Use polling version — Chase SPA renders mds-select asynchronously
      // after the initial page load, so a single-shot injection misses it.
      webViewRef.current?.injectJavaScript(DETECT_CARDS_JS_POLL);
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
        setAmexCardsReady(false);
        webViewRef.current?.injectJavaScript(buildAmexJsonCaptureJs());
      }
    }
  };

  const handleGoToOffers = () => {
    const target = config.offersUrl || config.url;
    webViewRef.current?.injectJavaScript(`window.location.replace('${target}'); true;`);
  };

  const handleSyncPress = () => {
    setSyncStarted(true);

    if (bank === 'amex') {
      const cards = cardOptionsRef.current;
      if (cards.length === 0) {
        Alert.alert('No cards found', 'Please wait for the page to fully load.');
        return;
      }
      const activeCard = cards.find(c => c.selected) ?? cards[0];
      initialActiveRef.current = activeCard.testId;
      webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
      switchToNextAmexCard();
      return;
    }

    captureArmed.current = true;
    webViewRef.current?.injectJavaScript(buildCaptureJs(config.gridSelector, config.captureMaxBytes));
  };

  const handleCaptureResult = async ({ payload, cardLabel, phase, capturedTestId }) => {
    setSyncing(true);
    const user = getAuthInstance().currentUser;
    if (!user) throw new Error('You must be signed in to sync offers.');
    const token = await user.getIdToken();

    const { cardName, cardLast4 } = parseCardLabel(cardLabel);
    const fullCardName = cardName
      ? (cardLast4 ? `${cardName} (...${cardLast4})` : cardName)
      : null;

    const isAmex = bank === 'amex';
    const bodyObj = isAmex
      ? { json: payload, bank, cardName: fullCardName, phase }
      : { html: payload, bank, cardName: fullCardName, phase };

    const response = await fetch(`${API_BASE_URL}/api/offers/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(bodyObj),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Sync failed');

    syncedCardsRef.current = [
      ...syncedCardsRef.current,
      { cardName: fullCardName || 'Unknown Card', count: result.synced ?? 0, phase },
    ];
    setSyncing(false);

    if (bank === 'amex') {
      if (capturedTestId) visitedCardsRef.current.add(capturedTestId);
      const totalCards = cardOptionsRef.current.length;
      const visited    = visitedCardsRef.current.size;

      if (visited < totalCards) {
        switchToNextAmexCard();
        return;
      }

      if (phase === 'eligible') {
        visitedCardsRef.current  = new Set();
        initialActiveRef.current = null;
        syncPhaseRef.current     = 'enrolled';
        setSyncPhaseUi('enrolled');
        cardsDiscovered.current  = false;
        webViewRef.current?.injectJavaScript(`window.location.replace('${config.enrolledUrl}'); true;`);
        return;
      }

      const total = syncedCardsRef.current.reduce((sum, c) => sum + c.count, 0);
      onSuccess(total, syncedCardsRef.current);
      onClose();
      return;
    }

    syncedCountRef.current += 1;
    const totalCards = cardOptionsRef.current.length;
    if (syncedCountRef.current < totalCards) {
      const nextPos = (cardIndexRef.current + 1) % totalCards;
      cardIndexRef.current = nextPos;
      setCardIndexUi(nextPos);
      setSwitching(true);
      switchRetriesRef.current = 0;
      cardsDiscovered.current  = false;
      webViewRef.current?.injectJavaScript(buildSwitchCardJs(cardOptionsRef.current[nextPos].index, SWITCH_TIMEOUT_MS));
    } else {
      const total = syncedCardsRef.current.reduce((sum, c) => sum + c.count, 0);
      onSuccess(total, syncedCardsRef.current);
      onClose();
    }
  };

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'CARDS_DETECTED') {
        const hasCards = data.cards?.length > 0;
        if (!cardsDiscovered.current && hasCards) {
          cardOptionsRef.current  = data.cards;
          cardsDiscovered.current = true;
          setCardCount(data.cards.length);
          const activeIdx = data.cards.findIndex(c => c.label === data.selectedLabel);
          cardIndexRef.current = activeIdx >= 0 ? activeIdx : 0;
          setCardIndexUi(cardIndexRef.current);
        }
        setCurrentCard(data.selectedLabel || null);
        if (config.useCardsDetectedAsOffersSignal) setOnOffersPage(hasCards);
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
        } else {
          setTimeout(() => {
            captureArmed.current = true;
            webViewRef.current?.injectJavaScript(buildCaptureJs(config.gridSelector, config.captureMaxBytes));
          }, POST_SWITCH_DELAY_MS);
        }
        return;
      }

      if (data.type === 'CARD_SWITCH_ERROR') {
        setSwitching(false);
        captureArmed.current = false;
        webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
        Alert.alert('Card Switch Failed', data.message);
        return;
      }

      if (data.type === 'ERROR') {
        captureArmed.current = false;
        webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
        Alert.alert('Capture Error', data.message);
        return;
      }

      // ── Amex JSON capture ───────────────────────────────────────────────
      if (data.type === 'CAPTURE_JSON' && bank === 'amex') {
        if (!captureArmed.current) return;
        captureArmed.current = false;

        const cards = cardOptionsRef.current;
        const capturedCard = cards.find(c =>
          data.cardLabel && (c.label + (c.last4 ? ` (...${c.last4})` : '')) === data.cardLabel
        );
        const capturedTestId = capturedCard?.testId ?? null;

        await handleCaptureResult({
          payload:         data.json,
          cardLabel:       data.cardLabel,
          phase:           syncPhaseRef.current,
          capturedTestId,
        });
        return;
      }

      // ── Chase HTML capture ────────────────────────────────────────────────
      if (data.type !== 'CAPTURE_HTML' || !captureArmed.current) return;
      captureArmed.current = false;
      await handleCaptureResult({
        payload:   data.html,
        cardLabel: data.cardLabel,
        phase:     syncPhaseRef.current,
      });

    } catch (err) {
      captureArmed.current        = false;
      pendingCardLabelRef.current = null;
      webViewRef.current?.injectJavaScript(`window.__amexJsonCaptureArmed = false; true;`);
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

  const renderFooter = () => {
    if (syncStarted) {
      return (
        <View style={s.statusRow}>
          <ActivityIndicator size="small" color={colors.primary} style={s.spinner} />
          <Text style={s.statusText}>{statusText}</Text>
        </View>
      );
    }
    if (onOffersPage) {
      const ready = pageLoaded && (bank === 'amex' ? amexCardsReady : true);
      return (
        <TouchableOpacity
          style={[s.syncBtn, !ready && s.syncBtnDisabled]}
          onPress={ready ? handleSyncPress : undefined}
          disabled={!ready}
        >
          <Text style={s.syncBtnText}>
            {ready ? 'Sync Offers' : (bank === 'amex' && pageLoaded ? 'Detecting cards...' : 'Loading...')}
          </Text>
        </TouchableOpacity>
      );
    }
    if (!pageLoaded) return null;
    return (
      <>
        <Text style={s.hint}>Log in above, then tap to go to your offers.</Text>
        <TouchableOpacity style={s.goToOffersBtn} onPress={handleGoToOffers}>
          <Text style={s.syncBtnText}>Go to Offers Page →</Text>
        </TouchableOpacity>
      </>
    );
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
            onMessage={handleMessage}
            onNavigationStateChange={handleNavigationStateChange}
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
  hint:            { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: 10 },
  syncBtn:         { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  syncBtnDisabled: { backgroundColor: colors.disabledBg },
  goToOffersBtn:   { backgroundColor: colors.primaryLight, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  syncBtnText:     { color: 'white', fontSize: 16, fontWeight: '700' },
  statusRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  spinner:         { marginRight: 10 },
  statusText:      { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
});
