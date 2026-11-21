// ─────────────────────────────────────────────
// ROOT LAYOUT
// Auth + onboarding gate:
//   unsigned → /login (or /email)
//   signed-in, first run → /onboarding → /connect-bank
//   signed-in, done → /
// ─────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { resolveAuthGate } from '../lib/authGate.js';
import { getOnboardingComplete, subscribeOnboarding } from '../lib/onboardingStore.js';
import { colors } from '../shared/theme.js';

export default function RootLayout() {
  const [user, setUser] = useState(undefined);
  const [onboardingDone, setOnboardingDone] = useState(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null);
      if (!firebaseUser) {
        setOnboardingDone(undefined);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) {
      setOnboardingDone(undefined);
      return undefined;
    }
    setOnboardingDone(undefined);
    getOnboardingComplete(user.uid).then((done) => {
      if (!cancelled) setOnboardingDone(done);
    });
    return () => { cancelled = true; };
  }, [user?.uid]);

  useEffect(() => {
    return subscribeOnboarding((uid, done) => {
      if (uid && uid === user?.uid) {
        setOnboardingDone(done);
      }
    });
  }, [user?.uid]);

  useEffect(() => {
    const decision = resolveAuthGate({
      user,
      onboardingDone,
      segment: segments[0],
    });
    if (decision.action === 'replace' && decision.path) {
      router.replace(decision.path);
    }
  }, [user, onboardingDone, segments, router]);

  if (user === undefined || (user && onboardingDone === undefined)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgPage }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bgHeader },
          headerTintColor: colors.textOnDark,
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: colors.bgPage },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="offers" options={{ headerShown: false }} />
        <Stack.Screen name="history" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ headerShown: false }} />
        <Stack.Screen name="results" options={{ title: 'Results' }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="email" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="connect-bank" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
