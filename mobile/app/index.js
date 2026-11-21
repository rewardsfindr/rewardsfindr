// ─────────────────────────────────────────────
// HOME SCREEN — orchestrator only
// Layout + navigation logic. No inline styles.
// All UI split into focused components.
// ─────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { ScrollView, Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { useSearch } from '../hooks/useSearch.js';
import { searchStoredOffers } from '../lib/offerStore.js';
import { resultsRouteParams, summarizeSyncCards } from '../lib/savedOffers.js';

import HomeBrand        from '../components/HomeBrand.js';
import SearchBar        from '../components/SearchBar.js';
import BankGrid         from '../components/BankGrid.js';
import BankPickerSheet  from '../components/BankPickerSheet.js';
import HomeBottomTabBar from '../components/HomeBottomTabBar.js';
import SyncWebView      from '../components/SyncWebView.js';
import { colors }       from '../shared/theme.js';

const getSyncKey = (uid) => `rewardsfindr_synced_banks_${uid}`;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { searchTerm, setSearchTerm, searching, error, clearSearch } = useSearch();
  const [localSearching, setLocalSearching] = useState(false);
  const [syncBank, setSyncBank] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [syncedBanks, setSyncedBanks] = useState({});

  const user = getAuthInstance().currentUser;

  useEffect(() => {
    if (!user?.uid) return;
    AsyncStorage.getItem(getSyncKey(user.uid))
      .then(val => { if (val) setSyncedBanks(JSON.parse(val)); })
      .catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || Object.keys(syncedBanks).length === 0) return;
    AsyncStorage.setItem(getSyncKey(user.uid), JSON.stringify(syncedBanks)).catch(() => {});
  }, [syncedBanks]);

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
              setSyncedBanks({});
            } catch {
              Alert.alert('Error', 'Could not sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  const navigateToResults = (data, query) => {
    router.push(resultsRouteParams(query, data.offers));
  };

  const runSearch = async (query) => {
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Sign in to search the offers saved on this phone.');
      return;
    }
    setLocalSearching(true);
    try {
      const offers = await searchStoredOffers(user.uid, query);
      navigateToResults({ offers }, query);
    } catch (err) {
      Alert.alert('Search Error', err.message);
    } finally {
      setLocalSearching(false);
    }
  };

  const onSearchSubmit = async () => {
    if (!searchTerm.trim()) return;
    await runSearch(searchTerm);
  };

  const handleSyncSuccess = (totalSynced, cardResults, bank) => {
    const summary = summarizeSyncCards(cardResults);
    setSyncedBanks(prev => ({
      ...prev,
      [bank]: { cards: summary.cardCount, lastSyncedAt: Date.now() },
    }));
    const lines = summary.lines;
    Alert.alert(
      totalSynced > 0 ? 'Offers saved on this phone' : 'No offers saved',
      totalSynced > 0
        ? `${lines}\n\nSearch a store name from that card.`
        : 'The sheet closed without storing offers. Open the bank again and tap Sync Offers.',
    );
  };

  const isSearching = searching || localSearching;

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.midCluster}>
          <HomeBrand />
          <SearchBar
            value={searchTerm}
            onChange={(val) => { setSearchTerm(val); clearSearch(); }}
            onSubmit={onSearchSubmit}
            isSearching={isSearching}
            error={error}
          />
        </View>
        <BankGrid
          syncedBanks={syncedBanks}
          syncingBank={syncBank}
          onSyncPress={setSyncBank}
          onSyncBankPress={() => setPickerOpen(true)}
        />
      </ScrollView>

      <HomeBottomTabBar onAccountPress={handleAccountPress} />

      <BankPickerSheet
        visible={pickerOpen}
        syncedBanks={syncedBanks}
        onClose={() => setPickerOpen(false)}
        onSelect={(bankId) => {
          setPickerOpen(false);
          setSyncBank(bankId);
        }}
      />

      <SyncWebView
        visible={syncBank !== null}
        bank={syncBank}
        onClose={() => setSyncBank(null)}
        onSuccess={(total, cardResults) => {
          handleSyncSuccess(total, cardResults, syncBank);
          setSyncBank(null);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.bgHeader },
  scroll:       { flex: 1, backgroundColor: colors.bgPage },
  scrollContent:{ flexGrow: 1, justifyContent: 'space-between', paddingBottom: 12 },
  midCluster:   { flexGrow: 1, justifyContent: 'center', paddingTop: 24, paddingBottom: 16 },
});
