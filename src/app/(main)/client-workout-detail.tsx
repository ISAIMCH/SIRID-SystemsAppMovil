import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/hooks/haptics';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, getApiErrorMessage } from '@/features/gymgo/api';
import type { Routine, WorkoutSessionLog } from '@/features/gymgo/types';
import { Segmented } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';

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

function createSlides(mode: Mode, now = new Date(), sessions: WorkoutSession[] = []): Slide[] {
  const today = startOfDay(now);
  const count = mode === 'day' ? 90 : 24;
  const slides = Array.from({ length: count }, (_, index) => {
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
  if (mode !== 'day') return slides.reverse();
  const dates = new Set(slides.map((slide) => slide.start.getTime()));
  sessions.forEach((session) => {
    const date = startOfDay(new Date(session.completedAt));
    if (!dates.has(date.getTime())) {
      slides.push({ key: `${mode}-${date.toISOString()}`, mode, start: date, end: addDays(date, 1), label: formatDate(date) });
    }
  });
  return slides.sort((a, b) => a.start.getTime() - b.start.getTime());
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

function DetailSlide({ slide, sessions, targetMap, width, onInfo, onEdit, onDelete }: { slide: Slide; sessions: WorkoutSession[]; targetMap: Map<string, TargetData>; width: number; onInfo: () => void; onEdit: (session: WorkoutSession) => void; onDelete: (session: WorkoutSession) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
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
      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator contentContainerStyle={styles.slideContent}>
      <Text style={styles.periodLabel}><MaterialIcons name="event" size={16} color={colors.accent} /> {slide.label}</Text>
      <View style={styles.detailCard}>
        <View style={styles.cardEyebrowRow}>
          <Text style={styles.cardEyebrow}>CALORÍAS QUEMADAS</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cómo se calculan las calorías" onPress={onInfo} hitSlop={8}>
            <MaterialIcons name="info-outline" size={18} color={colors.textSecondary} />
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
                <SessionSection key={session._id} session={session} sessionIndex={sessionIndex} targetMap={targetMap} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="fitness-center" size={28} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Sin entrenamiento registrado este día</Text>
          </View>
        )}
      </View>
      </ScrollView>
    </Animated.View>
  );
}

function ExerciseRow({ exercise, showRest = true }: { exercise: ExerciseSummary; showRest?: boolean }) {
  const styles = useStyles();
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

function SessionSection({ session, sessionIndex, targetMap, onEdit, onDelete }: { session: WorkoutSession; sessionIndex: number; targetMap: Map<string, TargetData>; onEdit: (session: WorkoutSession) => void; onDelete: (session: WorkoutSession) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const completedDate = new Date(session.completedAt);
  const performedDay = completedDate.getDay();
  const isMakeup = session.trainingDay !== performedDay;
  const routineTitle = session.routineTitle
    || (session.routine && typeof session.routine === 'object' ? session.routine.title : undefined)
    || 'Rutina registrada';
  return (
    <View style={styles.sessionSection}>
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionTitle}>Entrenamiento {sessionIndex + 1} · {formatSessionTime(session.completedAt)}</Text>
        <View style={styles.sessionActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Editar entrenamiento" onPress={() => onEdit(session)} hitSlop={8}><MaterialIcons name="edit" size={18} color={colors.accent} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Eliminar entrenamiento" onPress={() => onDelete(session)} hitSlop={8}><MaterialIcons name="delete-outline" size={19} color={colors.danger} /></Pressable>
        </View>
      </View>
      <View style={styles.sessionMetaRow}>
        <Text style={styles.sessionMeta}>{routineTitle}</Text>
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
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.metricChip}>
      <View style={styles.metricHeader}>
        <MaterialIcons name={icon} size={16} color={colors.accent} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function ClientWorkoutDetailScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Slide>>(null);
  const [mode, setMode] = useState<Mode>('day');
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [targetMap, setTargetMap] = useState<Map<string, TargetData>>(new Map());
  const [showCalorieInfo, setShowCalorieInfo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(startOfDay(new Date()));
  const [editingSession, setEditingSession] = useState<WorkoutSession | null>(null);
  const [editBlocks, setEditBlocks] = useState<NonNullable<WorkoutSession['blocks']>>([]);
  const [editForm, setEditForm] = useState({ perceivedExertion: '', clientNotes: '', durationMinutes: '' });
  const slides = useMemo(() => createSlides(mode, new Date(), sessions), [mode, sessions]);

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

  const jumpToDate = (date: Date) => {
    const selected = startOfDay(date);
    const index = slides.findIndex((slide) => mode === 'day'
      ? slide.start.getTime() === selected.getTime()
      : selected >= slide.start && selected < slide.end);
    if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true });
    setCalendarVisible(false);
  };

  const deleteSession = (session: WorkoutSession) => {
    Alert.alert('Eliminar entrenamiento', 'Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/workouts/${session._id}`);
          setSessions((current) => current.filter((entry) => entry._id !== session._id));
        } catch (requestError) {
          setError(getApiErrorMessage(requestError, 'No se pudo eliminar el entrenamiento.'));
        }
      } },
    ]);
  };

  const openEditor = (session: WorkoutSession) => {
    setEditingSession(session);
    setEditForm({
      perceivedExertion: session.perceivedExertion ? String(session.perceivedExertion) : '',
      clientNotes: session.clientNotes ?? '',
      durationMinutes: String(session.durationMinutes),
    });
    setEditBlocks(JSON.parse(JSON.stringify(session.blocks ?? [])) as NonNullable<WorkoutSession['blocks']>);
  };

  const saveEdit = async () => {
    if (!editingSession) return;
    const payload = {
      perceivedExertion: editForm.perceivedExertion ? Number(editForm.perceivedExertion) : null,
      clientNotes: editForm.clientNotes.trim() || null,
      durationMinutes: Number(editForm.durationMinutes),
      blocks: editBlocks,
    };
    try {
      const response = await api.patch<{ session: WorkoutSession }>(`/workouts/${editingSession._id}`, payload);
      setSessions((current) => current.map((session) => session._id === editingSession._id ? response.data.session : session));
      setEditingSession(null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo actualizar el entrenamiento.'));
    }
  };

  const updateEditExercise = (blockIndex: number, setIndex: number, exerciseIndex: number, changes: Partial<LoggedExercise>) => {
    setEditBlocks((blocks) => blocks.map((block, currentBlock) => currentBlock !== blockIndex ? block : {
      ...block,
      sets: block.sets.map((set, currentSet) => currentSet !== setIndex ? set : {
        ...set,
        exercises: set.exercises.map((exercise, currentExercise) => currentExercise !== exerciseIndex ? exercise : { ...exercise, ...changes }),
      }),
    }));
  };

  return (
    <View style={styles.safeArea}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Progreso</Text>
          <Text style={styles.title} accessibilityRole="header">Tu actividad</Text>
        </View>
        <Pressable style={styles.periodPicker} onPress={() => setCalendarVisible(true)} accessibilityRole="button" accessibilityLabel="Abrir calendario del historial">
          <MaterialIcons name="calendar-month" size={20} color={colors.accent} />
          <Text style={styles.periodPickerText}>Fecha</Text>
        </Pressable>
      </View>
      <Segmented value={mode} onChange={selectMode} options={modes.map((item) => ({ value: item.value, label: item.label }))} style={styles.segmented} />
      {isLoading ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        initialScrollIndex={slides.length - 1}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }: ListRenderItemInfo<Slide>) => <DetailSlide slide={item} sessions={sessions} targetMap={targetMap} width={width} onInfo={() => setShowCalorieInfo(true)} onEdit={openEditor} onDelete={deleteSession} />}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />
      <Modal visible={calendarVisible} transparent animationType="fade" onRequestClose={() => setCalendarVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <Pressable onPress={() => setCalendarMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))} hitSlop={10}><MaterialIcons name="chevron-left" size={24} color={colors.text} /></Pressable>
              <Text style={styles.modalTitle}>{calendarMonth.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</Text>
              <Pressable onPress={() => setCalendarMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))} hitSlop={10}><MaterialIcons name="chevron-right" size={24} color={colors.text} /></Pressable>
            </View>
            <View style={styles.calendarWeek}>{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => <Text key={index} style={styles.calendarWeekday}>{day}</Text>)}</View>
            <View style={styles.calendarGrid}>
              {Array.from({ length: (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() + 6) % 7 }, (_, index) => <View key={`empty-${index}`} style={styles.calendarDay} />)}
              {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => {
                const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1);
                const hasWorkout = sessions.some((session) => startOfDay(new Date(session.completedAt)).getTime() === date.getTime());
                return <Pressable key={date.toISOString()} style={styles.calendarDay} onPress={() => jumpToDate(date)}><Text style={styles.calendarDayText}>{index + 1}</Text>{hasWorkout ? <View style={styles.calendarDot} /> : null}</Pressable>;
              })}
            </View>
            <Pressable style={styles.modalClose} onPress={() => setCalendarVisible(false)}><Text style={styles.modalCloseText}>Cerrar</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(editingSession)} transparent animationType="slide" onRequestClose={() => setEditingSession(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar entrenamiento</Text>
            <Text style={styles.inputLabel}>RPE (1-5)</Text>
            <TextInput keyboardType="number-pad" value={editForm.perceivedExertion} onChangeText={(value) => setEditForm((form) => ({ ...form, perceivedExertion: value.replace(/\D/g, '').slice(0, 1) }))} style={styles.editInput} />
            <Text style={styles.inputLabel}>Duración (minutos)</Text>
            <TextInput keyboardType="number-pad" value={editForm.durationMinutes} onChangeText={(value) => setEditForm((form) => ({ ...form, durationMinutes: value.replace(/\D/g, '') }))} style={styles.editInput} />
            <Text style={styles.inputLabel}>Notas</Text>
            <TextInput multiline value={editForm.clientNotes} onChangeText={(value) => setEditForm((form) => ({ ...form, clientNotes: value }))} style={[styles.editInput, styles.notesInput]} />
            <ScrollView style={styles.editSets} nestedScrollEnabled>
              {editBlocks.map((block, blockIndex) => block.sets.map((set, setIndex) => set.exercises.map((exercise, exerciseIndex) => (
                <View key={`${blockIndex}-${setIndex}-${exerciseIndex}`} style={styles.editSetRow}>
                  <Text style={styles.editSetLabel}>Serie {set.setNumber} · {exercise.exerciseName}</Text>
                  {exercise.metricType === 'cardio' ? (
                    <TextInput keyboardType="decimal-pad" placeholder="Duración / distancia / nivel" placeholderTextColor={colors.textSecondary} value={exercise.durationMinutes?.toString() ?? exercise.distanceKm?.toString() ?? exercise.level?.toString() ?? ''} onChangeText={(value) => updateEditExercise(blockIndex, setIndex, exerciseIndex, { durationMinutes: Number(value) || undefined })} style={styles.editInput} />
                  ) : (
                    <View style={styles.editMetricRow}>
                      <TextInput keyboardType="number-pad" placeholder="Reps" placeholderTextColor={colors.textSecondary} value={exercise.reps?.toString() ?? ''} onChangeText={(value) => updateEditExercise(blockIndex, setIndex, exerciseIndex, { reps: Number(value) || undefined })} style={[styles.editInput, styles.editMetricInput]} />
                      <TextInput keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={colors.textSecondary} value={exercise.weightKg?.toString() ?? ''} onChangeText={(value) => updateEditExercise(blockIndex, setIndex, exerciseIndex, { weightKg: Number(value) || undefined })} style={[styles.editInput, styles.editMetricInput]} />
                    </View>
                  )}
                </View>
              ))))}
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => void saveEdit()}><Text style={styles.modalCloseText}>Guardar cambios</Text></Pressable>
            <Pressable onPress={() => setEditingSession(null)}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
          </View>
        </View>
      </Modal>
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

const useStyles = makeStyles(({ colors }) => ({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 20, paddingBottom: 4 },
  headerText: { flex: 1, gap: 2 },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: '800', fontFamily: 'display' },
  segmented: { marginHorizontal: 20, marginTop: 12, marginBottom: 12 },
  calendarWeekday: { width: 36, textAlign: 'center', color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  loader: { marginVertical: 12 },
  error: { color: colors.danger, paddingHorizontal: 20, paddingBottom: 12, textAlign: 'center' },
  slide: { paddingHorizontal: 16 },
  slideContent: { paddingBottom: 120 },
  periodLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  periodPicker: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  periodPickerText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  detailCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 18, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 4 },
  cardEyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardEyebrow: { color: colors.textSecondary, fontSize: 12, fontWeight: '900' },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 20 },
  kcalValue: { color: colors.text, fontSize: 56, lineHeight: 60, fontWeight: '800', fontFamily: 'display' },
  kcalUnit: { color: colors.textSecondary, fontSize: 15, fontWeight: '800' },
  hourlyChart: { height: 76, flexDirection: 'row', alignItems: 'flex-end', gap: 3, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 20, paddingHorizontal: 2 },
  hourColumn: { flex: 1, height: 68, alignItems: 'center', justifyContent: 'flex-end' },
  hourBar: { width: '100%', maxWidth: 10, minHeight: 3, borderRadius: 4, backgroundColor: colors.accentFill },
  hourLabel: { color: colors.textSecondary, fontSize: 8, marginTop: 3 },
  hourLabelSpacer: { height: 13 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  metricChip: { width: '47%', minHeight: 78, justifyContent: 'space-between', backgroundColor: colors.surfaceRaised, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '900' },
  metricValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  restSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  restSummaryText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', backgroundColor: colors.surfaceRaised, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  sectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '900', marginBottom: 10 },
  notesSection: { gap: 7, marginBottom: 20 },
  noteCard: { gap: 4, backgroundColor: colors.surfaceRaised, borderRadius: 10, padding: 10 },
  noteMeta: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  noteText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  sessionList: { gap: 18 },
  sessionSection: { gap: 10 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sessionActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  sessionTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  sessionMeta: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  makeupBadge: { color: colors.onAccentFill, backgroundColor: colors.warning, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, fontSize: 12, fontWeight: '900' },
  sessionRestSummary: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  blockSection: { gap: 6 },
  blockRest: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  setRestList: { gap: 5 },
  setRestRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  setRestLabel: { color: colors.text, fontSize: 12, fontWeight: '800' },
  setRestValue: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  addedRest: { color: colors.warning, fontSize: 12, fontWeight: '800' },
  skippedRest: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  exerciseList: { gap: 9 },
  exerciseRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 5 },
  exerciseName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  exerciseTarget: { color: colors.textSecondary, fontSize: 12 },
  exerciseRest: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  exerciseLogged: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  exerciseSkipped: { color: colors.warning },
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 42 },
  emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', backgroundColor: colors.scrim, padding: 16 },
  modalCard: { width: '100%', maxWidth: 420, gap: 14, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 20, paddingBottom: 24 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  modalBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  modalClose: { alignItems: 'center', justifyContent: 'center', minHeight: 50, borderRadius: 10, backgroundColor: colors.accentFill },
  modalCloseText: { color: colors.onAccentFill, fontSize: 14, fontWeight: '900' },
  calendarCard: { width: '100%', maxWidth: 420, gap: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 20, paddingBottom: 24 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarWeek: { flexDirection: 'row', justifyContent: 'space-between' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDay: { width: '14.285%', minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 3 },
  calendarDayText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  calendarDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accentFill },
  inputLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  editInput: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surfaceRaised, color: colors.text, paddingHorizontal: 12 },
  notesInput: { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },
  editSets: { maxHeight: 220 },
  editSetRow: { gap: 6, paddingVertical: 6 },
  editSetLabel: { color: colors.text, fontSize: 12, fontWeight: '800' },
  editMetricRow: { flexDirection: 'row', gap: 8 },
  editMetricInput: { flex: 1 },
  cancelText: { color: colors.textSecondary, textAlign: 'center', fontWeight: '800', paddingVertical: 8 },
}));
