// ─────────────────────────────────────────────
// LOGIN SCREEN
// Manual Google OAuth with token exchange
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView, Linking
} from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { makeRedirectUri } from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = '963869613685-7u94c53t5grma47e1qnt5b0hucfa3bi5.apps.googleusercontent.com';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogleSignIn = async () => {
    console.log('[LoginScreen] Starting Google OAuth flow...');
    setLoading(true);
    setError(null);

    try {
      const redirectUri = makeRedirectUri({
        scheme: 'com.rewardsfindr.app',
        path: 'oauthredirect'
      });
      
      console.log('[LoginScreen] Redirect URI:', redirectUri);

      // Generate random state and nonce
      const state = Math.random().toString(36).substring(7);
      const nonce = Math.random().toString(36).substring(7);

      // Build OAuth URL for id_token (implicit flow)
      const authUrl = 
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${WEB_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=id_token&` +
        `scope=${encodeURIComponent('openid email profile')}&` +
        `nonce=${nonce}&` +
        `state=${state}`;

      console.log('[LoginScreen] Opening browser...');
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      
      console.log('[LoginScreen] Browser result type:', result.type);

      if (result.type === 'success') {
        const url = result.url;
        console.log('[LoginScreen] Success URL received');
        
        // Parse URL fragment for id_token
        const params = new URLSearchParams(url.split('#')[1] || url.split('?')[1]);
        const idToken = params.get('id_token');
        const returnedState = params.get('state');
        
        console.log('[LoginScreen] Token check:', {
          hasIdToken: !!idToken,
          stateMatches: returnedState === state
        });

        if (!idToken) {
          throw new Error('No id_token received from Google');
        }

        if (returnedState !== state) {
          throw new Error('State mismatch - possible security issue');
        }

        console.log('[LoginScreen] Signing in to Firebase...');
        const auth = getAuthInstance();
        const credential = GoogleAuthProvider.credential(idToken);
        const userCredential = await signInWithCredential(auth, credential);
        
        console.log('[LoginScreen] Success!', userCredential.user.email);
        // Auth listener in _layout.js will redirect
      } else if (result.type === 'cancel') {
        console.log('[LoginScreen] User cancelled');
        setLoading(false);
      } else {
        console.log('[LoginScreen] Unexpected result:', result);
        setLoading(false);
      }
    } catch (err) {
      console.error('[LoginScreen] Error:', err);
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
