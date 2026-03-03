// ─────────────────────────────────────────────
// SYNC WEBVIEW MODAL (Option B — bottom sheet)
// Opens as an 85% modal sheet over the home screen.
// User logs into Chase/Amex inside the WebView, then
// taps "Sync Offers" → JS captures outerHTML → POST
// to /api/offers/parse → success toast + close.
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
  },
  amex: {
    url: 'https://www.americanexpress.com/en-us/benefits/offers/',
    label: 'Amex Offers',
    color: '#007ac1',
  },
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

// Injected into the WebView when user taps "Sync Offers".
// Captures full page HTML and sends it back to React Native.
const CAPTURE_JS = `
  (function() {
    try {
      var html = document.documentElement.outerHTML;
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

  const handleSyncPress = () => {
    webViewRef.current?.injectJavaScript(CAPTURE_JS);
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

          {/* WebView */}
          <WebView
            ref={webViewRef}
            source={{ uri: config.url }}
            onMessage={handleMessage}
            style={s.webview}
            // Don't persist session between syncs
            incognito={false}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
          />

          {/* Footer */}
          <View style={s.footer}>
            <Text style={s.hint}>
              Log in above, then tap Sync when your offers are visible.
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
