// ─────────────────────────────────────────────
// OFFERS TAB — on-device catalog with category + bank chips
// ─────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { loadOffers, searchStoredOffers } from '../lib/offerStore.js';
import { resultsRouteParams, formatOfferExpiry } from '../lib/savedOffers.js';
import { BANK_COLORS, bankLabel } from '../lib/resultsBankDisplay.js';
import {
  OFFER_CATEGORY_CHIPS,
  banksPresentInOffers,
  bankChipLabel,
  filterOffersForChips,
  sortOffersForList,
  formatOfferReward,
} from '../lib/offerFilters.js';
import OffersFilterChips from '../components/OffersFilterChips.js';
import HomeBottomTabBar from '../components/HomeBottomTabBar.js';
import { OFFERS_TAB_INDEX } from '../components/homeLayout.js';
import { colors, radii } from '../shared/theme.js';

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = getAuthInstance().currentUser;

  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [bank, setBank] = useState('all');

  const refresh = useCallback(async () => {
    if (!user?.uid) {
      setOffers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await loadOffers(user.uid);
      setOffers(Array.isArray(rows) ? rows : []);
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    // If selected bank disappears after a refresh, reset that axis.
    if (bank === 'all') return;
    const present = banksPresentInOffers(offers);
    if (!present.includes(bank)) setBank('all');
  }, [offers, bank]);

  const bankChips = useMemo(() => {
    const present = banksPresentInOffers(offers);
    return [
      { key: 'all', label: 'All' },
      ...present.map((id) => ({ key: id, label: bankChipLabel(id) })),
    ];
  }, [offers]);

  const filtered = useMemo(
    () => sortOffersForList(filterOffersForChips(offers, { category, bank })),
    [offers, category, bank]
  );

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
            } catch {
              Alert.alert('Error', 'Could not sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  const openOffer = async (offer) => {
    const query = String(offer?.merchantName || '').trim();
    if (!query || !user?.uid) return;
    try {
      const hits = await searchStoredOffers(user.uid, query);
      router.push(resultsRouteParams(query, hits));
    } catch (err) {
      Alert.alert('Search Error', err.message || 'Could not open offer.');
    }
  };

  const emptyCatalog = !loading && offers.length === 0;
  const emptyFilters = !loading && offers.length > 0 && filtered.length === 0;

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Offers</Text>
        <Text style={s.subtitle}>All offers saved on this phone</Text>
      </View>

      <View style={s.chipsBlock}>
        <OffersFilterChips
          chips={OFFER_CATEGORY_CHIPS}
          selectedKey={category}
          onSelect={setCategory}
        />
        <OffersFilterChips
          chips={bankChips}
          selectedKey={bank}
          onSelect={setBank}
        />
      </View>

      <View style={s.listWrap}>
        {loading ? (
          <ActivityIndicator style={s.loader} color={colors.primary} />
        ) : emptyCatalog ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No offers yet</Text>
            <Text style={s.emptyBody}>Sync a bank from Home to see offers here.</Text>
            <TouchableOpacity onPress={() => router.replace('/')} accessibilityRole="button">
              <Text style={s.emptyCta}>Go to Home</Text>
            </TouchableOpacity>
          </View>
        ) : emptyFilters ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No matches</Text>
            <Text style={s.emptyBody}>Try another category or bank.</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => item.id || `${item.bank}-${item.merchantName}-${index}`}
            contentContainerStyle={s.listContent}
            renderItem={({ item }) => {
              const expiry = formatOfferExpiry(item);
              return (
                <TouchableOpacity
                  style={s.row}
                  onPress={() => openOffer(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.merchantName} offer`}
                >
                  <View style={s.rowMain}>
                    <Text style={s.merchant} numberOfLines={1}>{item.merchantName}</Text>
                    {!!item.cardName && (
                      <Text style={s.cardName} numberOfLines={1}>{item.cardName}</Text>
                    )}
                    {!!expiry && (
                      <Text style={s.expiry} numberOfLines={1}>{expiry}</Text>
                    )}
                  </View>
                  <View style={s.rowRight}>
                    <Text style={s.reward}>
                      {formatOfferReward(item.cashbackAmount, item.cashbackType)}
                    </Text>
                    <View style={[s.bankPill, { backgroundColor: BANK_COLORS[item.bank] || colors.primary }]}>
                      <Text style={s.bankPillText}>{bankLabel(item.bank)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      <HomeBottomTabBar selectedIndex={OFFERS_TAB_INDEX} onAccountPress={handleAccountPress} />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgHeader },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, backgroundColor: colors.bgHeader },
  title: { color: colors.textOnDark, fontSize: 18, fontWeight: '700' },
  subtitle: { color: colors.textOnDarkSub, fontSize: 12, marginTop: 2 },
  chipsBlock: { backgroundColor: colors.bgHeader, paddingBottom: 4 },
  listWrap: { flex: 1, backgroundColor: colors.bgPage },
  listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 },
  loader: { marginTop: 48 },
  empty: { marginTop: 48, paddingHorizontal: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  emptyCta: { marginTop: 16, fontSize: 14, fontWeight: '600', color: colors.primary },
  row: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowMain: { flex: 1, minWidth: 0 },
  merchant: { fontWeight: '700', fontSize: 15, color: colors.textPrimary },
  cardName: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  expiry: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  reward: { fontWeight: '800', fontSize: 16, color: colors.bgHeader },
  bankPill: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  bankPillText: { fontSize: 10, fontWeight: '700', color: '#fff' },
});
