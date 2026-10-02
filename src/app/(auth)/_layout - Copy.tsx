import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/features/gymgo/auth-context';

export default function AuthLayout() {
  const { user } = useAuth();
  if (user) return <Redirect href="/(main)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}