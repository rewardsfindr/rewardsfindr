// Horizontal filter chip strip for the Offers screen.
import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, radii } from '../shared/theme.js';

export default function OffersFilterChips({ chips, selectedKey, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
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
  );
}

const s = StyleSheet.create({
  row: { paddingHorizontal: 12, gap: 6, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  chipActive: {
    backgroundColor: colors.bgHeader,
  },
  chipIdle: {
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: colors.textOnDark },
  chipTextIdle: { color: colors.textSecondary },
});
