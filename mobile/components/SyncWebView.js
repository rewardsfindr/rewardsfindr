// ─────────────────────────────────────────────────────────────────
// SYNC WEBVIEW MODAL
// Footer states:
//   1. Not on offers page  → "Go to Offers Page" button (fallback only)
//   2. On offers page, idle → "Sync Offers" button
//   3. Sync in progress    → no button, status text + spinner only
//   4. All done            → auto-close, no button shown
// ─────────────────────────────────────────────────────────────────
import React, { useRef, useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { colors, radii } from '../shared/theme.js';

const CHASE_OFFERS_URL = 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub';

const BANK_CONFIG = {
  chase: {
    url: CHASE_OFFERS_URL,
    offersUrl: CHASE_OFFERS_URL,
    label: 'Chase Offers',
    color: '#1a3a6b',
    offersPaths: ['/cardmember-offers', 'merchantOffers'],
    loginPaths: ['/sign-in', '/logon', '/login', '/sso', '/auth', '/identify', '/challenge'],
    gridSelector: '[data-testid="grid-items-container"]',
  },
  amex: {
    url: 'https://www.americanexpress.com/en-us/benefits/offers/',
    label: 'Amex Offers',
    color: '#007ac1',
    offersPaths: ['/benefits/offers'],
    loginPaths: ['/login', '/sign-in', '/identity', '/auth', '/challenge'],
  },
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const SWITCH_TIMEOUT_MS    = 3500;
const POST_SWITCH_DELAY_MS = 2000;
const MAX_SWITCH_RETRIES   = 3;

const CHASE_CREDIT_CARD_KEYWORDS = [
  'sapphire', 'freedom', 'flex', 'slate', 'ink', 'visa', 'united', 'marriott',
  'hyatt', 'southwest', 'amazon', 'prime', 'disney', 'starbucks', 'ihg',
  'british', 'aeroplan', 'reserve', 'preferred', 'unlimited', 'plus',
];

const DETECT_CARDS_JS = `
  (function() {
    try {
      var KEYWORDS = ${JSON.stringify(CHASE_CREDIT_CARD_KEYWORDS)};
      var sel = document.querySelector('mds-select[id="select-credit-card-account"]');
      if (sel) {
        var opts = sel.querySelectorAll('mds-select-option');
        var cards = [];
        opts.forEach(function(opt, i) {
          var rawLabel = opt.getAttribute('label') || '';
          var lowerLabel = rawLabel.toLowerCase();
          var isCreditCard = KEYWORDS.some(function(k) { return lowerLabel.indexOf(k) !== -1; });
          if (!isCreditCard) return;
          var value = opt.getAttribute('value') || String(i);
          cards.push({ label: rawLabel, value: value, index: i });
        });
        var selectedOpt = sel.querySelector('mds-select-option[selected="true"]');
        var selectedLabel = selectedOpt ? (selectedOpt.getAttribute('label') || '') : '';
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CARDS_DETECTED',
          cards: cards,
          selectedLabel: selectedLabel,
        }));
        return;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARDS_DETECTED', cards: [], selectedLabel: null }));
    } catch(e) {}
  })();
  true;
`;

const buildSwitchCardJs = (index, timeoutMs) => `
  (function() {
    try {
      var sel = document.querySelector('mds-select[id="select-credit-card-account"]');
      if (!sel) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'Dropdown not found' }));
        return;
      }
      var opts = sel.querySelectorAll('mds-select-option');
      var target = opts[${index}];
      if (!target) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: 'Card index out of range' }));
        return;
      }
      target.click();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(function() {
        var updated = sel.querySelector('mds-select-option[selected="true"]');
        var label = updated ? (updated.getAttribute('label') || '') : '';
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CARD_SWITCHED',
          cardLabel: label,
          expectedIndex: ${index},
        }));
      }, ${timeoutMs || SWITCH_TIMEOUT_MS});
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: e.message }));
    }
  })();
  true;
`;

const buildCaptureJs = (gridSelector) => `
  (function() {
    try {
      var html = null;
      var MAX = 200000;
      ${gridSelector ? `
      var grid = document.querySelector('${gridSelector}');
      if (grid && grid.innerHTML.length > 500) { html = grid.outerHTML; }
      ` : ''}
      if (!html) {
        var selectors = ['[data-testid*="offer"]','[class*="offers"]','[id*="offers"]','main','[role="main"]'];
        for (var i = 0; i < selectors.length; i++) {
          var el = document.querySelector(selectors[i]);
          if (el && el.innerHTML.length > 500) { html = el.outerHTML; break; }
        }
      }
      if (!html) html = document.documentElement.outerHTML;
      if (html.length > MAX) html = html.substring(0, MAX);
      var cardLabel = '';
      var cardSel = document.querySelector('mds-select[id="select-credit-card-account"]');
      if (cardSel) {
        var cardOpt = cardSel.querySelector('mds-select-option[selected="true"]');
        if (cardOpt) cardLabel = cardOpt.getAttribute('label') || '';
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAPTURE_HTML', html: html, cardLabel: cardLabel }));
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: e.message }));
    }
  })();
  true;
`;

const parseCardLabel = (label) => {
  if (!label) return { cardName: null, cardLast4: null };
  const match = label.match(/^(.+?)\s*\(\.\.\.([\w\d]+)\)\s*$/);
  if (match) return { cardName: match[1].trim(), cardLast4: match[2] };
  return { cardName: label.trim(), cardLast4: null };
};

export default function SyncWebView({ visible, bank, onClose, onSuccess }) {
  const webViewRef = useRef(null);

  const cardOptionsRef     = useRef([]);
  const cardIndexRef       = useRef(0);
  const syncedCardsRef     = useRef([]);
  const cardsDiscovered    = useRef(false);
  const switchRetriesRef   = useRef(0);
  const syncedCountRef     = useRef(0);
  const captureArmed       = useRef(false);
  const autoCapturing      = useRef(false);

  const [syncing, setSyncing]         = useState(false);
  const [switching, setSwitching]     = useState(false);
  const [syncStarted, setSyncStarted] = useState(false); // true once user taps Sync
  const [currentCard, setCurrentCard] = useState(null);
  const [currentUrl, setCurrentUrl]   = useState('');
  const [cardCount, setCardCount]     = useState(0);
  const [cardIndexUi, setCardIndexUi] = useState(0);

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
      setCardCount(0);
      setCardIndexUi(0);
    }
  }, [visible]);

  const isOnOffersPage = (config.offersPaths || []).some(
    (p) => currentUrl.toLowerCase().includes(p.toLowerCase())
  );

  const handleNavigationStateChange = (navState) => {
    if (!navState.url) return;
    setCurrentUrl(navState.url);
  };

  const handleLoadEnd = () => {
    if (bank === 'chase' && !cardsDiscovered.current) {
      webViewRef.current?.injectJavaScript(DETECT_CARDS_JS);
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

      if (data.type === 'CARDS_DETECTED') {
        if (!cardsDiscovered.current && data.cards && data.cards.length > 0) {
          cardOptionsRef.current  = data.cards;
          cardsDiscovered.current = true;
          setCardCount(data.cards.length);
          const activeIdx = data.cards.findIndex(c => c.label === data.selectedLabel);
          cardIndexRef.current = activeIdx >= 0 ? activeIdx : 0;
          setCardIndexUi(cardIndexRef.current);
        }
        setCurrentCard(data.selectedLabel || null);
        return;
      }

      if (data.type === 'CARD_SWITCHED') {
        const expectedIndex = data.expectedIndex;
        const expectedLabel = cardOptionsRef.current.find(c => c.index === expectedIndex)?.label || '';
        const actualLabel   = data.cardLabel || '';
        const switchConfirmed = expectedLabel
          ? actualLabel.trim() === expectedLabel.trim()
          : !!actualLabel;

        if (!switchConfirmed && switchRetriesRef.current < MAX_SWITCH_RETRIES) {
          switchRetriesRef.current += 1;
          const retryDelay = SWITCH_TIMEOUT_MS + (switchRetriesRef.current * 1500);
          webViewRef.current?.injectJavaScript(buildSwitchCardJs(expectedIndex, retryDelay));
          return;
        }

        switchRetriesRef.current = 0;
        setSwitching(false);
        setCurrentCard(actualLabel || expectedLabel || null);
        autoCapturing.current = true;
        setTimeout(() => {
          captureArmed.current = true;
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

      if (data.type !== 'CAPTURE_HTML') return;
      if (!captureArmed.current) return;
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
        const domIndex = cardOptionsRef.current[nextPos].index;
        webViewRef.current?.injectJavaScript(buildSwitchCardJs(domIndex, SWITCH_TIMEOUT_MS));
      } else {
        // All done — auto-close
        const total = syncedCardsRef.current.reduce((sum, c) => sum + c.count, 0);
        onSuccess(total, syncedCardsRef.current);
        onClose();
      }
    } catch (err) {
      captureArmed.current = false;
      autoCapturing.current = false;
      setSyncing(false);
      setSwitching(false);
      Alert.alert('Sync Failed', err.message);
    }
  };

  const { cardName } = parseCardLabel(currentCard);
  const totalCards    = cardCount || 1;
  const isBusy        = syncing || switching || autoCapturing.current;

  // Status text shown while sync is running
  const statusText = switching
    ? `⏳ Switching to card ${cardIndexUi + 1} of ${totalCards}...`
    : syncing
      ? `🔄 Syncing ${cardName || 'card'} (${cardIndexUi + 1} of ${totalCards})...`
      : `⚡ Processing...`;

  // Label for the Sync button (before sync starts)
  const syncBtnLabel = cardName
    ? `Sync Offers`
    : `Sync Offers`;

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
            {syncStarted ? (
              // Sync in progress — no button, just status
              <View style={s.statusRow}>
                <ActivityIndicator size="small" color={colors.primary} style={s.spinner} />
                <Text style={s.statusText}>{statusText}</Text>
              </View>
            ) : isOnOffersPage ? (
              // On offers page, ready to sync
              <TouchableOpacity style={s.syncBtn} onPress={handleSyncPress}>
                <Text style={s.syncBtnText}>{syncBtnLabel}</Text>
              </TouchableOpacity>
            ) : (
              // Not on offers page — fallback
              <>
                <Text style={s.hint}>Log in above, then tap to go to your offers.</Text>
                <TouchableOpacity style={s.goToOffersBtn} onPress={handleGoToOffers}>
                  <Text style={s.syncBtnText}>Go to Offers Page →</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:        { height: '87%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  handle:       { width: 40, height: 4, backgroundColor: colors.border, borderRadius: radii.full, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.disabledBg, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  webview:      { flex: 1 },
  footer:       { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: 'white' },
  hint:         { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: 10 },
  syncBtn:      { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  goToOffersBtn:{ backgroundColor: colors.primaryLight, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  syncBtnText:  { color: 'white', fontSize: 16, fontWeight: '700' },
  statusRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  spinner:      { marginRight: 10 },
  statusText:   { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
});
