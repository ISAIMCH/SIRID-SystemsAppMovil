import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text as RNText, View } from 'react-native';

import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  FadeIn,
  IconTile,
  ListGroup,
  ListRow,
  PressableScale,
  ProgressBar,
  Screen,
  SectionHeader,
  Skeleton,
  StatTile,
  Text,
  type IconName,
  type Tone,
} from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import ClientHomeScreen from './client-home-screen';
import FloorHomeScreen from './floor-home-screen';
import GymSwitcher from './gym-switcher';
import { routineEditorHref } from './routine-links';
import { usePendingStaffInvitations } from './staff-invitation-notifier';
import type { Routine } from './types';
import { useMaintenanceAlerts } from './use-maintenance-alerts';

type OperationsDashboard = {
  period: 'day' | 'week';
  today: { checkIns: number; checkOuts: number };
  currentOccupancy: number;
  dailyAttendance: { date: string; checkIns: number; checkOuts: number }[];
  hourlyDemand: { hour: number; checkIns: number }[];
  peakHour: { hour: number; checkIns: number } | null;
  equipmentByZone: { zone: string; total: number; available: number; busy: number; outOfService: number }[];
};

export default function DashboardScreen() {
  const { user } = useAuth();
  if (user?.role === 'Cliente') return <ClientHomeScreen />;
  if (user?.role === 'Admin' || user?.role === 'Recepcion') return <FloorHomeScreen />;
  return <CoachHome />;
}

const weekdayShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

function clientName(routine: Routine) {
  return typeof routine.assignedTo === 'object' && routine.assignedTo ? routine.assignedTo.name : 'Cliente';
}

function clientId(routine: Routine) {
  return typeof routine.assignedTo === 'object' && routine.assignedTo ? routine.assignedTo._id : routine.assignedTo;
}

