// ─────────────────────────────────────────────
// RESULTS SCREEN
// Shows personalized offers synced from the user's cards.
// Params: storeName (string), offers (JSON string)
// ─────────────────────────────────────────────
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';

const formatCashback = (amount, type) => {
  if (!amount) return 'Offer available';
  return type === 'percent' ? `${amount}% back` : `$${amount} cash back`;
};

const formatPurchaseType = (type) => {
  if (!type) return null;
  if (type === 'both') return '💻🏪 Online & In-Store';
  if (type === 'online') return '💻 Online only';
  if (type === 'in-store') return '🏪 In-store only';
  return null;
};

const CHASE_OFFERS_URL = 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub';

export default function ResultsScreen() {
  const router = useRouter();
  const { storeName, offers, notFound } = useLocalSearchParams();

  const myOffers = offers ? JSON.parse(offers) : [];
  const hasOffers = myOffers.length > 0;

  const handleActivate = (offer) => {
    const url = offer.offerDeepLink || CHASE_OFFERS_URL;
    Linking.openURL(url).catch(() =>
      Linking.openURL(CHASE_OFFERS_URL)
    );
  };

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
            <View style={s.resultsHeader}>
              <Text style={s.resultsTitle}>Your offers for {storeName}</Text>
            </View>

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

                    {/* Top row: merchant + cashback */}
                    <View style={s.offerCardTop}>
                      <View style={s.offerCardInfo}>
                        <Text style={s.merchantName}>{offer.merchantName}</Text>
                        <Text style={s.cardName}>{offer.cardName}</Text>
                        <Text style={s.bankName}>{offer.bank?.toUpperCase()}</Text>
                      </View>
                      <View style={s.rewardBadge}>
                        <Text style={s.rewardAmount}>
                          {formatCashback(offer.cashbackAmount, offer.cashbackType)}
                        </Text>
                        {/* Activation status badge */}
                        <View style={[s.statusBadge, offer.isActivated ? s.statusActive : s.statusInactive]}>
                          <Text style={s.statusText}>
                            {offer.isActivated ? '✓ Activated' : '⚡ Not activated'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Details row */}
                    <View style={s.detailsRow}>
                      {offer.minimumSpend > 0 && (
                        <View style={s.pill}>
                          <Text style={s.pillText}>💰 Min ${offer.minimumSpend}</Text>
                        </View>
                      )}
                      {offer.expiryDate && (
                        <View style={s.pill}>
                          <Text style={s.pillText}>📅 Expires {offer.expiryDate}</Text>
                        </View>
                      )}
                      {formatPurchaseType(offer.purchaseType) && (
                        <View style={s.pill}>
                          <Text style={s.pillText}>{formatPurchaseType(offer.purchaseType)}</Text>
                        </View>
                      )}
                    </View>

                    {/* Activate button — only shown if not activated */}
                    {!offer.isActivated && offer.bank === 'chase' && (
                      <TouchableOpacity
                        style={s.activateBtn}
                        onPress={() => handleActivate(offer)}
                      >
                        <Text style={s.activateBtnText}>⚡ Activate on Chase →</Text>
                      </TouchableOpacity>
                    )}

                  </View>
                ))}
              </View>
            )}

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
  safe:            { flex: 1, backgroundColor: '#eef2ff' },
  scroll:          { padding: 16, paddingBottom: 40 },

  notFoundBox:     { backgroundColor: 'white', borderRadius: 20, padding: 24,
                     alignItems: 'center', marginBottom: 16,
                     shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  notFoundIcon:    { fontSize: 40, marginBottom: 8 },
  notFoundTitle:   { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  notFoundSub:     { fontSize: 14, color: '#6b7280', textAlign: 'center' },

  resultsHeader:   { backgroundColor: '#4f46e5', borderRadius: 20, padding: 20, marginBottom: 16 },
  resultsTitle:    { fontSize: 20, fontWeight: '800', color: 'white' },

  section:         { marginBottom: 16 },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle:    { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 10 },
  sectionBadge:    { backgroundColor: '#d1fae5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  sectionBadgeText:{ fontSize: 11, color: '#065f46', fontWeight: '600' },

  offerCard:       { backgroundColor: 'white', borderRadius: 16, padding: 16,
                     marginBottom: 10, borderWidth: 2, borderColor: '#6ee7b7',
                     shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  offerCardTop:    { flexDirection: 'row', justifyContent: 'space-between',
                     alignItems: 'flex-start', marginBottom: 10 },
  offerCardInfo:   { flex: 1 },
  merchantName:    { fontSize: 16, fontWeight: '800', color: '#1f2937' },
  cardName:        { fontSize: 13, fontWeight: '600', color: '#4f46e5', marginTop: 2 },
  bankName:        { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  rewardBadge:     { alignItems: 'flex-end', marginLeft: 12 },
  rewardAmount:    { fontSize: 18, fontWeight: '800', color: '#059669' },

  statusBadge:     { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  statusActive:    { backgroundColor: '#d1fae5' },
  statusInactive:  { backgroundColor: '#fef3c7' },
  statusText:      { fontSize: 10, fontWeight: '700', color: '#374151' },

  detailsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill:            { backgroundColor: '#f3f4f6', borderRadius: 999,
                     paddingHorizontal: 10, paddingVertical: 4 },
  pillText:        { fontSize: 12, color: '#374151', fontWeight: '500' },

  activateBtn:     { marginTop: 12, backgroundColor: '#fffbeb', borderRadius: 10,
                     paddingVertical: 10, paddingHorizontal: 14,
                     borderWidth: 1, borderColor: '#fcd34d', alignItems: 'center' },
  activateBtnText: { fontSize: 13, fontWeight: '700', color: '#92400e' },

  emptyBox:        { backgroundColor: 'white', borderRadius: 16, padding: 20,
                     alignItems: 'center', marginBottom: 16 },
  emptyText:       { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22 },

  backBtn:         { backgroundColor: 'white', borderRadius: 14, padding: 14,
                     alignItems: 'center', marginTop: 8,
                     shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  backBtnText:     { color: '#4f46e5', fontWeight: '600', fontSize: 15 },
});
