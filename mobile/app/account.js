// ─────────────────────────────────────────────
// ACCOUNT / PROFILE TAB
// Compact identity, synced banks summary, support links, Log out.
// ─────────────────────────────────────────────
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';
import {
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
  PRIVACY_URL,
  TERMS_URL,
  APP_VERSION,
  accountDisplayName,
  accountInitials,
  syncedBanksSummary,
  formatAppVersion,
} from '../lib/accountProfile.js';
import HomeBottomTabBar from '../components/HomeBottomTabBar.js';
import { ACCOUNT_TAB_INDEX } from '../components/homeLayout.js';
import { colors, radii } from '../shared/theme.js';

const getSyncKey = (uid) => `rewardsfindr_synced_banks_${uid}`;

function ListRow({ title, subtitle, onPress, last }) {
  return (
    <TouchableOpacity
      style={[s.listRow, last && s.listRowLast]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={s.listRowText}>
        <Text style={s.listTitle}>{title}</Text>
        {subtitle ? <Text style={s.listSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const user = getAuthInstance().currentUser;
  const [syncedBanks, setSyncedBanks] = useState({});

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setSyncedBanks({});
        return undefined;
      }
      let cancelled = false;
      AsyncStorage.getItem(getSyncKey(user.uid))
        .then((val) => {
          if (cancelled) return;
          if (val) {
            try {
              setSyncedBanks(JSON.parse(val) || {});
            } catch {
              setSyncedBanks({});
            }
          } else {
            setSyncedBanks({});
          }
        })
        .catch(() => {
          if (!cancelled) setSyncedBanks({});
        });
      return () => { cancelled = true; };
    }, [user?.uid])
  );

  const name = accountDisplayName({
    displayName: user?.displayName,
    email: user?.email,
  });
  const email = String(user?.email || '').trim();
  const initials = accountInitials({
    displayName: user?.displayName,
    email: user?.email,
  });
  const banks = syncedBanksSummary(syncedBanks);

  const openUrl = async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open link', 'Please try again.');
    }
  };

  const onLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(getAuthInstance());
            } catch {
              Alert.alert('Error', 'Could not log out. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Account</Text>
        <Text style={s.subtitle}>Signed in on this phone</Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.identity}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={s.identityText}>
            <Text style={s.name} numberOfLines={1}>{name}</Text>
            {email ? (
              <Text style={s.email} numberOfLines={1}>{email}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.banksCard}>
          <View style={s.banksIcon}>
            <Ionicons name="card-outline" size={18} color={colors.bgHeader} />
          </View>
          <View style={s.banksText}>
            <Text style={s.banksTitle}>{banks.title}</Text>
            <Text style={s.banksSubtitle} numberOfLines={2}>{banks.subtitle}</Text>
          </View>
        </View>

        <View style={s.listGroup}>
          <ListRow
            title="Contact support"
            subtitle={SUPPORT_EMAIL}
            onPress={() => openUrl(SUPPORT_MAILTO)}
          />
          <ListRow
            title="Privacy Policy"
            onPress={() => openUrl(PRIVACY_URL)}
          />
          <ListRow
            title="Terms of Service"
            onPress={() => openUrl(TERMS_URL)}
            last
          />
        </View>

        <Text style={s.version}>{formatAppVersion(APP_VERSION)}</Text>

        <View style={s.spacer} />

        <TouchableOpacity
          style={s.logout}
          onPress={onLogout}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Text style={s.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>

      <HomeBottomTabBar selectedIndex={ACCOUNT_TAB_INDEX} />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgHeader },
  header: {
    backgroundColor: colors.bgHeader,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: { color: colors.textOnDark, fontSize: 18, fontWeight: '700' },
  subtitle: { color: colors.textOnDarkSub, fontSize: 12, marginTop: 2 },
  scroll: { flex: 1, backgroundColor: colors.bgPage },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
    flexGrow: 1,
  },
  identity: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgHeader,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primaryLight,
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.4,
  },
  identityText: { flex: 1, minWidth: 0 },
  name: { fontWeight: '700', fontSize: 16, color: colors.textPrimary },
  email: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  banksCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  banksIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.bgPage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banksText: { flex: 1, minWidth: 0 },
  banksTitle: { fontWeight: '700', fontSize: 14, color: colors.textPrimary },
  banksSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  listGroup: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listRowLast: { borderBottomWidth: 0 },
  listRowText: { flex: 1, minWidth: 0 },
  listTitle: { fontWeight: '600', fontSize: 14, color: colors.textPrimary },
  listSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  version: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 12,
  },
  spacer: { flexGrow: 1, minHeight: 24 },
  logout: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  logoutText: { fontWeight: '700', fontSize: 15, color: colors.error },
});
