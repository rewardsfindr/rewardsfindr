// ─────────────────────────────────────────────
// RESULTS SCREEN
// Layout: hero best-choice card + ranked list of all cards.
// Params: storeName (string), offers (JSON string)
// ─────────────────────────────────────────────
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadow } from '../shared/theme.js';

const CHASE_OFFERS_URL = 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub';
const CHASE_APP_URL   = 'chase://offers';

const BANK_COLORS = {
  chase:       '#1a3a6b',
  amex:        '#007ac1',
  capital_one: '#c0392b',
  citi:        '#003b8e',
  discover:    '#e65c00',
  wells_fargo: '#c0392b',
  bofa:        '#e31837',
  bilt:        '#1a1a1a',
};

const formatReward = (amount, type) => {
  if (!amount) return 'Offer';
  return type === 'percent' ? `${amount}%` : `$${amount}`;
};

const formatRewardLabel = (amount, type) => {
  if (!amount) return 'available';
  return type === 'percent' ? 'back' : 'cash back';
};

const formatDesc = (offer) => {
  if (!offer.cashbackAmount) return offer.offerDescription || 'Offer available';
  const pct = offer.cashbackType === 'percent'
    ? `${offer.cashbackAmount}% cash back`
    : `$${offer.cashbackAmount} cash back`;
  return offer.offerDescription || `${pct} on ${offer.merchantName || 'purchases'}`;
};

const bankLabel = (bank) => {
  if (!bank) return '';
  const map = {
    chase: 'CHASE', amex: 'AMEX', capital_one: 'CAPITAL ONE',
    citi: 'CITI', discover: 'DISCOVER', wells_fargo: 'WELLS FARGO',
    bofa: 'BOFA', bilt: 'BILT',
  };
  return map[bank] || bank.toUpperCase();
};

const maxReward = (offers) =>
  Math.max(...offers.map(o => parseFloat(o.cashbackAmount) || 0), 1);

// Opens Chase app if installed, falls back to browser
const openChaseOffer = (offer) => {
  const deepLink = offer.offerDeepLink || null;
  if (deepLink) {
    Linking.openURL(deepLink).catch(() =>
      Linking.openURL(CHASE_APP_URL).catch(() =>
        Linking.openURL(CHASE_OFFERS_URL)
      )
    );
  } else {
    Linking.openURL(CHASE_APP_URL).catch(() =>
      Linking.openURL(CHASE_OFFERS_URL)
    );
  }
};

