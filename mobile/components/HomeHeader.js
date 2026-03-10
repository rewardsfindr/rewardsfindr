// ─────────────────────────────────────────────
// HOME HEADER
// Dark green bar with logo + profile avatar.
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
    <View style={[s.header, { paddingTop: insets.top + 10 }]}>
      <View style={s.logoRow}>
        <Text style={s.logoIcon}>💳</Text>
        <Text style={s.logoText}>RewardsFindr</Text>
      </View>
      <TouchableOpacity style={s.avatar} onPress={onAvatarPress}>
        {initials
          ? <Text style={s.avatarText}>{initials}</Text>
          : <Text style={s.avatarIcon}>👤</Text>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: colors.bgHeader, paddingHorizontal: 16, paddingBottom: 14 },
  logoRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon:   { fontSize: 22 },
  logoText:   { fontSize: 20, fontWeight: '800', color: colors.textOnDark },
  avatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.textOnDark },
  avatarIcon: { fontSize: 18 },
});
