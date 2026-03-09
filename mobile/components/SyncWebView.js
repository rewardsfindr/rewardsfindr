// ─────────────────────────────────────────────
// SYNC WEBVIEW MODAL
// Opens as an 85% modal sheet over the home screen.
// Loads directly to bank's offers page.
// After login, auto-redirects back to offers page.
// Tapping "Sync Offers" targets just the offers grid
// container to send a small payload (~20KB) instead
// of the full page. POSTs to /api/offers/parse.
// ─────────────────────────────────────────────
import React, { useRef, useState } from 'react';
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
    // Selector for the offers grid — skip nav, banner, carousel
    gridSelector: '[data-testid="grid-items-container"]',
  },
  amex: {
    url: 'https://www.americanexpress.com/en-us/benefits/offers/',
    label: 'Amex Offers',
    color: '#007ac1',
    offersPath: '/benefits/offers',
    loginPaths: ['/login', '/sign-in', '/identity', '/auth', '/challenge'],
    gridSelector: null, // TODO: inspect Amex DOM and set real selector
  },
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

// Injected when user taps "Sync Offers".
// 1. Try bank-specific grid selector first (smallest payload, ~20KB)
// 2. Fall back to common offer container selectors
// 3. Last resort: truncated outerHTML at 200KB
const buildCaptureJs = (gridSelector) => `
  (function() {
    try {
      var html = null;
      var MAX = 200000;

      // Priority 1: bank-specific grid container
      ${gridSelector ? `
      var grid = document.querySelector('${gridSelector}');
      if (grid && grid.innerHTML.length > 500) {
        html = grid.outerHTML;
      }
      ` : ''}

      // Priority 2: generic offer container selectors
      if (!html) {
        var selectors = [
          '[data-testid*="offer"]',
          '[class*="offers"]',
          '[id*="offers"]',
          'main',
          '[role="main"]',
        ];
        for (var i = 0; i < selectors.length; i++) {
          var el = document.querySelector(selectors[i]);
          if (el && el.innerHTML.length > 500) { html = el.outerHTML; break; }
        }
      }

      // Priority 3: full page truncated
      if (!html) html = document.documentElement.outerHTML;
      if (html.length > MAX) html = html.substring(0, MAX);

      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAPTURE_HTML', html: html }));
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
 * @param {function} onSuccess(syncedCount) - called after successful sync
 */
export default function SyncWebView({ visible, bank, onClose, onSuccess }) {
  const webViewRef = useRef(null);
  const [syncing, setSyncing] = useState(false);
  const config = BANK_CONFIG[bank] || BANK_CONFIG.chase;

  // After login, bank redirects to dashboard — send back to offers page
  const handleNavigationStateChange = (navState) => {
    if (!navState.url || navState.loading) return;
    const url = navState.url.toLowerCase();
    const isOnOffersPage = url.includes(config.offersPath);
    const isOnLoginPage = config.loginPaths.some(p => url.includes(p));
    if (!isOnOffersPage && !isOnLoginPage) {
      webViewRef.current?.injectJavaScript(
        `window.location.replace('${config.url}'); true;`
      );
    }
  };

  const handleSyncPress = () => {
    const captureJs = buildCaptureJs(config.gridSelector);
    webViewRef.current?.injectJavaScript(captureJs);
  };

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'ERROR') {
        Alert.alert('Capture Error', data.message);
        return;
      }
      if (data.type !== 'CAPTURE_HTML') return;

      setSyncing(true);

      const user = getAuthInstance().currentUser;
      if (!user) throw new Error('You must be signed in to sync offers.');

      const token = await user.getIdToken();

      const response = await fetch(`${API_BASE_URL}/api/offers/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ html: data.html, bank }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync failed');

      onSuccess(result.synced ?? 0);
    } catch (err) {
      Alert.alert('Sync Failed', err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <SafeAreaView style={s.sheet}>
          {/* Drag handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={12}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>{config.label}</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* WebView — loads directly to offers page */}
          <WebView
            ref={webViewRef}
            source={{ uri: config.url }}
            onMessage={handleMessage}
            onNavigationStateChange={handleNavigationStateChange}
            style={s.webview}
            incognito={false}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
          />

          {/* Footer */}
          <View style={s.footer}>
            <Text style={s.hint}>
              Log in above — you'll be taken straight to your offers.
            </Text>
            <TouchableOpacity
              style={[s.syncBtn, syncing && s.syncBtnDisabled]}
              onPress={handleSyncPress}
              disabled={syncing}
            >
              {syncing
                ? <ActivityIndicator color="white" size="small" />
                : <Text style={s.syncBtnText}>Sync Offers</Text>}
            </TouchableOpacity>
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
    width: 40,
    height: 4,
    backgroundColor: '#d1d5db',
    borderRadius: 99,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: '#374151', fontWeight: '600' },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  webview:      { flex: 1 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: 'white',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 10,
  },
  syncBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
