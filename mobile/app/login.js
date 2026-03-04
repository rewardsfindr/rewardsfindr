// ─────────────────────────────────────────────
// LOGIN SCREEN
// Google Sign-In via expo-auth-session (no proxy)
// ─────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { Stack } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const ANDROID_CLIENT_ID = '963869613685-cbtfsrnsre4mbov0ujauvqjbi9a65egq.apps.googleusercontent.com';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  console.log('[LoginScreen] Initializing...');

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    console.log('[LoginScreen] Response:', response?.type);

    if (response?.type === 'success') {
      console.log('[LoginScreen] OAuth success!');
      const { authentication } = response;
      
      if (authentication?.idToken) {
        handleFirebaseSignIn(authentication.idToken, authentication.accessToken);
      } else {
        console.error('[LoginScreen] No idToken in response');
        setError('Authentication failed - no token received');
        setLoading(false);
      }
    } else if (response?.type === 'error') {
      console.error('[LoginScreen] OAuth error:', response.error);
      setError(`Sign-in failed: ${response.error}`);
      setLoading(false);
    } else if (response?.type === 'cancel') {
      console.log('[LoginScreen] User cancelled');
      setLoading(false);
    }
  }, [response]);

  const handleFirebaseSignIn = async (idToken, accessToken) => {
    console.log('[LoginScreen] Signing into Firebase...');
    try {
      const auth = getAuthInstance();
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      const result = await signInWithCredential(auth, credential);
      
      console.log('[LoginScreen] Firebase success:', result.user.email);
      // Auth listener will redirect
    } catch (err) {
      console.error('[LoginScreen] Firebase error:', err);
      setError(`Sign-in failed: ${err.message}`);
      setLoading(false);
    }
  };

  const handleSignIn = () => {
    console.log('[LoginScreen] Button pressed');
    setError(null);
    setLoading(true);
    promptAsync();
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
          style={[s.googleBtn, (!request || loading) && s.disabled]}
          onPress={handleSignIn}
          disabled={!request || loading}
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
