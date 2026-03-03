// ─────────────────────────────────────────────
// ROOT LAYOUT
// Auth gate: redirects to /login if not signed in
// Listens to Firebase auth state changes and routes accordingly
// DEBUG LOGS ADDED FOR OAUTH TROUBLESHOOTING
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

  // DEBUG: Log layout mount
  useEffect(() => {
    console.log('[RootLayout] Component mounted');
  }, []);

  // Listen to Firebase auth state
  useEffect(() => {
    console.log('[RootLayout] Setting up auth listener');
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log('[RootLayout] Auth state changed:', {
        authenticated: !!firebaseUser,
        email: firebaseUser?.email,
        uid: firebaseUser?.uid,
      });
      setUser(firebaseUser ?? null);
    });
    return () => {
      console.log('[RootLayout] Cleaning up auth listener');
      unsubscribe();
    };
  }, []);

  // Redirect based on auth state
  useEffect(() => {
    if (user === undefined) {
      console.log('[RootLayout] User still undefined, waiting...');
      return; // Still loading, wait
    }

    const onLoginScreen = segments[0] === 'login';
    console.log('[RootLayout] Routing logic:', {
      userAuthenticated: !!user,
      onLoginScreen,
      segments,
    });

    if (!user && !onLoginScreen) {
      console.log('[RootLayout] Redirecting to /login (user not authenticated)');
      router.replace('/login');
    } else if (user && onLoginScreen) {
      console.log('[RootLayout] Redirecting to / (user authenticated on login screen)');
      router.replace('/');
    } else {
      console.log('[RootLayout] No redirect needed');
    }
  }, [user, segments]);

  // Show spinner while Firebase checks persisted auth
  if (user === undefined) {
    console.log('[RootLayout] Rendering loading spinner');
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eef2ff' }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  console.log('[RootLayout] Rendering Stack navigator');
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
