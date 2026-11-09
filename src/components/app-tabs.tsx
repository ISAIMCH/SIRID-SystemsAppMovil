import { MaterialIcons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import * as Haptics from '@/hooks/haptics';
import { useAuth, type GymGoRole } from '@/features/gymgo/auth-context';
import { routineEditorHref } from '@/features/gymgo/routine-links';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { elevation, motion, radius } from '@/theme/tokens';

type IconName = keyof typeof MaterialIcons.glyphMap;

/** Every route under (main). Order here is irrelevant; ROLE_TABS sets the bar. */
const ALL_SCREENS = [
  'index',
  'access',
  'routines',
  'maintenance',
  'billing',
  'directory',
  'scanner',
  'store',
  'enroll',
  'routine-create',
  'clients',
  'profile',
  'client-workout-detail',
  'client-billing',
  'documents',
  'privacy',
  'settings',
] as const;

type ScreenName = (typeof ALL_SCREENS)[number];
type TabSpec = { name: ScreenName; label: string; icon: IconName; center?: boolean };

/**
 * One navigation grammar for every role: four destinations around a raised
 * center action — the thing that role does most at the gym.
 */
const ROLE_TABS: Record<GymGoRole, TabSpec[]> = {
  Cliente: [
    { name: 'index', label: 'Inicio', icon: 'home-filled' },
    { name: 'routines', label: 'Entrenar', icon: 'fitness-center' },
    { name: 'access', label: 'Acceso', icon: 'qr-code-2', center: true },
    { name: 'client-workout-detail', label: 'Progreso', icon: 'insights' },
    { name: 'billing', label: 'Perfil', icon: 'person' },
  ],
  Coach: [
    { name: 'index', label: 'Inicio', icon: 'home-filled' },
    { name: 'routines', label: 'Rutinas', icon: 'view-list' },
    { name: 'routine-create', label: 'Crear', icon: 'add', center: true },
    { name: 'directory', label: 'Clientes', icon: 'groups' },
    { name: 'settings', label: 'Ajustes', icon: 'settings' },
  ],
  // "Modo piso": the app is for the front desk; catalogs and settings live in the web dashboard.
  Admin: [
    { name: 'index', label: 'Inicio', icon: 'space-dashboard' },
    { name: 'billing', label: 'Caja', icon: 'point-of-sale' },
    { name: 'scanner', label: 'Escanear', icon: 'qr-code-scanner', center: true },
    { name: 'enroll', label: 'Alta', icon: 'person-add-alt-1' },
    { name: 'settings', label: 'Ajustes', icon: 'settings' },
  ],
  Recepcion: [
    { name: 'index', label: 'Inicio', icon: 'space-dashboard' },
    { name: 'billing', label: 'Caja', icon: 'point-of-sale' },
    { name: 'scanner', label: 'Escanear', icon: 'qr-code-scanner', center: true },
    { name: 'enroll', label: 'Alta', icon: 'person-add-alt-1' },
    { name: 'settings', label: 'Ajustes', icon: 'settings' },
  ],
};

const useStyles = makeStyles(({ colors, scheme }) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.tabBar,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    paddingHorizontal: 6,
    ...elevation(colors, scheme, scheme === 'dark' ? 0 : 2),
  },
  item: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 3 },
  pill: { width: 56, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pillBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.pill, backgroundColor: colors.accentSoft },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  labelActive: { color: colors.text, fontWeight: '700' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 56, gap: 3 },
  centerButton: {
    width: 58,
    height: 58,
    marginTop: -22,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: colors.tabBar,
    ...elevation(colors, scheme, 2),
  },
}));

function TabItem({ spec, focused, onPress, onLongPress }: { spec: TabSpec; focused: boolean; onPress: () => void; onLongPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.set(reduceMotion ? (focused ? 1 : 0) : withTiming(focused ? 1 : 0, { duration: motion.base }));
  }, [active, focused, reduceMotion]);

  const pillStyle = useAnimatedStyle(() => ({ opacity: active.value, transform: [{ scaleX: 0.6 + active.value * 0.4 }] }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={spec.label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.item}>
      <View style={styles.pill}>
        <Animated.View style={[styles.pillBg, pillStyle]} />
        <MaterialIcons name={spec.icon} size={24} color={focused ? colors.accent : colors.textSecondary} />
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.label, focused && styles.labelActive]}>{spec.label}</Text>
    </Pressable>
  );
}

function CenterItem({ spec, focused, onPress }: { spec: TabSpec; focused: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={spec.label}
      accessibilityState={{ selected: focused }}
      onPressIn={() => { if (!reduceMotion) scale.set(withSpring(0.9, { damping: 18, stiffness: 400 })); }}
      onPressOut={() => { scale.set(withSpring(1, { damping: 14, stiffness: 300 })); }}
      onPress={onPress}
      style={styles.centerWrap}>
      <Animated.View style={[styles.centerButton, animated]}>
        <MaterialIcons name={spec.icon} size={28} color={colors.onPrimary} />
      </Animated.View>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.label, focused && styles.labelActive]}>{spec.label}</Text>
    </Pressable>
  );
}

function SiridTabBar({ state, emitter, navigateToTab, insets, role }: BottomTabBarProps & { role: GymGoRole }) {
  const styles = useStyles();
  const specs = ROLE_TABS[role];
  const focusedName = state.routes[state.index]?.name;

  return (
    <View accessibilityRole="tablist" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {specs.map((spec) => {
        const route = state.routes.find((candidate) => candidate.name === spec.name);
        if (!route) return null;
        const focused = focusedName === spec.name;
        const onPress = () => {
          void Haptics.selectionAsync();
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (event.defaultPrevented) return;
          // The editor keeps its last params (e.g. a routine being edited); the tab always starts a fresh one.
          if (spec.name === 'routine-create') router.navigate(routineEditorHref());
          else if (!focused) navigateToTab(route.key);
        };
        const onLongPress = () => { emitter.emit({ type: 'tabLongPress', target: route.key }); };
        return spec.center
          ? <CenterItem key={spec.name} spec={spec} focused={focused} onPress={onPress} />
          : <TabItem key={spec.name} spec={spec} focused={focused} onPress={onPress} onLongPress={onLongPress} />;
      })}
    </View>
  );
}

export default function AppTabs() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const role = user?.role ?? 'Cliente';

  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <SiridTabBar {...props} role={role} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        animation: 'fade',
        sceneStyle: { backgroundColor: colors.background },
      }}>
      {ALL_SCREENS.map((name) => (
        <Tabs.Screen key={name} name={name} />
      ))}
    </Tabs>
  );
}
