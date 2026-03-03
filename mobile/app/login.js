// ─────────────────────────────────────────────
// LOGIN SCREEN
// Google Sign-In via expo-auth-session + Firebase credential
// On success, _layout.js auth listener redirects to home automatically
// DEBUG LOGS ADDED FOR OAUTH TROUBLESHOOTING
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

// Required to handle redirect back from browser after OAuth
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  console.log('[LoginScreen] Component rendered');
  console.log('[LoginScreen] Environment check:', {
    hasClientId: !!process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    clientIdPreview: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.substring(0, 20) + '...',
  });

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  }, {
    useProxy: true, // Force use of https://auth.expo.io proxy instead of exp:// local redirect
  });

  // DEBUG: Log request object
  useEffect(() => {
    console.log('[LoginScreen] Auth request object:', {
      hasRequest: !!request,
      url: request?.url,
      codeVerifier: request?.codeVerifier ? 'present' : 'missing',
    });
  }, [request]);

  useEffect(() => {
    console.log('[LoginScreen] Response received:', {
      type: response?.type,
      error: response?.error,
      errorCode: response?.error_code,
      params: response?.params ? Object.keys(response.params) : 'none',
      authentication: response?.authentication ? Object.keys(response.authentication) : 'none',
    });

    if (response?.type === 'success') {
      console.log('[LoginScreen] OAuth success! Processing tokens...');
      // Different response structure for web vs native
      const idToken = response.params?.id_token || response.authentication?.idToken;
      const accessToken = response.params?.access_token || response.authentication?.accessToken;
      
      console.log('[LoginScreen] Token check:', {
        hasIdToken: !!idToken,
        hasAccessToken: !!accessToken,
      });

      if (idToken || accessToken) {
        handleGoogleSignIn(idToken, accessToken);
      } else {
        console.error('[Login] No token in response:', response);
        setError('Authentication failed. No token received.');
        setLoading(false);
      }
    } else if (response?.type === 'error') {
      console.error('[Login] OAuth error response:', {
        error: response.error,
        errorDescription: response.params?.error_description,
        url: response.url,
      });
      setError(`Google sign-in failed: ${response.error}. Check console for details.`);
      setLoading(false);
    } else if (response?.type === 'dismiss') {
      console.log('[Login] User dismissed OAuth flow');
      setLoading(false);
    }
  }, [response]);

  const handleGoogleSignIn = async (idToken, accessToken) => {
    console.log('[LoginScreen] Starting Firebase sign-in with Google credential...');
    try {
      const auth = getAuthInstance();
      console.log('[LoginScreen] Auth instance obtained');
      
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      console.log('[LoginScreen] Google credential created');
      
      const result = await signInWithCredential(auth, credential);
      console.log('[LoginScreen] Firebase sign-in successful:', {
        uid: result.user.uid,
        email: result.user.email,
      });
      // _layout.js onAuthStateChanged fires and redirects to '/' automatically
    } catch (err) {
      console.error('[Login] Sign-in error:', {
        code: err.code,
        message: err.message,
        stack: err.stack,
      });
      setError(`Sign-in failed: ${err.message}`);
      setLoading(false);
    }
  };

  const handleSignInPress = () => {
    console.log('[LoginScreen] Sign-in button pressed');
    setError(null);
    setLoading(true);
    console.log('[LoginScreen] Calling promptAsync...');
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

        {/* Debug banner */}
        <View style={s.debugBox}>
          <Text style={s.debugText}>🔧 Debug Mode: Check Metro console for OAuth logs</Text>
        </View>

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>⚠️ {error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[s.googleBtn, (!request || loading) && s.disabled]}
          onPress={handleSignInPress}
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
  debugBox:      { backgroundColor: '#fff8dc', borderRadius: 12, padding: 10,
                   marginBottom: 16, width: '100%', borderWidth: 2, borderColor: '#ffa500' },
  debugText:     { color: '#b45309', fontSize: 12, textAlign: 'center', fontWeight: '600' },
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
