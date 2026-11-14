import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Text as RNText, View } from 'react-native';

import { Badge, Button, Card, EmptyState, ErrorBanner, IconTile, ProgressRing, SectionHeader, Segmented, Skeleton, Text, toneColors } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

import { routineEditorHref } from '../routine-links';
import type { Routine } from '../types';
import { ALERT_LEVEL_LABEL, ALERT_TONE, prLabel, type ClientAlert } from './alerts';
import { DeltaPill, describeChange, MiniBars, type Polarity } from './charts';
import { DAY_SHORT, daysSince, formatDate, formatNumber, formatVolume, localWeekKey, scheduleUnchangedSince, WEEK_INITIALS, weekKeyToDate } from './format';
import type { ClientTab, ExerciseSummary, PeriodMetrics } from './types';
import type { ClientTracking } from './use-client-tracking';

const LEVEL_NAMES: Record<string, string> = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };
const CHART_WEEKS = 8;
type ChartMetric = 'sessions' | 'volume' | 'rpe';

export function SummaryTab({ clientId, tracking, alerts, activeRoutine, now, onOpenTab, onAlertPress, onOpenExercise }: {
  clientId: string;
  tracking: ClientTracking;
  alerts: ClientAlert[];
  activeRoutine: Routine | null;
  now: number;
  onOpenTab: (tab: ClientTab) => void;
  onAlertPress: (alert: ClientAlert) => void;
  onOpenExercise: (exercise: ExerciseSummary) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { overview, isLoading, error } = tracking;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={tracking.isRefreshing} onRefresh={tracking.reload} tintColor={colors.accent} colors={[colors.accentFill]} progressBackgroundColor={colors.surface} />}>
      {error ? <ErrorBanner message={error} onRetry={tracking.reload} /> : null}
      {isLoading && !overview ? <SummarySkeleton /> : null}
      {overview ? (
        <>
          <WeekStatus tracking={tracking} activeRoutine={activeRoutine} now={now} />
          <AlertsSection alerts={alerts} onAlertPress={onAlertPress} />
          <Indicators tracking={tracking} activeRoutine={activeRoutine} onOpenExercise={onOpenExercise} />
          <RecentEvolution tracking={tracking} now={now} />
        </>
      ) : null}
      <ActiveRoutine clientId={clientId} routine={activeRoutine} onManage={() => onOpenTab('profile')} />
    </ScrollView>
  );
}

function SummarySkeleton() {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Skeleton height={120} radius={radius.lg} />
      <Skeleton height={90} radius={radius.lg} />
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} height={110} radius={radius.lg} style={styles.gridItem} />)}
      </View>
    </View>
  );
}

/* ───────────── A. Estado general ───────────── */

