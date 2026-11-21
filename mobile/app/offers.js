// ─────────────────────────────────────────────
// OFFERS TAB — on-device catalog with category strip + Banks sheet
// Classify once into categoryKey; chip taps only filter.
// ─────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState, startTransition } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAuthInstance } from '../lib/firebaseClient.js';
import { loadOffers, searchStoredOffers } from '../lib/offerStore.js';
import { resultsRouteParams, formatOfferExpiry } from '../lib/savedOffers.js';
import { BANK_COLORS, bankLabel } from '../lib/resultsBankDisplay.js';
import {
  OFFER_CATEGORY_CHIPS,
  banksPresentInOffers,
  enrichOffersWithCategoryKey,
  filterOffersForChips,
  sortOffersForList,
  formatOfferReward,
} from '../lib/offerFilters.js';
import OffersFilterChips from '../components/OffersFilterChips.js';
import OffersBankFilterSheet from '../components/OffersBankFilterSheet.js';
import HomeBottomTabBar from '../components/HomeBottomTabBar.js';
import { OFFERS_TAB_INDEX } from '../components/homeLayout.js';
import { colors, radii } from '../shared/theme.js';

function OfferListRow({ item, onPress }) {
  const expiry = formatOfferExpiry(item);
  return (
    <TouchableOpacity
      style={s.row}
      onPress={() => onPress(item)}
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
}

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = getAuthInstance().currentUser;

  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [selectedBanks, setSelectedBanks] = useState([]);
  const [bankSheetOpen, setBankSheetOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.uid) {
      setEnriched([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await loadOffers(user.uid);
      // Classify once per load — chip taps must not re-run heuristics.
      setEnriched(enrichOffersWithCategoryKey(Array.isArray(rows) ? rows : []));
    } catch {
      setEnriched([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const availableBanks = useMemo(
    () => banksPresentInOffers(enriched),
    [enriched]
  );

  useEffect(() => {
    // Drop bank ids that disappeared after a catalog refresh.
    setSelectedBanks((prev) => {
      if (prev.length === 0) return prev;
      const present = new Set(availableBanks);
      const next = prev.filter((id) => present.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [availableBanks]);

  const filtered = useMemo(
    () => sortOffersForList(filterOffersForChips(enriched, { category, banks: selectedBanks })),
    [enriched, category, selectedBanks]
  );

  const onSelectCategory = (key) => {
    startTransition(() => setCategory(key));
  };

  const toggleBank = (id) => {
    startTransition(() => {
      setSelectedBanks((prev) => (
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      ));
    });
  };

  const clearBanks = () => {
    startTransition(() => setSelectedBanks([]));
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

  const emptyCatalog = !loading && enriched.length === 0;
  const emptyFilters = !loading && enriched.length > 0 && filtered.length === 0;
  const bankCount = selectedBanks.length;
  const banksActive = bankCount > 0;

  const banksTrailing = (
    <TouchableOpacity
      style={[s.banksBtn, banksActive ? s.banksBtnActive : s.banksBtnIdle]}
      onPress={() => setBankSheetOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={banksActive ? `Banks, ${bankCount} selected` : 'Banks'}
    >
      <Ionicons
        name="business-outline"
        size={14}
        color={banksActive ? colors.textPrimary : colors.textOnDark}
      />
      <Text style={[s.banksBtnText, banksActive && s.banksBtnTextActive]}>Banks</Text>
      {banksActive ? (
        <View style={s.badge}>
          <Text style={s.badgeText}>{bankCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

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
          onSelect={onSelectCategory}
          trailing={banksTrailing}
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
            renderItem={({ item }) => <OfferListRow item={item} onPress={openOffer} />}
            initialNumToRender={12}
            windowSize={7}
            maxToRenderPerBatch={12}
            removeClippedSubviews
          />
        )}
      </View>

      <HomeBottomTabBar selectedIndex={OFFERS_TAB_INDEX} />

      <OffersBankFilterSheet
        visible={bankSheetOpen}
        bankIds={availableBanks}
        selectedBanks={selectedBanks}
        onToggle={toggleBank}
        onClear={clearBanks}
        onClose={() => setBankSheetOpen(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgHeader },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, backgroundColor: colors.bgHeader },
  title: { color: colors.textOnDark, fontSize: 18, fontWeight: '700' },
  subtitle: { color: colors.textOnDarkSub, fontSize: 12, marginTop: 2 },
  chipsBlock: { backgroundColor: colors.bgHeader, paddingBottom: 4 },
  banksBtn: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.full,
  },
  banksBtnIdle: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  banksBtnActive: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    paddingRight: 8,
  },
  banksBtnText: { fontSize: 11, fontWeight: '700', color: colors.textOnDark },
  banksBtnTextActive: { color: colors.textPrimary },
  badge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.bgHeader },
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
