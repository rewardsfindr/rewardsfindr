// ─────────────────────────────────────────────────────────────────
// SYNC WEBVIEW MODAL — orchestrator
// Handles modal UI, state, and message routing.
// Bank-specific JS injection is in sync/ modules.
//
// Footer states:
//   0. Not ready                        → nothing
//   1. On offers page + page loaded     → "Sync Offers" button (enabled)
//   2. Page loaded, not on offers page  → "Go to Offers Page"
//   3. Sync in progress                 → spinner + status
//
// onOffersPage + pageLoaded source of truth per bank:
//   Chase → CARDS_DETECTED message (SPA)
//   Amex  → handleLoadEnd ONLY via amexHandleLoadEnd()
//           navState must NOT reset pageLoaded for Amex — navState fires
//           after loadEnd and would wipe the flag before render
//   Other → handleNavigationStateChange URL check
//
// Amex two-phase sync:
//   Phase 1 (eligible) — user taps "Sync Offers"
//     → injects JSON interceptor, waits for CAPTURE_JSON
//   Phase 2 (enrolled) — auto after all eligible cards done
//     → same JSON interceptor pattern
//
// Amex capture strategy:
//   Instead of capturing DOM HTML, we inject buildAmexJsonCaptureJs()
//   which intercepts the ReadOffersHubPresentation XHR/fetch response.
//   This gives us clean structured JSON instead of raw HTML.
//   CAPTURE_JSON message is handled here; CAPTURE_HTML is Chase-only.
//
// Amex card switching strategy:
//   After capturing card N, we reload the page fresh, THEN switch to card N+1.
//   switchPendingRef holds the next card to switch to after reload.
//   On loadEnd with switchPendingRef set: switch card, JSON interceptor
//   will fire automatically when the card switch triggers a new API call.
//
// Chase is completely unchanged — still uses buildCaptureJs + CAPTURE_HTML.
//
// Adding a new bank:
//   1. Add entry to sync/bankConfig.js
//   2. Create sync/<bank>Sync.js with detect + switch JS
//   3. Wire up in handleLoadEnd + handleMessage below
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
import { DETECT_CARDS_JS, buildSwitchCardJs }             from './sync/chaseSync.js';
import {
  AMEX_OPEN_AND_DETECT_JS,
  buildAmexSwitchCardJs,
  buildAmexJsonCaptureJs,
  amexHandleLoadEnd,
} from './sync/amexSync.js';
import { buildCaptureJs, parseCardLabel }                 from './sync/captureJs.js';

const API_BASE_URL         = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const SWITCH_TIMEOUT_MS    = 3500;
const POST_SWITCH_DELAY_MS = 2500;
const MAX_SWITCH_RETRIES   = 3;

