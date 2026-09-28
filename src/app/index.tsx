import { Redirect } from 'expo-router';
import { useAuth } from '@/features/gymgo/auth-context';

export default function HomeScreen() {
  const { user } = useAuth();
  return <Redirect href={user ? '/(main)' : '/(auth)/login'} />;
}
