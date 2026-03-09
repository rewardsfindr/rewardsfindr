// ─────────────────────────────────────────────
// RESULTS SCREEN
// Shows personalized offers synced from the user's cards.
// Params: storeName (string), offers (JSON string)
// ─────────────────────────────────────────────
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';

const formatCashback = (amount, type) => {
  if (!amount) return 'Offer available';
  return type === 'percent' ? `${amount}% back` : `$${amount} cash back`;
};

export default function ResultsScreen() {
  const router = useRouter();
  const { storeName, offers, notFound } = useLocalSearchParams();

  const myOffers = offers ? JSON.parse(offers) : [];
  const hasOffers = myOffers.length > 0;

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
              No offers found for "{notFound}". Try syncing your cards first or search a different store.
            </Text>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
              <Text style={s.backBtnText}>Try another store</Text>
            </TouchableOpacity>
          </View>
        )}

        {!notFound && (
          <>
            {/* Results header */}
            <View style={s.resultsHeader}>
              <Text style={s.resultsTitle}>Your offers for {storeName}</Text>
            </View>

            {/* Personalized offers */}
            {hasOffers && (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>✨ Your Synced Cards</Text>
                  <View style={s.sectionBadge}>
                    <Text style={s.sectionBadgeText}>From your wallet</Text>
                  </View>
                </View>
                {myOffers.map((offer, idx) => (
                  <View key={`${offer.offerId || idx}`} style={s.offerCard}>
                    <View style={s.offerCardTop}>
                      <View style={s.offerCardInfo}>
                        <Text style={s.offerCardName}>{offer.cardName}</Text>
                        <Text style={s.offerCardBank}>{offer.bank?.toUpperCase()}</Text>
                      </View>
                      <View style={s.offerCardReward}>
                        <Text style={s.rewardAmount}>
                          {formatCashback(offer.cashbackAmount, offer.cashbackType)}
                        </Text>
                      </View>
                    </View>
                    {offer.offerDescription ? (
                      <Text style={s.offerDesc}>{offer.offerDescription}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {/* No offers */}
            {!hasOffers && (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>
                  No offers found. Sync your Chase or Amex cards from the home screen to see personalized results.
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
  safe:              { flex: 1, backgroundColor: '#eef2ff' },
  scroll:            { padding: 16, paddingBottom: 40 },

  notFoundBox:       { backgroundColor: 'white', borderRadius: 20, padding: 24,
                       alignItems: 'center', marginBottom: 16,
                       shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  notFoundIcon:      { fontSize: 40, marginBottom: 8 },
  notFoundTitle:     { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  notFoundSub:       { fontSize: 14, color: '#6b7280', textAlign: 'center' },

  resultsHeader:     { backgroundColor: '#4f46e5', borderRadius: 20, padding: 20, marginBottom: 16 },
  resultsTitle:      { fontSize: 20, fontWeight: '800', color: 'white' },

  section:           { marginBottom: 16 },
  sectionHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle:      { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 10 },
  sectionBadge:      { backgroundColor: '#d1fae5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  sectionBadgeText:  { fontSize: 11, color: '#065f46', fontWeight: '600' },

  offerCard:         { backgroundColor: 'white', borderRadius: 16, padding: 16,
                       marginBottom: 10, borderWidth: 2, borderColor: '#6ee7b7',
                       shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  offerCardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  offerCardInfo:     { flex: 1 },
  offerCardName:     { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  offerCardBank:     { fontSize: 12, color: '#6b7280', marginTop: 2 },
  offerCardReward:   { alignItems: 'flex-end', marginLeft: 12 },
  rewardAmount:      { fontSize: 18, fontWeight: '800', color: '#059669' },
  offerDesc:         { fontSize: 13, color: '#6b7280', marginTop: 8 },

  emptyBox:          { backgroundColor: 'white', borderRadius: 16, padding: 20,
                       alignItems: 'center', marginBottom: 16 },
  emptyText:         { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22 },

  backBtn:           { backgroundColor: 'white', borderRadius: 14, padding: 14,
                       alignItems: 'center', marginTop: 8,
                       shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  backBtnText:       { color: '#4f46e5', fontWeight: '600', fontSize: 15 },
});