export default function SyncWebView({ visible, bank, onClose, onSuccess }) {
  const webViewRef = useRef(null);

  // ── Sync state refs (not UI) ──────────────────────────────────
  const cardOptionsRef      = useRef([]);
  const cardIndexRef        = useRef(0);
  const syncedCardsRef      = useRef([]);
  const cardsDiscovered     = useRef(false);
  const switchRetriesRef    = useRef(0);
  const syncedCountRef      = useRef(0);
  const captureArmed        = useRef(false);
  const syncPhaseRef        = useRef('eligible');
  const switchPendingRef    = useRef(null);
  const pendingCardLabelRef = useRef(null);

  // ── UI state ──────────────────────────────────────────────────
  const [syncing, setSyncing]           = useState(false);
  const [switching, setSwitching]       = useState(false);
  const [syncStarted, setSyncStarted]   = useState(false);
  const [pageLoaded, setPageLoaded]     = useState(false);
  const [onOffersPage, setOnOffersPage] = useState(false);
  const [currentCard, setCurrentCard]   = useState(null);
  const [currentUrl, setCurrentUrl]     = useState('');
  const [cardCount, setCardCount]       = useState(0);
  const [cardIndexUi, setCardIndexUi]   = useState(0);
  const [syncPhaseUi, setSyncPhaseUi]   = useState('eligible');

  const config = BANK_CONFIG[bank] || BANK_CONFIG.chase;

  // ── Reset on close ────────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      cardOptionsRef.current      = [];
      cardIndexRef.current        = 0;
      syncedCardsRef.current      = [];
      cardsDiscovered.current     = false;
      switchRetriesRef.current    = 0;
      syncedCountRef.current      = 0;
      captureArmed.current        = false;
      syncPhaseRef.current        = 'eligible';
      switchPendingRef.current    = null;
      pendingCardLabelRef.current = null;
      setCurrentCard(null);
      setCurrentUrl('');
      setSyncing(false);
      setSwitching(false);
      setSyncStarted(false);
      setPageLoaded(false);
      setOnOffersPage(false);
      setCardCount(0);
      setCardIndexUi(0);
      setSyncPhaseUi('eligible');
    }
  }, [visible]);

  // ── Helpers ───────────────────────────────────────────────────
  const resetForPhase = (phase) => {
    console.log(`[SyncWebView:amex] resetForPhase phase=${phase}`);
    cardIndexRef.current        = 0;
    syncedCountRef.current      = 0;
    cardsDiscovered.current     = false;
    switchRetriesRef.current    = 0;
    captureArmed.current        = false;
    switchPendingRef.current    = null;
    pendingCardLabelRef.current = null;
    syncPhaseRef.current        = phase;
    setSyncPhaseUi(phase);
    setCardIndexUi(0);
    setSwitching(false);
    setSyncing(false);
  };

  // ── Navigation handlers ───────────────────────────────────────

  const handleNavigationStateChange = (navState) => {
    if (!navState.url) return;
    console.log(`[SyncWebView:${bank}] navState url:`, navState.url);
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
    console.log(`[SyncWebView:${bank}] loadEnd url:`, url);
    setPageLoaded(true);

    if (bank === 'chase') {
      webViewRef.current?.injectJavaScript(DETECT_CARDS_JS);
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
        console.log(`[SyncWebView:amex] arming JSON interceptor on loadEnd (phase=${syncPhaseRef.current})`);
        webViewRef.current?.injectJavaScript(buildAmexJsonCaptureJs());
      }

      if (onOffers && switchPendingRef.current) {
        const pending = switchPendingRef.current;
        switchPendingRef.current = null;
        console.log(`[SyncWebView:amex] page reloaded — switching to testId=${pending.testId} (cardIndex=${pending.cardIndex})`);
        webViewRef.current?.injectJavaScript(buildAmexSwitchCardJs(pending.testId, SWITCH_TIMEOUT_MS));
      }
      return;
    }
  };

  const handleGoToOffers = () => {
    const target = config.offersUrl || config.url;
    console.log(`[SyncWebView:${bank}] navigating to offersUrl:`, target);
    webViewRef.current?.injectJavaScript(`window.location.replace('${target}'); true;`);
  };

  // ── Sync press — bank-specific capture trigger ─────────────────
  const handleSyncPress = () => {
    console.log(`[SyncWebView:${bank}] Sync pressed — phase=${syncPhaseRef.current} captureArmed=${captureArmed.current}`);
    setSyncStarted(true);
    captureArmed.current = true;

    if (bank === 'amex') {
      console.log('[SyncWebView:amex] re-injecting JSON interceptor on sync press');
      webViewRef.current?.injectJavaScript(buildAmexJsonCaptureJs());
      return;
    }

    // Chase (and future HTML banks)
    webViewRef.current?.injectJavaScript(buildCaptureJs(config.gridSelector, config.captureMaxBytes));
  };

  const transitionToEnrolled = () => {
    console.log('[SyncWebView:amex] transitioning to enrolled phase');
    resetForPhase('enrolled');
    webViewRef.current?.injectJavaScript(`window.location.replace('${config.enrolledUrl}'); true;`);
  };

  // ── Shared post-capture logic ─────────────────────────────────
  const handleCaptureResult = async ({ payload, cardLabel, phase }) => {
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

    console.log(`[SyncWebView:${bank}] handleCaptureResult — phase=${phase} cardName=${fullCardName} payloadType=${isAmex ? 'json' : 'html'} payloadSize=${isAmex ? JSON.stringify(payload).length : payload?.length}`);
    console.log(`[SyncWebView:${bank}] POSTing to ${API_BASE_URL}/api/offers/parse`);

    const response = await fetch(`${API_BASE_URL}/api/offers/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(bodyObj),
    });
    const result = await response.json();
    console.log(`[SyncWebView:${bank}] API /parse response:`, JSON.stringify(result));
    if (!response.ok) throw new Error(result.error || 'Sync failed');

    syncedCardsRef.current = [
      ...syncedCardsRef.current,
      { cardName: fullCardName || 'Unknown Card', count: result.synced ?? 0, phase },
    ];
    syncedCountRef.current += 1;

    const totalCards = cardOptionsRef.current.length;
    console.log(`[SyncWebView:${bank}] syncedCount=${syncedCountRef.current} totalCards=${totalCards} phase=${phase}`);
    setSyncing(false);

    if (syncedCountRef.current < totalCards) {
      const nextPos = (cardIndexRef.current + 1) % totalCards;
      cardIndexRef.current = nextPos;
      setCardIndexUi(nextPos);
      setSwitching(true);
      switchRetriesRef.current = 0;
      cardsDiscovered.current  = false;

      if (bank === 'amex') {
        const nextCard  = cardOptionsRef.current[nextPos];
        const reloadUrl = phase === 'enrolled' ? config.enrolledUrl : (config.offersUrl || config.url);
        console.log(`[SyncWebView:amex] reloading ${reloadUrl} — will switch to testId=${nextCard.testId} after load`);
        switchPendingRef.current = { testId: nextCard.testId, cardIndex: nextPos };
        webViewRef.current?.injectJavaScript(`window.location.replace('${reloadUrl}'); true;`);
      } else {
        webViewRef.current?.injectJavaScript(buildSwitchCardJs(cardOptionsRef.current[nextPos].index, SWITCH_TIMEOUT_MS));
      }
    } else if (bank === 'amex' && phase === 'eligible') {
      console.log('[SyncWebView:amex] all eligible cards done — transitioning to enrolled phase');
      transitionToEnrolled();
    } else {
      const total = syncedCardsRef.current.reduce((sum, c) => sum + c.count, 0);
      console.log(`[SyncWebView:${bank}] all phases done — total offers synced: ${total}`);
      onSuccess(total, syncedCardsRef.current);
      onClose();
    }
  };

  // ── Message handler ───────────────────────────────────────────
  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log(`[SyncWebView:${bank}] ✉️ message type=${data.type}`, data.error ? `error=${data.error}` : '');

      // ── Chase card detection ──────────────────────────
      if (data.type === 'CARDS_DETECTED') {
        const hasCards = data.cards?.length > 0;
        console.log(`[SyncWebView:chase] CARDS_DETECTED count=${data.cards?.length} selected=${data.selectedLabel}`);
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

      // ── Amex card detection ───────────────────────────
      if (data.type === 'AMEX_CARDS_DETECTED') {
        const hasCards = data.cards?.length > 0;
        console.log(`[SyncWebView:amex] AMEX_CARDS_DETECTED count=${data.cards?.length} phase=${syncPhaseRef.current} alreadyDiscovered=${cardsDiscovered.current}`);
        if (!cardsDiscovered.current && hasCards && syncPhaseRef.current === 'eligible' && cardOptionsRef.current.length === 0) {
          cardOptionsRef.current = data.cards;
          setCardCount(data.cards.length);
          const activeIdx = data.cards.findIndex(c => c.selected);
          cardIndexRef.current = activeIdx >= 0 ? activeIdx : 0;
          setCardIndexUi(cardIndexRef.current);
          console.log(`[SyncWebView:amex] stored ${data.cards.length} cards, activeIdx=${cardIndexRef.current}`);
        }
        if (!cardsDiscovered.current) cardsDiscovered.current = true;
        setCurrentCard(data.selectedLabel || null);

        if (syncPhaseRef.current === 'enrolled' && !captureArmed.current) {
          console.log('[SyncWebView:amex] enrolled page ready — arming captureArmed flag');
          captureArmed.current = true;
        }
        return;
      }

      // ── Card switched (Chase + Amex) ──────────────────
      if (data.type === 'CARD_SWITCHED') {
        console.log(`[SyncWebView:${bank}] CARD_SWITCHED cardLabel=${data.cardLabel} expectedTestId=${data.expectedTestId || data.expectedIndex}`);
        const switchConfirmed = bank === 'amex' ? !!data.cardLabel : (() => {
          const expectedLabel = cardOptionsRef.current.find(c => c.index === data.expectedIndex)?.label || '';
          const confirmed = expectedLabel ? data.cardLabel?.trim() === expectedLabel.trim() : !!data.cardLabel;
          console.log(`[SyncWebView:chase] switch confirm: expected="${expectedLabel}" got="${data.cardLabel}" confirmed=${confirmed}`);
          return confirmed;
        })();

        if (!switchConfirmed && switchRetriesRef.current < MAX_SWITCH_RETRIES) {
          switchRetriesRef.current += 1;
          const retryDelay = SWITCH_TIMEOUT_MS + switchRetriesRef.current * 1500;
          console.log(`[SyncWebView:${bank}] switch not confirmed, retry ${switchRetriesRef.current}/${MAX_SWITCH_RETRIES} in ${retryDelay}ms`);
          if (bank === 'amex') {
            const card = cardOptionsRef.current[cardIndexRef.current];
            webViewRef.current?.injectJavaScript(buildAmexSwitchCardJs(card.testId, retryDelay));
          } else {
            webViewRef.current?.injectJavaScript(buildSwitchCardJs(data.expectedIndex, retryDelay));
          }
          return;
        }

        switchRetriesRef.current = 0;
        setSwitching(false);
        setCurrentCard(data.cardLabel || null);

        if (bank === 'amex') {
          pendingCardLabelRef.current = data.cardLabel || null;
          console.log(`[SyncWebView:amex] switch confirmed (${data.cardLabel}) — JSON interceptor will fire on next API call`);
          return;
        }

        // Chase: capture after delay
        console.log(`[SyncWebView:chase] switch confirmed — capturing HTML in ${POST_SWITCH_DELAY_MS}ms`);
        setTimeout(() => {
          captureArmed.current = true;
          webViewRef.current?.injectJavaScript(buildCaptureJs(config.gridSelector, config.captureMaxBytes));
        }, POST_SWITCH_DELAY_MS);
        return;
      }

      if (data.type === 'CARD_SWITCH_ERROR') {
        console.log(`[SyncWebView:${bank}] CARD_SWITCH_ERROR:`, data.message);
        setSwitching(false);
        captureArmed.current = false;
        Alert.alert('Card Switch Failed', data.message);
        return;
      }

      if (data.type === 'ERROR') {
        console.log(`[SyncWebView:${bank}] ERROR from WebView:`, data.message);
        captureArmed.current = false;
        Alert.alert('Capture Error', data.message);
        return;
      }

      // ── Amex JSON capture ─────────────────────────────
      if (data.type === 'CAPTURE_JSON' && bank === 'amex') {
        console.log(`[SyncWebView:amex] CAPTURE_JSON received — captureArmed=${captureArmed.current} cardLabel=${data.cardLabel} jsonKeys=${Object.keys(data.json || {}).join(',')}`);
        if (!captureArmed.current) {
          console.log('[SyncWebView:amex] CAPTURE_JSON ignored — not armed');
          return;
        }
        captureArmed.current = false;

        const resolvedLabel = pendingCardLabelRef.current || data.cardLabel;
        pendingCardLabelRef.current = null;
        console.log(`[SyncWebView:amex] resolvedLabel=${resolvedLabel} phase=${syncPhaseRef.current}`);

        await handleCaptureResult({
          payload:   data.json,
          cardLabel: resolvedLabel,
          phase:     syncPhaseRef.current,
        });
        return;
      }

      // ── Chase HTML capture ────────────────────────────
      if (data.type !== 'CAPTURE_HTML' || !captureArmed.current) {
        console.log(`[SyncWebView:${bank}] ignoring message — type=${data.type} captureArmed=${captureArmed.current}`);
        return;
      }
      captureArmed.current = false;
      console.log(`[SyncWebView:chase] CAPTURE_HTML received — html.length=${data.html?.length} cardLabel=${data.cardLabel}`);

      const resolvedLabel = pendingCardLabelRef.current || data.cardLabel;
      pendingCardLabelRef.current = null;

      await handleCaptureResult({
        payload:   data.html,
        cardLabel: resolvedLabel,
        phase:     syncPhaseRef.current,
      });

    } catch (err) {
      captureArmed.current        = false;
      switchPendingRef.current    = null;
      pendingCardLabelRef.current = null;
      setSyncing(false);
      setSwitching(false);
      console.error(`[SyncWebView:${bank}] handleMessage UNHANDLED ERROR:`, err.message);
      Alert.alert('Sync Failed', err.message);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  const { cardName } = parseCardLabel(currentCard);
  const totalCards   = cardCount || 1;
  const phaseLabel   = syncPhaseUi === 'enrolled' ? 'activated' : 'eligible';

  const statusText = switching
    ? `⏳ Switching card — reloading...`
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
      const ready = pageLoaded;
      return (
        <TouchableOpacity
          style={[s.syncBtn, !ready && s.syncBtnDisabled]}
          onPress={ready ? handleSyncPress : undefined}
          disabled={!ready}
        >
          <Text style={s.syncBtnText}>{ready ? 'Sync Offers' : 'Loading...'}</Text>
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
