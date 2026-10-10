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
  | 'scanner'
  | 'store'
  | 'admin-store';

const ROLE_TABS: Record<GymGoRole, TabName[]> = {
  Cliente: ['index', 'routines', 'billing'],
  Coach: ['index', 'routines', 'directory'],
  Admin: ['index', 'inventory', 'directory', 'admin-store'],
};

const TAB_META: Record<TabName, { title: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  index: { title: 'Inicio', icon: 'home' },
  access: { title: 'Acceso QR', icon: 'qr-code-2' },
  routines: { title: 'Rutinas', icon: 'fitness-center' },
  inventory: { title: 'Inventario', icon: 'inventory-2' },
  maintenance: { title: 'Mantenim.', icon: 'build' },
  billing: { title: 'Membresía', icon: 'credit-card' },
  directory: { title: 'Usuarios', icon: 'groups' },
  staff: { title: 'Personal', icon: 'person-add' },
  scanner: { title: 'Escáner', icon: 'qr-code-scanner' },
  store: { title: 'Tienda', icon: 'storefront' },
  'admin-store': { title: 'Comercio', icon: 'local-offer' },
};

const TAB_NAMES = Object.keys(TAB_META) as TabName[];

const SECONDARY_SCREENS = ['routine-create', 'clients', 'profile', 'plans', 'client-workout-detail', 'client-billing'];

const HIDDEN_OPTIONS = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' } } as const;
const CLIENT_DETAIL_OPTIONS = { href: null } as const;

export default function AppTabs() {
  const { user } = useAuth();
  const isClient = user?.role === 'Cliente';
  const isCoach = user?.role === 'Coach';
  const allowed = user ? ROLE_TABS[user.role] : [];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isClient || isCoach ? '#9BFF63' : palette.green,
        tabBarInactiveTintColor: isClient || isCoach ? '#84938A' : palette.muted,
        tabBarLabelStyle: { fontSize: 10 },
        tabBarStyle: {
          backgroundColor: isClient || isCoach ? '#070B09' : palette.surface,
          borderTopColor: isClient || isCoach ? '#27342E' : palette.line,
          height: 62,
          paddingTop: 6,
          paddingBottom: 6,
        },
        sceneStyle: { backgroundColor: isClient || isCoach ? '#070B09' : palette.paper },
      }}>
      {TAB_NAMES.map((name) => {
        const { title, icon } = TAB_META[name];
        const visible = allowed.includes(name);
        const label = name === 'directory' && user?.role === 'Coach'
          ? 'Clientes'
          : name === 'billing' && isClient
            ? 'Perfil'
            : name === 'billing' && user?.role === 'Admin'
              ? 'Pagos'
              : title;

        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: label,
              ...(visible ? {} : HIDDEN_OPTIONS),
              tabBarIcon: ({ color }) => <MaterialIcons name={icon} size={24} color={color} />,
            }}
          />
        );
      })}
      {SECONDARY_SCREENS.map((name) => (
        <Tabs.Screen key={name} name={name} options={name === 'client-workout-detail' ? CLIENT_DETAIL_OPTIONS : HIDDEN_OPTIONS} />
      ))}
    </Tabs>
  );
}
