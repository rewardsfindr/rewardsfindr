// ─────────────────────────────────────────────
// HOME BRAND
// Centered logo + RewardsFindr wordmark for the mid-screen cluster.
// ─────────────────────────────────────────────
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '../shared/theme.js';

export default function HomeBrand() {
  return (
    <View style={s.wrap} accessible accessibilityRole="header" accessibilityLabel="RewardsFindr">
      <Image
        source={require('../assets/logo.png')}
        style={s.logo}
        accessible={false}
      />
      <Text style={s.title}>RewardsFindr</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4 },
  logo:  { width: 72, height: 72, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
});
