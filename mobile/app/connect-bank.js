// ─────────────────────────────────────────────
// SOFT BANK SYNC PROMPT
// Shown after onboarding carousel (or Skip).
// Sync Chase/Amex via existing SyncWebView, or skip to Home.
// Marks onboarding complete either way.
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { setOnboardingComplete } from '../lib/onboardingStore.js';
import { CONNECT_BANK_COPY, buildSyncedBanksUpdate } from '../lib/onboardingContent.js';
import SyncWebView from '../components/SyncWebView.js';
import { colors, radii, shadow } from '../shared/theme.js';

const getSyncKey = (uid) => `rewardsfindr_synced_banks_${uid}`;

export default function ConnectBankScreen() {
  const router = useRouter();
  const [syncBank, setSyncBank] = useState(null);
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    const uid = getAuthInstance().currentUser?.uid;
    try {
      await setOnboardingComplete(uid);
    } catch {
      // Still navigate; gate will re-check and may show again once.
    }
    router.replace('/');
  };

  const persistSyncedBank = async (bank, cardResults) => {
    const uid = getAuthInstance().currentUser?.uid;
    if (!uid || !bank) return;
    try {
      const key = getSyncKey(uid);
      const raw = await AsyncStorage.getItem(key);
      const prev = raw ? JSON.parse(raw) : {};
      const next = buildSyncedBanksUpdate(prev, bank, cardResults);
      await AsyncStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Home can still sync later
    }
  };

  const handleSyncSuccess = (totalSynced, cardResults) => {
    persistSyncedBank(syncBank, cardResults);
    const lines = (cardResults || [])
      .map((card) => `${card.cardName}: ${card.count} offers`)
      .join('\n');
    Alert.alert(
      totalSynced > 0 ? 'Offers saved on this phone' : 'No offers saved',
      totalSynced > 0
        ? `${lines}\n\nYou’re ready to search any store.`
        : 'You can sync again anytime from Home.',
      [{ text: 'Continue', onPress: () => { setSyncBank(null); finish(); } }],
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.container}>
        <Text style={s.title}>{CONNECT_BANK_COPY.title}</Text>
        <Text style={s.subtitle}>{CONNECT_BANK_COPY.subtitle}</Text>

        <TouchableOpacity
          style={s.primaryBtn}
          onPress={() => setSyncBank('chase')}
          accessibilityRole="button"
        >
          <Text style={s.primaryBtnText}>{CONNECT_BANK_COPY.chaseCta}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={() => setSyncBank('amex')}
          accessibilityRole="button"
        >
          <Text style={s.secondaryBtnText}>{CONNECT_BANK_COPY.amexCta}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={finish}
          disabled={finishing}
          accessibilityRole="button"
          style={s.skipWrap}
        >
          <Text style={s.skip}>{CONNECT_BANK_COPY.skip}</Text>
        </TouchableOpacity>

        <Text style={s.footnote}>{CONNECT_BANK_COPY.footnote}</Text>
      </View>

      <SyncWebView
        visible={syncBank !== null}
        bank={syncBank}
        onClose={() => setSyncBank(null)}
        onSuccess={(total, cardResults) => {
          handleSyncSuccess(total, cardResults);
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.bgPage },
  container: {
    flex: 1,
    padding: 32,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 36,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
    ...shadow.sm,
  },
  primaryBtnText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
    ...shadow.sm,
  },
  secondaryBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  skipWrap: { alignItems: 'center', paddingVertical: 8 },
  skip: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  footnote: {
    marginTop: 28,
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
  },
});
