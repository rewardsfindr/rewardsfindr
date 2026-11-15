// ─────────────────────────────────────────────
// EMAIL AUTH FLOW
// Steps: enter email → sign in OR sign up → optional forgot password
// Uses Firebase email/password auth.
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { colors, radii, shadow } from '../shared/theme.js';

const STEPS = {
  EMAIL: 'email',
  SIGN_IN: 'sign_in',
  SIGN_UP: 'sign_up',
  FORGOT: 'forgot',
  FORGOT_SENT: 'forgot_sent',
};

function mapAuthError(err) {
  const code = err?.code || '';
  if (code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (code === 'auth/user-disabled') return 'This account has been disabled.';
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Incorrect email or password.';
  }
  if (code === 'auth/email-already-in-use') return 'An account already exists with this email. Try signing in.';
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection.';
  return err?.message || 'Something went wrong. Please try again.';
}

export default function EmailAuthScreen() {
  const router = useRouter();
  const [step, setStep] = useState(STEPS.EMAIL);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const goBack = () => {
    setError(null);
    if (step === STEPS.EMAIL) {
      router.back();
      return;
    }
    if (step === STEPS.FORGOT || step === STEPS.FORGOT_SENT) {
      setStep(STEPS.SIGN_IN);
      setPassword('');
      return;
    }
    setStep(STEPS.EMAIL);
    setPassword('');
    setConfirm('');
  };

  const continueWithEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const methods = await fetchSignInMethodsForEmail(getAuthInstance(), trimmed);
      setEmail(trimmed);
      if (methods.includes('password')) {
        setStep(STEPS.SIGN_IN);
      } else if (methods.length > 0) {
        setError('This email uses Google or Apple sign-in. Go back and continue with that provider.');
      } else {
        setStep(STEPS.SIGN_UP);
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(getAuthInstance(), email, password);
    } catch (err) {
      setError(mapAuthError(err));
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(getAuthInstance(), email, password);
    } catch (err) {
      setError(mapAuthError(err));
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Enter your email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await sendPasswordResetEmail(getAuthInstance(), trimmed);
      setEmail(trimmed);
      setStep(STEPS.FORGOT_SENT);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const title = {
    [STEPS.EMAIL]: 'Continue with email',
    [STEPS.SIGN_IN]: 'Welcome back',
    [STEPS.SIGN_UP]: 'Create your account',
    [STEPS.FORGOT]: 'Reset password',
    [STEPS.FORGOT_SENT]: 'Check your inbox',
  }[step];

  const subtitle = {
    [STEPS.EMAIL]: 'We’ll use this to save your offers on this device.',
    [STEPS.SIGN_IN]: email,
    [STEPS.SIGN_UP]: email,
    [STEPS.FORGOT]: 'We’ll send a reset link to your email.',
    [STEPS.FORGOT_SENT]: `We sent a reset link to ${email}.`,
  }[step];

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.container}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity onPress={goBack} accessibilityRole="button" style={s.backBtn}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>

          {error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {step === STEPS.EMAIL && (
            <>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                placeholder="you@email.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                editable={!loading}
              />
              <TouchableOpacity
                style={[s.primaryBtn, loading && s.disabled]}
                onPress={continueWithEmail}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color={colors.textOnDark} />
                ) : (
                  <Text style={s.primaryBtnText}>Continue</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === STEPS.SIGN_IN && (
            <>
              <Text style={s.label}>Password</Text>
              <TextInput
                style={s.input}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
              <TouchableOpacity onPress={() => { setError(null); setStep(STEPS.FORGOT); }}>
                <Text style={s.link}>Forgot password?</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, loading && s.disabled]}
                onPress={handleSignIn}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color={colors.textOnDark} />
                ) : (
                  <Text style={s.primaryBtnText}>Sign in</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === STEPS.SIGN_UP && (
            <>
              <Text style={s.label}>Password</Text>
              <TextInput
                style={s.input}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
              <Text style={s.label}>Confirm password</Text>
              <TextInput
                style={s.input}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={confirm}
                onChangeText={setConfirm}
                editable={!loading}
              />
              <TouchableOpacity
                style={[s.primaryBtn, loading && s.disabled]}
                onPress={handleSignUp}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color={colors.textOnDark} />
                ) : (
                  <Text style={s.primaryBtnText}>Create account</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === STEPS.FORGOT && (
            <>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
                editable={!loading}
              />
              <TouchableOpacity
                style={[s.primaryBtn, loading && s.disabled]}
                onPress={handleForgot}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color={colors.textOnDark} />
                ) : (
                  <Text style={s.primaryBtnText}>Send reset link</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === STEPS.FORGOT_SENT && (
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => setStep(STEPS.SIGN_IN)}
              accessibilityRole="button"
            >
              <Text style={s.primaryBtnText}>Back to sign in</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.bgPage },
  flex:      { flex: 1 },
  container: { flexGrow: 1, padding: 24, paddingTop: 12 },
  backBtn:   { marginBottom: 24, alignSelf: 'flex-start' },
  backText:  { fontSize: 16, color: colors.textSecondary, fontWeight: '600' },
  title:     { fontSize: 28, fontWeight: '900', color: colors.primary, marginBottom: 8 },
  subtitle:  { fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: 28 },
  label:     { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
  input:     {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    ...shadow.sm,
  },
  primaryBtnText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
  link:      { color: colors.accent, fontSize: 14, fontWeight: '600', marginBottom: 12 },
  disabled:  { opacity: 0.5 },
  errorBox:  {
    backgroundColor: colors.errorBg,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: colors.error, fontSize: 14, textAlign: 'center' },
});
