// ─────────────────────────────────────────────────────────────────
// SYNC WEBVIEW MODAL — orchestrator
// Handles modal UI, state, and message routing.
// Bank-specific JS injection is in sync/ modules.
//
// Footer states:
//   0. Not ready         → nothing
//   1. On offers page    → "Sync Offers" button
//   2. Page loaded, not on offers page → "Go to Offers Page"
//   3. Sync in progress  → spinner + status
//
// onOffersPage source of truth per bank:
//   Chase → CARDS_DETECTED message (SPA)
//   Amex  → handleLoadEnd URL check
//          navState fires AFTER loadEnd on Amex and would reset
//          onOffersPage back to false — so we skip the reset for Amex only
//   Other → handleNavigationStateChange URL check
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
import { AMEX_OPEN_AND_DETECT_JS, buildAmexSwitchCardJs } from './sync/amexSync.js';
import { buildCaptureJs, parseCardLabel }                 from './sync/captureJs.js';

const API_BASE_URL         = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const SWITCH_TIMEOUT_MS    = 3500;
const POST_SWITCH_DELAY_MS = 2500;
const MAX_SWITCH_RETRIES   = 3;

export default function SyncWebView({ visible, bank, onClose, onSuccess }) {
  const webViewRef = useRef(null);

  const cardOptionsRef   = useRef([]);
  const cardIndexRef     = useRef(0);
  const syncedCardsRef   = useRef([]);
  const cardsDiscovered  = useRef(false);
  const switchRetriesRef = useRef(0);
  const syncedCountRef   = useRef(0);
  const captureArmed     = useRef(false);
  const autoCapturing    = useRef(false);

  const [syncing, setSyncing]           = useState(false);
  const [switching, setSwitching]       = useState(false);
  const [syncStarted, setSyncStarted]   = useState(false);
  const [pageLoaded, setPageLoaded]     = useState(false);
  const [onOffersPage, setOnOffersPage] = useState(false);
  const [currentCard, setCurrentCard]   = useState(null);
  const [currentUrl, setCurrentUrl]     = useState('');
  const [cardCount, setCardCount]       = useState(0);
  const [cardIndexUi, setCardIndexUi]   = useState(0);

  const config = BANK_CONFIG[bank] || BANK_CONFIG.chase;

  useEffect(() => {
    if (!visible) {
      cardOptionsRef.current   = [];
      cardIndexRef.current     = 0;
      syncedCardsRef.current   = [];
      cardsDiscovered.current  = false;
      switchRetriesRef.current = 0;
      syncedCountRef.current   = 0;
      captureArmed.current     = false;
      autoCapturing.current    = false;
      setCurrentCard(null);
      setCurrentUrl('');
      setSyncing(false);
      setSwitching(false);
      setSyncStarted(false);
      setPageLoaded(false);
      setOnOffersPage(false);
      setCardCount(0);
      setCardIndexUi(0);
    }
  }, [visible]);

  const handleNavigationStateChange = (navState) => {
    if (!navState.url) return;
    setCurrentUrl(navState.url);
    setPageLoaded(false);

    // Amex: handleLoadEnd is the source of truth for onOffersPage.
    // navState fires AFTER loadEnd on Amex — resetting here would clobber
    // the value already set correctly by handleLoadEnd.
    if (config.useAmexCardSwitcher) return;

    // Chase: CARDS_DETECTED message is source of truth — reset is fine here
    // because CARDS_DETECTED will fire again and restore onOffersPage=true.
    // Other banks: URL-based detection handled here.
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
      webViewRef.current?.injectJavaScript(DETECT_CARDS_JS);
      return;
    }

    if (bank === 'amex') {
      const onLogin  = (config.loginPaths  || []).some(p => url.includes(p.toLowerCase()));
      const onOffers = !onLogin && (config.offersPaths || []).some(p => url.includes(p.toLowerCase()));
      setOnOffersPage(onOffers);
      if (onOffers && !cardsDiscovered.current) {
        webViewRef.current?.injectJavaScript(AMEX_OPEN_AND_DETECT_JS);
      }
    }
  };

  const handleGoToOffers = () => {
    const target = config.offersUrl || config.url;
    webViewRef.current?.injectJavaScript(`window.location.replace('${target}'); true;`);
  };

  const handleSyncPress = () => {
    setSyncStarted(true);
    captureArmed.current = true;
    webViewRef.current?.injectJavaScript(buildCaptureJs(config.gridSelector));
  };

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // ── Chase card detection ──────────────────────────────────
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

      // ── Amex card detection ───────────────────────────────────
      if (data.type === 'AMEX_CARDS_DETECTED') {
        const hasCards = data.cards?.length > 0;
        if (!cardsDiscovered.current && hasCards) {
          cardOptionsRef.current  = data.cards;
          cardsDiscovered.current = true;
          setCardCount(data.cards.length);
          const activeIdx = data.cards.findIndex(c => c.selected);
          cardIndexRef.current = activeIdx >= 0 ? activeIdx : 0;
          setCardIndexUi(cardIndexRef.current);
          setCurrentCard(data.selectedLabel || null);
        }
        return;
      }

      // ── Card switched (Chase + Amex) ──────────────────────────
      if (data.type === 'CARD_SWITCHED') {
        let switchConfirmed = false;
        if (bank === 'amex') {
          switchConfirmed = !!data.cardLabel;
        } else {
          const expectedLabel = cardOptionsRef.current.find(c => c.index === data.expectedIndex)?.label || '';
          switchConfirmed = expectedLabel
            ? data.cardLabel?.trim() === expectedLabel.trim()
            : !!data.cardLabel;
        }

        if (!switchConfirmed && switchRetriesRef.current < MAX_SWITCH_RETRIES) {
          switchRetriesRef.current += 1;
          const retryDelay = SWITCH_TIMEOUT_MS + switchRetriesRef.current * 1500;
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
        autoCapturing.current = true;
        setTimeout(() => {
          captureArmed.current  = true;
          autoCapturing.current = false;
          webViewRef.current?.injectJavaScript(buildCaptureJs(config.gridSelector));
        }, POST_SWITCH_DELAY_MS);
        return;
      }

      if (data.type === 'CARD_SWITCH_ERROR') {
        setSwitching(false);
        captureArmed.current = false;
        Alert.alert('Card Switch Failed', data.message);
        return;
      }

      if (data.type === 'ERROR') {
        captureArmed.current = false;
        Alert.alert('Capture Error', data.message);
        return;
      }

      if (data.type !== 'CAPTURE_HTML' || !captureArmed.current) return;
      captureArmed.current = false;

      setSyncing(true);
      const user = getAuthInstance().currentUser;
      if (!user) throw new Error('You must be signed in to sync offers.');
      const token = await user.getIdToken();

      const { cardName, cardLast4 } = parseCardLabel(data.cardLabel);
      const fullCardName = cardName
        ? (cardLast4 ? `${cardName} (...${cardLast4})` : cardName)
        : null;

      const response = await fetch(`${API_BASE_URL}/api/offers/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ html: data.html, bank, cardName: fullCardName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync failed');

      syncedCardsRef.current = [
        ...syncedCardsRef.current,
        { cardName: fullCardName || 'Unknown Card', count: result.synced ?? 0 },
      ];
      syncedCountRef.current += 1;

      const totalCards = cardOptionsRef.current.length;
      setSyncing(false);

      if (syncedCountRef.current < totalCards) {
        const nextPos = (cardIndexRef.current + 1) % totalCards;
        cardIndexRef.current = nextPos;
        setCardIndexUi(nextPos);
        setSwitching(true);
        switchRetriesRef.current = 0;
        if (bank === 'amex') {
          const nextCard = cardOptionsRef.current[nextPos];
          webViewRef.current?.injectJavaScript(buildAmexSwitchCardJs(nextCard.testId, SWITCH_TIMEOUT_MS));
        } else {
          webViewRef.current?.injectJavaScript(buildSwitchCardJs(cardOptionsRef.current[nextPos].index, SWITCH_TIMEOUT_MS));
        }
      } else {
        const total = syncedCardsRef.current.reduce((sum, c) => sum + c.count, 0);
        onSuccess(total, syncedCardsRef.current);
        onClose();
      }
    } catch (err) {
      captureArmed.current  = false;
      autoCapturing.current = false;
      setSyncing(false);
      setSwitching(false);
      Alert.alert('Sync Failed', err.message);
    }
  };

  const { cardName } = parseCardLabel(currentCard);
  const totalCards   = cardCount || 1;
  const statusText   = switching
    ? `⏳ Switching to card ${cardIndexUi + 1} of ${totalCards}...`
    : syncing
      ? `🔄 Syncing ${cardName || 'card'} (${cardIndexUi + 1} of ${totalCards})...`
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
      return (
        <TouchableOpacity style={s.syncBtn} onPress={handleSyncPress}>
          <Text style={s.syncBtnText}>Sync Offers</Text>
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
  overlay:       { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:         { height: '87%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  handle:        { width: 40, height: 4, backgroundColor: colors.border, borderRadius: radii.full, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.disabledBg, alignItems: 'center', justifyContent: 'center' },
  closeBtnText:  { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  headerTitle:   { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  webview:       { flex: 1 },
  footer:        { minHeight: 56, padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: 'white' },
  hint:          { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: 10 },
  syncBtn:       { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  goToOffersBtn: { backgroundColor: colors.primaryLight, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  syncBtnText:   { color: 'white', fontSize: 16, fontWeight: '700' },
  statusRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  spinner:       { marginRight: 10 },
  statusText:    { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
});
