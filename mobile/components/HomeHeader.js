// ─────────────────────────────────────────────
// HOME HEADER
// Slim dark top bar with profile avatar only (no wordmark).
// Uses useSafeAreaInsets to sit below the status bar.
// Avatar shows user initials if signed in.
// ─────────────────────────────────────────────
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../shared/theme.js';

const getInitials = (user) => {
  if (!user) return null;
  if (user.displayName) {
    return user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
  return user.email?.[0]?.toUpperCase() || '?';
};

export default function HomeHeader({ user, onAvatarPress }) {
  const insets = useSafeAreaInsets();
  const initials = getInitials(user);

  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      <View style={s.spacer} />
      <TouchableOpacity
        style={s.avatar}
        onPress={onAvatarPress}
        accessibilityRole="button"
        accessibilityLabel="Account"
      >
        {initials
          ? <Text style={s.avatarText}>{initials}</Text>
          : <Text style={s.avatarIcon}>👤</Text>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
                backgroundColor: colors.bgHeader, paddingHorizontal: 16, paddingBottom: 10 },
  spacer:     { flex: 1 },
  avatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.textOnDark },
  avatarIcon: { fontSize: 18 },
});
