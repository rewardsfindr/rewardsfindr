// ─────────────────────────────────────────────
// HOME SCREEN — orchestrator only
// Layout + navigation logic. No inline styles.
// All UI split into focused components.
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import { ScrollView, Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { useSearch } from '../hooks/useSearch.js';
import { searchStore } from '../lib/api.js';

import HomeHeader     from '../components/HomeHeader.js';
import SearchBar      from '../components/SearchBar.js';
import ExampleRewards from '../components/ExampleRewards.js';
import BankGrid       from '../components/BankGrid.js';
import SyncWebView    from '../components/SyncWebView.js';
import { colors }     from '../shared/theme.js';

export default function HomeScreen() {
  const router = useRouter();
  const { searchTerm, setSearchTerm, searching, error, clearSearch } = useSearch();
  const [localSearching, setLocalSearching] = useState(false);
  const [syncBank, setSyncBank] = useState(null);
  const [syncedBanks, setSyncedBanks] = useState({});

  const user = getAuthInstance().currentUser;

  const handleAvatarPress = () => {
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

  const navigateToResults = (data, query) => {
    if (!data.offers || data.offers.length === 0) {
      router.push({ pathname: '/results', params: { notFound: query } });
      return;
    }
    router.push({ pathname: '/results', params: { storeName: query, offers: JSON.stringify(data.offers) } });
  };

  const onSearchSubmit = async () => {
    if (!searchTerm.trim()) return;
    setLocalSearching(true);
    try {
      const data = await searchStore(searchTerm);
      navigateToResults(data, searchTerm);
    } catch (err) {
      Alert.alert('Search Error', err.message);
    } finally {
      setLocalSearching(false);
    }
  };

  const onChipPress = async (storeName) => {
    setLocalSearching(true);
    try {
      const data = await searchStore(storeName);
      navigateToResults(data, storeName);
    } catch (err) {
      Alert.alert('Search Error', err.message);
    } finally {
      setLocalSearching(false);
    }
  };

  const handleSyncSuccess = (totalSynced, cardResults, bank) => {
    setSyncedBanks(prev => ({ ...prev, [bank]: cardResults.length }));
  };

  const isSearching = searching || localSearching;

  return (
    <View style={s.safe}>
      <HomeHeader user={user} onAvatarPress={handleAvatarPress} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <SearchBar
          value={searchTerm}
          onChange={(val) => { setSearchTerm(val); clearSearch(); }}
          onSubmit={onSearchSubmit}
          onChipPress={onChipPress}
          isSearching={isSearching}
          error={error}
        />
        <ExampleRewards />
        <BankGrid syncedBanks={syncedBanks} onSyncPress={setSyncBank} />
      </ScrollView>

      <SyncWebView
        visible={syncBank !== null}
        bank={syncBank}
        onClose={() => setSyncBank(null)}
        onSuccess={(total, cardResults) => handleSyncSuccess(total, cardResults, syncBank)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bgHeader },
  scroll: { backgroundColor: colors.bgPage, paddingBottom: 40 },
});
