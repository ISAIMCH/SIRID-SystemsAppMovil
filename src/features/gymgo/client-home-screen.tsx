import { MaterialIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import ClientAccessModal from './client-access-modal';
import { FloatingCard } from './fit-ui';

type Period = 'day' | 'week' | 'month';
type Analytics = {
  clientId: string;
  period: Period;
  date: string;
  timezone: string;
  range: { start: string; end: string };
  totals: { sessionCount: number; durationMinutes: number; totalVolumeKg: number; caloriesBurned: number };
  bestLift: { weightKg: number; exerciseName: string; completedAt: string } | null;
  chartData: { label: string; durationMinutes: number; totalVolumeKg: number; caloriesBurned: number }[];
};
type WorkoutStats = { currentStreak: number };

const periods: { value: Period; short: string; label: string; title: string }[] = [
  { value: 'day', short: 'D', label: 'Día', title: 'Hoy' },
  { value: 'week', short: 'S', label: 'Semana', title: 'Esta semana' },
  { value: 'month', short: 'M', label: 'Mes', title: 'Este mes' },
];
const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const dark = {
  background: '#070B09',
  surface: '#111815',
  elevated: '#18211D',
  line: '#27342E',
  muted: '#91A098',
  white: '#F4F8F5',
  green: '#9BFF63',
  cyan: '#55D6D0',
};

function localDateAndTimezone() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { timezone, date: `${values.year}-${values.month}-${values.day}` };
}

function labelForPeriod(label: string, period: Period, index: number) {
  if (period === 'day') return index % 3 === 0 ? label.slice(0, 2) : '';
  if (period === 'week') {
    const weekday = new Date(`${label}T12:00:00Z`).getUTCDay();
    return dayLabels[weekday];
  }
  const day = Number(label.slice(-2));
  return day === 1 || day % 5 === 0 ? String(day) : '';
}

function formatWholeNumber(value: number) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Math.round(value));
}

