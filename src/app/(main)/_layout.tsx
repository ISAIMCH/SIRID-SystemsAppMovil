import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { useAuth } from '@/features/gymgo/auth-context';

export default function MainLayout() {
  const { user, needsGym, activeGym } = useAuth();
  if (!user) return <Redirect href="/(auth)/login" />;
  if (needsGym) return <Redirect href="/join-gym" />;

  // Remounting on a gym change reloads every screen with the new gym's data.
  return <AppTabs key={activeGym?.id ?? 'no-gym'} />;
}
