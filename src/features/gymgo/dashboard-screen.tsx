import { router, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import ClientHomeScreen from './client-home-screen';
import ClientQrCard from './client-qr-card';
import { routineEditorHref } from './routine-links';
import { palette } from './theme';
import type { Routine } from './types';
import { ActionButton, AppHeader, Eyebrow, Notice, SectionTitle, Surface } from './ui';

type OperationsDashboard = {
  period: 'day' | 'week';
  today: { checkIns: number; checkOuts: number };
  currentOccupancy: number;
  dailyAttendance: { date: string; checkIns: number; checkOuts: number }[];
  hourlyDemand: { hour: number; checkIns: number }[];
  peakHour: { hour: number; checkIns: number } | null;
  equipmentByZone: { zone: string; total: number; available: number; busy: number; outOfService: number }[];
};

type WorkoutStats = {
  currentStreak: number;
  totalSessions: number;
  completedThisWeek: number;
  totalVolumeKg: number;
  lastWorkoutAt: string | null;
};

export default function DashboardScreen() {
  const { user } = useAuth();
  if (user?.role === 'Cliente') return <ClientHomeScreen />;
  return <StaffDashboard />;
}

function StaffDashboard() {
  const { user } = useAuth();
  const isClient = user?.role === 'Cliente';
  const isAdmin = user?.role === 'Admin';
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [routineError, setRoutineError] = useState('');
  const [operations, setOperations] = useState<OperationsDashboard | null>(null);
  const [workoutStats, setWorkoutStats] = useState<WorkoutStats | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  useEffect(() => {
    let isCurrent = true;
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
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const summaryRequest = isClient
      ? api.get<WorkoutStats>('/workouts/me/stats')
      : api.get<OperationsDashboard>('/analytics/dashboard', { params: { period: 'week' } });

    summaryRequest
      .then((response) => {
        if (!isCurrent) return;
        if (isClient) setWorkoutStats(response.data as WorkoutStats);
        else setOperations(response.data as OperationsDashboard);
      })
      .catch((error: unknown) => {
        if (isCurrent) setSummaryError(getApiErrorMessage(error, 'No se pudieron cargar las estadísticas.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoadingSummary(false);
      });
    return () => { isCurrent = false; };
  }, [isClient]);

  const activeRoutineCount = routines.filter((routine) => routine.status === 'active').length;
  const roleHeading = isClient ? 'Tu semana, a tu ritmo.' : user?.role === 'Admin' ? 'Tu gimnasio, en foco.' : 'Entrena con estrategia.';

  return (
    <>
      <View style={styles.topTint} />
      <View style={styles.page}>
        <AppHeader title={`Hola, ${user?.name?.split(' ')[0] ?? 'deportista'}`} detail={user?.email} />

        <View style={styles.hero}>
          <Eyebrow>{isClient ? 'PLAN PERSONAL' : `${user?.role?.toUpperCase()} · GYMGO`}</Eyebrow>
          <Text style={styles.heroTitle}>{roleHeading}</Text>
          <Text style={styles.heroDetail}>
            {isClient
              ? user?.goal ? `Objetivo: ${user.goal}` : 'Tus rutinas y tu acceso están a un toque.'
              : 'Una vista clara de la actividad y el equipo del gimnasio.'}
          </Text>
          {isAdmin ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir escáner de recepción"
              onPress={() => router.push('/(main)/scanner')}
              style={styles.scannerCta}>
              <SymbolView name={{ ios: 'qrcode', android: 'qr_code_scanner', web: 'qr_code_scanner' }} tintColor={palette.deepGreen} size={22} />
              <Text style={styles.scannerCtaText}>Escáner de recepción</Text>
              <Text style={styles.scannerCtaArrow}>→</Text>
            </Pressable>
          ) : null}
          {isClient ? (
            <Pressable onPress={() => router.push('/(main)/access')} style={styles.qrLink}>
              <Text style={styles.qrLinkText}>Mostrar acceso QR</Text>
              <Text style={styles.arrow}>→</Text>
            </Pressable>
          ) : null}
        </View>

        {isClient ? <ClientQrCard /> : null}

        {isClient ? (
          <View style={styles.metricRow}>
            <Surface style={styles.metric}>
              <Text style={styles.metricLabel}>Rutinas activas</Text>
              <Text style={styles.metricValue}>{isLoading ? '—' : activeRoutineCount}</Text>
            </Surface>
            <Surface style={styles.metric}>
              <Text style={styles.metricLabel}>Membresía</Text>
              <Text style={[styles.metricStatus, user?.membership?.status === 'active' && styles.active]}>
                {user?.membership?.status ?? 'pendiente'}
              </Text>
            </Surface>
            <Surface style={styles.metric}>
              <Text style={styles.metricLabel}>Racha actual</Text>
              <Text style={styles.metricValue}>{isLoadingSummary ? '—' : workoutStats?.currentStreak ?? 0}</Text>
              <Text style={styles.metricHint}>días programados</Text>
            </Surface>
          </View>
        ) : (
          <View style={styles.metricRow}>
            <Surface style={styles.metric}>
              <Text style={styles.metricLabel}>Entradas hoy</Text>
              <Text style={styles.metricValue}>{isLoadingSummary ? '—' : operations?.today.checkIns ?? 0}</Text>
              <Text style={styles.metricHint}>check-in registrados</Text>
            </Surface>
            <Surface style={styles.metric}>
              <Text style={styles.metricLabel}>Dentro ahora</Text>
              <Text style={styles.metricValue}>{isLoadingSummary ? '—' : operations?.currentOccupancy ?? 0}</Text>
              <Text style={styles.metricHint}>clientes presentes</Text>
            </Surface>
          </View>
        )}

        {routineError ? <Notice error>{routineError}</Notice> : null}
        {summaryError ? <Notice error>{summaryError}</Notice> : null}

        {isClient && workoutStats ? (
          <Surface style={styles.progressPanel}>
            <SectionTitle>Progreso de entrenamiento</SectionTitle>
            <View style={styles.progressRow}>
              <View><Text style={styles.progressValue}>{workoutStats.completedThisWeek}</Text><Text style={styles.metricHint}>sesiones esta semana</Text></View>
              <View><Text style={styles.progressValue}>{Math.round(workoutStats.totalVolumeKg)} kg</Text><Text style={styles.metricHint}>volumen acumulado</Text></View>
            </View>
          </Surface>
        ) : null}

        {!isClient && operations ? (
          <Surface style={styles.analyticsPanel}>
            <View style={styles.analyticsHeader}>
              <View style={styles.analyticsHeading}>
                <View style={styles.demandDot} />
                <Text style={styles.demandTitle}>Demanda horaria · 7 días</Text>
              </View>
              <Text style={styles.metricHint}>{operations.today.checkOuts} salidas hoy</Text>
            </View>
            {operations.peakHour ? (
              <Text style={styles.peakLabel}>Hora pico · {String(operations.peakHour.hour).padStart(2, '0')}:00 ({operations.peakHour.checkIns} entradas)</Text>
            ) : <Text style={styles.demandBody}>Aún no hay suficientes entradas para calcular una hora pico.</Text>}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chart}>
              {operations.hourlyDemand.filter((entry) => entry.hour >= 6 && entry.hour <= 23).map((entry) => {
                const maximum = Math.max(1, ...operations.hourlyDemand.map((value) => value.checkIns));
                return (
                  <View key={entry.hour} style={styles.chartColumn}>
                    <Text style={styles.chartCount}>{entry.checkIns || ''}</Text>
                    <View style={[styles.chartBar, { height: Math.max(4, Math.round((entry.checkIns / maximum) * 66)) }]} />
                    <Text style={styles.chartHour}>{String(entry.hour).padStart(2, '0')}</Text>
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.zoneList}>
              {operations.equipmentByZone.map((zone) => (
                <View key={zone.zone} style={styles.zoneRow}>
                  <Text style={styles.zoneName}>{zone.zone}</Text>
                  <Text style={styles.zoneValue}>{zone.available}/{zone.total} disp. · {zone.busy} ocup.</Text>
                </View>
              ))}
              {!operations.equipmentByZone.length ? <Text style={styles.demandBody}>No hay equipos por zona registrados.</Text> : null}
            </View>
          </Surface>
        ) : null}

        <View style={styles.section}>
          <SectionTitle>{isClient ? 'Siguiente paso' : 'Operación del gimnasio'}</SectionTitle>
          {isClient ? (
            <View style={styles.actionStack}>
              <ActionButton onPress={() => router.push('/(main)/routines')}>Ver mis rutinas</ActionButton>
              <ActionButton secondary onPress={() => router.push('/(main)/access')}>Abrir código de acceso</ActionButton>
              <ActionButton secondary onPress={() => router.push('/(main)/billing')}>Pago y membresía</ActionButton>
              <ActionButton secondary onPress={() => router.push('/(main)/maintenance')}>Reportar falla de equipo</ActionButton>
            </View>
          ) : isAdmin ? (
            <View style={styles.actionStack}>
              <ActionButton onPress={() => router.push('/directory' as Href)}>Abrir directorio</ActionButton>
              <ActionButton onPress={() => router.push('/(main)/inventory')}>Inventario / Equipos</ActionButton>
              <ActionButton onPress={() => router.push('/(main)/billing')}>Revisar pagos</ActionButton>
              <ActionButton onPress={() => router.push('/(main)/maintenance')}>Alertas de mantenimiento</ActionButton>
              <ActionButton onPress={() => router.push('/(main)/staff')}>Agregar Coach o Cliente</ActionButton>
              <ActionButton secondary onPress={() => router.push('/(main)/routines')}>Consultar rutinas</ActionButton>
            </View>
          ) : user?.role === 'Coach' ? (
            <View style={styles.actionStack}>
              <ActionButton onPress={() => router.push(routineEditorHref())}>Crear rutina</ActionButton>
              <ActionButton secondary onPress={() => router.push('/directory' as Href)}>Ver directorio</ActionButton>
            </View>
          ) : (
            <View style={styles.actionStack}>
              <ActionButton onPress={() => router.push('/directory' as Href)}>Ver mi directorio</ActionButton>
              <ActionButton onPress={() => router.push('/(main)/inventory')}>Consultar equipos</ActionButton>
              <ActionButton secondary onPress={() => router.push('/(main)/routines')}>Consultar rutinas</ActionButton>
            </View>
          )}
        </View>

        {isLoading ? <ActivityIndicator color={palette.green} /> : null}
        <View style={styles.footerLine}>
          <Text style={styles.footerText}>{user?.role === 'Coach' ? 'COACH CREATOR' : 'GYMGO · MOVIMIENTO CON PROPÓSITO'}</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  topTint: { position: 'absolute', height: 130, left: 0, right: 0, top: 0, backgroundColor: '#E4EAD8' },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 22, gap: 22, paddingBottom: 36 },
  hero: { backgroundColor: palette.deepGreen, borderRadius: 10, minHeight: 205, padding: 22, justifyContent: 'center', gap: 12 },
  heroTitle: { color: palette.white, fontSize: 30, lineHeight: 36, fontWeight: '800', maxWidth: 420 },
  heroDetail: { color: '#DFE8DF', fontSize: 14, lineHeight: 21 },
  scannerCta: { minHeight: 50, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, backgroundColor: palette.lime, paddingHorizontal: 15 },
  scannerCtaText: { color: palette.deepGreen, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  scannerCtaArrow: { color: palette.deepGreen, fontSize: 20, fontWeight: '800' },
  qrLink: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', paddingTop: 4 },
  qrLinkText: { color: palette.lime, fontSize: 14, fontWeight: '800' },
  arrow: { color: palette.lime, fontSize: 20, fontWeight: '700' },
  metricRow: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, minHeight: 118, justifyContent: 'space-between', gap: 12 },
  metricLabel: { color: palette.muted, fontSize: 13, fontWeight: '700' },
  metricValue: { color: palette.ink, fontSize: 29, lineHeight: 32, fontWeight: '800' },
  metricHint: { color: palette.muted, fontSize: 12 },
  metricStatus: { color: palette.coral, fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  active: { color: palette.green },
  section: { gap: 14 },
  actionStack: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  progressPanel: { gap: 14 },
  progressRow: { flexDirection: 'row', gap: 28 },
  progressValue: { color: palette.green, fontSize: 22, fontWeight: '800' },
  analyticsPanel: { gap: 14 },
  analyticsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  analyticsHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  demandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.coral },
  demandTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  demandBody: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  peakLabel: { color: palette.green, fontSize: 13, fontWeight: '800' },
  chart: { alignItems: 'flex-end', gap: 6, paddingTop: 14, paddingBottom: 4 },
  chartColumn: { width: 22, height: 100, justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  chartCount: { height: 12, color: palette.muted, fontSize: 9 },
  chartBar: { width: 12, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: palette.green },
  chartHour: { color: palette.muted, fontSize: 9 },
  zoneList: { gap: 8, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12 },
  zoneRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  zoneName: { color: palette.ink, flex: 1, fontSize: 12, fontWeight: '700' },
  zoneValue: { color: palette.muted, fontSize: 11 },
  footerLine: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12 },
  footerText: { color: palette.muted, fontSize: 10, fontWeight: '800' },
});