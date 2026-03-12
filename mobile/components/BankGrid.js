// ─────────────────────────────────────────────
// BANK GRID
// Shows all supported and coming-soon banks.
// syncingBank: bankId currently being synced (disables that button)
//
// Staleness logic (based on lastSyncedAt):
//   < 7 days  → green  ✓  (fresh)
//   7–14 days → yellow !  (stale)
//   > 14 days → red    ✗  (expired)
// ─────────────────────────────────────────────
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radii, shadow } from '../shared/theme.js';
import { BANK_LIST } from '../shared/constants.js';
import BankLogoIcon from './BankLogoIcon.js';

const SEVEN_DAYS  = 7  * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

function getSyncStatus(syncData) {
  if (!syncData) return null;
  // Support legacy shape (plain number) and new shape ({ cards, lastSyncedAt })
  if (typeof syncData === 'number') return 'fresh';
  const age = Date.now() - syncData.lastSyncedAt;
  if (age < SEVEN_DAYS)    return 'fresh';
  if (age < FOURTEEN_DAYS) return 'stale';
  return 'expired';
}

const BADGE = {
  fresh:   { symbol: '✓', bg: '#22c55e', fg: '#fff' },
  stale:   { symbol: '!', bg: '#eab308', fg: '#fff' },
  expired: { symbol: '✗', bg: '#ef4444', fg: '#fff' },
};

function getCardCount(syncData) {
  if (!syncData) return 0;
  if (typeof syncData === 'number') return syncData;
  return syncData.cards ?? 0;
}

export default function BankGrid({ syncedBanks = {}, syncingBank = null, onSyncPress }) {
  return (
    <View style={s.wrap}>
      <Text style={s.label}>SYNC YOUR BANKS</Text>
      <View style={s.grid}>
        {BANK_LIST.map((bank) => {
          const syncData = syncedBanks[bank.id];
          const status   = getSyncStatus(syncData);
          const syncing  = syncingBank === bank.id;
          const disabled = !bank.supported || syncing;
          const cardCount = getCardCount(syncData);
          const badge = status ? BADGE[status] : null;

          return (
            <TouchableOpacity
              key={bank.id}
              style={[s.cell, disabled && s.cellDisabled]}
              onPress={() => !disabled && onSyncPress(bank.id)}
              disabled={disabled}
              activeOpacity={disabled ? 1 : 0.7}
            >
              <View style={s.iconWrap}>
                <BankLogoIcon bankId={bank.id} size={44} />
                {badge && !syncing && (
                  <View style={[s.badgeDot, { backgroundColor: badge.bg }]}>
                    <Text style={[s.badgeText, { color: badge.fg }]}>{badge.symbol}</Text>
                  </View>
                )}
              </View>
              <Text style={[s.bankName, disabled && s.bankNameDisabled]} numberOfLines={2}>
                {bank.label}
              </Text>
              {syncing
                ? <ActivityIndicator size="small" color={colors.primaryLight} style={s.spinner} />
                : cardCount > 0
                  ? <Text style={[s.syncedLabel, status === 'stale' && s.staleLabel, status === 'expired' && s.expiredLabel]}>
                      {cardCount} card{cardCount !== 1 ? 's' : ''}
                    </Text>
                  : !bank.supported
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
  cellDisabled:    { opacity: 0.45 },
  iconWrap:        { marginBottom: 6, position: 'relative' },
  badgeDot:        { position: 'absolute', bottom: -2, right: -2,
                     width: 16, height: 16, borderRadius: 8,
                     alignItems: 'center', justifyContent: 'center' },
  badgeText:       { fontSize: 9, fontWeight: '800' },
  bankName:        { fontSize: 11, fontWeight: '600', color: colors.textPrimary,
                     textAlign: 'center', marginBottom: 2 },
  bankNameDisabled:{ color: colors.disabled },
  syncedLabel:     { fontSize: 10, color: '#22c55e', fontWeight: '600' },
  staleLabel:      { color: '#eab308' },
  expiredLabel:    { color: '#ef4444' },
  addLabel:        { fontSize: 10, color: colors.textMuted },
  comingSoon:      { fontSize: 9, color: colors.disabled, fontStyle: 'italic' },
  spinner:         { marginTop: 2 },
});
