// ─────────────────────────────────────────────
// FIRST-RUN ONBOARDING CAROUSEL
// 3 value pages → connect-bank soft prompt.
// Skip jumps to connect-bank (not straight to home).
// ─────────────────────────────────────────────
import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Dimensions, ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors, radii, shadow } from '../shared/theme.js';

const { width } = Dimensions.get('window');

const PAGES = [
  {
    key: 'value',
    title: 'Never miss the best reward again',
    body: 'RewardsFindr tracks your bank offers and shows which card to use at any store.',
    visual: 'cards',
  },
  {
    key: 'sync',
    title: 'Sync your bank offers',
    body: 'Securely pull Chase and Amex offers in the app. No manual entry. We never store your bank password.',
    visual: 'banks',
  },
  {
    key: 'search',
    title: 'Search any store',
    body: 'Before you shop, search Target, Amazon, gas, or dining — see your best card in seconds.',
    visual: 'search',
  },
];

function Visual({ type }) {
  if (type === 'cards') {
    return (
      <View style={v.wrap}>
        <View style={[v.card, v.cardBack]} />
        <View style={[v.card, v.cardFront]}>
          <Text style={v.pct}>5%</Text>
          <Text style={v.pctLabel}>cash back</Text>
        </View>
      </View>
    );
  }
  if (type === 'banks') {
    return (
      <View style={v.wrap}>
        <View style={v.bankRow}>
          <View style={[v.bankPill, { backgroundColor: colors.chase }]}>
            <Text style={v.bankText}>Chase</Text>
          </View>
          <View style={[v.bankPill, { backgroundColor: colors.amex }]}>
            <Text style={v.bankText}>Amex</Text>
          </View>
        </View>
        <Text style={v.hint}>Secure offer sync</Text>
      </View>
    );
  }
  return (
    <View style={v.wrap}>
      <View style={v.searchBox}>
        <Text style={v.searchPlaceholder}>Search Target…</Text>
      </View>
      <View style={v.result}>
        <Text style={v.bestLabel}>Best card</Text>
        <Text style={v.bestValue}>Chase Freedom · 5%</Text>
      </View>
    </View>
  );
}

const v = StyleSheet.create({
  wrap: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  card: {
    width: 140,
    height: 88,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    ...shadow.md,
  },
  cardBack: {
    position: 'absolute',
    transform: [{ rotate: '-8deg' }, { translateX: -18 }],
    backgroundColor: colors.primaryLight,
    opacity: 0.85,
  },
  cardFront: {
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '4deg' }],
  },
  pct: { color: colors.textOnDark, fontSize: 28, fontWeight: '900' },
  pctLabel: { color: colors.textOnDarkSub, fontSize: 12, fontWeight: '600' },
  bankRow: { flexDirection: 'row', gap: 12 },
  bankPill: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  bankText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hint: { marginTop: 16, color: colors.textMuted, fontSize: 13 },
  searchBox: {
    width: '100%',
    maxWidth: 260,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...shadow.sm,
  },
  searchPlaceholder: { color: colors.textMuted, fontSize: 15 },
  result: {
    marginTop: 14,
    width: '100%',
    maxWidth: 260,
    backgroundColor: colors.successBg,
    borderRadius: radii.md,
    padding: 14,
  },
  bestLabel: { fontSize: 12, color: colors.successText, fontWeight: '600', marginBottom: 4 },
  bestValue: { fontSize: 16, color: colors.primary, fontWeight: '800' },
});

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollRef = useRef(null);
  const [index, setIndex] = useState(0);

  const goConnect = () => {
    router.replace('/connect-bank');
  };

  const onNext = () => {
    if (index >= PAGES.length - 1) {
      goConnect();
      return;
    }
    const next = index + 1;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  const onScrollEnd = (e) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(page);
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.topBar}>
        <TouchableOpacity onPress={goConnect} accessibilityRole="button">
          <Text style={s.skip}>Skip</Text>
        </TouchableOpacity>
        <View style={s.dots}>
          {PAGES.map((p, i) => (
            <View key={p.key} style={[s.dot, i === index && s.dotActive]} />
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={s.pager}
      >
        {PAGES.map((page) => (
          <View key={page.key} style={[s.page, { width }]}>
            <Visual type={page.visual} />
            <Text style={s.title}>{page.title}</Text>
            <Text style={s.body}>{page.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={s.cta} onPress={onNext} accessibilityRole="button">
          <Text style={s.ctaText}>
            {index >= PAGES.length - 1 ? 'Get started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bgPage },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  skip: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: { backgroundColor: colors.accent, width: 18 },
  pager: { flex: 1 },
  page: {
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    textAlign: 'center',
  },
  footer: { padding: 24, paddingBottom: 16 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
    ...shadow.sm,
  },
  ctaText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
});
