import { Redirect } from 'expo-router';

import { useAuth } from '@/features/gymgo/auth-context';
import AppTabs from '@/components/app-tabs';

export default function MainLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/(auth)/login" />;

  return <AppTabs />;
}