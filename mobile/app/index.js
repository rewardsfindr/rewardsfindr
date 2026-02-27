// ─────────────────────────────────────────────
// Home Screen
// Search input + popular store chips
// Navigates to /results on successful match
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSearch } from '../hooks/useSearch.js';
import { POPULAR_STORES } from '../shared/constants.js';

export default function HomeScreen() {
  const router = useRouter();
  const {
    searchTerm, setSearchTerm,
    searching, handleSearch, handleQuickSearch,
    results, selectedStore, matchMeta, clearSearch,
  } = useSearch();

  const doSearch = async (term) => {
    if (!term?.trim()) return;
    // Run the search then navigate if we got results
    await handleQuickSearch(term);
  };

  // Navigate to results after searching
  const onSearchPress = async () => {
    if (!searchTerm.trim()) return;
    clearSearch();

    // Inline search so we can pass results via router params
    const { findBestStoreMatch, buildResultsForCategory, buildStoreLookup } = require('../shared/offerUtils.js');
    const { CARDS } = require('../shared/constants.js');
    const lookup = buildStoreLookup();
    const match = findBestStoreMatch(searchTerm, lookup);

    if (!match) {
      router.push({ pathname: '/results', params: { notFound: searchTerm } });
      return;
    }

    const cardResults = buildResultsForCategory(match.category, CARDS);
    router.push({
      pathname: '/results',
      params: {
        storeName: match.displayName,
        category:  match.category,
        quality:   match.quality,
        results:   JSON.stringify(cardResults.slice(0, 3)),
      },
    });
  };

  const onChipPress = (storeName) => {
    setSearchTerm(storeName);
    const { findBestStoreMatch, buildResultsForCategory, buildStoreLookup } = require('../shared/offerUtils.js');
    const { CARDS } = require('../shared/constants.js');
    const lookup = buildStoreLookup();
    const match = findBestStoreMatch(storeName, lookup);
    if (!match) return;
    const cardResults = buildResultsForCategory(match.category, CARDS);
    router.push({
      pathname: '/results',
      params: {
        storeName: match.displayName,
        category:  match.category,
        quality:   match.quality,
        results:   JSON.stringify(cardResults.slice(0, 3)),
      },
    });
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerIconWrap}>
            <Text style={s.headerIcon}>💳</Text>
          </View>
          <View>
            <Text style={s.headerTitle}>RewardsFindr</Text>
            <Text style={s.headerSub}>Find the best card for any store</Text>
          </View>
        </View>

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
            <TouchableOpacity style={s.searchBtn} onPress={onSearchPress} disabled={searching}>
              {searching
                ? <ActivityIndicator color="white" size="small" />
                : <Text style={s.searchBtnText}>🔍</Text>}
            </TouchableOpacity>
          </View>

          <Text style={s.popularLabel}>Popular Stores</Text>
          <View style={s.chips}>
            {POPULAR_STORES.map(name => (
              <TouchableOpacity key={name} style={s.chip} onPress={() => onChipPress(name)}>
                <Text style={s.chipText}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* How it works */}
        <View style={s.card}>
          <Text style={s.cardTitle}>How it works</Text>
          <Text style={s.cardBody}>
            Search any store → see which credit card gives you the best rewards there.
            No login required. Data from public card terms.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#eef2ff' },
  scroll:        { padding: 16, paddingBottom: 40 },

  header:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, marginTop: 8 },
  headerIconWrap:{ backgroundColor: '#4f46e5', borderRadius: 12, padding: 10 },
  headerIcon:    { fontSize: 22 },
  headerTitle:   { fontSize: 26, fontWeight: '800', color: '#4f46e5' },
  headerSub:     { fontSize: 13, color: '#6b7280', marginTop: 2 },

  searchBox:     { backgroundColor: 'white', borderRadius: 20, padding: 16, marginBottom: 16,
                   shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  inputRow:      { flexDirection: 'row', gap: 8, marginBottom: 14 },
  input:         { flex: 1, borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 12,
                   paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#1f2937' },
  searchBtn:     { backgroundColor: '#4f46e5', borderRadius: 12, paddingHorizontal: 16,
                   alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { fontSize: 18 },

  popularLabel:  { fontSize: 13, color: '#6b7280', fontWeight: '500', marginBottom: 8 },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { backgroundColor: '#eef2ff', borderRadius: 999, paddingHorizontal: 14,
                   paddingVertical: 7, borderWidth: 1, borderColor: '#c7d2fe' },
  chipText:      { color: '#4338ca', fontSize: 13, fontWeight: '500' },

  card:          { backgroundColor: 'white', borderRadius: 20, padding: 16,
                   shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  cardTitle:     { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 6 },
  cardBody:      { fontSize: 14, color: '#6b7280', lineHeight: 22 },
});
