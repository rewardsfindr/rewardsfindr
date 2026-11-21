// Category chip strip + optional trailing control (Banks) for Offers.
import React from 'react';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, radii } from '../shared/theme.js';

export default function OffersFilterChips({
  chips,
  selectedKey,
  onSelect,
  trailing = null,
}) {
  return (
    <View style={s.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.scroll}
        contentContainerStyle={s.row}
      >
        {chips.map((chip) => {
          const active = chip.key === selectedKey;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[s.chip, active ? s.chipActive : s.chipIdle]}
              onPress={() => onSelect?.(chip.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={chip.label}
            >
              <Text style={[s.chipText, active ? s.chipTextActive : s.chipTextIdle]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {trailing}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 12,
    paddingBottom: 8,
    gap: 6,
  },
  scroll: { flex: 1, minWidth: 0 },
  row: { gap: 6, alignItems: 'center', paddingRight: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  chipActive: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  chipIdle: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: colors.textPrimary, fontWeight: '700' },
  chipTextIdle: { color: colors.textOnDark },
});
