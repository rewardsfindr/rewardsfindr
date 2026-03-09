// ─────────────────────────────────────────────
// SYNC WEBVIEW MODAL
// Opens as an 85% modal sheet over the home screen.
// Loads directly to bank's offers page.
// Tracks current URL — shows Sync button only when on offers page.
// Shows Go to Offers button on all other pages.
// Detects selected card and shows it in hint + button text.
// ─────────────────────────────────────────────
import React, { useRef, useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { getAuthInstance } from '../lib/firebaseClient.js';

const BANK_CONFIG = {
  chase: {
    url: 'https://www.chase.com/personal/credit-cards/cardmember-offers',
    label: 'Chase Offers',
    color: '#1a3a6b',
    offersPath: '/cardmember-offers',
    loginPaths: ['/sign-in', '/logon', '/login', '/sso', '/auth', '/identify', '/challenge'],
    gridSelector: '[data-testid="grid-items-container"]',
  },
  amex: {
    url: 'https://www.americanexpress.com/en-us/benefits/offers/',
    label: 'Amex Offers',
    color: '#007ac1',
    offersPath: '/benefits/offers',
    loginPaths: ['/login', '/sign-in', '/identity', '/auth', '/challenge'],
    gridSelector: null, // TODO: inspect Amex DOM
  },
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

// Injected on page load — reads currently selected card from Chase dropdown
const DETECT_CARD_JS = `
  (function() {
    try {
      var sel = document.querySelector('mds-select[id="select-credit-card-account"]');
      if (sel) {
        var opt = sel.querySelector('mds-select-option[selected="true"]');
        if (opt) {
          var label = opt.getAttribute('label') || '';
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_DETECTED', cardLabel: label }));
          return;
        }
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CARD_DETECTED', cardLabel: null }));
    } catch(e) {}
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

// Captures offers grid HTML + reads selected card in one injection
const buildCaptureJs = (gridSelector) => `
  (function() {
    try {
      var html = null;
      var MAX = 200000;

      ${ gridSelector ? `
      var grid = document.querySelector('${gridSelector}');
      if (grid && grid.innerHTML.length > 500) { html = grid.outerHTML; }
      ` : '' }

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

/**
 * @param {boolean}  visible  - controls modal visibility
 * @param {'chase'|'amex'} bank - which bank to open
 * @param {function} onClose  - called when user dismisses
 * @param {function} onSuccess(syncedCount, cardName) - called after successful sync
 */
export default function SyncWebView({ visible, bank, onClose, onSuccess }) {
  const webViewRef = useRef(null);
  const [syncing, setSyncing]       = useState(false);
  const [currentCard, setCurrentCard] = useState(null);  // e.g. "Sapphire Reserve (...0483)"
  const [currentUrl, setCurrentUrl]   = useState('');    // tracks live WebView URL
  const config = BANK_CONFIG[bank] || BANK_CONFIG.chase;

  // Reset state when modal closes so next open starts fresh
  useEffect(() => {
    if (!visible) {
      setCurrentCard(null);
      setCurrentUrl('');
      setSyncing(false);
    }
  }, [visible]);

  const isOnOffersPage = currentUrl.toLowerCase().includes(config.offersPath);

  const handleNavigationStateChange = (navState) => {
    if (!navState.url) return;
    setCurrentUrl(navState.url);
  };

  // Detect selected card each time a page finishes loading
  const handleLoadEnd = () => {
    webViewRef.current?.injectJavaScript(DETECT_CARD_JS);
  };

  const handleGoToOffers = () => {
    webViewRef.current?.injectJavaScript(
      `window.location.replace('${config.url}'); true;`
    );
  };

  const handleSyncPress = () => {
    webViewRef.current?.injectJavaScript(buildCaptureJs(config.gridSelector));
  };

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'CARD_DETECTED') {
        setCurrentCard(data.cardLabel || null);
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

      onSuccess(result.synced ?? 0, fullCardName);
    } catch (err) {
      Alert.alert('Sync Failed', err.message);
    } finally {
      setSyncing(false);
    }
  };

  // Button label: "Sync Sapphire Reserve" or "Sync Offers" as fallback
  const { cardName } = parseCardLabel(currentCard);
  const syncBtnLabel = cardName ? `Sync ${cardName}` : 'Sync Offers';

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
            {isOnOffersPage ? (
              // On offers page: show detected card + sync button
              <>
                <Text style={s.hint} numberOfLines={1}>
                  {currentCard ? `💳 ${currentCard}` : 'Select a card above, then tap Sync.'}
                </Text>
                <TouchableOpacity
                  style={[s.syncBtn, syncing && s.syncBtnDisabled]}
                  onPress={handleSyncPress}
                  disabled={syncing}
                >
                  {syncing
                    ? <ActivityIndicator color="white" size="small" />
                    : <Text style={s.syncBtnText}>{syncBtnLabel}</Text>}
                </TouchableOpacity>
              </>
            ) : (
              // Not on offers page: prompt user to navigate there
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
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