export default function ResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { storeName, offers, notFound } = useLocalSearchParams();

  const myOffers = offers ? JSON.parse(offers) : [];
  const sorted = [...myOffers].sort(
    (a, b) => (parseFloat(b.cashbackAmount) || 0) - (parseFloat(a.cashbackAmount) || 0)
  );
  const best = sorted[0];
  const hasOffers = sorted.length > 0;

  const displayName = (hasOffers && best?.merchantName) ? best.merchantName : (storeName || notFound);

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity style={s.backRow} onPress={() => router.back()}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Back</Text>
        </TouchableOpacity>

        <Text style={s.storeTitle}>{displayName}</Text>
        <Text style={s.storeSub}>
          {notFound
            ? 'No offers found — try syncing your cards'
            : 'Best cards ranked by rewards'}
        </Text>

        {!hasOffers && (
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>
              No offers found. Sync your Chase or Amex cards from the home screen to see personalized results.
            </Text>
          </View>
        )}

        {hasOffers && (
          <>
            {/* Hero: Best Choice */}
            <View style={s.heroCard}>
              <View style={s.heroTop}>
                <View style={s.heroLeft}>
                  <Text style={s.bestChoiceLabel}>BEST CHOICE</Text>
                  <Text style={s.heroCardName}>{best.cardName}</Text>
                  <Text style={s.heroDesc}>{formatDesc(best)}</Text>
                </View>
                <View style={s.heroRight}>
                  <Text style={s.heroRewardPct}>{formatReward(best.cashbackAmount, best.cashbackType)}</Text>
                  <Text style={s.heroRewardLabel}>Rewards</Text>
                </View>
              </View>
              <View style={s.heroBottom}>
                <View style={[s.bankPill, { backgroundColor: BANK_COLORS[best.bank] || colors.primary }]}>
                  <Text style={s.bankPillText}>{bankLabel(best.bank)}</Text>
                </View>
                {best.cardLast4 && <Text style={s.heroLast4}>•• {best.cardLast4}</Text>}
                {best.isActivated === true ? (
                  <View style={s.heroActivatedBadge}>
                    <Text style={s.heroActivatedText}>✓ ACTIVATED</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={s.heroActivateBtn} onPress={() => openChaseOffer(best)}>
                    <Text style={s.heroActivateBtnText}>⚡ Activate</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* All Your Cards */}
            <Text style={s.allCardsLabel}>ALL YOUR CARDS</Text>

            {sorted.map((offer, idx) => {
              const isActivated = offer.isActivated === true;
              return (
                <View
                  key={offer.offerId || idx}
                  style={s.rankCard}
                >
                  <View style={s.rankRow}>
                    <Text style={s.rankNum}>{idx + 1}</Text>
                    <View style={s.rankInfo}>
                      <View style={s.rankNameRow}>
                        <Text style={s.rankCardName}>{offer.cardName}</Text>
                        {idx === 0 && (
                          <View style={s.topBadge}>
                            <Text style={s.topBadgeText}>TOP</Text>
                          </View>
                        )}
                        {isActivated && (
                          <View style={s.activatedBadge}>
                            <Text style={s.activatedBadgeText}>✓ ACTIVATED</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.rankDesc}>{formatDesc(offer)}</Text>
                      <View style={s.rankMeta}>
                        <View style={[s.bankPillSm, { backgroundColor: BANK_COLORS[offer.bank] || colors.primary }]}>
                          <Text style={s.bankPillSmText}>{bankLabel(offer.bank)}</Text>
                        </View>
                        {offer.cardLast4 && (
                          <Text style={s.rankLast4}>•• {offer.cardLast4}</Text>
                        )}
                      </View>
                      {!isActivated && (
                        <TouchableOpacity
                          style={s.activateBtn}
                          onPress={() => openChaseOffer(offer)}
                          activeOpacity={0.8}
                        >
                          <Text style={s.activateBtnText}>⚡ Tap to Activate on Chase</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={s.rankReward}>
                      <Text style={s.rankRewardPct}>{formatReward(offer.cashbackAmount, offer.cashbackType)}</Text>
                      <Text style={s.rankRewardLabel}>{formatRewardLabel(offer.cashbackAmount, offer.cashbackType)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: colors.bgPage },
  scroll:           { padding: 16, paddingBottom: 48 },

  backRow:          { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backArrow:        { fontSize: 18, color: colors.textPrimary, marginRight: 6 },
  backLabel:        { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },

  storeTitle:       { fontSize: 28, fontWeight: '900', color: colors.textPrimary, marginBottom: 2 },
  storeSub:         { fontSize: 13, color: colors.textMuted, marginBottom: 20 },

  emptyBox:         { backgroundColor: colors.bgCard, borderRadius: radii.lg, padding: 24,
                      alignItems: 'center', ...shadow.sm },
  emptyText:        { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  heroCard:         { backgroundColor: colors.bgHeader, borderRadius: radii.xl,
                      padding: 20, marginBottom: 24, ...shadow.md },
  heroTop:          { flexDirection: 'row', justifyContent: 'space-between',
                      alignItems: 'flex-start', marginBottom: 16 },
  heroLeft:         { flex: 1, marginRight: 12 },
  bestChoiceLabel:  { fontSize: 10, fontWeight: '800', color: colors.textOnDarkSub,
                      letterSpacing: 1.2, marginBottom: 6 },
  heroCardName:     { fontSize: 20, fontWeight: '900', color: colors.textOnDark, marginBottom: 4 },
  heroDesc:         { fontSize: 13, color: colors.textOnDarkSub, lineHeight: 18 },
  heroRight:        { alignItems: 'flex-end' },
  heroRewardPct:    { fontSize: 36, fontWeight: '900', color: colors.primaryLight, lineHeight: 40 },
  heroRewardLabel:  { fontSize: 12, color: colors.textOnDarkSub, fontWeight: '600' },
  heroBottom:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroLast4:        { fontSize: 13, color: colors.textOnDarkSub, flex: 1 },
  heroActivateBtn:  { borderRadius: radii.sm, backgroundColor: colors.primaryLight,
                      paddingHorizontal: 12, paddingVertical: 6 },
  heroActivateBtnText: { fontSize: 12, fontWeight: '800', color: colors.bgHeader },
  heroActivatedBadge:  { borderRadius: radii.sm, backgroundColor: '#2ecc71',
                         paddingHorizontal: 10, paddingVertical: 6 },
  heroActivatedText:   { fontSize: 12, fontWeight: '800', color: '#fff' },

  bankPill:         { borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 4 },
  bankPillText:     { fontSize: 10, fontWeight: '800', color: '#fff' },
  bankPillSm:       { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  bankPillSmText:   { fontSize: 9, fontWeight: '800', color: '#fff' },

  allCardsLabel:    { fontSize: 11, fontWeight: '800', color: colors.textMuted,
                      letterSpacing: 1, marginBottom: 12 },
  rankCard:         { backgroundColor: colors.bgCard, borderRadius: radii.lg,
                      padding: 16, marginBottom: 10, ...shadow.sm },
  rankRow:          { flexDirection: 'row', alignItems: 'flex-start' },
  rankNum:          { fontSize: 16, fontWeight: '900', color: colors.textMuted,
                      width: 24, marginTop: 2 },
  rankInfo:         { flex: 1, marginRight: 8 },
  rankNameRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' },
  rankCardName:     { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  topBadge:         { backgroundColor: colors.primaryLight, borderRadius: radii.sm,
                      paddingHorizontal: 7, paddingVertical: 2 },
  topBadgeText:     { fontSize: 10, fontWeight: '900', color: '#fff' },
  activatedBadge:   { backgroundColor: '#2ecc71', borderRadius: radii.sm,
                      paddingHorizontal: 7, paddingVertical: 2 },
  activatedBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  rankDesc:         { fontSize: 12, color: colors.textMuted, marginBottom: 6, lineHeight: 16 },
  rankMeta:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  rankLast4:        { fontSize: 12, color: colors.textMuted },
  rankReward:       { alignItems: 'flex-end', minWidth: 48 },
  rankRewardPct:    { fontSize: 22, fontWeight: '900', color: colors.textPrimary, lineHeight: 26 },
  rankRewardLabel:  { fontSize: 11, color: colors.textMuted },

  activateBtn:      { backgroundColor: '#f0a500', borderRadius: radii.sm,
                      paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  activateBtnText:  { fontSize: 11, fontWeight: '800', color: '#fff' },
});
