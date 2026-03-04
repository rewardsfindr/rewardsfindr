// ─────────────────────────────────────────────
// LOGIN SCREEN
// Server-side OAuth flow via API backend
// This bypasses all mobile OAuth client configuration issues
// ─────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { Stack } from 'expo-router';
import { WebView } from 'react-native-webview';
import { signInWithCustomToken } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [error, setError] = useState(null);
  const webViewRef = useRef(null);

  const handleSignIn = () => {
    console.log('[LoginScreen] Opening server-side OAuth flow');
    setError(null);
    setLoading(true);
    setShowWebView(true);
  };

  const handleWebViewNavigationStateChange = async (navState) => {
    const { url } = navState;
    console.log('[LoginScreen] WebView URL:', url);

    // Check if we got redirected to success callback with token
    if (url.includes('/auth/mobile/callback')) {
      try {
        // Extract custom token from URL
        const urlObj = new URL(url);
        const customToken = urlObj.searchParams.get('token');
        
        if (customToken) {
          console.log('[LoginScreen] Got custom token, signing into Firebase');
          setShowWebView(false);
          
          const auth = getAuthInstance();
          const result = await signInWithCustomToken(auth, customToken);
          console.log('[LoginScreen] Success:', result.user.email);
          // Auth listener will redirect
        } else {
          throw new Error('No token in callback');
        }
      } catch (err) {
        console.error('[LoginScreen] Error:', err);
        setError(`Sign-in failed: ${err.message}`);
        setShowWebView(false);
        setLoading(false);
      }
    }
  };

  if (showWebView) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ headerShown: false }} />
        <WebView
          ref={webViewRef}
          source={{ uri: `${API_URL}/auth/google/mobile` }}
          onNavigationStateChange={handleWebViewNavigationStateChange}
          startInLoadEnd={() => setLoading(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.container}>

        <View style={s.iconWrap}>
          <Text style={s.icon}>💳</Text>
        </View>

        <Text style={s.title}>RewardsFindr</Text>
        <Text style={s.subtitle}>Find the best card rewards{"\n"}for any store</Text>

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>⚠️ {error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[s.googleBtn, loading && s.disabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#1f2937" />
          ) : (
            <Text style={s.googleBtnText}>🔑  Continue with Google</Text>
          )}
        </TouchableOpacity>

        <Text style={s.note}>
          Sign in with the same Google account you use in the Chrome extension
          to see your personalized card rewards.
        </Text>

      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#eef2ff' },
  container:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWrap:      { backgroundColor: '#4f46e5', borderRadius: 24, padding: 20, marginBottom: 24 },
  icon:          { fontSize: 44 },
  title:         { fontSize: 32, fontWeight: '900', color: '#4f46e5', marginBottom: 8 },
  subtitle:      { fontSize: 16, color: '#6b7280', textAlign: 'center', lineHeight: 26, marginBottom: 16 },
  errorBox:      { backgroundColor: '#fee2e2', borderRadius: 12, padding: 12,
                   marginBottom: 16, width: '100%' },
  errorText:     { color: '#b91c1c', fontSize: 14, textAlign: 'center' },
  googleBtn:     { alignItems: 'center', justifyContent: 'center', backgroundColor: 'white',
                   borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32,
                   width: '100%', marginBottom: 16,
                   shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  disabled:      { opacity: 0.5 },
  googleBtnText: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  note:          { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 22 },
});
