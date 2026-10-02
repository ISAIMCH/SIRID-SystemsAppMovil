import { MaterialIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { FloatingCard, IconBadge, MetricCard } from './fit-ui';
import { palette } from './theme';
import type { Routine } from './types';
import { Notice, Page } from './ui';

type WorkoutStats = {
  currentStreak: number;
  totalSessions: number;
  completedThisWeek: number;
  totalVolumeKg: number;
};

const membershipLabels = { active: 'Activa', pending: 'Pendiente', suspended: 'Suspendida', expired: 'Vencida' } as const;

const shortcuts: { label: string; icon: keyof typeof MaterialIcons.glyphMap; color: string; href: Href }[] = [
  { label: 'Perfil físico', icon: 'monitor-weight', color: palette.cyan, href: '/(main)/profile' as Href },
  { label: 'Tienda', icon: 'storefront', color: palette.violet, href: '/(main)/store' as Href },
  { label: 'Rutinas', icon: 'fitness-center', color: palette.neon, href: '/(main)/routines' as Href },
  { label: 'Reportar falla', icon: 'build', color: palette.orange, href: '/(main)/maintenance' as Href },
];

export default function ClientHomeScreen() {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [activeRoutines, setActiveRoutines] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    Promise.all([
      api.get<WorkoutStats>('/workouts/me/stats'),
      api.get<{ routines: Routine[] }>('/routines'),
    ])
      .then(([statsResponse, routinesResponse]) => {
        if (!isCurrent) return;
        setStats(statsResponse.data);
        setActiveRoutines(routinesResponse.data.routines.filter((routine) => routine.status === 'active').length);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudieron cargar tus estadísticas.'));
      });
    return () => { isCurrent = false; };
  }, []);

  const membershipStatus = user?.membership?.status ?? 'pending';
  const streak = stats?.currentStreak ?? 0;

  return (
    <Page>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>Hola, {user?.name?.split(' ')[0] ?? 'deportista'}</Text>
          <Text style={styles.subtitle}>{user?.goal ? `Objetivo: ${user.goal}` : 'Hoy es un buen día para entrenar'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sesión" onPress={() => void signOut()}>
          <IconBadge name="logout" color={palette.muted} />
        </Pressable>
      </View>

      <FloatingCard style={styles.streakCard}>
        <View style={styles.streakTop}>
          <IconBadge name="local-fire-department" color={palette.orange} size={52} />
          <View style={styles.membershipChip}>
            <View style={[styles.chipDot, membershipStatus === 'active' && styles.chipDotActive]} />
            <Text style={styles.chipText}>Membresía {membershipLabels[membershipStatus]}</Text>
          </View>
        </View>
        <Text style={styles.streakValue}>{streak}</Text>
        <Text style={styles.streakLabel}>{streak === 1 ? 'día de racha' : 'días de racha'}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/(main)/access')} style={styles.qrButton}>
          <MaterialIcons name="qr-code-2" size={22} color={palette.deepGreen} />
          <Text style={styles.qrButtonText}>Mostrar mi acceso QR</Text>
        </Pressable>
      </FloatingCard>

      {error ? <Notice error>{error}</Notice> : null}

      <View style={styles.row}>
        <MetricCard icon="event-available" color={palette.neon} label="Sesiones esta semana" value={stats?.completedThisWeek ?? '—'} />
        <MetricCard icon="insights" color={palette.cyan} label="Volumen total" value={stats ? `${Math.round(stats.totalVolumeKg)} kg` : '—'} />
      </View>
      <View style={styles.row}>
        <MetricCard icon="assignment" color={palette.violet} label="Rutinas activas" value={activeRoutines ?? '—'} />
        <MetricCard icon="emoji-events" color={palette.orange} label="Sesiones totales" value={stats?.totalSessions ?? '—'} />
      </View>

      <Text style={styles.sectionTitle}>Accesos rápidos</Text>
      <View style={styles.grid}>
        {shortcuts.map((shortcut) => (
          <Pressable
            key={shortcut.label}
            accessibilityRole="button"
            onPress={() => router.push(shortcut.href)}
            style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
            <FloatingCard style={styles.shortcutCard}>
              <IconBadge name={shortcut.icon} color={shortcut.color} />
              <Text style={styles.shortcutLabel}>{shortcut.label}</Text>
            </FloatingCard>
          </Pressable>
        ))}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1, gap: 4 },
  greeting: { color: palette.ink, fontSize: 28, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 14 },
  streakCard: { backgroundColor: '#0F2A24', gap: 4, padding: 22 },
  streakTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  membershipChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF1F', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  chipDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.orange },
  chipDotActive: { backgroundColor: palette.neon },
  chipText: { color: palette.white, fontSize: 12, fontWeight: '700' },
  streakValue: { color: palette.neon, fontSize: 64, lineHeight: 72, fontWeight: '900', marginTop: 8 },
  streakLabel: { color: '#CFE3D8', fontSize: 15, fontWeight: '600' },
  qrButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: palette.neon, borderRadius: 18, minHeight: 50, marginTop: 14 },
  qrButtonText: { color: palette.deepGreen, fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 14 },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  shortcut: { width: '47%', flexGrow: 1 },
  shortcutCard: { gap: 12, alignItems: 'flex-start' },
  shortcutLabel: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
