// ─────────────────────────────────────────────
// BANK PICKER SHEET
// Opaque white bottom sheet of supported banks
// not yet on Home. Select → existing SyncWebView.
// ─────────────────────────────────────────────
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii } from '../shared/theme.js';
import { pickerBanks } from './homeBanks.js';
import BankLogoIcon from './BankLogoIcon.js';

export default function BankPickerSheet({
  visible,
  syncedBanks = {},
  onSelect,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const banks = pickerBanks(syncedBanks);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close bank picker" />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>Choose a bank</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={s.close}>Close</Text>
            </TouchableOpacity>
          </View>
          {banks.map((bank, index) => (
            <View key={bank.id}>
              {index > 0 ? <View style={s.divider} /> : null}
              <TouchableOpacity
                style={s.row}
                onPress={() => onSelect(bank.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Sync ${bank.label}`}
              >
                <BankLogoIcon bankId={bank.id} size={32} />
                <Text style={s.rowLabel}>{bank.label}</Text>
                <Text style={s.rowAction}>Sync</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(26, 58, 26, 0.55)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radii.full,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  title:   { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  close:   { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.bgCard,
  },
  rowLabel:  { flex: 1, fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  rowAction: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
});
