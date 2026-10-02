import { Stack } from 'expo-router';

import { palette } from '@/features/gymgo/theme';

export default function DirectoryLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper } }} />;
}