// ─────────────────────────────────────────────
// EXAMPLE REWARDS
// Hardcoded sample cards showing what the app
// can do. Clearly labelled as examples.
// ─────────────────────────────────────────────
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, shadow } from '../shared/theme.js';
import { EXAMPLE_REWARDS } from '../shared/constants.js';

const BANK_COLORS = {
  AMEX:          '#007ac1',
  'Capital One': '#c0392b',
  CHASE:         '#1a3a6b',
};

export default function ExampleRewards() {
  return (
    <View style={s.wrap}>
      <Text style={s.label}>EXAMPLE REWARDS</Text>
      {EXAMPLE_REWARDS.map((item, i) => (
        <View key={i} style={s.row}>
          <View style={s.rowLeft}>
            <View style={s.badge}>
              <Text style={s.badgeText}>{item.reward}</Text>
            </View>
            <Text style={s.atText}> at {item.store}</Text>
          </View>
          <View style={s.rowRight}>
            <Text style={s.cardInfo}>{item.cardName} •• {item.last4}</Text>
            <View style={[s.bankBadge, { backgroundColor: BANK_COLORS[item.bank] || colors.primary }]}>
              <Text style={s.bankText}>{item.bank}</Text>
            </View>
          </View>
        </View>
      ))}
      <Text style={s.disclaimer}>* Example data — sync your cards to see real offers</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       { paddingHorizontal: 16, paddingBottom: 8 },
  label:      { fontSize: 11, fontWeight: '700', color: colors.textMuted,
                letterSpacing: 0.8, marginBottom: 10 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: colors.bgCard, borderRadius: radii.md,
                paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, ...shadow.sm },
  rowLeft:    { flexDirection: 'row', alignItems: 'center', flex: 1 },
  badge:      { backgroundColor: '#e8f5e9', borderRadius: radii.sm,
                paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:  { fontSize: 12, fontWeight: '700', color: colors.primaryLight },
  atText:     { fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  rowRight:   { alignItems: 'flex-end', gap: 4 },
  cardInfo:   { fontSize: 11, color: colors.textMuted },
  bankBadge:  { borderRadius: radii.sm, paddingHorizontal: 7, paddingVertical: 3 },
  bankText:   { fontSize: 10, fontWeight: '800', color: '#fff' },
  disclaimer: { fontSize: 10, color: colors.textMuted, marginTop: 4, fontStyle: 'italic' },
});
