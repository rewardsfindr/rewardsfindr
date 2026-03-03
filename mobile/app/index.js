// ─────────────────────────────────────────────
// HOME SCREEN
// Search input + popular store chips
// Shows signed-in user info + sign out in header
// Navigates to /results on search
// Sync Chase / Amex buttons open SyncWebView modal
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { useSearch } from '../hooks/useSearch.js';
import { POPULAR_STORES } from '../shared/constants.js';
import { searchStore } from '../lib/api.js';
import SyncWebView from '../components/SyncWebView.js';

export default function HomeScreen() {
  const router = useRouter();
  const { searchTerm, setSearchTerm, searching, error, clearSearch } = useSearch();
  const [localSearching, setLocalSearching] = useState(false);
  const [syncBank, setSyncBank] = useState(null); // 'chase' | 'amex' | null

  const user = getAuthInstance().currentUser;

  const handleSignOut = async () => {
    try {
      await signOut(getAuthInstance());
    } catch (err) {
      Alert.alert('Error', 'Could not sign out. Please try again.');
    }
  };

  const navigateToResults = (data, query) => {
    if (!data.store && (!data.personalizedOffers || data.personalizedOffers.length === 0)) {
      router.push({ pathname: '/results', params: { notFound: query } });
      return;
    }
    router.push({
      pathname: '/results',
      params: {
        storeName: data.store || query,
        category:  data.category,
        quality:   data.quality,
        results:   JSON.stringify(data.cards?.slice(0, 3) ?? []),
        personalizedOffers: JSON.stringify(data.personalizedOffers ?? []),
      },
    });
  };

  const onSearchPress = async () => {
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

  const handleSyncSuccess = (count) => {
    setSyncBank(null);
    Alert.alert(
      'Sync Complete',
      count > 0
        ? `${count} offer${count !== 1 ? 's' : ''} synced successfully!`
        : 'No offers found. Make sure you are on the offers page before syncing.',
      [{ text: 'OK' }]
    );
  };

  const isSearching = searching || localSearching;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.headerIconWrap}>
              <Text style={s.headerIcon}>&#128179;</Text>
            </View>
            <View>
              <Text style={s.headerTitle}>RewardsFindr</Text>
              <Text style={s.headerSub}>Find the best card for any store</Text>
            </View>
          </View>
        </View>

        {/* Signed-in user banner */}
        {user && (
          <View style={s.userBanner}>
            <Text style={s.userEmail} numberOfLines={1}>
              &#128100; {user.displayName || user.email}
            </Text>
            <TouchableOpacity onPress={handleSignOut}>
              <Text style={s.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Search */}
        <View style={s.searchBox}>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={searchTerm}
              onChangeText={(val) => { setSearchTerm(val); clearSearch(); }}
              onSubmitEditing={onSearchPress}
              placeholder="Search for any store..."
              placeholderTextColor="#9ca3af"
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            <TouchableOpacity style={s.searchBtn} onPress={onSearchPress} disabled={isSearching}>
              {isSearching
                ? <ActivityIndicator color="white" size="small" />
                : <Text style={s.searchBtnText}>&#128269;</Text>}
            </TouchableOpacity>
          </View>

          {error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>&#9888;&#65039; {error}</Text>
            </View>
          )}

          <Text style={s.popularLabel}>Popular Stores</Text>
          <View style={s.chips}>
            {POPULAR_STORES.map(name => (
              <TouchableOpacity key={name} style={s.chip} onPress={() => onChipPress(name)} disabled={isSearching}>
                <Text style={s.chipText}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sync Offers */}
        <View style={s.syncCard}>
          <Text style={s.syncTitle}>Sync Your Card Offers</Text>
          <Text style={s.syncSubtitle}>Log in to see your personalized cashback offers</Text>
          <View style={s.syncRow}>
            <TouchableOpacity style={s.syncBtnChase} onPress={() => setSyncBank('chase')}>
              <Text style={s.syncBtnText}>Sync Chase</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.syncBtnAmex} onPress={() => setSyncBank('amex')}>
              <Text style={s.syncBtnText}>Sync Amex</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* How it works */}
        <View style={s.card}>
          <Text style={s.cardTitle}>How it works</Text>
          <Text style={s.cardBody}>
            Search any store &#8594; see which of your credit cards gives you the best rewards there.
            Sync your Chase or Amex offers above to see personalized results.
          </Text>
        </View>

      </ScrollView>

      {/* WebView Sync Modal */}
      <SyncWebView
        visible={syncBank !== null}
        bank={syncBank}
        onClose={() => setSyncBank(null)}
        onSuccess={handleSyncSuccess}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#eef2ff' },
  scroll:        { padding: 16, paddingBottom: 40 },

  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   marginBottom: 12, marginTop: 8 },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconWrap:{ backgroundColor: '#4f46e5', borderRadius: 12, padding: 10 },
  headerIcon:    { fontSize: 22 },
  headerTitle:   { fontSize: 26, fontWeight: '800', color: '#4f46e5' },
  headerSub:     { fontSize: 13, color: '#6b7280', marginTop: 2 },

  userBanner:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                   backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 14,
                   paddingVertical: 10, marginBottom: 14,
                   shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  userEmail:     { fontSize: 13, color: '#4b5563', flex: 1, marginRight: 8 },
  signOutText:   { fontSize: 13, color: '#ef4444', fontWeight: '600' },

  searchBox:     { backgroundColor: 'white', borderRadius: 20, padding: 16, marginBottom: 16,
                   shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  inputRow:      { flexDirection: 'row', gap: 8, marginBottom: 14 },
  input:         { flex: 1, borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 12,
                   paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#1f2937' },
  searchBtn:     { backgroundColor: '#4f46e5', borderRadius: 12, paddingHorizontal: 16,
                   alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { fontSize: 18 },

  errorBox:      { backgroundColor: '#fee', borderRadius: 8, padding: 10, marginBottom: 12 },
  errorText:     { color: '#c00', fontSize: 13 },

  popularLabel:  { fontSize: 13, color: '#6b7280', fontWeight: '500', marginBottom: 8 },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { backgroundColor: '#eef2ff', borderRadius: 999, paddingHorizontal: 14,
                   paddingVertical: 7, borderWidth: 1, borderColor: '#c7d2fe' },
  chipText:      { color: '#4338ca', fontSize: 13, fontWeight: '500' },

  syncCard:      { backgroundColor: 'white', borderRadius: 20, padding: 16, marginBottom: 16,
                   shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  syncTitle:     { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  syncSubtitle:  { fontSize: 13, color: '#6b7280', marginBottom: 14 },
  syncRow:       { flexDirection: 'row', gap: 10 },
  syncBtnChase:  { flex: 1, backgroundColor: '#1a3a6b', borderRadius: 12,
                   paddingVertical: 12, alignItems: 'center' },
  syncBtnAmex:   { flex: 1, backgroundColor: '#007ac1', borderRadius: 12,
                   paddingVertical: 12, alignItems: 'center' },
  syncBtnText:   { color: 'white', fontWeight: '700', fontSize: 14 },

  card:          { backgroundColor: 'white', borderRadius: 20, padding: 16,
                   shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  cardTitle:     { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 6 },
  cardBody:      { fontSize: 14, color: '#6b7280', lineHeight: 22 },
});
