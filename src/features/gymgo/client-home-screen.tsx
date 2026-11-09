import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text as RNText, View, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import {
  Button,
  Card,
  ErrorBanner,
  FadeIn,
  IconTile,
  PressableScale,
  Screen,
  Segmented,
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
import ClientAccessModal from './client-access-modal';
import GymSwitcher from './gym-switcher';

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

const periods: { value: Period; label: string; title: string }[] = [
  { value: 'day', label: 'Día', title: 'Hoy' },
  { value: 'week', label: 'Semana', title: 'Esta semana' },
  { value: 'month', label: 'Mes', title: 'Este mes' },
];
const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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

function formatDisplayDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const formatted = date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export default function ClientHomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
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

  useFocusEffect(useCallback(() => {
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
  // reloadToken is a manual "reintentar" trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, reloadToken, user?.id]));

  useFocusEffect(useCallback(() => {
    if (!user?.id) return undefined;
    let isCurrent = true;
    api.get<WorkoutStats>('/workouts/me/stats', { params: { tzOffsetMinutes: -new Date().getTimezoneOffset() } })
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
  // reloadToken: pull-to-refresh reloads the streak too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, reloadToken]));

  const selectedAnalytics = analytics?.period === period ? analytics : null;
  const maximumCalories = Math.max(5, ...(selectedAnalytics?.chartData.map((item) => item.caloriesBurned) ?? [0]));
  const chartMaximum = Math.ceil(maximumCalories / 4 / 25) * 25 || 25;
  const chartData = (selectedAnalytics?.chartData ?? []).map((item, index) => ({
    value: item.caloriesBurned,
    label: labelForPeriod(item.label, period, index),
    frontColor: colors.accentFill,
    topLabelComponent: () => <View />,
  }));
  const chartWidth = Math.min(Math.max(width - 96, 240), 580);
  const periodName = periods.find((item) => item.value === period)?.title ?? 'Hoy';
  const displayDate = formatDisplayDate(selectedAnalytics?.date ?? localDateAndTimezone().date);
  const hasCalories = Boolean(selectedAnalytics?.totals.caloriesBurned);
  const firstName = user?.name?.split(' ')[0] ?? 'deportista';
  const streak = workoutStats?.currentStreak ?? 0;

  return (
    <Screen
      onRefresh={() => setReloadToken((value) => value + 1)}
      refreshing={false}
      overlay={<ClientAccessModal visible={showAccess} onClose={() => setShowAccess(false)} />}>
      <FadeIn style={styles.header}>
        <Text variant="caption" tone="secondary">{displayDate}</Text>
        <Text variant="display" accessibilityRole="header">Hola, {firstName}</Text>
        <GymSwitcher />
      </FadeIn>

      <FadeIn index={1}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroText}>
              <Text variant="label" tone="heroSecondary">Racha actual</Text>
              {isLoadingStreak ? <Skeleton width={120} height={56} style={styles.heroSkeleton} /> : (
                <View style={styles.streakRow}>
                  <RNText style={styles.streakValue}>{workoutStats ? streak : '—'}</RNText>
                  <RNText style={styles.streakUnit}>{streak === 1 ? 'día' : 'días'}</RNText>
                </View>
              )}
              <Text variant="caption" tone="heroSecondary">
                {!workoutStats ? 'Tu constancia aparecerá aquí.' : streak > 0 ? 'Días seguidos asistiendo. ¡No la rompas!' : 'Entrena hoy para iniciar tu racha.'}
              </Text>
            </View>
            <View style={styles.flame}>
              <MaterialIcons name="local-fire-department" size={34} color={streak > 0 ? '#FFC24D' : colors.heroTextSecondary} />
            </View>
          </View>
          <View style={styles.heroActions}>
            <Button variant="accent" icon="qr-code-2" onPress={() => setShowAccess(true)} style={styles.heroButton}>Mi acceso</Button>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(main)/routines')}
              style={({ pressed }) => [styles.heroGhost, pressed && styles.pressed]}>
              <MaterialIcons name="fitness-center" size={20} color={colors.heroText} />
              <RNText style={styles.heroGhostText}>Entrenar</RNText>
            </Pressable>
          </View>
        </View>
      </FadeIn>

      <FadeIn index={2} style={styles.section}>
        <Segmented value={period} onChange={setPeriod} options={periods.map((item) => ({ value: item.value, label: item.label }))} />

        {error ? <ErrorBanner message={error} onRetry={() => setReloadToken((value) => value + 1)} /> : null}

        <Card
          variant="raised"
          onPress={() => router.push('/(main)/client-workout-detail')}
          accessibilityLabel={`Calorías quemadas ${periodName}: ${selectedAnalytics ? formatWholeNumber(selectedAnalytics.totals.caloriesBurned) : 'sin datos'} kilocalorías. Ver historial`}>
          <View style={styles.cardHead}>
            <View style={styles.flexText}>
              <Text variant="label" tone="secondary">Calorías · {periodName}</Text>
              {isLoading && !selectedAnalytics ? <Skeleton width={140} height={44} /> : (
                <View style={styles.valueRow}>
                  <Text variant="hero">{selectedAnalytics ? formatWholeNumber(selectedAnalytics.totals.caloriesBurned) : '—'}</Text>
                  <Text variant="bodyStrong" tone="secondary">kcal</Text>
                </View>
              )}
            </View>
            <View style={styles.historyLink}>
              <RNText style={styles.historyText}>Historial</RNText>
              <MaterialIcons name="chevron-right" size={18} color={colors.accent} />
            </View>
          </View>
          <View style={styles.chartArea} pointerEvents="none">
            {hasCalories && selectedAnalytics?.chartData.length ? (
              <BarChart
                key={`${period}-${selectedAnalytics.range.start}`}
                data={chartData}
                width={chartWidth}
                height={150}
                barWidth={period === 'month' ? 6 : period === 'day' ? 8 : 18}
                spacing={period === 'month' ? 4 : period === 'day' ? 4 : 17}
                initialSpacing={8}
                adjustToWidth
                frontColor={colors.accentFill}
                barBorderTopLeftRadius={5}
                barBorderTopRightRadius={5}
                noOfSections={4}
                maxValue={chartMaximum * 4}
                stepValue={chartMaximum}
                yAxisTextStyle={styles.axisText}
                xAxisLabelTextStyle={styles.axisText}
                xAxisColor={colors.border}
                yAxisColor="transparent"
                yAxisThickness={0}
                rulesColor={colors.divider}
                rulesType="solid"
                rulesThickness={1}
                hideOrigin
                isAnimated
                animationDuration={350}
                disableScroll
              />
            ) : isLoading ? (
              <Skeleton height={150} radius={radius.md} />
            ) : (
              <View style={styles.emptyChart}>
                <MaterialIcons name="bar-chart" size={30} color={colors.textTertiary} />
                <Text variant="callout" tone="secondary">Aún no hay actividad en este periodo</Text>
              </View>
            )}
          </View>
          {hasCalories && selectedAnalytics?.chartData.length ? (
            <View style={styles.chartFooter}>
              <Text variant="caption" tone="secondary">{period === 'day' ? 'Por hora del día' : 'Por día del periodo'}</Text>
            </View>
          ) : null}
        </Card>

        {!hasCalories && !isLoading ? (
          <Button variant="secondary" icon="play-arrow" onPress={() => router.push('/(main)/routines')}>Iniciar entrenamiento hoy</Button>
        ) : null}

        <View style={styles.row}>
          <StatTile
            icon="schedule"
            tone="info"
            label="Tiempo activo"
            value={selectedAnalytics ? formatWholeNumber(selectedAnalytics.totals.durationMinutes) : '—'}
            unit="min"
            loading={isLoading && !selectedAnalytics}
          />
          <StatTile
            icon="fitness-center"
            label="Volumen"
            value={selectedAnalytics ? formatWholeNumber(selectedAnalytics.totals.totalVolumeKg) : '—'}
            unit="kg"
            loading={isLoading && !selectedAnalytics}
          />
        </View>

        <Card>
          <View style={styles.liftRow}>
            <IconTile name="emoji-events" tone="warning" size={44} />
            <View style={styles.flexText}>
              <Text variant="label" tone="secondary">Mejor levantamiento</Text>
              {selectedAnalytics?.bestLift ? (
                <>
                  <Text variant="bodyStrong" numberOfLines={1}>{selectedAnalytics.bestLift.exerciseName}</Text>
                  <Text variant="caption" tone="secondary">{new Date(selectedAnalytics.bestLift.completedAt).toLocaleDateString('es-MX')}</Text>
                </>
              ) : (
                <Text variant="callout" tone="secondary">{isLoading ? 'Cargando…' : 'Registra un ejercicio de fuerza para ver tu mejor marca.'}</Text>
              )}
            </View>
            {selectedAnalytics?.bestLift ? (
              <View style={styles.valueRow}>
                <Text variant="metric" tone="accent">{formatWholeNumber(selectedAnalytics.bestLift.weightKg)}</Text>
                <Text variant="caption" tone="secondary">kg</Text>
              </View>
            ) : null}
          </View>
        </Card>
      </FadeIn>

      <FadeIn index={3} style={styles.section}>
        <Text variant="headline" accessibilityRole="header">Accesos rápidos</Text>
        <View style={styles.grid}>
          <QuickLink icon="fitness-center" label="Mis rutinas" tone="accent" onPress={() => router.push('/(main)/routines')} />
          <QuickLink icon="storefront" label="Tienda" tone="warning" onPress={() => router.push('/(main)/store')} />
          <QuickLink icon="monitor-weight" label="Perfil físico" tone="info" onPress={() => router.push('/(main)/profile')} />
          <QuickLink icon="build" label="Reportar falla" tone="danger" onPress={() => router.push('/(main)/maintenance')} />
        </View>
      </FadeIn>
    </Screen>
  );
}

function QuickLink({ icon, label, tone, onPress }: { icon: IconName; label: string; tone: Tone; onPress: () => void }) {
  const styles = useStyles();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} style={styles.quickLink}>
      <IconTile name={icon} tone={tone} size={40} />
      <RNText numberOfLines={2} maxFontSizeMultiplier={1.4} style={styles.quickLinkText}>{label}</RNText>
    </PressableScale>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  header: { gap: space.xs },
  section: { gap: space.md },
  hero: { backgroundColor: colors.hero, borderRadius: radius.xl, padding: space.xl, gap: space.xl, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  heroText: { flex: 1, gap: space.xs },
  heroSkeleton: { opacity: 0.3 },
  streakRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  streakValue: { color: colors.heroText, fontFamily: 'display', fontSize: 64, lineHeight: 68, fontWeight: '800' },
  streakUnit: { color: colors.heroTextSecondary, fontFamily: 'display', fontSize: 24, fontWeight: '600' },
  flame: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  heroActions: { flexDirection: 'row', gap: space.sm },
  heroButton: { flex: 1.3 },
  heroGhost: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  heroGhostText: { color: colors.heroText, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  flexText: { flex: 1, gap: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  historyLink: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  historyText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  chartArea: { minHeight: 160, justifyContent: 'center', marginHorizontal: -8 },
  axisText: { color: colors.textSecondary, fontSize: 10 },
  emptyChart: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: space.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, marginHorizontal: 8 },
  chartFooter: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  liftRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  quickLink: { flexBasis: '46%', flexGrow: 1, minHeight: 104, justifyContent: 'space-between', gap: space.md, borderRadius: radius.lg, padding: space.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  quickLinkText: { color: colors.text, fontSize: 15, fontWeight: '700' },
}));