function WeekStatus({ tracking, activeRoutine, now }: { tracking: ClientTracking; activeRoutine: Routine | null; now: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const today = new Date(now);
  const weekKey = localWeekKey(today);
  const weekStart = weekKeyToDate(weekKey);
  const todayIndex = (today.getDay() + 6) % 7;
  const thisWeek = tracking.recentSessions.filter((session) => localWeekKey(session.completedAt) === weekKey);
  const doneDays = new Set(thisWeek.map((session) => (new Date(session.completedAt).getDay() + 6) % 7));
  const scheduledDays = new Set((activeRoutine?.scheduleDays ?? []).map((day) => (day + 6) % 7));
  const planned = scheduledDays.size;
  const missed = [...scheduledDays].filter((day) => day < todayIndex && !doneDays.has(day)).length;
  const left = [...scheduledDays].filter((day) => day >= todayIndex && !doneDays.has(day)).length;

  let situation: string;
  if (!activeRoutine) situation = 'Sin rutina activa: no hay días programados.';
  else if (!planned) situation = 'La rutina activa no tiene días programados.';
  else if (thisWeek.length >= planned) situation = 'Completó las sesiones programadas de la semana.';
  else if (missed > 0) situation = `${missed} ${missed === 1 ? 'día programado quedó' : 'días programados quedaron'} sin sesión${left ? ` · ${left} por delante` : ''}.`;
  else situation = `Va al día · ${left} ${left === 1 ? 'sesión programada' : 'sesiones programadas'} por delante.`;

  return (
    <Card variant="raised" style={styles.statusCard}>
      <ProgressRing value={planned ? thisWeek.length / planned : 0} size={76} stroke={8}>
        <Text variant="headline">{thisWeek.length}{planned ? `/${planned}` : ''}</Text>
      </ProgressRing>
      <View style={styles.flex}>
        <Text variant="label" tone="secondary">Esta semana</Text>
        <Text variant="callout">{situation}</Text>
        <View style={styles.weekStrip} accessibilityLabel={`Semana: ${WEEK_INITIALS.map((_, index) => {
          const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index);
          return `${DAY_SHORT[date.getDay()]} ${doneDays.has(index) ? 'entrenó' : scheduledDays.has(index) ? (index < todayIndex ? 'sin sesión' : 'programado') : 'libre'}`;
        }).join(', ')}`}>
          {WEEK_INITIALS.map((initial, index) => {
            const done = doneDays.has(index);
            const scheduled = scheduledDays.has(index);
            const isMissed = scheduled && !done && index < todayIndex;
            return (
              <View key={index} style={styles.dayColumn}>
                <View style={[
                  styles.dayDot,
                  scheduled && styles.dayScheduled,
                  isMissed && styles.dayMissed,
                  done && styles.dayDone,
                  index === todayIndex && styles.dayToday,
                ]}>
                  {done ? <MaterialIcons name="check" size={13} color={colors.onAccentFill} /> : null}
                </View>
                <RNText style={[styles.dayLabel, index === todayIndex && styles.dayLabelToday]}>{initial}</RNText>
              </View>
            );
          })}
        </View>
      </View>
    </Card>
  );
}

/* ───────────── B. Alertas ───────────── */

function AlertsSection({ alerts, onAlertPress }: { alerts: ClientAlert[]; onAlertPress: (alert: ClientAlert) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const urgent = alerts.filter((alert) => alert.level !== 'info');
  const info = alerts.filter((alert) => alert.level === 'info');
  return (
    <View style={styles.section}>
      <SectionHeader title="Alertas" subtitle={urgent.length ? `${urgent.length} ${urgent.length === 1 ? 'requiere' : 'requieren'} seguimiento` : undefined} />
      <View style={styles.alertGroup}>
        {urgent.length === 0 ? (
          <View style={styles.allGood}>
            <MaterialIcons name="check-circle" size={20} color={colors.success} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">Todo en orden</Text>
              <Text variant="caption" tone="secondary">Sin alertas de actividad, fatiga, omisiones ni constancia.</Text>
            </View>
          </View>
        ) : urgent.map((alert, index) => <AlertRow key={alert.id} alert={alert} divider={index < urgent.length - 1 || info.length > 0} onPress={onAlertPress} />)}
        {info.length ? (
          <>
            <RNText style={styles.groupLabel}>Observaciones</RNText>
            {info.map((alert, index) => <AlertRow key={alert.id} alert={alert} divider={index < info.length - 1} onPress={onAlertPress} />)}
          </>
        ) : null}
      </View>
    </View>
  );
}

function AlertRow({ alert, divider, onPress }: { alert: ClientAlert; divider: boolean; onPress: (alert: ClientAlert) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tone = ALERT_TONE[alert.level];
  const { fg } = toneColors(colors, tone);
  const content = (
    <>
      <View style={[styles.alertStripe, { backgroundColor: fg }]} />
      <IconTile name={alert.icon} tone={tone} size={34} />
      <View style={styles.flex}>
        <RNText style={[styles.alertLevel, { color: fg }]}>{ALERT_LEVEL_LABEL[alert.level]}</RNText>
        <Text variant="bodyStrong">{alert.title}</Text>
        {alert.detail ? <Text variant="caption" tone="secondary" numberOfLines={alert.level === 'info' ? 3 : undefined}>{alert.detail}</Text> : null}
      </View>
      {alert.target ? <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} /> : null}
    </>
  );
  if (!alert.target) return <View style={[styles.alertRow, divider && styles.divider]}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={alert.target.type === 'history' ? 'Abre el historial' : 'Abre el registro que originó la alerta'}
      onPress={() => onPress(alert)}
      style={({ pressed }) => [styles.alertRow, divider && styles.divider, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

/* ───────────── C. Indicadores ───────────── */

function Indicators({ tracking, activeRoutine, onOpenExercise }: { tracking: ClientTracking; activeRoutine: Routine | null; onOpenExercise: (exercise: ExerciseSummary) => void }) {
  const styles = useStyles();
  const [showTable, setShowTable] = useState(false);
  const { period } = tracking.overview!;
  const { current, previous } = period;
  // Only when the active routine kept its schedule for the whole period; otherwise the target would be invented.
  const expected = activeRoutine?.scheduleDays?.length && scheduleUnchangedSince(activeRoutine, period.currentStart)
    ? Math.round((activeRoutine.scheduleDays.length * period.days) / 7)
    : null;
  const volumeChange = describeChange(current.volumeKg, previous.sessions ? previous.volumeKg : null, 'neutral');
  const sharpVolumeRise = previous.volumeKg > 0 && current.volumeKg > previous.volumeKg * 1.3;
  const best = (tracking.exercises ?? [])
    .filter((exercise) => exercise.primaryMetric === 'e1rm' && exercise.pr?.weightKg)
    .sort((a, b) => (b.pr!.weightKg ?? 0) - (a.pr!.weightKg ?? 0) || (b.pr!.reps ?? 0) - (a.pr!.reps ?? 0))[0];
  const bestIsNew = best?.pr && new Date(best.pr.completedAt) >= new Date(period.currentStart);
  const periodLabel = `Últimos ${period.days} días frente a los ${period.days} anteriores`;

  return (
    <View style={styles.section}>
      <SectionHeader title="Indicadores" subtitle={periodLabel} />
      <Segmented
        value={String(tracking.periodDays) as '7' | '30'}
        options={[{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }]}
        onChange={(value) => tracking.setPeriodDays(Number(value) as 7 | 30)}
        fitLabels
      />
      <View style={styles.grid}>
        <KpiTile
          label="Adherencia"
          value={formatNumber(current.sessions)}
          unit={expected ? `de ${expected} sesiones` : current.sessions === 1 ? 'sesión' : 'sesiones'}
          change={describeChange(current.sessions, previous.sessions, 'higherIsBetter', { relative: false })}
          caption={`Antes: ${formatNumber(previous.sessions)}`}
        />
        <KpiTile
          label="Volumen"
          value={formatVolume(current.volumeKg)}
          change={volumeChange}
          caption={sharpVolumeRise ? 'Subida brusca: revisa la recuperación' : `Antes: ${formatVolume(previous.volumeKg)}`}
          captionTone={sharpVolumeRise ? 'warning' : undefined}
        />
        <KpiTile
          label="RPE promedio"
          value={current.avgRpe === null ? '—' : formatNumber(current.avgRpe, 1)}
          unit={current.avgRpe === null ? undefined : 'de 5'}
          change={describeChange(current.avgRpe, previous.avgRpe, 'higherNeedsCare', { relative: false, digits: 1, threshold: 0.2 })}
          caption={current.avgRpe === null ? 'Sin RPE registrado' : `Antes: ${previous.avgRpe === null ? '—' : formatNumber(previous.avgRpe, 1)}`}
        />
        <KpiTile
          label="Mejor levantamiento"
          value={best ? prLabel(best) : '—'}
          caption={best ? best.name : 'Sin levantamientos con peso'}
          footer={best?.pr ? (
            bestIsNew ? <Badge tone="success" icon="emoji-events">Récord en el periodo</Badge>
              : <Text variant="caption" tone="secondary">Récord de hace {daysSince(best.pr.completedAt)} días</Text>
          ) : null}
          onPress={best ? () => onOpenExercise(best) : undefined}
        />
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showTable }} onPress={() => setShowTable((value) => !value)} style={styles.toggle}>
        <RNText style={styles.toggleText}>{showTable ? 'Ocultar comparación detallada' : 'Ver comparación detallada'}</RNText>
        <MaterialIcons name={showTable ? 'expand-less' : 'expand-more'} size={20} style={styles.toggleIcon} />
      </Pressable>
      {showTable ? <ComparisonTable current={current} previous={previous} currentStart={period.currentStart} previousStart={period.previousStart} /> : null}
    </View>
  );
}

function KpiTile({ label, value, unit, change, caption, captionTone, footer, onPress }: {
  label: string;
  value: string;
  unit?: string;
  change?: ReturnType<typeof describeChange>;
  caption?: string;
  captionTone?: 'warning';
  footer?: ReactNode;
  onPress?: () => void;
}) {
  const styles = useStyles();
  return (
    <Card onPress={onPress} accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}${change ? `, cambio ${change.label}` : ''}`} style={styles.gridItem}>
      <RNText maxFontSizeMultiplier={1.3} style={styles.kpiLabel}>{label}</RNText>
      <View>
        <Text variant="metric" style={styles.kpiValue}>{value}</Text>
        {unit ? <Text variant="caption" tone="secondary">{unit}</Text> : null}
      </View>
      {change ? <DeltaPill {...change} /> : null}
      {caption ? <Text variant="caption" tone={captionTone ?? 'secondary'}>{caption}</Text> : null}
      {footer}
    </Card>
  );
}

const TABLE_ROWS: { label: string; value: (metrics: PeriodMetrics) => number | null; format: (value: number | null) => string; polarity: Polarity; relative?: boolean; digits?: number }[] = [
  { label: 'Sesiones', value: (m) => m.sessions, format: (v) => formatNumber(v), polarity: 'higherIsBetter', relative: false },
  { label: 'Volumen', value: (m) => m.volumeKg, format: formatVolume, polarity: 'neutral' },
  { label: 'RPE promedio', value: (m) => m.avgRpe, format: (v) => formatNumber(v, 1), polarity: 'higherNeedsCare', relative: false, digits: 1 },
  { label: 'Series completadas', value: (m) => m.completedSets, format: (v) => formatNumber(v), polarity: 'higherIsBetter' },
  { label: 'Series omitidas', value: (m) => m.skippedSets, format: (v) => formatNumber(v), polarity: 'lowerIsBetter', relative: false },
  { label: 'Duración promedio', value: (m) => m.avgDurationMinutes, format: (v) => (v === null ? '—' : `${formatNumber(v)} min`), polarity: 'neutral' },
];

function ComparisonTable({ current, previous, currentStart, previousStart }: { current: PeriodMetrics; previous: PeriodMetrics; currentStart: string; previousStart: string }) {
  const styles = useStyles();
  const currentEnd = new Date();
  const previousEnd = new Date(new Date(currentStart).getTime() - 1);
  return (
    <Card style={styles.table}>
      <View style={[styles.tableRow, styles.divider]}>
        <RNText style={[styles.tableHead, styles.tableLabel]}>Indicador</RNText>
        <RNText style={styles.tableHead}>Anterior</RNText>
        <RNText style={styles.tableHead}>Actual</RNText>
        <RNText style={[styles.tableHead, styles.tableChange]}>Cambio</RNText>
      </View>
      {TABLE_ROWS.map((row, index) => {
        const now = row.value(current);
        const before = row.value(previous);
        const change = describeChange(now, previous.sessions || row.label === 'Sesiones' ? before : null, row.polarity, { relative: row.relative ?? true, digits: row.digits ?? 0 });
        return (
          <View key={row.label} style={[styles.tableRow, index < TABLE_ROWS.length - 1 && styles.divider]}>
            <RNText style={[styles.tableCell, styles.tableLabel]}>{row.label}</RNText>
            <RNText style={styles.tableCell}>{row.format(before)}</RNText>
            <RNText style={[styles.tableCell, styles.tableCurrent]}>{row.format(now)}</RNText>
            <View style={styles.tableChange}>{change ? <DeltaPill {...change} /> : <RNText style={styles.tableCell}>—</RNText>}</View>
          </View>
        );
      })}
      <Text variant="caption" tone="secondary">
        Actual: {formatDate(currentStart)} – {formatDate(currentEnd)} · Anterior: {formatDate(previousStart)} – {formatDate(previousEnd)}.
        {' '}Más volumen o esfuerzo no siempre es progreso: léelo junto con el RPE y las series omitidas.
      </Text>
    </Card>
  );
}

/* ───────────── D. Evolución reciente ───────────── */

function RecentEvolution({ tracking, now }: { tracking: ClientTracking; now: number }) {
  const styles = useStyles();
  const [metric, setMetric] = useState<ChartMetric>('sessions');
  const weeks = new Map(tracking.overview!.weeks.map((week) => [week.weekStart, week]));
  const start = weekKeyToDate(localWeekKey(new Date(now)));
  const data = Array.from({ length: CHART_WEEKS }, (_, index) => {
    const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - (CHART_WEEKS - 1 - index) * 7);
    const key = localWeekKey(monday);
    const week = weeks.get(key);
    const isCurrent = index === CHART_WEEKS - 1;
    const value = metric === 'sessions' ? week?.sessions ?? 0 : metric === 'volume' ? (week?.volumeKg ?? 0) : week?.avgRpe ?? null;
    return {
      key,
      label: isCurrent ? 'Esta' : `${monday.getDate()}/${monday.getMonth() + 1}`,
      value,
      highlight: metric === 'sessions' && Boolean(week?.plannedSessions) && (week?.sessions ?? 0) >= (week?.plannedSessions ?? 0),
      muted: isCurrent,
    };
  });
  const format = metric === 'volume' ? (value: number) => (value >= 1000 ? `${formatNumber(value / 1000, 1)}t` : formatNumber(value)) : metric === 'rpe' ? (value: number) => formatNumber(value, 1) : (value: number) => formatNumber(value);
  const caption = metric === 'sessions'
    ? 'Verde: semana con todas las sesiones programadas. La semana en curso aparece en gris.'
    : metric === 'volume' ? 'Kilos movidos por semana (repeticiones × peso).' : 'Esfuerzo percibido promedio por semana, de 1 a 5.';
  return (
    <View style={styles.section}>
      <SectionHeader title="Evolución reciente" subtitle="Últimas 8 semanas" />
      <Card>
        <Segmented
          value={metric}
          options={[{ value: 'sessions', label: 'Sesiones' }, { value: 'volume', label: 'Volumen' }, { value: 'rpe', label: 'RPE' }]}
          onChange={setMetric}
          fitLabels
        />
        <MiniBars data={data} format={format} />
        <Text variant="caption" tone="secondary">{caption}</Text>
      </Card>
    </View>
  );
}

/* ───────────── E. Rutina activa ───────────── */

function ActiveRoutine({ clientId, routine, onManage }: { clientId: string; routine: Routine | null; onManage: () => void }) {
  const styles = useStyles();
  const blocks = routine ? routine.blocks?.length ?? routine.exercises.length : 0;
  const days = (routine?.scheduleDays ?? []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((day) => DAY_SHORT[day]).join(' · ');
  return (
    <View style={styles.section}>
      <SectionHeader title="Rutina activa" action="Administrar" onAction={onManage} />
      {routine ? (
        <Card variant="raised">
          <View style={styles.routineTop}>
            <IconTile name="assignment" />
            <View style={styles.flex}>
              <Text variant="headline">{routine.title}</Text>
              <Text variant="caption" tone="secondary">
                {LEVEL_NAMES[routine.level] ?? routine.level} · {routine.daysPerWeek} días/semana · {routine.durationWeeks} semanas
              </Text>
              <Text variant="caption" tone="secondary">{days ? `${days} · ` : ''}{blocks} {blocks === 1 ? 'bloque' : 'bloques'}</Text>
            </View>
          </View>
          <Button variant="secondary" size="small" icon="edit" onPress={() => router.push(routineEditorHref({ routineId: routine._id }))}>Editar rutina</Button>
        </Card>
      ) : (
        <Card>
          <EmptyState icon="assignment" title="Sin rutina activa" message="Crea una rutina o activa una pausada desde Perfil." action="Crear rutina" onAction={() => router.push(routineEditorHref({ clientId }))} />
        </Card>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.huge * 2, gap: space.xxl },
  section: { gap: space.md },
  flex: { flex: 1, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  gridItem: { flexGrow: 1, flexBasis: '46%', minWidth: 150, gap: space.sm },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  dayColumn: { alignItems: 'center', gap: 3 },
  dayDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken },
  dayScheduled: { borderWidth: 1.5, borderColor: colors.accent, backgroundColor: 'transparent' },
  dayMissed: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  dayDone: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  dayToday: { transform: [{ scale: 1.08 }] },
  dayLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  dayLabelToday: { color: colors.text, fontWeight: '800' },
  alertGroup: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  allGood: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, backgroundColor: colors.successSoft },
  groupLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingRight: space.md, paddingLeft: space.lg },
  alertStripe: { position: 'absolute', left: 0, top: space.md, bottom: space.md, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  alertLevel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { backgroundColor: colors.surfaceRaised },
  kpiLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  kpiValue: { fontSize: 26, lineHeight: 30 },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  toggleText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  toggleIcon: { color: colors.accent },
  table: { gap: space.sm },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  tableHead: { flex: 1, color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', textAlign: 'right' },
  tableLabel: { flex: 1.6, textAlign: 'left' },
  tableCell: { flex: 1, color: colors.textSecondary, fontSize: 13, textAlign: 'right' },
  tableCurrent: { color: colors.text, fontWeight: '700' },
  tableChange: { flex: 1.1, alignItems: 'flex-end', textAlign: 'right' },
  routineTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
}));
