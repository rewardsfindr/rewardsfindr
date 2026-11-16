// ─────────────────────────────────────────────
// LOGIN SCREEN
// Google, Apple (iOS), and Email sign-in.
// On success, _layout.js routes to onboarding or home.
// ─────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView, Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import {
  GoogleAuthProvider, OAuthProvider, getRedirectResult,
  signInWithCredential, signInWithPopup, signInWithRedirect,
} from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { colors, radii, shadow } from '../shared/theme.js';

let AppleAuthentication = null;
if (Platform.OS === 'ios') {
  try {
    AppleAuthentication = require('expo-apple-authentication');
  } catch {
    AppleAuthentication = null;
  }
}

if (Platform.OS !== 'web') {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    scopes: ['profile', 'email'],
    offlineAccess: false,
  });
}

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    getRedirectResult(getAuthInstance()).catch((err) => {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
      setError(`Sign-in failed: ${err.message}`);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS !== 'ios' || !AppleAuthentication?.isAvailableAsync) {
        if (!cancelled) setAppleAvailable(false);
        return;
      }
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (!cancelled) setAppleAvailable(available);
      } catch {
        if (!cancelled) setAppleAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const auth = getAuthInstance();
      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
          await signInWithPopup(auth, provider);
        } catch (popupError) {
          if (popupError?.code !== 'auth/popup-blocked') throw popupError;
          await signInWithRedirect(auth, provider);
        }
        return;
      }
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken ?? userInfo.idToken;
      if (!idToken) throw new Error('No idToken returned from Google Sign-In');
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
    } catch (err) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        setLoading(false);
      } else if (err.code === statusCodes.IN_PROGRESS) {
        setError('Sign-in already in progress.');
        setLoading(false);
      } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play Services not available.');
        setLoading(false);
      } else {
        setError(`Sign-in failed: ${err.message}`);
        setLoading(false);
      }
    }
  };

  const handleAppleSignIn = async () => {
    if (!AppleAuthentication) {
      setError('Apple Sign-In is not available on this device.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!appleCredential.identityToken) {
        throw new Error('No identity token returned from Apple');
      }
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({
        idToken: appleCredential.identityToken,
      });
      await signInWithCredential(getAuthInstance(), credential);
    } catch (err) {
      if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED') {
        setLoading(false);
        return;
      }
      setError(`Apple sign-in failed: ${err.message || err}`);
      setLoading(false);
    }
  };

  const handleEmailSignIn = () => {
    setError(null);
    router.push('/email');
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.container}>

        <Image
          source={require('../assets/logo.png')}
          style={s.icon}
          accessible={false}
        />

        <Text style={s.title}>RewardsFindr</Text>
        <Text style={s.subtitle}>Find the best card rewards{"\n"}for any store</Text>

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          style={[s.authBtn, loading && s.disabled]}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <>
              <Text style={s.authBtnIcon}>G</Text>
              <Text style={s.authBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {appleAvailable && (
          <TouchableOpacity
            style={[s.authBtn, s.appleBtn, loading && s.disabled]}
            onPress={handleAppleSignIn}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={[s.authBtnIcon, s.appleBtnText]}></Text>
            <Text style={[s.authBtnText, s.appleBtnText]}>Continue with Apple</Text>
          </TouchableOpacity>
        )}

        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        <TouchableOpacity
          style={[s.authBtn, s.emailBtn, loading && s.disabled]}
          onPress={handleEmailSignIn}
          disabled={loading}
          accessibilityRole="button"
        >
          <Text style={s.authBtnIcon}>✉️</Text>
          <Text style={[s.authBtnText, s.emailBtnText]}>Continue with Email</Text>
        </TouchableOpacity>

        <Text style={s.trust}>We never store your bank passwords.</Text>
        <Text style={s.terms}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>

      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.bgPage },
  container:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  icon:          { width: 112, height: 112, marginBottom: 24 },
  title:         { fontSize: 32, fontWeight: '900', color: colors.primary, marginBottom: 8 },
  subtitle:      { fontSize: 16, color: colors.textMuted, textAlign: 'center', lineHeight: 26, marginBottom: 36 },

  errorBox:      { backgroundColor: colors.errorBg, borderRadius: radii.md, padding: 12,
                   marginBottom: 16, width: '100%' },
  errorText:     { color: colors.error, fontSize: 14, textAlign: 'center' },

  authBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                   backgroundColor: colors.bgCard, borderRadius: radii.md,
                   paddingVertical: 15, paddingHorizontal: 24,
                   width: '100%', marginBottom: 12, ...shadow.sm },
  appleBtn:      { backgroundColor: '#000' },
  emailBtn:      { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  disabled:      { opacity: 0.5 },

  authBtnIcon:   { fontSize: 18, marginRight: 10, fontWeight: '700' },
  authBtnText:   { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  appleBtnText:  { color: '#fff' },
  emailBtnText:  { color: colors.textSecondary },

  divider:       { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 4, marginBottom: 12 },
  dividerLine:   { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText:   { marginHorizontal: 12, fontSize: 13, color: colors.textMuted },

  trust:         { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 16 },
  terms:         { fontSize: 11, color: colors.textMuted, textAlign: 'center',
                   lineHeight: 18, marginTop: 8, paddingHorizontal: 8 },
});