function CoachHome() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const pendingInvitations = usePendingStaffInvitations();
  const maintenanceAlerts = useMaintenanceAlerts(true);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [routineError, setRoutineError] = useState('');
  const [operations, setOperations] = useState<OperationsDashboard | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    setRoutineError('');
    api.get<{ routines: Routine[] }>('/routines')
      .then((response) => {
        if (isCurrent) setRoutines(response.data.routines);
      })
      .catch((error: unknown) => {
        if (isCurrent) setRoutineError(getApiErrorMessage(error, 'No se pudieron cargar tus rutinas.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  // reloadKey is the pull-to-refresh / retry trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]));

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    setSummaryError('');
    api.get<OperationsDashboard>('/analytics/dashboard', { params: { period: 'week' } })
      .then((response) => {
        if (isCurrent) setOperations(response.data);
      })
      .catch((error: unknown) => {
        if (isCurrent) setSummaryError(getApiErrorMessage(error, 'No se pudieron cargar las estadísticas.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoadingSummary(false);
      });
    return () => { isCurrent = false; };
  // reloadKey is the pull-to-refresh / retry trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]));

  const activeRoutines = routines.filter((routine) => routine.status === 'active');
  const clientsWithRoutine = new Set(routines.map(clientId)).size;
  const recentRoutines = [...routines].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const demand = (operations?.hourlyDemand ?? []).filter((entry) => entry.hour >= 6 && entry.hour <= 23);
  const demandMax = Math.max(1, ...demand.map((entry) => entry.checkIns));
  const hasDemand = demand.some((entry) => entry.checkIns > 0);
  const attendance = operations?.dailyAttendance ?? [];
  const attendanceMax = Math.max(1, ...attendance.map((day) => day.checkIns));
  const firstName = user?.name?.split(' ')[0] ?? 'coach';
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen onRefresh={() => setReloadKey((value) => value + 1)} refreshing={false}>
      <FadeIn style={styles.header}>
        <Text variant="caption" tone="secondary">{today.charAt(0).toUpperCase() + today.slice(1)}</Text>
        <Text variant="display" accessibilityRole="header">Hola, {firstName}</Text>
        <GymSwitcher />
      </FadeIn>

      {pendingInvitations > 0 ? (
        <Card onPress={() => router.push('/staff-invitations' as Href)} style={styles.inlineCard}>
          <IconTile name="badge" tone="info" />
          <Text variant="bodyStrong" style={styles.flex}>
            {pendingInvitations === 1 ? 'Tienes 1 invitación al staff' : `Tienes ${pendingInvitations} invitaciones al staff`}
          </Text>
          <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
        </Card>
      ) : null}

      <FadeIn index={1} style={styles.grid}>
        <StatTile icon="login" label="Entradas hoy" value={operations?.today.checkIns ?? '—'} loading={isLoadingSummary} style={styles.gridItem} />
        <StatTile icon="groups" tone="info" label="Dentro ahora" value={operations?.currentOccupancy ?? '—'} loading={isLoadingSummary} style={styles.gridItem} />
        <StatTile icon="assignment" tone="success" label="Rutinas activas" value={isLoading ? '—' : activeRoutines.length} loading={isLoading} style={styles.gridItem} onPress={() => router.push('/(main)/routines')} />
        <StatTile icon="person" tone="warning" label="Clientes" value={isLoading ? '—' : clientsWithRoutine} loading={isLoading} style={styles.gridItem} onPress={() => router.push('/directory' as Href)} />
      </FadeIn>

      {summaryError ? <ErrorBanner message={summaryError} onRetry={() => setReloadKey((value) => value + 1)} /> : null}
      {routineError ? <ErrorBanner message={routineError} onRetry={() => setReloadKey((value) => value + 1)} /> : null}

      <FadeIn index={2} style={styles.section}>
        <SectionHeader title="Acciones rápidas" />
        <View style={styles.actions}>
          <QuickAction icon="add-task" label="Nueva rutina" tone="accent" primary onPress={() => router.push(routineEditorHref())} />
          <QuickAction icon="library-add" label="Plantilla base" tone="info" onPress={() => router.push(routineEditorHref({ mode: 'template' }))} />
          <QuickAction icon="groups" label="Mis clientes" tone="success" onPress={() => router.push('/directory' as Href)} />
          <QuickAction
            icon="build"
            label="Mantenimiento"
            tone="danger"
            badge={maintenanceAlerts?.length ?? 0}
            onPress={() => router.push('/(main)/maintenance')}
          />
        </View>
      </FadeIn>

      <FadeIn index={3}>
        <Card variant="raised">
          <View style={styles.chartHead}>
            <View style={styles.flex}>
              <Text variant="label" tone="secondary">Demanda horaria · 7 días</Text>
              {operations?.peakHour ? (
                <View style={styles.peakRow}>
                  <Text variant="metric">{hourLabel(operations.peakHour.hour)}</Text>
                  <Text variant="caption" tone="secondary">hora pico · {operations.peakHour.checkIns} entradas</Text>
                </View>
              ) : null}
            </View>
            {operations ? <Badge tone="neutral">{`${operations.today.checkOuts} salidas hoy`}</Badge> : null}
          </View>
          {isLoadingSummary ? <Skeleton height={120} radius={radius.md} /> : hasDemand ? (
            <View
              style={styles.bars}
              accessible
              accessibilityLabel={`Demanda por hora. Hora pico ${operations?.peakHour ? hourLabel(operations.peakHour.hour) : 'sin datos'}`}>
              {demand.map((entry) => {
                const isPeak = entry.hour === operations?.peakHour?.hour;
                return (
                  <View key={entry.hour} style={styles.barColumn}>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { height: `${Math.max(4, (entry.checkIns / demandMax) * 100)}%`, backgroundColor: isPeak ? colors.accentFill : colors.borderStrong }]} />
                    </View>
                    <RNText style={[styles.barLabel, isPeak && styles.barLabelPeak]}>{entry.hour % 3 === 0 || isPeak ? entry.hour : ''}</RNText>
                  </View>
                );
              })}
            </View>
          ) : (
            <EmptyState icon="schedule" title="Sin datos suficientes" message="Aún no hay entradas para calcular una hora pico." />
          )}
        </Card>
      </FadeIn>

      {attendance.length ? (
        <FadeIn index={4}>
          <Card>
            <Text variant="label" tone="secondary">Asistencia diaria</Text>
            <View style={styles.attendance}>
              {attendance.map((day) => {
                const weekday = weekdayShort[new Date(`${day.date}T12:00:00`).getDay()] ?? day.date.slice(5);
                return (
                  <View key={day.date} style={styles.attendanceColumn} accessible accessibilityLabel={`${weekday}: ${day.checkIns} entradas`}>
                    <RNText style={styles.attendanceValue}>{day.checkIns}</RNText>
                    <View style={styles.attendanceTrack}>
                      <View style={[styles.attendanceBar, { height: `${Math.max(6, (day.checkIns / attendanceMax) * 100)}%` }]} />
                    </View>
                    <RNText style={styles.barLabel}>{weekday}</RNText>
                  </View>
                );
              })}
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {operations?.equipmentByZone.length ? (
        <FadeIn index={5} style={styles.section}>
          <SectionHeader title="Equipos por zona" subtitle="Disponibles ahora" />
          <Card>
            {operations.equipmentByZone.map((zone) => (
              <View key={zone.zone} style={styles.zoneRow}>
                <View style={styles.zoneHead}>
                  <Text variant="bodyStrong" style={styles.flex}>{zone.zone}</Text>
                  <Text variant="caption" tone="secondary">{zone.available}/{zone.total} libres{zone.outOfService ? ` · ${zone.outOfService} fuera de servicio` : ''}</Text>
                </View>
                <ProgressBar value={zone.total ? zone.available / zone.total : 0} height={6} color={zone.available === 0 ? colors.danger : undefined} />
              </View>
            ))}
          </Card>
        </FadeIn>
      ) : null}

      <FadeIn index={6} style={styles.section}>
        <SectionHeader title="Rutinas recientes" action="Ver todas" onAction={() => router.push('/(main)/routines')} />
        {isLoading ? <Skeleton height={140} radius={radius.lg} /> : recentRoutines.length ? (
          <ListGroup>
            {recentRoutines.map((routine, index) => (
              <ListRow
                key={routine._id}
                icon="assignment"
                iconTone={routine.status === 'active' ? 'success' : 'neutral'}
                title={routine.title}
                subtitle={`${clientName(routine)} · ${routine.daysPerWeek} días/sem`}
                trailing={<Badge tone={routine.status === 'active' ? 'success' : 'neutral'}>{routine.status === 'active' ? 'Activa' : 'Pausada'}</Badge>}
                divider={index < recentRoutines.length - 1}
                onPress={() => router.push(routineEditorHref({ routineId: routine._id }))}
              />
            ))}
          </ListGroup>
        ) : (
          <Card variant="sunken">
            <EmptyState icon="assignment" title="Sin rutinas todavía" message="Crea la primera rutina para uno de tus clientes." action="Crear rutina" onAction={() => router.push(routineEditorHref())} />
          </Card>
        )}
      </FadeIn>
    </Screen>
  );
}

function QuickAction({ icon, label, tone, primary = false, badge = 0, onPress }: {
  icon: IconName;
  label: string;
  tone: Tone;
  primary?: boolean;
  badge?: number;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={badge ? `${label}, ${badge} pendientes` : label} style={[styles.action, primary && styles.actionPrimary]}>
      {primary ? (
        <View style={styles.actionPrimaryIcon}><MaterialIcons name={icon} size={22} color={colors.onPrimary} /></View>
      ) : <IconTile name={icon} tone={tone} size={40} />}
      <RNText numberOfLines={2} style={[styles.actionLabel, primary && styles.actionLabelPrimary]}>{label}</RNText>
      {badge ? <View style={styles.actionBadge}><RNText style={styles.actionBadgeText}>{badge}</RNText></View> : null}
    </PressableScale>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1 },
  header: { gap: space.xs },
  section: { gap: space.md },
  inlineCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  gridItem: { flexBasis: '46%', flexGrow: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  action: { flexBasis: '46%', flexGrow: 1, minHeight: 96, justifyContent: 'space-between', gap: space.md, borderRadius: radius.lg, padding: space.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionPrimaryIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,255,133,0.16)' },
  actionLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  actionLabelPrimary: { color: colors.onPrimary },
  actionBadge: { position: 'absolute', top: space.md, right: space.md, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
  actionBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  chartHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  peakRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  bars: { height: 132, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  barColumn: { flex: 1, height: '100%', alignItems: 'center', gap: 4 },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 3 },
  barLabel: { height: 14, color: colors.textSecondary, fontSize: 11 },
  barLabelPeak: { color: colors.accent, fontWeight: '700' },
  attendance: { height: 132, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: space.sm },
  attendanceColumn: { flex: 1, maxWidth: 44, height: '100%', alignItems: 'center', gap: 4 },
  attendanceValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  attendanceTrack: { flex: 1, width: '100%', justifyContent: 'flex-end', borderRadius: radius.xs, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  attendanceBar: { width: '100%', borderRadius: radius.xs, backgroundColor: colors.accentFill },
  zoneRow: { gap: space.sm },
  zoneHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
}));
