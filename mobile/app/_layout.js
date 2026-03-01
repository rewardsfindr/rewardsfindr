// ─────────────────────────────────────────────
// ROOT LAYOUT
// Auth gate: redirects to /login if not signed in
// Listens to Firebase auth state changes and routes accordingly
// ─────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';

export default function RootLayout() {
  const [user, setUser] = useState(undefined); // undefined = still loading
  const router = useRouter();
  const segments = useSegments();

  // Listen to Firebase auth state
  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null);
    });
    return unsubscribe;
  }, []);

  // Redirect based on auth state
  useEffect(() => {
    if (user === undefined) return; // Still loading, wait

    const onLoginScreen = segments[0] === 'login';

    if (!user && !onLoginScreen) {
      router.replace('/login');
    } else if (user && onLoginScreen) {
      router.replace('/');
    }
  }, [user, segments]);

  // Show spinner while Firebase checks persisted auth
  if (user === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eef2ff' }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#4f46e5' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#eef2ff' },
        }}
      />
    </>
  );
}
