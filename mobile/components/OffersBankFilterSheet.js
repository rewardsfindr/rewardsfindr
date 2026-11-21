// Multi-select bank filter sheet for Offers (live-apply).
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../shared/theme.js';
import { bankChipLabel } from '../lib/offerFilters.js';

export default function OffersBankFilterSheet({
  visible,
  bankIds = [],
  selectedBanks = [],
  onToggle,
  onClear,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const selected = new Set(selectedBanks);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Dismiss bank filter" />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>Filter by bank</Text>
            <TouchableOpacity
              onPress={onClear}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Clear bank filter"
            >
              <Text style={s.clear}>Clear</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.subtitle}>Pick one bank or several. Empty = all banks.</Text>
          <ScrollView style={s.list} bounces={false}>
            {bankIds.length === 0 ? (
              <Text style={s.empty}>No banks in your saved offers yet.</Text>
            ) : (
              bankIds.map((id) => {
                const checked = selected.has(id);
                return (
                  <TouchableOpacity
                    key={id}
                    style={[s.row, checked && s.rowChecked]}
                    onPress={() => onToggle?.(id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={bankChipLabel(id)}
                  >
                    <View style={[s.box, checked && s.boxChecked]}>
                      {checked ? (
                        <Ionicons name="checkmark" size={12} color={colors.textOnDark} />
                      ) : null}
                    </View>
                    <Text style={s.rowLabel}>{bankChipLabel(id)}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
          <TouchableOpacity
            style={s.done}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={s.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(26, 58, 26, 0.55)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    maxHeight: '70%',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  clear: { fontSize: 13, fontWeight: '600', color: colors.primary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 4, marginBottom: 10 },
  list: { maxHeight: 280 },
  empty: { fontSize: 13, color: colors.textMuted, paddingVertical: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPage,
    marginBottom: 6,
  },
  rowChecked: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.successBg,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  done: {
    marginTop: 12,
    backgroundColor: colors.bgHeader,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: { color: colors.textOnDark, fontWeight: '700', fontSize: 14 },
});
