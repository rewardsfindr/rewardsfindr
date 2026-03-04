// ─────────────────────────────────────────────
// LOGIN SCREEN
// Google Sign-In via WebBrowser + Firebase credential
// Uses Web OAuth client for simplicity and reliability
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = '963869613685-7u94c53t5grma47e1qnt5b0hucfa3bi5.apps.googleusercontent.com';
const REDIRECT_URI = 'https://rewardsfindr-dev.firebaseapp.com/__/auth/handler';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogleSignIn = async () => {
    console.log('[LoginScreen] Starting Google OAuth flow...');
    setLoading(true);
    setError(null);

    try {
      // Build OAuth URL
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${WEB_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `response_type=id_token&` +
        `scope=openid%20email%20profile&` +
        `nonce=${Math.random().toString(36)}`;

      console.log('[LoginScreen] Opening browser for OAuth...');
      const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);
      
      console.log('[LoginScreen] Browser result:', result.type);

      if (result.type === 'success') {
        // Extract id_token from URL fragment
        const url = result.url;
        const idTokenMatch = url.match(/id_token=([^&]+)/);
        
        if (idTokenMatch && idTokenMatch[1]) {
          const idToken = idTokenMatch[1];
          console.log('[LoginScreen] Got id_token, signing in to Firebase...');
          
          const auth = getAuthInstance();
          const credential = GoogleAuthProvider.credential(idToken);
          const userCredential = await signInWithCredential(auth, credential);
          
          console.log('[LoginScreen] Firebase sign-in successful:', userCredential.user.email);
          // Auth state listener in _layout.js will handle redirect
        } else {
          throw new Error('No id_token in response');
        }
      } else if (result.type === 'cancel') {
        console.log('[LoginScreen] User cancelled');
        setLoading(false);
      }
    } catch (err) {
      console.error('[LoginScreen] Sign-in error:', err);
      setError(`Sign-in failed: ${err.message}`);
      setLoading(false);
    }
  };

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
          onPress={handleGoogleSignIn}
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
                   width: '100%', marginBottom: 24,
                   shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  disabled:      { opacity: 0.5 },
  googleBtnText: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  note:          { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 22 },
});
