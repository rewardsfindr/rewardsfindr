// ─────────────────────────────────────────────
// LOGIN SCREEN
// Google Sign-In via @react-native-google-signin + Firebase credential
// On success, _layout.js auth listener redirects to home automatically
// ─────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { Stack } from 'expo-router';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';

// Configure Google Sign-In once at module level
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  offlineAccess: false,
});

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      console.log('[Login] Checking Play Services...');
      await GoogleSignin.hasPlayServices();
      
      console.log('[Login] Starting sign-in...');
      const userInfo = await GoogleSignin.signIn();
      console.log('[Login] Sign-in response:', JSON.stringify(userInfo, null, 2));
      
      const idToken = userInfo.data?.idToken ?? userInfo.idToken;
      console.log('[Login] idToken present:', !!idToken);

      if (!idToken) {
        throw new Error('No idToken returned from Google Sign-In');
      }

      console.log('[Login] Creating Firebase credential...');
      const auth = getAuthInstance();
      const credential = GoogleAuthProvider.credential(idToken);
      
      console.log('[Login] Signing in to Firebase...');
      await signInWithCredential(auth, credential);
      console.log('[Login] ✅ Firebase sign-in successful');
      // _layout.js onAuthStateChanged fires and redirects to '/' automatically
    } catch (err) {
      console.error('[Login] Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
      console.error('[Login] Error code:', err.code);
      console.error('[Login] Error message:', err.message);
      console.error('[Login] Error stack:', err.stack);
      
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('[Login] User cancelled');
        // user cancelled - not an error
      } else if (err.code === statusCodes.IN_PROGRESS) {
        setError('Sign-in already in progress.');
      } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play Services not available.');
      } else {
        setError(`Sign-in failed: ${err.message}`);
      }
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
  subtitle:      { fontSize: 16, color: '#6b7280', textAlign: 'center', lineHeight: 26, marginBottom: 36 },
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
