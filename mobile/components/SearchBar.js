// ─────────────────────────────────────────────
// SEARCH BAR
// Search input for store names.
// ─────────────────────────────────────────────
import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { colors, radii, shadow } from '../shared/theme.js';

export default function SearchBar({ value, onChange, onSubmit, isSearching, error }) {
  return (
    <View style={s.wrap}>
      <Text style={s.subtitle}>Use the right card, every time.</Text>

      <View style={s.inputRow}>
        <Text style={s.inputIcon}>🔍</Text>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          placeholder="Enter a store name..."
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <TouchableOpacity style={s.searchBtn} onPress={onSubmit} disabled={isSearching}>
          {isSearching
            ? <ActivityIndicator color={colors.textOnDark} size="small" />
            : <Text style={s.searchBtnText}>Search</Text>}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>⚠️ {error}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:         { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  subtitle:     { fontSize: 14, color: colors.textSecondary, marginBottom: 12, textAlign: 'center' },
  inputRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard,
                  borderRadius: radii.full, paddingHorizontal: 14, paddingVertical: 4,
                  marginBottom: 12, ...shadow.sm },
  inputIcon:    { fontSize: 16, marginRight: 6 },
  input:        { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 10 },
  searchBtn:    { backgroundColor: colors.primary, borderRadius: radii.full,
                  paddingHorizontal: 14, paddingVertical: 8 },
  searchBtnText:{ color: colors.textOnDark, fontWeight: '700', fontSize: 13 },
  errorBox:     { backgroundColor: colors.errorBg, borderRadius: radii.sm,
                  padding: 10, marginBottom: 10 },
  errorText:    { color: colors.error, fontSize: 13 },
});
