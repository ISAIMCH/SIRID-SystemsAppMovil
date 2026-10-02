import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useAuth, type GymGoRole } from '@/features/gymgo/auth-context';
import { palette } from '@/features/gymgo/theme';

type TabName =
  | 'index'
  | 'access'
  | 'routines'
  | 'inventory'
  | 'maintenance'
  | 'billing'
  | 'directory'
  | 'staff'
  | 'scanner';

const ROLE_TABS: Record<GymGoRole, TabName[]> = {
  Cliente: ['index', 'access', 'routines', 'billing'],
  Coach: ['index', 'routines', 'directory'],
  Admin: ['index', 'scanner', 'inventory', 'maintenance', 'billing', 'directory', 'staff'],
};

const TAB_META: Record<TabName, { title: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  index: { title: 'Inicio', icon: 'home' },
  access: { title: 'Acceso QR', icon: 'qr-code-2' },
  routines: { title: 'Rutinas', icon: 'fitness-center' },
  inventory: { title: 'Equipos', icon: 'inventory-2' },
  maintenance: { title: 'Mantenim.', icon: 'build' },
  billing: { title: 'Membresía', icon: 'credit-card' },
  directory: { title: 'Directorio', icon: 'groups' },
  staff: { title: 'Personal', icon: 'person-add' },
  scanner: { title: 'Escáner', icon: 'qr-code-scanner' },
};

const TAB_NAMES = Object.keys(TAB_META) as TabName[];

export default function AppTabs() {
  const { user } = useAuth();
  const allowed = user ? ROLE_TABS[user.role] : [];

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
      {TAB_NAMES.map((name) => {
        const { title, icon } = TAB_META[name];
        const visible = allowed.includes(name);
        const label = name === 'billing' && user?.role === 'Admin' ? 'Pagos' : title;

        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: label,
              href: visible ? undefined : null,
              tabBarIcon: ({ color }) => <MaterialIcons name={icon} size={24} color={color} />,
            }}
          />
        );
      })}
      <Tabs.Screen name="routine-create" options={{ href: null }} />
      <Tabs.Screen name="clients" options={{ href: null }} />
    </Tabs>
  );
}
