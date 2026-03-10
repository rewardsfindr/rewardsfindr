// ─────────────────────────────────────────────
// BANK GRID
// Shows all supported and coming-soon banks.
// Tapping a supported bank opens the sync modal.
// Coming-soon banks show a disabled state.
// ─────────────────────────────────────────────
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radii, shadow } from '../shared/theme.js';
import { BANK_LIST } from '../shared/constants.js';

export default function BankGrid({ syncedBanks = {}, onSyncPress }) {
  return (
    <View style={s.wrap}>
      <Text style={s.label}>SYNC YOUR BANKS</Text>
      <View style={s.grid}>
        {BANK_LIST.map((bank) => {
          const synced = syncedBanks[bank.id];
          const disabled = !bank.supported;
          return (
            <TouchableOpacity
              key={bank.id}
              style={[s.cell, disabled && s.cellDisabled]}
              onPress={() => !disabled && onSyncPress(bank.id)}
              disabled={disabled}
              activeOpacity={disabled ? 1 : 0.7}
            >
              <View style={[s.iconWrap, { backgroundColor: disabled ? colors.disabledBg : bank.color }]}>
                <Text style={s.emoji}>{bank.emoji}</Text>
                {synced && <View style={s.checkDot}><Text style={s.checkText}>✓</Text></View>}
              </View>
              <Text style={[s.bankName, disabled && s.bankNameDisabled]}>
                {bank.label}
              </Text>
              {synced
                ? <Text style={s.syncedLabel}>{synced} card{synced !== 1 ? 's' : ''}</Text>
                : disabled
                  ? <Text style={s.comingSoon}>Coming Soon</Text>
                  : <Text style={s.addLabel}>+ Add</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:            { paddingHorizontal: 16, paddingBottom: 16 },
  label:           { fontSize: 11, fontWeight: '700', color: colors.textMuted,
                     letterSpacing: 0.8, marginBottom: 12 },
  grid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell:            { width: '22%', alignItems: 'center', backgroundColor: colors.bgCard,
                     borderRadius: radii.lg, paddingVertical: 12, paddingHorizontal: 4,
                     ...shadow.sm },
  cellDisabled:    { opacity: 0.55 },
  iconWrap:        { width: 48, height: 48, borderRadius: radii.md,
                     alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emoji:           { fontSize: 22 },
  checkDot:        { position: 'absolute', bottom: -2, right: -2,
                     width: 16, height: 16, borderRadius: 8,
                     backgroundColor: colors.primaryLight,
                     alignItems: 'center', justifyContent: 'center' },
  checkText:       { fontSize: 9, color: '#fff', fontWeight: '800' },
  bankName:        { fontSize: 11, fontWeight: '600', color: colors.textPrimary,
                     textAlign: 'center', marginBottom: 2 },
  bankNameDisabled:{ color: colors.disabled },
  syncedLabel:     { fontSize: 10, color: colors.primaryLight, fontWeight: '600' },
  addLabel:        { fontSize: 10, color: colors.textMuted },
  comingSoon:      { fontSize: 9, color: colors.disabled, fontStyle: 'italic' },
});
