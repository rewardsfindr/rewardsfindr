// ─────────────────────────────────────────────
// useAuth
// Manages Firebase Auth state for the whole app.
// Exposes: user, loading, signIn, signOut
//
// user === null  → signed out
// user === obj   → signed in (has uid, displayName, email, photoURL)
// loading === true → auth state not yet resolved (show nothing / spinner)
// ─────────────────────────────────────────────
import { useState, useEffect } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, provider } from '../firebase.js';

export const useAuth = () => {
  const [user, setUser]       = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Subscribe to auth state on mount, unsubscribe on unmount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will fire and update user state automatically
    } catch (err) {
      // User closed the popup — not a real error, ignore silently
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error('[useAuth] signIn error:', err);
      }
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // onAuthStateChanged will fire and set user to null automatically
    } catch (err) {
      console.error('[useAuth] signOut error:', err);
    }
  };

  return { user, authLoading, signIn, signOut };
};
