// ─────────────────────────────────────────────
// Results Screen
// Shows top 3 cards for a matched store
// Receives params: storeName, category, quality, results (JSON)
// ─────────────────────────────────────────────
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { MATCH_QUALITY } from '../shared/offerUtils.js';

const CARD_COLORS = [
  ['#10b981', '#059669'],  // green  — rank 1
  ['#3b82f6', '#4f46e5'],  // blue   — rank 2
  ['#a855f7', '#ec4899'],  // purple — rank 3
];

export default function ResultsScreen() {
  const router = useRouter();
  const { storeName, category, quality, results, notFound } = useLocalSearchParams();

  const cards = results ? JSON.parse(results) : [];
  const categoryLabel = category
    ? category.charAt(0).toUpperCase() + category.slice(1)
    : '';

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: storeName || 'Results' }} />
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Not found */}
        {notFound && (
          <View style={s.notFoundBox}>
            <Text style={s.notFoundIcon}>🔍</Text>
            <Text style={s.notFoundTitle}>Store not found</Text>
            <Text style={s.notFoundSub}>
              We don’t have “{notFound}” yet. Try a different name.
            </Text>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
              <Text style={s.backBtnText}>Try another store</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Match quality banner */}
        {!notFound && quality && quality !== MATCH_QUALITY.EXACT && (
          <View style={s.banner}>
            <Text style={s.bannerText}>
              {quality === MATCH_QUALITY.PARTIAL
                ? `Showing results for “${storeName}”`
                : `Did you mean “${storeName}”?`}
            </Text>
          </View>
        )}

        {/* Results header */}
        {!notFound && (
          <View style={s.resultsHeader}>
            <Text style={s.resultsTitle}>Best Cards for {storeName}</Text>
            {categoryLabel ? (
              <Text style={s.resultsCategory}>Category: {categoryLabel}</Text>
            ) : null}
          </View>
        )}

        {/* Card tiles */}
        {cards.map((card, idx) => {
          const [from, to] = CARD_COLORS[idx] || CARD_COLORS[2];
          return (
            <View key={card.id} style={[s.resultCard, { backgroundColor: from }]}>
              <View style={s.resultCardTop}>
                <View style={s.resultCardInfo}>
                  <Text style={s.resultCardName}>{card.cardName}</Text>
                  <Text style={s.resultCardIssuer}>{card.issuer}</Text>
                </View>
                <View style={s.resultCardRate}>
                  <Text style={s.rateNumber}>{card.rate}%</Text>
                  <Text style={s.rateLabel}>
                    {card.rewardType === 'points' ? 'points back' : 'cash back'}
                  </Text>
                </View>
              </View>
              {card.notes ? (
                <View style={s.notesBox}>
                  <Text style={s.notesText}>{card.notes}</Text>
                </View>
              ) : null}
            </View>
          );
        })}

        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>← Search another store</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: '#eef2ff' },
  scroll:           { padding: 16, paddingBottom: 40 },

  notFoundBox:      { backgroundColor: 'white', borderRadius: 20, padding: 24,
                      alignItems: 'center', marginBottom: 16,
                      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  notFoundIcon:     { fontSize: 40, marginBottom: 8 },
  notFoundTitle:    { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  notFoundSub:      { fontSize: 14, color: '#6b7280', textAlign: 'center' },

  banner:           { backgroundColor: '#fef3c7', borderRadius: 16, padding: 12,
                      marginBottom: 12, borderWidth: 1.5, borderColor: '#fbbf24' },
  bannerText:       { color: '#92400e', fontWeight: '500', fontSize: 14 },

  resultsHeader:    { backgroundColor: '#4f46e5', borderRadius: 20, padding: 20,
                      marginBottom: 16 },
  resultsTitle:     { fontSize: 20, fontWeight: '800', color: 'white', marginBottom: 4 },
  resultsCategory:  { fontSize: 13, color: 'rgba(255,255,255,0.85)' },

  resultCard:       { borderRadius: 16, padding: 16, marginBottom: 12 },
  resultCardTop:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  resultCardInfo:   { flex: 1 },
  resultCardName:   { fontSize: 16, fontWeight: '700', color: 'white', marginBottom: 2 },
  resultCardIssuer: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  resultCardRate:   { alignItems: 'flex-end', marginLeft: 12 },
  rateNumber:       { fontSize: 36, fontWeight: '900', color: 'white', lineHeight: 38 },
  rateLabel:        { fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  notesBox:         { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 10 },
  notesText:        { fontSize: 13, color: 'rgba(255,255,255,0.95)' },

  backBtn:          { backgroundColor: 'white', borderRadius: 14, padding: 14,
                      alignItems: 'center', marginTop: 8,
                      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  backBtnText:      { color: '#4f46e5', fontWeight: '600', fontSize: 15 },
});
