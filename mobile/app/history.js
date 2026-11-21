// ─────────────────────────────────────────────
// SEARCH HISTORY TAB — recent store searches
// ─────────────────────────────────────────────
import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { searchStoredOffers } from '../lib/offerStore.js';
import { resultsRouteParams } from '../lib/savedOffers.js';
import {
  loadSearchHistory,
  recordSearch,
  clearSearchHistory,
  formatRelativeSearchTime,
} from '../lib/searchHistory.js';
import HomeBottomTabBar from '../components/HomeBottomTabBar.js';
import { HISTORY_TAB_INDEX } from '../components/homeLayout.js';
import { colors, radii } from '../shared/theme.js';

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = getAuthInstance().currentUser;

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (!user?.uid) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setEntries(await loadSearchHistory(user.uid));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleAccountPress = () => {
    if (!user) return;
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(getAuthInstance());
            } catch {
              Alert.alert('Error', 'Could not sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  const onClear = () => {
    if (!user?.uid || entries.length === 0) return;
    Alert.alert(
      'Clear search history?',
      'This removes all recent searches on this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearSearchHistory(user.uid);
            setEntries([]);
          },
        },
      ]
    );
  };

  const rerunSearch = async (query) => {
    const q = String(query || '').trim();
    if (!q || !user?.uid) return;
    try {
      await recordSearch(user.uid, q);
      const offers = await searchStoredOffers(user.uid, q);
      router.push(resultsRouteParams(q, offers));
    } catch (err) {
      Alert.alert('Search Error', err.message || 'Could not search.');
    }
  };

  const empty = !loading && entries.length === 0;

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.title}>Search history</Text>
          <Text style={s.subtitle}>Last 30 days · max 100</Text>
        </View>
        {!empty && (
          <TouchableOpacity onPress={onClear} accessibilityRole="button" accessibilityLabel="Clear history">
            <Text style={s.clear}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.listWrap}>
        {loading ? (
          <ActivityIndicator style={s.loader} color={colors.primary} />
        ) : empty ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No searches yet</Text>
            <Text style={s.emptyBody}>
              Search a store from Home. Your recent searches will show up here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => `${item.query}-${item.searchedAt}`}
            contentContainerStyle={s.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.row}
                onPress={() => rerunSearch(item.query)}
                accessibilityRole="button"
                accessibilityLabel={`Search ${item.query} again`}
              >
                <View style={s.iconWrap}>
                  <Ionicons name="search" size={16} color={colors.textMuted} />
                </View>
                <View style={s.rowMain}>
                  <Text style={s.query} numberOfLines={1}>{item.query}</Text>
                  <Text style={s.hint}>Tap to search again</Text>
                </View>
                <Text style={s.when}>{formatRelativeSearchTime(item.searchedAt, now)}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      <HomeBottomTabBar selectedIndex={HISTORY_TAB_INDEX} onAccountPress={handleAccountPress} />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgHeader },
  header: {
    backgroundColor: colors.bgHeader,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: { flex: 1, paddingRight: 12 },
  title: { color: colors.textOnDark, fontSize: 18, fontWeight: '700' },
  subtitle: { color: colors.textOnDarkSub, fontSize: 12, marginTop: 2 },
  clear: { color: colors.primaryLight, fontSize: 13, fontWeight: '600' },
  listWrap: { flex: 1, backgroundColor: colors.bgPage },
  listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 },
  loader: { marginTop: 48 },
  empty: { marginTop: 48, paddingHorizontal: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptyBody: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  row: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgPage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: { flex: 1, minWidth: 0 },
  query: { fontWeight: '600', fontSize: 15, color: colors.textPrimary },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  when: { fontSize: 12, color: colors.textMuted },
});
