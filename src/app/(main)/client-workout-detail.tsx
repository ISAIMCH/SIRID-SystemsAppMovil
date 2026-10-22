import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, getApiErrorMessage } from '@/features/gymgo/api';
import type { Routine, WorkoutSessionLog } from '@/features/gymgo/types';

const dark = {
  background: '#121212',
  surface: '#18181B',
  elevated: '#1E1E1E',
  border: '#27272A',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  neon: '#10FF85',
  orange: '#FF7043',
};

type Mode = 'day' | 'week' | 'month';
type WorkoutSession = WorkoutSessionLog & {
  caloriesBurned?: number;
  perceivedExertion?: number;
  clientNotes?: string;
};
type Slide = { key: string; mode: Mode; start: Date; end: Date; label: string };
type ExerciseSummary = {
  key: string;
  name: string;
  target: string;
  logged: string;
  restSeconds: number[];
};
type TargetData = { label: string; sets: number };
type SessionBlock = NonNullable<WorkoutSession['blocks']>[number];
type LoggedExercise = SessionBlock['sets'][number]['exercises'][number];

const modes: { value: Mode; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];
const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfWeek(date: Date) {
  const result = startOfDay(date);
  const day = result.getDay();
  result.setDate(result.getDate() - ((day + 6) % 7));
  return result;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function formatSessionTime(value: string) {
  return new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function formatSessionDate(value: string) {
  return new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function sessionActiveMinutes(session: WorkoutSession) {
  if (session.activeDurationMinutes !== undefined) return session.activeDurationMinutes;
  return Math.max(0, session.durationMinutes - (session.totalRestSeconds ?? 0) / 60);
}

function sessionTargetSets(session: WorkoutSession, targetMap: Map<string, TargetData>) {
  if (session.targetSetsTotal !== undefined && session.targetSetsTotal !== null) return session.targetSetsTotal;
  const blocks = session.blocks ?? [];
  if (blocks.some((block) => block.targetSets !== undefined && block.targetSets !== null)) {
    return blocks.reduce((total, block) => total + (block.targetSets ?? block.sets.length), 0);
  }
  return blocks.reduce((total, block) => {
    const targetSetCount = targetMap.get(block.sets[0]?.exercises[0]?.routineExerciseId)?.sets ?? 0;
    return total + Math.max(block.sets.length, targetSetCount);
  }, 0);
}

function createSlides(mode: Mode, now = new Date()): Slide[] {
  const today = startOfDay(now);
  return Array.from({ length: 7 }, (_, index) => {
    if (mode === 'day') {
      const start = addDays(today, -index);
      return { key: `${mode}-${start.toISOString()}`, mode, start, end: addDays(start, 1), label: formatDate(start) };
    }
    if (mode === 'week') {
      const start = addDays(startOfWeek(today), -index * 7);
      const end = addDays(start, 7);
      return { key: `${mode}-${start.toISOString()}`, mode, start, end, label: `${formatDate(start)} - ${formatDate(addDays(end, -1))}` };
    }
    const start = new Date(today.getFullYear(), today.getMonth() - index, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return {
      key: `${mode}-${start.toISOString()}`,
      mode,
      start,
      end,
      label: start.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
    };
  });
}

function sessionMatches(session: WorkoutSession, slide: Slide) {
  const completedAt = new Date(session.completedAt);
  return completedAt >= slide.start && completedAt < slide.end;
}

function buildTargetMap(routines: Routine[]) {
  const targets = new Map<string, TargetData>();
  for (const routine of routines) {
    for (const exercise of routine.exercises ?? routine.blocks?.flatMap((block) => block.exercises) ?? []) {
      targets.set(exercise._id ?? exercise.name, {
        label: exercise.metricType === 'cardio'
          ? [exercise.targetDurationMinutes ? `${exercise.targetDurationMinutes} min` : '', exercise.targetDistanceKm !== undefined ? `${exercise.targetDistanceKm} km` : '', exercise.targetLevel !== undefined ? `nivel ${exercise.targetLevel}` : ''].filter(Boolean).join(' · ') || 'Objetivo no disponible'
          : `${exercise.reps ?? '—'} reps · ${exercise.suggestedWeight ?? '—'} kg`,
        sets: exercise.sets ?? 0,
      });
    }
  }
  return targets;
}

function formatLoggedExercise(exercise: LoggedExercise) {
  if (exercise.skipped) return 'Omitido';
  if (exercise.metricType === 'cardio') {
    return [exercise.durationMinutes ? `${exercise.durationMinutes} min` : '', exercise.distanceKm !== undefined ? `${exercise.distanceKm} km` : '', exercise.level !== undefined ? `nivel ${exercise.level}` : ''].filter(Boolean).join(' · ') || 'Sin métricas';
  }
  return `${exercise.reps ?? '—'} reps · ${exercise.weightKg ?? '—'} kg`;
}

function hasTargetSnapshot(exercise: LoggedExercise) {
  return [exercise.targetReps, exercise.targetWeightKg, exercise.targetDurationMinutes, exercise.targetDistanceKm, exercise.targetLevel]
    .some((value) => value !== undefined && value !== null);
}

function formatExerciseTarget(exercise: LoggedExercise, targetMap: Map<string, TargetData>) {
  if (!hasTargetSnapshot(exercise)) return targetMap.get(exercise.routineExerciseId)?.label ?? 'Objetivo no disponible';
  if (exercise.metricType === 'cardio') {
    return [
      exercise.targetDurationMinutes !== null && exercise.targetDurationMinutes !== undefined ? `${exercise.targetDurationMinutes} min` : '',
      exercise.targetDistanceKm !== null && exercise.targetDistanceKm !== undefined ? `${exercise.targetDistanceKm} km` : '',
      exercise.targetLevel !== null && exercise.targetLevel !== undefined ? `nivel ${exercise.targetLevel}` : '',
    ].filter(Boolean).join(' · ') || 'Objetivo no disponible';
  }
  return `${exercise.targetReps ?? '—'} reps · ${exercise.targetWeightKg ?? '—'} kg`;
}

function summarizeBlockExercises(block: SessionBlock, targetMap: Map<string, TargetData>) {
  const summaries = new Map<string, ExerciseSummary>();
  for (const set of block.sets) {
    for (const exercise of set.exercises) {
      const current = summaries.get(exercise.routineExerciseId) ?? {
        key: exercise.routineExerciseId,
        name: exercise.exerciseName,
        target: formatExerciseTarget(exercise, targetMap),
        logged: '',
        restSeconds: [],
      };
      if (!current.restSeconds.includes(block.restSeconds)) current.restSeconds.push(block.restSeconds);
      const value = formatLoggedExercise(exercise);
      current.logged = current.logged ? `${current.logged} / ${value}` : value;
      summaries.set(exercise.routineExerciseId, current);
    }
  }
  return [...summaries.values()];
}

function DetailSlide({ slide, sessions, targetMap, width, onInfo }: { slide: Slide; sessions: WorkoutSession[]; targetMap: Map<string, TargetData>; width: number; onInfo: () => void }) {
  const [transition] = useState(() => new Animated.Value(0));
  const matchingSessions = sessions.filter((session) => sessionMatches(session, slide));
  const calories = matchingSessions.reduce((total, session) => total + (session.caloriesBurned ?? 0), 0);
  const duration = matchingSessions.reduce((total, session) => total + session.durationMinutes, 0);
  const activeDuration = matchingSessions.reduce((total, session) => total + sessionActiveMinutes(session), 0);
  const totalRestSeconds = matchingSessions.reduce((total, session) => total + (session.totalRestSeconds ?? 0), 0);
  const volume = matchingSessions.reduce((total, session) => total + session.totalVolumeKg, 0);
  const sets = matchingSessions.reduce((total, session) => total + (session.blocks ?? []).reduce((blockTotal, block) => blockTotal + block.sets.length, 0), 0);
  const targetSets = matchingSessions.reduce((total, session) => total + sessionTargetSets(session, targetMap), 0) || sets;
  const hourlyCalories = Array.from({ length: 24 }, (_, hour) => matchingSessions
    .filter((session) => new Date(session.completedAt).getHours() === hour)
    .reduce((total, session) => total + (session.caloriesBurned ?? 0), 0));
  const maximumHourlyCalories = Math.max(1, ...hourlyCalories);

  useEffect(() => {
    transition.setValue(0);
    Animated.spring(transition, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }).start();
  }, [slide.key, transition]);

  const rpeValues = matchingSessions
    .map((session) => session.perceivedExertion)
    .filter((value): value is number => typeof value === 'number');
  const averageRpe = rpeValues.length
    ? (rpeValues.reduce((total, value) => total + value, 0) / rpeValues.length).toFixed(1)
    : '—';
  const notes = matchingSessions
    .map((session) => ({ session, note: session.clientNotes?.trim() }))
    .filter((entry): entry is { session: WorkoutSession; note: string } => Boolean(entry.note));
  const sortedSessions = [...matchingSessions].sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());

  return (
    <Animated.View style={[styles.slide, { width, opacity: transition, transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      <Text style={styles.periodLabel}>{slide.label}</Text>
      <View style={styles.detailCard}>
        <View style={styles.cardEyebrowRow}>
          <Text style={styles.cardEyebrow}>CALORÍAS QUEMADAS</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cómo se calculan las calorías" onPress={onInfo} hitSlop={8}>
            <MaterialIcons name="info-outline" size={18} color={dark.muted} />
          </Pressable>
        </View>
        <View style={styles.kcalRow}>
          <Text style={styles.kcalValue}>{Math.round(calories)}</Text>
          <Text style={styles.kcalUnit}>kcal</Text>
        </View>
        <View style={styles.hourlyChart}>
          {hourlyCalories.map((value, hour) => (
            <View key={hour} style={styles.hourColumn}>
              <View style={[styles.hourBar, { height: Math.max(3, (value / maximumHourlyCalories) * 54) }]} />
              {hour % 6 === 0 ? <Text style={styles.hourLabel}>{String(hour).padStart(2, '0')}</Text> : <View style={styles.hourLabelSpacer} />}
            </View>
          ))}
        </View>
        {matchingSessions.length ? (
          <>
            <View style={styles.metricsGrid}>
              <Metric icon="schedule" label="TIEMPO ACTIVO" value={`${Math.round(activeDuration)} min`} />
              <Metric icon="fitness-center" label="VOLUMEN TOTAL" value={`${Math.round(volume)} kg`} />
              <Metric icon="check-circle" label="SERIES COMPLETADAS" value={`${sets}/${targetSets}`} />
              <Metric icon="insights" label="RPE" value={averageRpe} />
            </View>
            <View style={styles.restSummary}>
              <Text style={styles.restSummaryText}>Descanso total: {Math.round(totalRestSeconds)}s</Text>
              <Text style={styles.restSummaryText}>Tiempo transcurrido: {Math.round(duration)} min</Text>
            </View>
            {notes.length ? (
              <View style={styles.notesSection}>
                <Text style={styles.sectionLabel}>NOTAS DEL ENTRENAMIENTO</Text>
                {notes.map(({ session, note }) => (
                  <View key={`${session._id}-${note}`} style={styles.noteCard}>
                    <Text style={styles.noteMeta}>{formatSessionDate(session.completedAt)} · {formatSessionTime(session.completedAt)}</Text>
                    <Text style={styles.noteText}>{note}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={styles.sectionLabel}>EJERCICIOS</Text>
            <View style={styles.sessionList}>
              {sortedSessions.map((session, sessionIndex) => (
                <SessionSection key={session._id} session={session} sessionIndex={sessionIndex} targetMap={targetMap} />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="fitness-center" size={28} color={dark.muted} />
            <Text style={styles.emptyText}>Sin entrenamiento registrado este día</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function ExerciseRow({ exercise, showRest = true }: { exercise: ExerciseSummary; showRest?: boolean }) {
  const skipped = exercise.logged.split(' / ').every((value) => value === 'Omitido');
  return (
    <View style={styles.exerciseRow}>
      <Text style={styles.exerciseName}>{exercise.name}</Text>
      <Text style={styles.exerciseTarget}>Objetivo: {exercise.target}</Text>
      {showRest && exercise.restSeconds.length ? <Text style={styles.exerciseRest}>Descanso: {exercise.restSeconds.join('s · ')}s</Text> : null}
      <Text style={[styles.exerciseLogged, skipped && styles.exerciseSkipped]}>{skipped ? 'Omitido' : `Registrado: ${exercise.logged}`}</Text>
    </View>
  );
}

function SessionSection({ session, sessionIndex, targetMap }: { session: WorkoutSession; sessionIndex: number; targetMap: Map<string, TargetData> }) {
  const completedDate = new Date(session.completedAt);
  const performedDay = completedDate.getDay();
  const isMakeup = session.trainingDay !== performedDay;
  return (
    <View style={styles.sessionSection}>
      <Text style={styles.sessionTitle}>Entrenamiento {sessionIndex + 1} · {formatSessionTime(session.completedAt)}</Text>
      <View style={styles.sessionMetaRow}>
        <Text style={styles.sessionMeta}>{session.routineTitle ?? (typeof session.routine === 'object' ? session.routine.title : undefined) ?? 'Rutina'}</Text>
        <Text style={styles.sessionMeta}>Rutina de {dayNames[session.trainingDay] ?? 'día desconocido'}</Text>
        {isMakeup ? <Text style={styles.makeupBadge}>Recuperada · Rutina de {dayNames[session.trainingDay]}</Text> : null}
      </View>
      <Text style={styles.sessionRestSummary}>
        Descanso total: {Math.round(session.totalRestSeconds ?? 0)}s · Tiempo activo: {Math.round(sessionActiveMinutes(session))} min
      </Text>
      {(session.blocks ?? []).map((block, blockIndex) => (
        <View key={`${session._id}-${block.routineBlockId}-${blockIndex}`} style={styles.blockSection}>
          <Text style={styles.blockRest}>Descanso objetivo: {block.restSeconds}s</Text>
          <View style={styles.setRestList}>
            {block.sets.map((set) => (
              <View key={`${session._id}-${blockIndex}-${set.setNumber}`} style={styles.setRestRow}>
                <Text style={styles.setRestLabel}>Serie {set.setNumber}</Text>
                <Text style={styles.setRestValue}>{set.actualRestSeconds ?? 0}s</Text>
                {(set.addedRestCount ?? 0) > 0 ? <Text style={styles.addedRest}>+15s ×{set.addedRestCount}</Text> : null}
                {set.restSkipped ? <Text style={styles.skippedRest}>Descanso saltado</Text> : null}
              </View>
            ))}
          </View>
          <View style={styles.exerciseList}>
            {summarizeBlockExercises(block, targetMap).map((exercise) => (
              <ExerciseRow key={exercise.key} exercise={exercise} showRest={false} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function Metric({ icon, label, value }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.metricChip}>
      <View style={styles.metricHeader}>
        <MaterialIcons name={icon} size={16} color={dark.neon} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function ClientWorkoutDetailScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Slide>>(null);
  const [mode, setMode] = useState<Mode>('day');
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [targetMap, setTargetMap] = useState<Map<string, TargetData>>(new Map());
  const [showCalorieInfo, setShowCalorieInfo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const slides = useMemo(() => createSlides(mode).reverse(), [mode]);

  useEffect(() => {
    listRef.current?.scrollToIndex({ index: slides.length - 1, animated: false });
  }, [slides]);

  useEffect(() => {
    let isCurrent = true;
    api.get<{ sessions: WorkoutSession[] }>('/workouts/me')
      .then((response) => {
        if (isCurrent) setSessions(response.data.sessions);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar tu historial de entrenamientos.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    api.get<{ routines: Routine[] }>('/routines')
      .then((response) => {
        if (isCurrent) setTargetMap(buildTargetMap(response.data.routines));
      })
      .catch(() => undefined);
    return () => { isCurrent = false; };
  }, []);

  const selectMode = (nextMode: Mode) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(nextMode);
  };

  return (
    <View style={styles.safeArea}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => { if (router.canGoBack()) { router.back(); } else { router.push('/(main)/billing'); } }}
          style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={dark.text} />
        </Pressable>
        <Text style={styles.title}>Detalle de actividad</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.segmented}>
        {modes.map((item) => (
          <Pressable key={item.value} onPress={() => selectMode(item.value)} style={[styles.segment, mode === item.value && styles.segmentSelected]}>
            <Text style={[styles.segmentText, mode === item.value && styles.segmentTextSelected]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? <ActivityIndicator color={dark.neon} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        initialScrollIndex={slides.length - 1}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }: ListRenderItemInfo<Slide>) => <DetailSlide slide={item} sessions={sessions} targetMap={targetMap} width={width} onInfo={() => setShowCalorieInfo(true)} />}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />
      <Modal visible={showCalorieInfo} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCalorieInfo(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cálculo de calorías</Text>
            <Text style={styles.modalBody}>Estimamos las calorías usando la metodología MET (equivalente metabólico de la actividad), considerando la duración del entrenamiento, tu peso corporal, la intensidad del ejercicio y el volumen registrado.</Text>
            <Pressable accessibilityRole="button" onPress={() => setShowCalorieInfo(false)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: dark.background },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: dark.border },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 42 },
  title: { flex: 1, color: dark.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  segmented: { flexDirection: 'row', margin: 16, padding: 4, borderRadius: 999, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, shadowColor: '#000000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4 },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  segmentSelected: { backgroundColor: dark.neon },
  segmentText: { color: dark.muted, fontSize: 13, fontWeight: '700' },
  segmentTextSelected: { color: '#081009', fontWeight: '900' },
  loader: { marginVertical: 12 },
  error: { color: '#FF8A80', paddingHorizontal: 20, paddingBottom: 12, textAlign: 'center' },
  slide: { paddingHorizontal: 16, paddingBottom: 28 },
  periodLabel: { color: dark.muted, fontSize: 14, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  detailCard: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 16, padding: 18, shadowColor: '#000000', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 4 },
  cardEyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardEyebrow: { color: dark.muted, fontSize: 10, fontWeight: '900' },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 20 },
  kcalValue: { color: dark.neon, fontSize: 48, fontWeight: '900' },
  kcalUnit: { color: dark.muted, fontSize: 15, fontWeight: '800' },
  hourlyChart: { height: 76, flexDirection: 'row', alignItems: 'flex-end', gap: 3, borderBottomWidth: 1, borderBottomColor: dark.border, marginBottom: 20, paddingHorizontal: 2 },
  hourColumn: { flex: 1, height: 68, alignItems: 'center', justifyContent: 'flex-end' },
  hourBar: { width: '100%', maxWidth: 10, minHeight: 3, borderRadius: 4, backgroundColor: dark.neon },
  hourLabel: { color: dark.muted, fontSize: 8, marginTop: 3 },
  hourLabelSpacer: { height: 13 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  metricChip: { width: '47%', minHeight: 78, justifyContent: 'space-between', backgroundColor: dark.elevated, borderRadius: 14, borderWidth: 1, borderColor: dark.border, padding: 12 },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricLabel: { color: dark.muted, fontSize: 9, fontWeight: '900' },
  metricValue: { color: dark.text, fontSize: 15, fontWeight: '800' },
  restSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  restSummaryText: { color: dark.muted, fontSize: 11, fontWeight: '700', backgroundColor: dark.elevated, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  sectionLabel: { color: dark.muted, fontSize: 10, fontWeight: '900', marginBottom: 10 },
  notesSection: { gap: 7, marginBottom: 20 },
  noteCard: { gap: 4, backgroundColor: dark.elevated, borderRadius: 10, padding: 10 },
  noteMeta: { color: dark.muted, fontSize: 10, fontWeight: '800' },
  noteText: { color: dark.text, fontSize: 12, lineHeight: 18 },
  sessionList: { gap: 18 },
  sessionSection: { gap: 10 },
  sessionTitle: { color: dark.text, fontSize: 13, fontWeight: '900' },
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  sessionMeta: { color: dark.muted, fontSize: 11, fontWeight: '700' },
  makeupBadge: { color: '#081009', backgroundColor: '#F7C948', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, fontSize: 10, fontWeight: '900' },
  sessionRestSummary: { color: dark.muted, fontSize: 10, fontWeight: '700' },
  blockSection: { gap: 6 },
  blockRest: { color: dark.muted, fontSize: 10, fontWeight: '800' },
  setRestList: { gap: 5 },
  setRestRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  setRestLabel: { color: dark.text, fontSize: 10, fontWeight: '800' },
  setRestValue: { color: dark.neon, fontSize: 10, fontWeight: '800' },
  addedRest: { color: '#F7C948', fontSize: 10, fontWeight: '800' },
  skippedRest: { color: '#FF9868', fontSize: 10, fontWeight: '800' },
  exerciseList: { gap: 9 },
  exerciseRow: { borderTopWidth: 1, borderTopColor: dark.border, paddingTop: 12, gap: 5 },
  exerciseName: { color: dark.text, fontSize: 14, fontWeight: '800' },
  exerciseTarget: { color: dark.muted, fontSize: 11 },
  exerciseRest: { color: dark.muted, fontSize: 10, fontWeight: '700' },
  exerciseLogged: { color: dark.neon, fontSize: 11, fontWeight: '700' },
  exerciseSkipped: { color: '#F7C948' },
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 42 },
  emptyText: { color: dark.muted, fontSize: 13, textAlign: 'center' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', backgroundColor: '#000000C7', padding: 16 },
  modalCard: { width: '100%', maxWidth: 420, gap: 14, borderRadius: 24, borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, padding: 20, paddingBottom: 24 },
  modalTitle: { color: dark.text, fontSize: 18, fontWeight: '800' },
  modalBody: { color: dark.muted, fontSize: 14, lineHeight: 21 },
  modalClose: { alignItems: 'center', justifyContent: 'center', minHeight: 50, borderRadius: 10, backgroundColor: dark.neon },
  modalCloseText: { color: '#081009', fontSize: 14, fontWeight: '900' },
});
