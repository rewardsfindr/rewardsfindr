import { Stack } from 'expo-router';
import { colors } from '../../shared/theme.js';

export default function AccountLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgPage },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="support" />
    </Stack>
  );
}
