// ─────────────────────────────────────────────
// HOME HEADER
// Dark green bar with title + profile avatar.
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
      <Text style={s.logoText}>RewardsFindr</Text>
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
  logoText:   { fontSize: 20, fontWeight: '800', color: colors.textOnDark },
  avatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.textOnDark },
  avatarIcon: { fontSize: 18 },
});
