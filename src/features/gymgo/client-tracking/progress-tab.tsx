import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text as RNText, View } from 'react-native';

import { Chip, EmptyState, ErrorBanner, SectionHeader, Skeleton, Text } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

import type { Exercise, Routine, RoutineBlock } from '../types';
import { DeltaPill, Sparkline } from './charts';
import { blockTypeLabel, DAY_NAMES, DAY_SHORT, formatCardio, formatTopSet, nameDigest, relativeDays } from './format';
import type { ExerciseSummary } from './types';
import type { ClientTracking } from './use-client-tracking';

const PLATEAU_SESSIONS = 4;
const PREVIOUS = 'previous';

function routineBlocks(routine: Routine): RoutineBlock[] {
  if (routine.blocks?.length) return routine.blocks;
  return (routine.exercises ?? []).map((exercise, order) => ({
    _id: `legacy-${exercise._id ?? order}`,
    day: exercise.day ?? 0,
    blockType: 'single',
    sets: exercise.sets ?? 3,
    restSeconds: exercise.restSeconds ?? 60,
    order,
    exercises: [exercise],
  }));
}

function isCardio(exercise: Exercise) {
  return exercise.metricType === 'cardio' || (typeof exercise.equipmentId === 'object' && exercise.equipmentId?.type === 'cardio');
}

/** The same stable key the API gives each exercise's history. */
export function routineExerciseKey(exercise: Exercise) {
  const metric = isCardio(exercise) ? 'c' : 's';
  if (exercise.catalogExerciseId) return `c-${exercise.catalogExerciseId}-${metric}`;
  return exercise._id ? `r-${exercise._id}-${metric}-${nameDigest(exercise.name)}` : null;
}

type DayGroup = { day: number; items: { id: string; name: string; blockType: string; summary: ExerciseSummary | null; keyId: string | null }[] };

