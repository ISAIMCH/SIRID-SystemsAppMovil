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
  surface: '#1E1E1E',
  border: '#27342E',
  text: '#F4F8F5',
  muted: '#91A098',
  neon: '#9BFF63',
  orange: '#FF7043',
};

type Mode = 'day' | 'week' | 'month';
type WorkoutSession = WorkoutSessionLog & { caloriesBurned?: number; rpe?: number };
type Slide = { key: string; mode: Mode; start: Date; end: Date; label: string };
type ExerciseSummary = {
  key: string;
  name: string;
  target: string;
  logged: string;
};
type TargetData = { label: string; sets: number };

const modes: { value: Mode; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];

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

function summarizeExercises(sessions: WorkoutSession[], targetMap: Map<string, TargetData>): ExerciseSummary[] {
  const summaries = new Map<string, ExerciseSummary>();
  for (const session of sessions) {
    for (const block of session.blocks ?? []) {
      for (const set of block.sets) {
        for (const exercise of set.exercises) {
          const current = summaries.get(exercise.routineExerciseId) ?? {
            key: exercise.routineExerciseId,
            name: exercise.exerciseName,
            target: targetMap.get(exercise.routineExerciseId)?.label ?? 'Objetivo no disponible',
            logged: '',
          };
          const value = exercise.metricType === 'cardio'
            ? [exercise.durationMinutes ? `${exercise.durationMinutes} min` : '', exercise.distanceKm !== undefined ? `${exercise.distanceKm} km` : '', exercise.level !== undefined ? `nivel ${exercise.level}` : ''].filter(Boolean).join(' · ')
            : `${exercise.reps ?? '—'} reps · ${exercise.weightKg ?? '—'} kg`;
          current.logged = current.logged ? `${current.logged} / ${value}` : value;
          summaries.set(exercise.routineExerciseId, current);
        }
      }
    }
  }
  return [...summaries.values()];
}

function DetailSlide({ slide, sessions, targetMap, width, onInfo }: { slide: Slide; sessions: WorkoutSession[]; targetMap: Map<string, TargetData>; width: number; onInfo: () => void }) {
  const transition = useRef(new Animated.Value(0)).current;
  const matchingSessions = sessions.filter((session) => sessionMatches(session, slide));
  const calories = matchingSessions.reduce((total, session) => total + (session.caloriesBurned ?? 0), 0);
  const duration = matchingSessions.reduce((total, session) => total + session.durationMinutes, 0);
  const volume = matchingSessions.reduce((total, session) => total + session.totalVolumeKg, 0);
  const sets = matchingSessions.reduce((total, session) => total + (session.blocks ?? []).reduce((blockTotal, block) => blockTotal + block.sets.length, 0), 0);
  const targetSets = matchingSessions.reduce((total, session) => total + (session.blocks ?? []).reduce((blockTotal, block) => {
    const targetSetCount = targetMap.get(block.sets[0]?.exercises[0]?.routineExerciseId)?.sets ?? 0;
    return blockTotal + Math.max(block.sets.length, targetSetCount);
  }, 0), 0) || sets;
  const hourlyCalories = Array.from({ length: 24 }, (_, hour) => matchingSessions
    .filter((session) => new Date(session.completedAt).getHours() === hour)
    .reduce((total, session) => total + (session.caloriesBurned ?? 0), 0));
  const maximumHourlyCalories = Math.max(1, ...hourlyCalories);
  const exercises = summarizeExercises(matchingSessions, targetMap);

  useEffect(() => {
    transition.setValue(0);
    Animated.spring(transition, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }).start();
  }, [slide.key, transition]);

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
              <Metric label="TIEMPO ACTIVO" value={`${duration} min`} />
              <Metric label="VOLUMEN TOTAL" value={`${Math.round(volume)} kg`} />
              <Metric label="SERIES COMPLETADAS" value={`${sets}/${targetSets}`} />
              <Metric label="RPE" value="—" />
            </View>
            <Text style={styles.sectionLabel}>EJERCICIOS</Text>
            <View style={styles.exerciseList}>
              {exercises.map((exercise) => (
                <View key={exercise.key} style={styles.exerciseRow}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseTarget}>Objetivo: {exercise.target}</Text>
                  <Text style={styles.exerciseLogged}>Registrado: {exercise.logged}</Text>
                </View>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricChip}>
      <Text style={styles.metricLabel}>{label}</Text>
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
  const [targetMap, setTargetMap] = useState<Map<string, string>>(new Map());
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
  segmented: { flexDirection: 'row', margin: 16, padding: 4, borderRadius: 14, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segmentSelected: { backgroundColor: '#27342E' },
  segmentText: { color: dark.muted, fontSize: 13, fontWeight: '700' },
  segmentTextSelected: { color: dark.text },
  loader: { marginVertical: 12 },
  error: { color: '#FF8A80', paddingHorizontal: 20, paddingBottom: 12, textAlign: 'center' },
  slide: { paddingHorizontal: 16, paddingBottom: 28 },
  periodLabel: { color: dark.muted, fontSize: 14, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  detailCard: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 22, padding: 18 },
  cardEyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardEyebrow: { color: dark.muted, fontSize: 10, fontWeight: '900' },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 20 },
  kcalValue: { color: dark.neon, fontSize: 48, fontWeight: '900' },
  kcalUnit: { color: dark.neon, fontSize: 15, fontWeight: '800' },
  hourlyChart: { height: 76, flexDirection: 'row', alignItems: 'flex-end', gap: 3, borderBottomWidth: 1, borderBottomColor: dark.border, marginBottom: 20, paddingHorizontal: 2 },
  hourColumn: { flex: 1, height: 68, alignItems: 'center', justifyContent: 'flex-end' },
  hourBar: { width: '100%', maxWidth: 10, minHeight: 3, borderRadius: 4, backgroundColor: dark.neon },
  hourLabel: { color: dark.muted, fontSize: 8, marginTop: 3 },
  hourLabelSpacer: { height: 13 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  metricChip: { width: '48%', minHeight: 68, justifyContent: 'space-between', backgroundColor: dark.background, borderRadius: 12, borderWidth: 1, borderColor: dark.border, padding: 11 },
  metricLabel: { color: dark.muted, fontSize: 9, fontWeight: '900' },
  metricValue: { color: dark.text, fontSize: 15, fontWeight: '800' },
  sectionLabel: { color: dark.muted, fontSize: 10, fontWeight: '900', marginBottom: 10 },
  exerciseList: { gap: 9 },
  exerciseRow: { borderTopWidth: 1, borderTopColor: dark.border, paddingTop: 10, gap: 4 },
  exerciseName: { color: dark.text, fontSize: 14, fontWeight: '800' },
  exerciseTarget: { color: dark.muted, fontSize: 11 },
  exerciseLogged: { color: dark.neon, fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 42 },
  emptyText: { color: dark.muted, fontSize: 13, textAlign: 'center' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000B8', padding: 22 },
  modalCard: { width: '100%', maxWidth: 420, gap: 14, borderRadius: 18, borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, padding: 20 },
  modalTitle: { color: dark.text, fontSize: 18, fontWeight: '800' },
  modalBody: { color: dark.muted, fontSize: 14, lineHeight: 21 },
  modalClose: { alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 6 },
  modalCloseText: { color: dark.neon, fontSize: 14, fontWeight: '800' },
});
