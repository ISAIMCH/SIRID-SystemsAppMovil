import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { useAuth } from '@/features/gymgo/auth-context';
import { palette } from '@/features/gymgo/theme';

export default function AppTabs() {
  const { user } = useAuth();
  const isClient = user?.role === 'Cliente';
  const isAdmin = user?.role === 'Admin';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.green,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.line,
          height: 62,
          paddingTop: 6,
          paddingBottom: 6,
        },
        sceneStyle: { backgroundColor: palette.paper },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="access"
        options={{
          title: 'Acceso QR',
          href: isClient ? undefined : null,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'qrcode', android: 'qr_code_2', web: 'qr_code_2' }} tintColor={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="routines"
        options={{
          title: 'Rutinas',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'dumbbell.fill', android: 'fitness_center', web: 'fitness_center' }} tintColor={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clientes',
          href: isClient || isAdmin ? null : undefined,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'person.2.fill', android: 'group', web: 'group' }} tintColor={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="staff"
        options={{
          title: 'Personal',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }} tintColor={color} size={22} />
          ),
        }}
      />
    </Tabs>
  );
}
