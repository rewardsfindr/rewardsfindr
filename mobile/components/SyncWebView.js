// ─────────────────────────────────────────────
// SYNC WEBVIEW MODAL
// Opens as an 87% modal sheet over the home screen.
// Loads directly to bank's offers page.
// Tracks current URL — shows Sync button only when on offers page.
// Shows Go to Offers button on all other pages.
// Multi-card: reads all cards from Chase dropdown, cycles through each.
// After all cards synced, shows "Done" button to close modal.
// ─────────────────────────────────────────────
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { getAuthInstance } from '../lib/firebaseClient.js';

const BANK_CONFIG = {
  chase: {
    url: 'https://www.chase.com',
    offersUrl: 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub',
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

// Reads ALL card options from Chase dropdown + currently selected card
const DETECT_CARDS_JS = `
  (function() {
    try {
      var sel = document.querySelector('mds-select[id="select-credit-card-account"]');
      if (sel) {
        var opts = sel.querySelectorAll('mds-select-option');
        var cards = [];
        opts.forEach(function(opt, i) {
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
      // No dropdown — single card account
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CARDS_DETECTED',
        cards: [],
        selectedLabel: null,
      }));
    } catch(e) {}
  })();
  true;
`;

// Switch Chase dropdown to card at given index, then wait for grid to reload
const buildSwitchCardJs = (index) => `
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
      // Click the option to select it
      target.click();
      // Also dispatch change event on the select element
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      // Wait for grid to re-render then confirm switch
      setTimeout(function() {
        var updated = sel.querySelector('mds-select-option[selected="true"]');
        var label = updated ? (updated.getAttribute('label') || '') : '';
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCHED', cardLabel: label, index: ${index} }));
      }, 2000);
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_SWITCH_ERROR', message: e.message }));
    }
  })();
  true;
`;

// Captures offers grid HTML + currently selected card label
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
        var selectors = [
          '[data-testid*="offer"]', '[class*="offers"]', '[id*="offers"]',
          'main', '[role="main"]',
        ];
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

// "Sapphire Reserve (...0483)" → { cardName: "Sapphire Reserve", cardLast4: "0483" }
const parseCardLabel = (label) => {
  if (!label) return { cardName: null, cardLast4: null };
  const match = label.match(/^(.+?)\s*\(\.\.\.([\w\d]+)\)\s*$/);
  if (match) return { cardName: match[1].trim(), cardLast4: match[2] };
  return { cardName: label.trim(), cardLast4: null };
};

/**
 * @param {boolean}  visible  - controls modal visibility
 * @param {'chase'|'amex'} bank - which bank to open
 * @param {function} onClose  - called when user dismisses
 * @param {function} onSuccess(totalSynced, cardResults) - called after ALL cards synced
 */
export default function SyncWebView({ visible, bank, onClose, onSuccess }) {
  const webViewRef = useRef(null);
  const [syncing, setSyncing]           = useState(false);
  const [switching, setSwitching]       = useState(false);
  const [currentCard, setCurrentCard]   = useState(null);
  const [currentUrl, setCurrentUrl]     = useState('');
  // Multi-card state
  const [cardOptions, setCardOptions]   = useState([]); // [{ label, value, index }]
  const [cardIndex, setCardIndex]       = useState(0);  // which card we're syncing now
  const [syncedCards, setSyncedCards]   = useState([]); // [{ cardName, count }]
  const [allDone, setAllDone]           = useState(false);

  const config = BANK_CONFIG[bank] || BANK_CONFIG.chase;

  useEffect(() => {
    if (!visible) {
      setCurrentCard(null);
      setCurrentUrl('');
      setSyncing(false);
      setSwitching(false);
      setCardOptions([]);
      setCardIndex(0);
      setSyncedCards([]);
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
    // Use DETECT_CARDS_JS for Chase (reads full dropdown), simple detect for others
    if (bank === 'chase') {
      webViewRef.current?.injectJavaScript(DETECT_CARDS_JS);
    }
  };

  const handleGoToOffers = () => {
    const target = config.offersUrl || config.url;
    webViewRef.current?.injectJavaScript(
      `window.location.replace('${target}'); true;`
    );
  };

  const handleSyncPress = () => {
    webViewRef.current?.injectJavaScript(buildCaptureJs(config.gridSelector));
  };

  const advanceToNextCard = useCallback((nextIndex, updatedSyncedCards) => {
    if (nextIndex >= cardOptions.length) {
      // All cards done
      const total = updatedSyncedCards.reduce((sum, c) => sum + c.count, 0);
      setAllDone(true);
      onSuccess(total, updatedSyncedCards);
      return;
    }
    setSwitching(true);
    setCardIndex(nextIndex);
    webViewRef.current?.injectJavaScript(buildSwitchCardJs(nextIndex));
  }, [cardOptions, onSuccess]);

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'CARDS_DETECTED') {
        if (data.cards && data.cards.length > 0) {
          setCardOptions(data.cards);
          setCardIndex(0);
        }
        setCurrentCard(data.selectedLabel || null);
        return;
      }

      if (data.type === 'CARD_SWITCHED') {
        setSwitching(false);
        setCurrentCard(data.cardLabel || null);
        // Re-detect all cards to get fresh selected state
        webViewRef.current?.injectJavaScript(DETECT_CARDS_JS);
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ html: data.html, bank, cardName: fullCardName }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync failed');

      const syncedCount = result.synced ?? 0;
      const updatedSyncedCards = [
        ...syncedCards,
        { cardName: fullCardName || 'Unknown Card', count: syncedCount },
      ];
      setSyncedCards(updatedSyncedCards);

      const nextIndex = cardIndex + 1;

      if (cardOptions.length > 1 && nextIndex < cardOptions.length) {
        // More cards to go — advance
        setSyncing(false);
        advanceToNextCard(nextIndex, updatedSyncedCards);
      } else {
        // Single card or last card
        setSyncing(false);
        const total = updatedSyncedCards.reduce((sum, c) => sum + c.count, 0);
        setAllDone(true);
        onSuccess(total, updatedSyncedCards);
      }
    } catch (err) {
      setSyncing(false);
      setSwitching(false);
      Alert.alert('Sync Failed', err.message);
    }
  };

  const { cardName } = parseCardLabel(currentCard);

  // Footer button logic
  const totalCards = cardOptions.length || 1;
  const progressLabel = cardOptions.length > 1
    ? ` (${cardIndex + 1} of ${totalCards})`
    : '';
  const syncBtnLabel = cardName
    ? `Sync ${cardName}${progressLabel}`
    : `Sync Offers${progressLabel}`;

  const isBusy = syncing || switching;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
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
                  ✅ All {syncedCards.length} card{syncedCards.length !== 1 ? 's' : ''} synced!{' '}
                  {syncedCards.map(c => `${c.cardName}: ${c.count} offers`).join(' · ')}
                </Text>
                <TouchableOpacity style={s.doneBtn} onPress={onClose}>
                  <Text style={s.syncBtnText}>✓ Done — Go Back to App</Text>
                </TouchableOpacity>
              </>
            ) : isOnOffersPage ? (
              <>
                <Text style={s.hint} numberOfLines={1}>
                  {switching
                    ? `⏳ Switching to card ${cardIndex + 1} of ${totalCards}...`
                    : currentCard
                      ? `💳 ${currentCard}${cardOptions.length > 1 ? ` · Card ${cardIndex + 1} of ${totalCards}` : ''}`
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
                <Text style={s.hint}>
                  Log in above, then tap the button to go to your offers.
                </Text>
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
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    height: '87%',
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#d1d5db',
    borderRadius: 99, alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText:  { fontSize: 14, color: '#374151', fontWeight: '600' },
  headerTitle:   { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  webview:       { flex: 1 },
  footer: {
    padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: 'white',
  },
  hint: {
    fontSize: 12, color: '#6b7280', textAlign: 'center', marginBottom: 10,
  },
  syncBtn: {
    backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  goToOffersBtn: {
    backgroundColor: '#059669', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  doneBtn: {
    backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