export function ProgressTab({ tracking, activeRoutine, onOpenExercise }: {
  tracking: ClientTracking;
  activeRoutine: Routine | null;
  onOpenExercise: (exercise: ExerciseSummary) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string>('all');
  const summaries = new Map((tracking.exercises ?? []).map((exercise) => [exercise.key, exercise]));

  const groups: DayGroup[] = [];
  const inRoutine = new Set<string>();
  if (activeRoutine) {
    const blocks = [...routineBlocks(activeRoutine)].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.order - b.order);
    for (const block of blocks) {
      let group = groups.find((entry) => entry.day === block.day);
      if (!group) { group = { day: block.day, items: [] }; groups.push(group); }
      block.exercises.forEach((exercise, index) => {
        const key = routineExerciseKey(exercise);
        if (key) inRoutine.add(key);
        group.items.push({
          id: `${block._id ?? block.order}-${exercise._id ?? index}`,
          name: exercise.name,
          blockType: block.blockType,
          summary: key ? summaries.get(key) ?? null : null,
          keyId: key,
        });
      });
    }
  }
  const previous = (tracking.exercises ?? []).filter((exercise) => !inRoutine.has(exercise.key));
  const visibleGroups = selected === 'all' ? groups : groups.filter((group) => String(group.day) === selected);
  const showPrevious = (selected === 'all' || selected === PREVIOUS) && previous.length > 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={tracking.isRefreshing} onRefresh={tracking.reload} tintColor={colors.accent} colors={[colors.accentFill]} progressBackgroundColor={colors.surface} />}>
      {tracking.error ? <ErrorBanner message={tracking.error} onRetry={tracking.reload} /> : null}
      {tracking.exercises === null && tracking.isLoading ? (
        <View style={styles.section}>{[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} height={64} radius={radius.md} />)}</View>
      ) : null}
      {tracking.exercises !== null ? (
        <>
          <Text variant="caption" tone="secondary">
            Toca un ejercicio para ver su historial completo, récords y comparación con el objetivo. La línea muestra sus últimos registros y el porcentaje compara el último con sus registros anteriores.
          </Text>
          {groups.length || previous.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              <Chip label="Todos" selected={selected === 'all'} onPress={() => setSelected('all')} />
              {groups.map((group) => <Chip key={group.day} label={DAY_SHORT[group.day]} selected={selected === String(group.day)} onPress={() => setSelected(String(group.day))} />)}
              {previous.length ? <Chip label="Rutinas anteriores" icon="history" selected={selected === PREVIOUS} onPress={() => setSelected(PREVIOUS)} /> : null}
            </ScrollView>
          ) : null}

          {visibleGroups.map((group) => (
            <View key={group.day} style={styles.section}>
              <SectionHeader title={DAY_NAMES[group.day]} subtitle={`${group.items.length} ${group.items.length === 1 ? 'ejercicio' : 'ejercicios'} · rutina activa`} />
              <View style={styles.group}>
                {group.items.map((item, index) => (
                  <ExerciseRow
                    key={item.id}
                    name={item.name}
                    caption={item.blockType !== 'single' ? blockTypeLabel(item.blockType) : undefined}
                    summary={item.summary}
                    divider={index < group.items.length - 1}
                    onPress={item.summary ? () => onOpenExercise(item.summary!) : undefined}
                  />
                ))}
              </View>
            </View>
          ))}

          {showPrevious ? (
            <View style={styles.section}>
              <SectionHeader title="De rutinas anteriores" subtitle="Ejercicios con historial que no están en la rutina activa" />
              <View style={styles.group}>
                {previous.map((exercise, index) => (
                  <ExerciseRow key={exercise.key} name={exercise.name} summary={exercise} divider={index < previous.length - 1} onPress={() => onOpenExercise(exercise)} />
                ))}
              </View>
            </View>
          ) : null}

          {!groups.length && !previous.length ? (
            <EmptyState icon="show-chart" title="Sin progreso que mostrar" message="Cuando el cliente registre sesiones, aquí verás la evolución de cada ejercicio." />
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const TREND_COPY = { up: 'Sube', down: 'Baja', flat: 'Estable' } as const;

function ExerciseRow({ name, caption, summary, divider, onPress }: {
  name: string;
  caption?: string;
  summary: ExerciseSummary | null;
  divider: boolean;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const last = summary?.last;
  const performance = last ? (summary.metricType === 'cardio' ? formatCardio(last) : formatTopSet(last)) : null;
  const plateau = summary?.sessionsSinceBest !== null && (summary?.sessionsSinceBest ?? 0) >= PLATEAU_SESSIONS;
  const trend = summary?.trend;
  const values = summary?.recent.map((point) => point.value) ?? [];

  let detail: { text: string; tone: 'secondary' | 'warning' };
  if (!summary) detail = { text: 'Sin registros todavía', tone: 'secondary' };
  else if (summary.lastSkipped) detail = { text: `Omitido en su última sesión${performance ? ` · antes ${performance}` : ''}`, tone: 'warning' };
  else if (plateau) detail = { text: `${performance} · sin mejora en ${summary.sessionsSinceBest} sesiones`, tone: 'warning' };
  else detail = { text: `${performance} · ${relativeDays(last!.completedAt)}`, tone: 'secondary' };

  const content = (
    <>
      <View style={styles.flex}>
        <RNText style={styles.name}>{name}{caption ? <RNText style={styles.caption}>  {caption}</RNText> : null}</RNText>
        <RNText style={[styles.detail, detail.tone === 'warning' && styles.warning]}>{detail.text}</RNText>
      </View>
      {summary ? (
        <View style={styles.trail}>
          <Sparkline values={values} tone={trend?.direction === 'down' ? 'warning' : trend?.direction === 'up' ? 'success' : 'neutral'} />
          {trend ? (
            <DeltaPill
              direction={trend.direction}
              label={trend.direction === 'flat' ? TREND_COPY.flat : `${trend.changePct > 0 ? '+' : ''}${Math.round(trend.changePct)}%`}
              tone={trend.direction === 'up' ? 'success' : trend.direction === 'down' ? 'warning' : 'neutral'}
            />
          ) : <RNText style={styles.caption}>1 registro</RNText>}
        </View>
      ) : null}
      {onPress ? <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} /> : null}
    </>
  );
  const label = `${name}. ${detail.text}${trend ? `. Tendencia: ${TREND_COPY[trend.direction]}${trend.direction === 'flat' ? '' : ` ${Math.round(trend.changePct)}%`}` : ''}`;
  if (!onPress) return <View style={[styles.row, divider && styles.divider]} accessible accessibilityLabel={label}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.huge * 2, gap: space.xl },
  section: { gap: space.md },
  filters: { gap: space.sm, paddingRight: space.xl },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingLeft: space.lg, paddingRight: space.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { backgroundColor: colors.surfaceRaised },
  flex: { flex: 1, gap: 3 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  caption: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  detail: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  warning: { color: colors.warning },
  trail: { alignItems: 'flex-end', gap: 4 },
}));
