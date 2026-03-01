// ─────────────────────────────────────────────
// RESULTS SCREEN
// Shows two sections:
//   1. ✨ Your Cards — personalized offers synced from extension (top)
//   2. All Card Recommendations — general cards from constants (bottom)
// Params: storeName, category, quality, results (JSON), personalizedOffers (JSON)
// ─────────────────────────────────────────────
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { MATCH_QUALITY } from '../shared/offerUtils.js';

const CARD_COLORS = [
  ['#10b981', '#059669'],
  ['#3b82f6', '#4f46e5'],
  ['#a855f7', '#ec4899'],
];

const formatCashback = (amount, type) => {
  if (!amount) return 'Offer available';
  return type === 'percent' ? `${amount}% back` : `$${amount} cash back`;
};

export default function ResultsScreen() {
  const router = useRouter();
  const { storeName, category, quality, results, personalizedOffers, notFound } = useLocalSearchParams();

  const generalCards = results ? JSON.parse(results) : [];
  const myOffers = personalizedOffers ? JSON.parse(personalizedOffers) : [];
  const categoryLabel = category
    ? category.charAt(0).toUpperCase() + category.slice(1)
    : '';

  const hasPersonalized = myOffers.length > 0;
  const hasGeneral = generalCards.length > 0;

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: storeName || 'Results' }} />
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Not found */}
        {notFound && (
          <View style={s.notFoundBox}>
            <Text style={s.notFoundIcon}>🔍</Text>
            <Text style={s.notFoundTitle}>No results found</Text>
            <Text style={s.notFoundSub}>
              We couldn't find offers for "{notFound}". Try a different name.
            </Text>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
              <Text style={s.backBtnText}>Try another store</Text>
            </TouchableOpacity>
          </View>
        )}

        {!notFound && (
          <>
            {/* Match quality banner */}
            {quality && quality !== MATCH_QUALITY.EXACT && (
              <View style={s.banner}>
                <Text style={s.bannerText}>
                  {quality === MATCH_QUALITY.PARTIAL
                    ? `Showing results for "${storeName}"`
                    : `Did you mean "${storeName}"?`}
                </Text>
              </View>
            )}

            {/* Results header */}
            <View style={s.resultsHeader}>
              <Text style={s.resultsTitle}>Best Cards for {storeName}</Text>
              {categoryLabel ? (
                <Text style={s.resultsCategory}>Category: {categoryLabel}</Text>
              ) : null}
            </View>

            {/* ✨ Personalized offers — from user's synced extension data */}
            {hasPersonalized && (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>✨ Your Synced Cards</Text>
                  <View style={s.sectionBadge}>
                    <Text style={s.sectionBadgeText}>From your wallet</Text>
                  </View>
                </View>
                {myOffers.map((offer, idx) => (
                  <View key={`${offer.offerId || idx}`} style={s.personalizedCard}>
                    <View style={s.personalizedCardTop}>
                      <View style={s.personalizedCardInfo}>
                        <Text style={s.personalizedCardName}>{offer.cardName}</Text>
                        <Text style={s.personalizedCardBank}>{offer.bank?.toUpperCase()}</Text>
                      </View>
                      <View style={s.personalizedCardReward}>
                        <Text style={s.personalizedRewardAmount}>
                          {formatCashback(offer.cashbackAmount, offer.cashbackType)}
                        </Text>
                      </View>
                    </View>
                    {offer.offerDescription ? (
                      <Text style={s.personalizedDesc}>{offer.offerDescription}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {/* General card recommendations */}
            {hasGeneral && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>
                  {hasPersonalized ? 'All Card Recommendations' : 'Card Recommendations'}
                </Text>
                {generalCards.map((card, idx) => {
                  const [from] = CARD_COLORS[idx] || CARD_COLORS[2];
                  return (
                    <View key={card.id || idx} style={[s.resultCard, { backgroundColor: from }]}>
                      <View style={s.resultCardTop}>
                        <View style={s.resultCardInfo}>
                          <Text style={s.resultCardName}>{card.cardName}</Text>
                          <Text style={s.resultCardIssuer}>{card.issuer}</Text>
                        </View>
                        <View style={s.resultCardRate}>
                          <Text style={s.rateNumber}>{card.rate}%</Text>
                          <Text style={s.rateLabel}>
                            {card.rewardType === 'points' ? 'pts back' : 'cash back'}
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
              </View>
            )}

            {/* No offers at all */}
            {!hasPersonalized && !hasGeneral && (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>
                  No offers found. Sync your credit cards using the Chrome extension to see personalized results.
                </Text>
              </View>
            )}
          </>
        )}

        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>← Search another store</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:                  { flex: 1, backgroundColor: '#eef2ff' },
  scroll:                { padding: 16, paddingBottom: 40 },

  notFoundBox:           { backgroundColor: 'white', borderRadius: 20, padding: 24,
                           alignItems: 'center', marginBottom: 16,
                           shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  notFoundIcon:          { fontSize: 40, marginBottom: 8 },
  notFoundTitle:         { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  notFoundSub:           { fontSize: 14, color: '#6b7280', textAlign: 'center' },

  banner:                { backgroundColor: '#fef3c7', borderRadius: 16, padding: 12,
                           marginBottom: 12, borderWidth: 1.5, borderColor: '#fbbf24' },
  bannerText:            { color: '#92400e', fontWeight: '500', fontSize: 14 },

  resultsHeader:         { backgroundColor: '#4f46e5', borderRadius: 20, padding: 20, marginBottom: 16 },
  resultsTitle:          { fontSize: 20, fontWeight: '800', color: 'white', marginBottom: 4 },
  resultsCategory:       { fontSize: 13, color: 'rgba(255,255,255,0.85)' },

  section:               { marginBottom: 16 },
  sectionHeader:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle:          { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 10 },
  sectionBadge:          { backgroundColor: '#d1fae5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  sectionBadgeText:      { fontSize: 11, color: '#065f46', fontWeight: '600' },

  // Personalized offer cards
  personalizedCard:      { backgroundColor: 'white', borderRadius: 16, padding: 16,
                           marginBottom: 10, borderWidth: 2, borderColor: '#6ee7b7',
                           shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  personalizedCardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  personalizedCardInfo:  { flex: 1 },
  personalizedCardName:  { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  personalizedCardBank:  { fontSize: 12, color: '#6b7280', marginTop: 2 },
  personalizedCardReward:{ alignItems: 'flex-end', marginLeft: 12 },
  personalizedRewardAmount: { fontSize: 18, fontWeight: '800', color: '#059669' },
  personalizedDesc:      { fontSize: 13, color: '#6b7280', marginTop: 8 },

  // General card tiles
  resultCard:            { borderRadius: 16, padding: 16, marginBottom: 10 },
  resultCardTop:         { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  resultCardInfo:        { flex: 1 },
  resultCardName:        { fontSize: 16, fontWeight: '700', color: 'white', marginBottom: 2 },
  resultCardIssuer:      { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  resultCardRate:        { alignItems: 'flex-end', marginLeft: 12 },
  rateNumber:            { fontSize: 36, fontWeight: '900', color: 'white', lineHeight: 38 },
  rateLabel:             { fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  notesBox:              { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 10 },
  notesText:             { fontSize: 13, color: 'rgba(255,255,255,0.95)' },

  emptyBox:              { backgroundColor: 'white', borderRadius: 16, padding: 20,
                           alignItems: 'center', marginBottom: 16 },
  emptyText:             { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22 },

  backBtn:               { backgroundColor: 'white', borderRadius: 14, padding: 14,
                           alignItems: 'center', marginTop: 8,
                           shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  backBtnText:           { color: '#4f46e5', fontWeight: '600', fontSize: 15 },
});