export default function ClientHomeScreen() {
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('day');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [showAccess, setShowAccess] = useState(false);
  const [workoutStats, setWorkoutStats] = useState<WorkoutStats | null>(null);
  const [isLoadingStreak, setIsLoadingStreak] = useState(true);

  useEffect(() => {
    if (!user?.id) return undefined;
    let isCurrent = true;
    const controller = new AbortController();
    const requestTimer = setTimeout(() => {
      setIsLoading(true);
      setError('');
      const { date, timezone } = localDateAndTimezone();
      api.get<Analytics>(`/analytics/client/${user.id}`, {
        params: { period, date, timezone },
        signal: controller.signal,
      })
        .then((response) => {
          if (isCurrent) setAnalytics(response.data);
        })
        .catch((requestError: unknown) => {
          if (isCurrent && !controller.signal.aborted) {
            setError(getApiErrorMessage(requestError, 'No se pudieron cargar tus estadísticas.'));
          }
        })
        .finally(() => {
          if (isCurrent) setIsLoading(false);
        });
    }, 0);

    return () => {
      isCurrent = false;
      clearTimeout(requestTimer);
      controller.abort();
    };
  }, [period, reloadToken, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let isCurrent = true;
    api.get<WorkoutStats>('/workouts/me/stats')
      .then((response) => {
        if (isCurrent) setWorkoutStats(response.data);
      })
      .catch(() => {
        if (isCurrent) setWorkoutStats(null);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingStreak(false);
      });
    return () => { isCurrent = false; };
  }, [user?.id]);

  const selectedAnalytics = analytics?.period === period ? analytics : null;
  const maximumCalories = Math.max(5, ...(selectedAnalytics?.chartData.map((item) => item.caloriesBurned) ?? [0]));
  const chartMaximum = Math.ceil(maximumCalories / 4 / 25) * 25 || 25;
  const chartData = (selectedAnalytics?.chartData ?? []).map((item, index) => ({
    value: item.caloriesBurned,
    label: labelForPeriod(item.label, period, index),
    frontColor: dark.green,
    topLabelComponent: () => <View />,
  }));
  const chartWidth = Math.min(Math.max(width - 84, 250), 580);
  const periodName = periods.find((item) => item.value === period)?.title ?? 'Hoy';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>GYMGO · CLIENTE</Text>
            <Text style={styles.greeting}>Hola, {user?.name?.split(' ')[0] ?? 'deportista'}</Text>
            <Text style={styles.subtitle}>{periodName} · {selectedAnalytics?.date ?? localDateAndTimezone().date}</Text>
          </View>
        </View>

        <FloatingCard style={styles.streakCard}>
          <MaterialIcons name="local-fire-department" size={30} color="#FF7043" />
          <View style={styles.streakText}>
            <Text style={styles.streakLabel}>Racha actual</Text>
            <Text style={styles.streakValue}>
              {isLoadingStreak ? '—' : `${workoutStats?.currentStreak ?? 0} días seguidos`}
            </Text>
          </View>
        </FloatingCard>

        <View accessibilityRole="tablist" style={styles.segmented}>
          {periods.map((item) => (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: period === item.value }}
              onPress={() => setPeriod(item.value)}
              style={[styles.segment, period === item.value && styles.segmentSelected]}>
              <Text style={[styles.segmentLetter, period === item.value && styles.segmentLetterSelected]}>{item.short}</Text>
              <Text style={[styles.segmentLabel, period === item.value && styles.segmentLabelSelected]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {error ? (
          <Pressable accessibilityRole="button" onPress={() => setReloadToken((value) => value + 1)} style={styles.errorBox}>
            <MaterialIcons name="refresh" size={18} color={dark.green} />
            <Text style={styles.errorText}>{error} · Toca para reintentar</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir detalle de actividad"
          onPress={() => router.push('/(main)/client-workout-detail' as Href)}>
          <View style={styles.calorieCard}>
          <View style={styles.calorieHead}>
            <View>
              <Text style={styles.metricLabel}>CALORÍAS QUEMADAS</Text>
              <Text style={styles.periodCaption}>{periodName}</Text>
            </View>
            <View style={styles.flameIcon}><MaterialIcons name="local-fire-department" size={23} color={dark.green} /></View>
          </View>
          <View style={styles.calorieValueRow}>
            <Text style={styles.calorieValue}>{selectedAnalytics ? formatWholeNumber(selectedAnalytics.totals.caloriesBurned) : '—'}</Text>
            <Text style={styles.calorieUnit}>kcal</Text>
          </View>
          {isLoading ? <ActivityIndicator color={dark.green} style={styles.loadingIndicator} /> : null}
          <View style={styles.chartArea}>
            {selectedAnalytics?.chartData.length ? (
              <BarChart
                key={`${period}-${selectedAnalytics.range.start}`}
                data={chartData}
                width={chartWidth}
                height={166}
                barWidth={period === 'month' ? 6 : period === 'day' ? 8 : 18}
                spacing={period === 'month' ? 4 : period === 'day' ? 4 : 17}
                initialSpacing={8}
                adjustToWidth
                frontColor={dark.green}
                barBorderTopLeftRadius={5}
                barBorderTopRightRadius={5}
                noOfSections={4}
                maxValue={chartMaximum * 4}
                stepValue={chartMaximum}
                yAxisTextStyle={styles.axisText}
                xAxisLabelTextStyle={styles.axisText}
                xAxisColor={dark.line}
                yAxisColor={dark.line}
                rulesColor={dark.line}
                rulesThickness={1}
                hideOrigin
                isAnimated
                animationDuration={350}
                disableScroll
              />
            ) : !isLoading ? (
              <View style={styles.emptyChart}>
                <MaterialIcons name="show-chart" size={26} color={dark.muted} />
                <Text style={styles.emptyChartText}>Aún no hay actividad en este periodo</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.chartFooter}>
            <Text style={styles.chartCaption}>{period === 'day' ? 'HORA DEL DÍA' : 'DÍA DEL PERIODO'}</Text>
            <Text style={styles.chartCaption}>TOTAL {period === 'day' ? 'POR HORA' : 'POR DÍA'}</Text>
          </View>
          </View>
        </Pressable>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryTitleRow}>
              <View style={[styles.summaryIcon, { backgroundColor: '#55D6D01F' }]}><MaterialIcons name="schedule" size={17} color={dark.cyan} /></View>
              <Text style={styles.summaryLabel}>TIEMPO ACTIVO</Text>
            </View>
            <Text style={styles.summaryValue}>{selectedAnalytics ? formatWholeNumber(selectedAnalytics.totals.durationMinutes) : '—'}<Text style={styles.summaryUnit}> min</Text></Text>
          </View>
          <View style={styles.summaryCard}>
            <View style={styles.summaryTitleRow}>
              <View style={[styles.summaryIcon, { backgroundColor: '#9BFF631F' }]}><MaterialIcons name="fitness-center" size={17} color={dark.green} /></View>
              <Text style={styles.summaryLabel}>VOLUMEN</Text>
            </View>
            <Text style={styles.summaryValue}>{selectedAnalytics ? formatWholeNumber(selectedAnalytics.totals.totalVolumeKg) : '—'}<Text style={styles.summaryUnit}> kg</Text></Text>
          </View>
        </View>

        <View style={styles.secondaryCard}>
          <View style={styles.summaryTitleRow}>
            <View style={[styles.summaryIcon, { backgroundColor: '#FFB4541F' }]}><MaterialIcons name="emoji-events" size={17} color="#FFB454" /></View>
            <Text style={styles.summaryLabel}>MEJOR LEVANTAMIENTO</Text>
          </View>
          {selectedAnalytics?.bestLift ? (
            <View style={styles.bestLiftRow}>
              <View style={styles.bestLiftText}>
                <Text style={styles.bestLiftName}>{selectedAnalytics.bestLift.exerciseName}</Text>
                <Text style={styles.bestLiftDate}>{new Date(selectedAnalytics.bestLift.completedAt).toLocaleDateString('es-MX')}</Text>
              </View>
              <Text style={styles.bestLiftValue}>{formatWholeNumber(selectedAnalytics.bestLift.weightKg)}<Text style={styles.summaryUnit}> kg</Text></Text>
            </View>
          ) : (
            <Text style={styles.noLift}>{isLoading ? 'Cargando…' : 'Registra un ejercicio de fuerza para ver tu mejor marca.'}</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>ACCESOS RÁPIDOS</Text>
        <View style={styles.shortcuts}>
          <QuickLink icon="qr-code-2" label="Acceso QR" onPress={() => setShowAccess(true)} />
          <QuickLink icon="fitness-center" label="Rutinas" onPress={() => router.push('/(main)/routines')} />
          <QuickLink icon="storefront" label="Tienda" onPress={() => router.push('/(main)/store')} />
          <QuickLink icon="monitor-weight" label="Perfil físico" onPress={() => router.push('/(main)/profile')} />
        </View>
      </ScrollView>
      <ClientAccessModal visible={showAccess} onClose={() => setShowAccess(false)} />
    </SafeAreaView>
  );
}

function QuickLink({ icon, label, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quickLink, pressed && styles.quickLinkPressed]}>
      <MaterialIcons name={icon} size={20} color={dark.green} />
      <Text style={styles.quickLinkText}>{label}</Text>
      <MaterialIcons name="arrow-forward" size={16} color={dark.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: dark.background },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 38, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  headerText: { flex: 1, gap: 4 },
  eyebrow: { color: dark.green, fontSize: 10, fontWeight: '900' },
  greeting: { color: dark.white, fontSize: 26, fontWeight: '800' },
  subtitle: { color: dark.muted, fontSize: 13 },
  iconButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.line, alignItems: 'center', justifyContent: 'center' },
  segmented: { minHeight: 54, flexDirection: 'row', borderRadius: 18, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.line, padding: 4 },
  segment: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 14 },
  segmentSelected: { backgroundColor: dark.elevated, borderWidth: 1, borderColor: '#9BFF634D' },
  segmentLetter: { color: dark.muted, fontSize: 15, fontWeight: '900' },
  segmentLetterSelected: { color: dark.green },
  segmentLabel: { color: dark.muted, fontSize: 12, fontWeight: '700' },
  segmentLabelSelected: { color: dark.white },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderColor: dark.line, backgroundColor: dark.surface, padding: 16 },
  streakText: { flex: 1, gap: 3 },
  streakLabel: { color: dark.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  streakValue: { color: dark.white, fontSize: 18, fontWeight: '800' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: '#17221C', padding: 12 },
  errorText: { flex: 1, color: dark.white, fontSize: 12 },
  calorieCard: { borderRadius: 24, borderWidth: 1, borderColor: dark.line, backgroundColor: dark.surface, padding: 18, overflow: 'hidden' },
  calorieHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricLabel: { color: dark.muted, fontSize: 10, fontWeight: '900' },
  periodCaption: { color: dark.white, fontSize: 14, fontWeight: '700', marginTop: 4 },
  flameIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#9BFF631A' },
  calorieValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12 },
  calorieValue: { color: dark.white, fontSize: 48, lineHeight: 55, fontWeight: '900' },
  calorieUnit: { color: dark.green, fontSize: 14, fontWeight: '800' },
  loadingIndicator: { alignSelf: 'flex-start', marginVertical: 4 },
  chartArea: { minHeight: 182, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginHorizontal: -8 },
  axisText: { color: dark.muted, fontSize: 9 },
  emptyChart: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyChartText: { color: dark.muted, fontSize: 12 },
  chartFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: dark.line, paddingTop: 10 },
  chartCaption: { color: dark.muted, fontSize: 9, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, minHeight: 104, justifyContent: 'space-between', borderRadius: 20, borderWidth: 1, borderColor: dark.line, backgroundColor: dark.surface, padding: 14 },
  summaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { color: dark.muted, fontSize: 9, fontWeight: '900' },
  summaryValue: { color: dark.white, fontSize: 25, fontWeight: '900' },
  summaryUnit: { color: dark.muted, fontSize: 12, fontWeight: '700' },
  secondaryCard: { gap: 14, borderRadius: 20, borderWidth: 1, borderColor: dark.line, backgroundColor: dark.surface, padding: 16 },
  bestLiftRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bestLiftText: { flex: 1, gap: 4 },
  bestLiftName: { color: dark.white, fontSize: 15, fontWeight: '800' },
  bestLiftDate: { color: dark.muted, fontSize: 11 },
  bestLiftValue: { color: dark.green, fontSize: 24, fontWeight: '900' },
  noLift: { color: dark.muted, fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: dark.muted, fontSize: 10, fontWeight: '900', marginTop: 2 },
  shortcuts: { gap: 9 },
  quickLink: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: dark.line, backgroundColor: dark.surface, paddingHorizontal: 14 },
  quickLinkPressed: { opacity: 0.75 },
  quickLinkText: { flex: 1, color: dark.white, fontSize: 13, fontWeight: '700' },
});
