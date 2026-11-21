// ─────────────────────────────────────────────
// BANK GRID (Home)
// Linked banks from syncedBanks + trailing Sync Bank.
// Unsupported / unlinked banks are not shown here.
//
// Staleness logic (based on lastSyncedAt):
//   < 7 days  → green  ✓  (fresh)
//   7–14 days → yellow !  (stale)
//   > 14 days → red    ✗  (expired)
// ─────────────────────────────────────────────
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radii, shadow } from '../shared/theme.js';
import BankLogoIcon from './BankLogoIcon.js';
import { visibleHomeBanks, canAddMoreBanks } from './homeBanks.js';

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

export default function BankGrid({
  syncedBanks = {},
  syncingBank = null,
  onSyncPress,
  onSyncBankPress,
}) {
  const banks = visibleHomeBanks(syncedBanks);
  const showSyncBank = canAddMoreBanks(syncedBanks);

  return (
    <View style={s.wrap}>
      <View style={s.grid}>
        {banks.map((bank) => {
          const syncData = syncedBanks[bank.id];
          const status   = getSyncStatus(syncData);
          const syncing  = syncingBank === bank.id;
          const cardCount = getCardCount(syncData);
          const badge = status ? BADGE[status] : null;

          return (
            <TouchableOpacity
              key={bank.id}
              style={[s.cell, syncing && s.cellDisabled]}
              onPress={() => !syncing && onSyncPress(bank.id)}
              disabled={syncing}
              activeOpacity={syncing ? 1 : 0.7}
              accessibilityLabel={`Sync ${bank.label}`}
            >
              <View style={s.iconWrap}>
                <BankLogoIcon bankId={bank.id} size={44} />
                {badge && !syncing && (
                  <View style={[s.badgeDot, { backgroundColor: badge.bg }]}>
                    <Text style={[s.badgeText, { color: badge.fg }]}>{badge.symbol}</Text>
                  </View>
                )}
              </View>
              <Text style={s.bankName} numberOfLines={2}>
                {bank.label}
              </Text>
              {syncing
                ? <ActivityIndicator size="small" color={colors.primaryLight} style={s.spinner} />
                : cardCount > 0
                  ? <Text style={[s.syncedLabel, status === 'stale' && s.staleLabel, status === 'expired' && s.expiredLabel]}>
                      {cardCount} card{cardCount !== 1 ? 's' : ''}
                    </Text>
                  : <Text style={s.addLabel}>+ Add</Text>}
            </TouchableOpacity>
          );
        })}

        {showSyncBank ? (
          <TouchableOpacity
            style={[s.cell, s.syncBankCell]}
            onPress={onSyncBankPress}
            activeOpacity={0.7}
            accessibilityLabel="Sync Bank"
            accessibilityRole="button"
          >
            <View style={s.syncBankIcon}>
              <Text style={s.syncBankPlus}>+</Text>
            </View>
            <Text style={s.bankName} numberOfLines={2}>Sync Bank</Text>
            <Text style={s.syncBankMeta}>+ Add</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:            { paddingHorizontal: 16, paddingBottom: 16 },
  grid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell:            { width: '22%', alignItems: 'center', backgroundColor: colors.bgCard,
                     borderRadius: radii.lg, paddingVertical: 12, paddingHorizontal: 4,
                     borderWidth: 1, borderColor: colors.border,
                     ...shadow.sm },
  syncBankCell:    { borderColor: colors.primaryLight },
  cellDisabled:    { opacity: 0.45 },
  iconWrap:        { marginBottom: 6, position: 'relative' },
  badgeDot:        { position: 'absolute', bottom: -2, right: -2,
                     width: 16, height: 16, borderRadius: 8,
                     alignItems: 'center', justifyContent: 'center' },
  badgeText:       { fontSize: 9, fontWeight: '800' },
  bankName:        { fontSize: 11, fontWeight: '600', color: colors.textPrimary,
                     textAlign: 'center', marginBottom: 2 },
  syncedLabel:     { fontSize: 10, color: '#22c55e', fontWeight: '600' },
  staleLabel:      { color: '#eab308' },
  expiredLabel:    { color: '#ef4444' },
  addLabel:        { fontSize: 10, color: colors.textMuted },
  syncBankIcon:    {
    width: 44, height: 44, borderRadius: 10, marginBottom: 6,
    backgroundColor: colors.bgPage, alignItems: 'center', justifyContent: 'center',
  },
  syncBankPlus:    { fontSize: 22, fontWeight: '700', color: colors.primaryLight, lineHeight: 26 },
  syncBankMeta:    { fontSize: 10, color: colors.primaryLight, fontWeight: '600' },
  spinner:         { marginTop: 2 },
});
