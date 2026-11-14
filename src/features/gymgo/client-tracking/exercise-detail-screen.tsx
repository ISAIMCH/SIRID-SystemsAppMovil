import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text as RNText, useWindowDimensions, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { Badge, Card, EmptyState, ErrorBanner, Screen, ScreenHeader, SectionHeader, Segmented, Skeleton, Text } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

import { api, getApiErrorMessage } from '../api';
import { prLabel } from './alerts';
import { DeltaPill, describeChange } from './charts';
import { DAY_MS, formatDate, formatDayDate, formatMetric, formatNumber, METRIC_LABELS, sessionHref } from './format';
import type { ExerciseEntry, ExerciseSummary, PrimaryMetric } from './types';

type Range = '7' | '30' | '90' | 'all';
type ChartMetric = PrimaryMetric | 'weightKg' | 'volumeKg' | 'totalReps';

const RANGES: { value: Range; label: string }[] = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: 'all', label: 'Todo' },
];

const METRIC_NAMES: Record<ChartMetric, string> = {
  ...METRIC_LABELS,
  weightKg: 'Peso máx.',
  volumeKg: 'Volumen',
  totalReps: 'Reps totales',
  e1rm: '1RM est.',
  reps: 'Reps máx.',
};

function metricOptions(summary: ExerciseSummary, entries: ExerciseEntry[]): ChartMetric[] {
  if (summary.primaryMetric === 'e1rm') return ['e1rm', 'weightKg', 'volumeKg'];
  if (summary.primaryMetric === 'reps') return ['reps', 'totalReps'];
  return (['distanceKm', 'durationMinutes', 'level'] as const).filter((metric) => entries.some((entry) => entry.stats[metric]));
}

function valueOf(entry: ExerciseEntry, metric: ChartMetric): number | null {
  const { stats } = entry;
  switch (metric) {
    case 'e1rm': return stats.e1rm || null;
    case 'weightKg': return stats.topSet?.weightKg || null;
    case 'volumeKg': return stats.volumeKg ?? null;
    case 'reps': return stats.maxReps || null;
    case 'totalReps': return stats.totalReps || null;
    default: return stats[metric] ?? null;
  }
}

function formatSets(entry: ExerciseEntry) {
  return entry.sets.map((set) => {
    if (set.skipped) return `S${set.setNumber} omitida`;
    if (set.durationMinutes !== undefined || set.distanceKm !== undefined || set.level !== undefined) {
      return `S${set.setNumber} ${[set.durationMinutes ? `${set.durationMinutes} min` : '', set.distanceKm ? `${formatNumber(set.distanceKm, 2)} km` : '', set.level ? `nivel ${set.level}` : ''].filter(Boolean).join(' ')}`;
    }
    return `S${set.setNumber} ${set.weightKg ? `${formatNumber(set.weightKg, 1)} kg × ` : ''}${set.reps ?? '—'}${set.weightKg ? '' : ' reps'}`;
  }).join(' · ');
}

