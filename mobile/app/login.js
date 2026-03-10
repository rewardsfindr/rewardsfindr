// ─────────────────────────────────────────────
// LOGIN SCREEN
// Google Sign-In is wired up.
// Apple and Email buttons are UI placeholders for future implementation.
// On Google success, _layout.js auth listener redirects to home.
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView, Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { colors, radii, shadow } from '../shared/theme.js';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  scopes: ['profile', 'email'],
  offlineAccess: false,
});

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken ?? userInfo.idToken;
      if (!idToken) throw new Error('No idToken returned from Google Sign-In');
      const auth = getAuthInstance();
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

  // TODO: wire up Apple Sign-In (expo-apple-authentication)
  const handleAppleSignIn = () => {};

  // TODO: wire up Email/Password auth
  const handleEmailSignIn = () => {};

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.container}>

        {/* Logo */}
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

        {/* Google */}
        <TouchableOpacity
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

        {/* Apple — iOS only, placeholder */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity style={[s.authBtn, s.appleBtn]} onPress={handleAppleSignIn}>
            <Text style={[s.authBtnIcon, s.appleBtnText]}></Text>
            <Text style={[s.authBtnText, s.appleBtnText]}>Continue with Apple</Text>
          </TouchableOpacity>
        )}

        {/* Divider */}
        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        {/* Email — placeholder */}
        <TouchableOpacity style={[s.authBtn, s.emailBtn]} onPress={handleEmailSignIn}>
          <Text style={s.authBtnIcon}>✉️</Text>
          <Text style={[s.authBtnText, s.emailBtnText]}>Continue with Email</Text>
        </TouchableOpacity>

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

  iconWrap:      { backgroundColor: colors.primary, borderRadius: 24, padding: 20, marginBottom: 24 },
  icon:          { fontSize: 44 },
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

  terms:         { fontSize: 11, color: colors.textMuted, textAlign: 'center',
                   lineHeight: 18, marginTop: 20, paddingHorizontal: 8 },
});
