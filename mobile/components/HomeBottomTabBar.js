// ─────────────────────────────────────────────
// HOME BOTTOM TAB BAR
// Custom 5-slot bar on Home / Offers / History / Account.
// Cards → Coming soon. Real tabs → router.replace.
// ─────────────────────────────────────────────
import React from 'react';
import { View, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../shared/theme.js';
import {
  HOME_TAB_SLOTS,
  HOME_TAB_COMING_SOON_MESSAGE,
  selectedHomeTabIndex,
  isPlaceholderTab,
  routeForTabIndex,
} from './homeLayout.js';

export default function HomeBottomTabBar({
  selectedIndex = selectedHomeTabIndex(),
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const onPress = (index) => {
    if (isPlaceholderTab(index)) {
      Alert.alert(HOME_TAB_COMING_SOON_MESSAGE);
      return;
    }
    if (index === selectedIndex) return;
    const path = routeForTabIndex(index);
    if (path) router.replace(path);
  };

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {HOME_TAB_SLOTS.map((slot, index) => {
        const selected = index === selectedIndex;
        return (
          <TouchableOpacity
            key={slot.id}
            style={s.slot}
            onPress={() => onPress(index)}
            accessibilityRole="button"
            accessibilityLabel={slot.label}
            accessibilityState={{ selected }}
          >
            <Ionicons
              name={selected ? slot.icon : slot.iconOutline}
              size={26}
              color={selected ? colors.primaryLight : colors.textOnDarkSub}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgFooter,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)',
          paddingTop: 10 },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
});
