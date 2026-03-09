// ─────────────────────────────────────────────
// SYNC WEBVIEW MODAL
// Multi-card flow:
//   1. On first load, detect credit cards only (options with an img child).
//      Debit/checking accounts have no card image and are skipped.
//      Multiple debit accounts are handled automatically by this filter.
//   2. User taps Sync — captures card 0.
//   3. After each sync, auto-switch to next card (3.5s timeout).
//   4. CARD_SWITCHED verifies label matches expected — retries up to 3x if not.
//   5. On confirmed switch, auto-captures next card (no tap needed).
//   6. After last card, shows Done button.
// ─────────────────────────────────────────────
import React, { useRef, useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { getAuthInstance } from '../lib/firebaseClient.js';

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
    offersUrl: null,
    label: 'Amex Offers',
    color: '#007ac1',
    offersPaths: ['/benefits/offers'],
    loginPaths: ['/login', '/sign-in', '/identity', '/auth', '/challenge'],
    gridSelector: null,
  },
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const SWITCH_TIMEOUT_MS = 3500;
const MAX_SWITCH_RETRIES = 3;

// Run ONCE on first load.
// Only includes options that have an <img> child — credit cards have card art images,
// debit/checking accounts do not. Handles 1 or many debit accounts automatically.
const DETECT_CARDS_JS = `
  (function() {
    try {
      var sel = document.querySelector('mds-select[id="select-credit-card-account"]');
      if (sel) {
        var opts = sel.querySelectorAll('mds-select-option');
        var cards = [];
        opts.forEach(function(opt, i) {
          // Skip debit/checking accounts — they have no card image
          var hasImage = opt.querySelector('img') !== null;
          if (!hasImage) return;
          var label = opt.getAttribute('label') || '';
          var value = opt.getAttribute('value') || String(i);
          cards.push({ label: label, value: value, index: i });
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

// Switch to card at DOM index, wait timeoutMs, then report selected label
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

  // Refs — always current inside async handleMessage
  const cardOptionsRef     = useRef([]);
  const cardIndexRef       = useRef(0);
  const syncedCardsRef     = useRef([]);
  const cardsDiscovered    = useRef(false);
  const switchRetriesRef   = useRef(0);

  // State — UI only
  const [syncing, setSyncing]         = useState(false);
  const [switching, setSwitching]     = useState(false);
  const [currentCard, setCurrentCard] = useState(null);
  const [currentUrl, setCurrentUrl]   = useState('');
  const [cardCount, setCardCount]     = useState(0);
  const [cardIndexUi, setCardIndexUi] = useState(0);
  const [allDone, setAllDone]         = useState(false);

  const config = BANK_CONFIG[bank] || BANK_CONFIG.chase;

  useEffect(() => {
    if (!visible) {
      cardOptionsRef.current   = [];
      cardIndexRef.current     = 0;
      syncedCardsRef.current   = [];
      cardsDiscovered.current  = false;
      switchRetriesRef.current = 0;
      setCurrentCard(null);
      setCurrentUrl('');
      setSyncing(false);
      setSwitching(false);
      setCardCount(0);
      setCardIndexUi(0);
      setAllDone(false);
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
    webViewRef.current?.injectJavaScript(buildCaptureJs(config.gridSelector));
  };

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // ── CARDS DETECTED (first load only, credit cards only) ──
      if (data.type === 'CARDS_DETECTED') {
        if (!cardsDiscovered.current && data.cards && data.cards.length > 0) {
          cardOptionsRef.current  = data.cards;
          cardsDiscovered.current = true;
          setCardCount(data.cards.length);
        }
        setCurrentCard(data.selectedLabel || null);
        return;
      }

      // ── CARD SWITCHED ──
      if (data.type === 'CARD_SWITCHED') {
        const expectedIndex = data.expectedIndex;
        const expectedLabel = cardOptionsRef.current[expectedIndex]?.label || '';
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
        // Auto-capture — no tap needed for cards 2+
        webViewRef.current?.injectJavaScript(buildCaptureJs(config.gridSelector));
        return;
      }

      if (data.type === 'CARD_SWITCH_ERROR') {
        setSwitching(false);
        Alert.alert('Card Switch Failed', data.message);
        return;
      }

      if (data.type === 'ERROR') {
        Alert.alert('Capture Error', data.message);
        return;
      }

      if (data.type !== 'CAPTURE_HTML') return;

      // ── CAPTURE HTML — send to backend ──
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

      const nextIndex  = cardIndexRef.current + 1;
      const totalCards = cardOptionsRef.current.length;

      setSyncing(false);

      if (totalCards > 1 && nextIndex < totalCards) {
        cardIndexRef.current = nextIndex;
        setCardIndexUi(nextIndex);
        setSwitching(true);
        switchRetriesRef.current = 0;
        webViewRef.current?.injectJavaScript(buildSwitchCardJs(cardOptionsRef.current[nextIndex].index, SWITCH_TIMEOUT_MS));
      } else {
        const total = syncedCardsRef.current.reduce((sum, c) => sum + c.count, 0);
        setAllDone(true);
        onSuccess(total, syncedCardsRef.current);
      }
    } catch (err) {
      setSyncing(false);
      setSwitching(false);
      Alert.alert('Sync Failed', err.message);
    }
  };

  const { cardName } = parseCardLabel(currentCard);
  const totalCards    = cardCount || 1;
  const progressLabel = cardCount > 1 ? ` (${cardIndexUi + 1} of ${totalCards})` : '';
  const syncBtnLabel  = cardName ? `Sync ${cardName}${progressLabel}` : `Sync Offers${progressLabel}`;
  const isBusy        = syncing || switching;

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
            {allDone ? (
              <>
                <Text style={s.hint}>
                  ✅ All {syncedCardsRef.current.length} card{syncedCardsRef.current.length !== 1 ? 's' : ''} synced!{'  '}
                  {syncedCardsRef.current.map(c => `${c.cardName}: ${c.count} offers`).join(' · ')}
                </Text>
                <TouchableOpacity style={s.doneBtn} onPress={onClose}>
                  <Text style={s.syncBtnText}>✓ Done — Go Back to App</Text>
                </TouchableOpacity>
              </>
            ) : isOnOffersPage ? (
              <>
                <Text style={s.hint} numberOfLines={2}>
                  {switching
                    ? `⏳ Switching to card ${cardIndexUi + 1} of ${totalCards}... (auto-syncing after)`
                    : currentCard
                      ? `💳 ${currentCard}${cardCount > 1 ? ` · Card ${cardIndexUi + 1} of ${totalCards}` : ''}`
                      : 'Select a card above, then tap Sync.'}
                </Text>
                <TouchableOpacity
                  style={[s.syncBtn, isBusy && s.syncBtnDisabled]}
                  onPress={handleSyncPress}
                  disabled={isBusy}
                >
                  {isBusy
                    ? <ActivityIndicator color="white" size="small" />
                    : <Text style={s.syncBtnText}>{syncBtnLabel}</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.hint}>Log in above, then tap the button to go to your offers.</Text>
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
  overlay:         { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:           { height: '87%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  handle:          { width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 99, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  closeBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  closeBtnText:    { fontSize: 14, color: '#374151', fontWeight: '600' },
  headerTitle:     { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  webview:         { flex: 1 },
  footer:          { padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: 'white' },
  hint:            { fontSize: 12, color: '#6b7280', textAlign: 'center', marginBottom: 10 },
  syncBtn:         { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  goToOffersBtn:   { backgroundColor: '#059669', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  doneBtn:         { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText:     { color: 'white', fontSize: 16, fontWeight: '700' },
});