function formatTarget(entry: ExerciseEntry) {
  const { target } = entry;
  const parts = [
    target.reps !== null ? `${target.reps} reps` : '',
    target.weightKg !== null ? `${formatNumber(target.weightKg, 1)} kg` : '',
    target.durationMinutes ? `${target.durationMinutes} min` : '',
    target.distanceKm ? `${formatNumber(target.distanceKm, 2)} km` : '',
    target.level ? `nivel ${target.level}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

// How the best set compares with the routine's target for that session.
function targetComparison(entry: ExerciseEntry) {
  const top = entry.stats.topSet;
  if (!top || entry.skipped) return null;
  const parts: { label: string; met: boolean }[] = [];
  if (entry.target.weightKg !== null) {
    const diff = top.weightKg - entry.target.weightKg;
    parts.push({ label: diff === 0 ? 'peso igual al objetivo' : `${diff > 0 ? '+' : ''}${formatNumber(diff, 1)} kg vs. objetivo`, met: diff >= 0 });
  }
  if (entry.target.reps !== null) {
    const doneSets = entry.sets.filter((set) => !set.skipped);
    const reached = doneSets.filter((set) => (set.reps ?? 0) >= (entry.target.reps ?? 0)).length;
    parts.push({ label: `${reached} de ${doneSets.length} series con las reps objetivo`, met: reached === doneSets.length });
  }
  return parts;
}

export default function ExerciseDetailScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { clientId, key, name } = useLocalSearchParams<{ clientId: string; key: string; name?: string }>();
  const [data, setData] = useState<{ exercise: ExerciseSummary; entries: ExerciseEntry[] } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [range, setRange] = useState<Range>('90');
  const [metric, setMetric] = useState<ChartMetric | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let isCurrent = true;
    api.get<{ exercise: ExerciseSummary; entries: ExerciseEntry[] }>(`/workouts/client/${clientId}/exercises/${key}`)
      .then((response) => { if (isCurrent) { setData(response.data); setError(''); } })
      .catch((requestError: unknown) => { if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar el ejercicio.')); });
    return () => { isCurrent = false; };
  }, [clientId, key, attempt]);

  if (!data) {
    return (
      <Screen>
        <ScreenHeader back eyebrow="Progreso" title={name ?? 'Ejercicio'} />
        {error ? <ErrorBanner message={error} onRetry={() => setAttempt((value) => value + 1)} /> : (
          <View style={styles.gap}>
            <Skeleton height={44} radius={radius.md} />
            <Skeleton height={220} radius={radius.lg} />
          </View>
        )}
      </Screen>
    );
  }

  const { exercise, entries } = data;
  const options = metricOptions(exercise, entries);
  const activeMetric = metric && options.includes(metric) ? metric : options[0] ?? exercise.primaryMetric;
  const days = range === 'all' ? null : Number(range);
  const start = days === null ? -Infinity : now - days * DAY_MS;
  const previousStart = days === null ? null : start - days * DAY_MS;
  const inRange = entries.filter((entry) => new Date(entry.completedAt).getTime() >= start);
  const inPrevious = previousStart === null ? [] : entries.filter((entry) => {
    const at = new Date(entry.completedAt).getTime();
    return at >= previousStart && at < start;
  });
  const points = [...inRange].reverse()
    .map((entry) => ({ entry, value: valueOf(entry, activeMetric) }))
    .filter((point): point is { entry: ExerciseEntry; value: number } => point.value !== null);

  const first = points[0]?.value ?? null;
  const last = points[points.length - 1]?.value ?? null;
  const change = points.length >= 2 ? describeChange(last, first, activeMetric === 'volumeKg' ? 'neutral' : 'higherIsBetter') : null;
  const average = (list: ExerciseEntry[]) => {
    const values = list.map((entry) => valueOf(entry, activeMetric)).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const currentAverage = average(inRange);
  const previousAverage = average(inPrevious);
  const averageChange = describeChange(currentAverage, previousAverage, activeMetric === 'volumeKg' ? 'neutral' : 'higherIsBetter');
  const rangeVolume = inRange.reduce((sum, entry) => sum + (entry.stats.volumeKg ?? 0), 0);
  const skippedInRange = inRange.filter((entry) => entry.skipped).length;

  // Card padding on both sides plus the y-axis labels (yAxisLabelWidth) and a margin for the rules.
  const chartWidth = Math.min(width, 720) - space.xl * 2 - space.lg * 2 - 40 - 16;
  // Room at both ends so the first and last date labels (centered on their points) are not clipped.
  const chartEdge = 22;
  const spacing = points.length > 1 ? Math.max(18, (chartWidth - chartEdge * 2) / (points.length - 1)) : chartWidth;
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));
  const chartData = points.map((point, index) => ({
    value: point.value,
    label: index % labelEvery === 0 || index === points.length - 1 ? formatDate(point.entry.completedAt, { day: 'numeric', month: 'numeric' }) : '',
    dataPointColor: point.entry.sessionId === exercise.pr?.sessionId ? colors.warning : colors.accentFill,
  }));
  const max = points.length ? Math.max(...points.map((point) => point.value)) : 0;
  const min = points.length ? Math.min(...points.map((point) => point.value)) : 0;

  return (
    <Screen>
      <ScreenHeader
        back
        eyebrow={exercise.muscleGroup}
        title={exercise.name}
        subtitle={`${exercise.sessions} ${exercise.sessions === 1 ? 'sesión registrada' : 'sesiones registradas'} desde ${formatDate(exercise.firstAt, { day: 'numeric', month: 'short', year: 'numeric' })}`}
      />

      <View style={styles.grid}>
        <Card style={styles.stat}>
          <RNText style={styles.statLabel}>Récord personal</RNText>
          <Text variant="headline">{prLabel(exercise)}</Text>
          {exercise.pr ? <Text variant="caption" tone="secondary">{formatDayDate(exercise.pr.completedAt)}</Text> : null}
        </Card>
        <Card style={styles.stat}>
          <RNText style={styles.statLabel}>Último registro</RNText>
          <Text variant="headline">{exercise.last ? formatMetric(exercise.primaryMetric, exercise.last.value) : '—'}</Text>
          {exercise.last ? <Text variant="caption" tone="secondary">{METRIC_LABELS[exercise.primaryMetric]} · {formatDayDate(exercise.last.completedAt)}</Text> : null}
        </Card>
      </View>

      <View style={styles.gap}>
        <Segmented value={range} options={RANGES} onChange={setRange} fitLabels />
        {options.length > 1 ? (
          <Segmented value={activeMetric} options={options.map((option) => ({ value: option, label: METRIC_NAMES[option] }))} onChange={setMetric} fitLabels />
        ) : null}
      </View>

      <Card variant="raised">
        <View style={styles.chartHead}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">{METRIC_NAMES[activeMetric]}</Text>
            <Text variant="caption" tone="secondary">
              {points.length} {points.length === 1 ? 'registro' : 'registros'} {days ? `en ${days} días` : 'en total'}
              {change ? ' · cambio desde el primero' : ''}
            </Text>
          </View>
          {change ? <DeltaPill {...change} /> : null}
        </View>
        {points.length >= 2 ? (
          <LineChart
            key={`${range}-${activeMetric}`}
            data={chartData}
            width={chartWidth}
            height={170}
            spacing={spacing}
            initialSpacing={chartEdge}
            endSpacing={chartEdge}
            color={colors.accentFill}
            thickness={2.5}
            dataPointsRadius={4}
            areaChart
            startFillColor={colors.accentFill}
            endFillColor={colors.accentFill}
            startOpacity={0.18}
            endOpacity={0.01}
            noOfSections={4}
            yAxisOffset={Math.max(0, Math.floor(min - (max - min) * 0.2))}
            maxValue={Math.max(1, Math.ceil((max - Math.max(0, Math.floor(min - (max - min) * 0.2))) * 1.15))}
            rulesColor={colors.divider}
            rulesType="solid"
            yAxisColor="transparent"
            xAxisColor={colors.border}
            yAxisTextStyle={styles.axis}
            xAxisLabelTextStyle={styles.axis}
            yAxisLabelWidth={40}
            formatYLabel={(label) => formatNumber(Number(label))}
            disableScroll={points.length <= 12}
            isAnimated
          />
        ) : (
          <EmptyState icon="show-chart" title="Pocos registros" message={points.length === 1 ? 'Solo hay un registro en este periodo: amplía el rango para ver la evolución.' : 'No hay registros en este periodo.'} />
        )}
        <Text variant="caption" tone="secondary">
          {activeMetric === 'e1rm'
            ? '1RM estimado (Epley): combina peso y repeticiones para comparar series con distinto número de reps. Punto amarillo: sesión del récord.'
            : activeMetric === 'volumeKg'
              ? 'Volumen = repeticiones × peso. Más volumen no siempre es progreso: revísalo junto con el RPE de la sesión.'
              : 'Mejor valor de cada sesión. Punto amarillo: sesión del récord.'}
        </Text>
      </Card>

      <View style={styles.grid}>
        <Card style={styles.stat}>
          <RNText style={styles.statLabel}>Promedio del periodo</RNText>
          <Text variant="headline">{formatMetric(activeMetric, currentAverage)}</Text>
          {days ? (
            averageChange ? <View style={styles.inline}><DeltaPill {...averageChange} /><Text variant="caption" tone="secondary">vs. {days} días anteriores</Text></View>
              : <Text variant="caption" tone="secondary">Sin registros en los {days} días anteriores</Text>
          ) : <Text variant="caption" tone="secondary">Todo el historial</Text>}
        </Card>
        {exercise.metricType === 'strength' && exercise.primaryMetric === 'e1rm' ? (
          <Card style={styles.stat}>
            <RNText style={styles.statLabel}>Volumen del periodo</RNText>
            <Text variant="headline">{formatMetric('volumeKg', rangeVolume)}</Text>
            <Text variant="caption" tone="secondary">{inRange.length - skippedInRange} sesiones{skippedInRange ? ` · ${skippedInRange} omitido` : ''}</Text>
          </Card>
        ) : null}
      </View>

      <View style={styles.gap}>
        <SectionHeader title="Registros" subtitle={days ? `Últimos ${days} días, del más reciente al más antiguo` : 'Todo el historial, del más reciente al más antiguo'} />
        {inRange.length === 0 ? <Text variant="callout" tone="secondary">Sin registros en este periodo.</Text> : null}
        {inRange.map((entry) => {
          const target = formatTarget(entry);
          const comparison = targetComparison(entry);
          return (
            <Pressable
              key={`${entry.sessionId}`}
              accessibilityRole="button"
              accessibilityHint="Abre la sesión completa"
              onPress={() => router.push(sessionHref(clientId, entry.sessionId))}
              style={({ pressed }) => [styles.entry, pressed && styles.pressed]}>
              <View style={styles.entryHead}>
                <Text variant="bodyStrong" style={styles.flex}>{formatDayDate(entry.completedAt)}</Text>
                {entry.sessionId === exercise.pr?.sessionId ? <Badge tone="warning" icon="emoji-events">Récord</Badge> : null}
                {entry.skipped ? <Badge tone="warning" icon="skip-next">Omitido</Badge> : null}
              </View>
              <Text variant="caption" tone="secondary">{entry.routineTitle ?? 'Rutina histórica'}{target ? ` · Objetivo: ${target}` : ''}</Text>
              <Text variant="callout">{formatSets(entry)}</Text>
              {comparison?.length ? (
                <View style={styles.inline}>
                  {comparison.map((part) => <Badge key={part.label} tone={part.met ? 'success' : 'neutral'}>{part.label}</Badge>)}
                </View>
              ) : null}
              {entry.stats.volumeKg ? <Text variant="caption" tone="secondary">Volumen {formatMetric('volumeKg', entry.stats.volumeKg)}{entry.stats.e1rm ? ` · 1RM est. ${formatMetric('e1rm', entry.stats.e1rm)}` : ''}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  gap: { gap: space.md },
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { flexGrow: 1, flexBasis: '45%', minWidth: 140, gap: 2, padding: space.md },
  statLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  chartHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  axis: { color: colors.textSecondary, fontSize: 10 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  entry: { gap: space.xs, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pressed: { backgroundColor: colors.surfaceRaised },
}));
