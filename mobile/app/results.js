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
import { colors, radii, shadow } from '../shared/theme.js';

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
                        <View style={[s.statusBadge, offer.isActivated ? s.statusActive : s.statusInactive]}>
                          <Text style={s.statusText}>
                            {offer.isActivated ? '✓ Activated' : '⚡ Not activated'}
                          </Text>
                        </View>
                      </View>
                    </View>

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
  safe:            { flex: 1, backgroundColor: colors.bgPage },
  scroll:          { padding: 16, paddingBottom: 40 },

  notFoundBox:     { backgroundColor: colors.bgCard, borderRadius: radii.xl, padding: 24,
                     alignItems: 'center', marginBottom: 16, ...shadow.sm },
  notFoundIcon:    { fontSize: 40, marginBottom: 8 },
  notFoundTitle:   { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  notFoundSub:     { fontSize: 14, color: colors.textMuted, textAlign: 'center' },

  resultsHeader:   { backgroundColor: colors.bgHeader, borderRadius: radii.xl, padding: 20, marginBottom: 16 },
  resultsTitle:    { fontSize: 20, fontWeight: '800', color: colors.textOnDark },

  section:         { marginBottom: 16 },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle:    { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
  sectionBadge:    { backgroundColor: colors.successBg, borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 3 },
  sectionBadgeText:{ fontSize: 11, color: colors.successText, fontWeight: '600' },

  offerCard:       { backgroundColor: colors.bgCard, borderRadius: radii.lg, padding: 16,
                     marginBottom: 10, borderWidth: 2, borderColor: colors.primaryLight,
                     ...shadow.sm },
  offerCardTop:    { flexDirection: 'row', justifyContent: 'space-between',
                     alignItems: 'flex-start', marginBottom: 10 },
  offerCardInfo:   { flex: 1 },
  merchantName:    { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  cardName:        { fontSize: 13, fontWeight: '600', color: colors.primaryLight, marginTop: 2 },
  bankName:        { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  rewardBadge:     { alignItems: 'flex-end', marginLeft: 12 },
  rewardAmount:    { fontSize: 18, fontWeight: '800', color: colors.accent },

  statusBadge:     { borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  statusActive:    { backgroundColor: colors.successBg },
  statusInactive:  { backgroundColor: '#fef3c7' },
  statusText:      { fontSize: 10, fontWeight: '700', color: colors.textSecondary },

  detailsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill:            { backgroundColor: colors.disabledBg, borderRadius: radii.full,
                     paddingHorizontal: 10, paddingVertical: 4 },
  pillText:        { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },

  activateBtn:     { marginTop: 12, backgroundColor: '#fffbeb', borderRadius: radii.sm,
                     paddingVertical: 10, paddingHorizontal: 14,
                     borderWidth: 1, borderColor: '#fcd34d', alignItems: 'center' },
  activateBtnText: { fontSize: 13, fontWeight: '700', color: '#92400e' },

  emptyBox:        { backgroundColor: colors.bgCard, borderRadius: radii.lg, padding: 20,
                     alignItems: 'center', marginBottom: 16 },
  emptyText:       { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  backBtn:         { backgroundColor: colors.bgCard, borderRadius: radii.md, padding: 14,
                     alignItems: 'center', marginTop: 8, ...shadow.sm },
  backBtnText:     { color: colors.primaryLight, fontWeight: '600', fontSize: 15 },
});
