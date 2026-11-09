import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { connectSocket } from '../../services/socket';
import { api, getApiErrorMessage, getEquipmentTraffic } from './api';
import { useAuth } from './auth-context';
import { CoachRoutineList } from './coach-routine-list';
import CoachTemplates from './coach-templates';
import { ExerciseDetailModal } from './exercise-detail';
import type { ExerciseDetailTarget } from './exercise-detail';
import { routineEditorHref } from './routine-links';
import type { EquipmentTraffic, Exercise, Routine, RoutineBlock, WorkoutSessionLog, WorkoutSessionPayload } from './types';
import { Notice, Page } from './ui';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  FadeIn,
  IconButton,
  IconTile,
  ProgressBar,
  ProgressRing,
  ScreenHeader,
  Segmented,
  Sheet,
  Skeleton,
  TextField,
} from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { elevation, radius, space } from '@/theme/tokens';

type MetricValues = { reps: string; weightKg: string; durationMinutes: string; distanceKm: string; level: string };
type RestTimer = { blockId: string; setNumber: number; remaining: number; startedAt: number; addedRestCount: number };
type RestTracking = { actualRestSeconds: number; addedRestCount: number; restSkipped: boolean };
type WorkoutReward = {
  caloriesBurned: number;
  durationMinutes: number;
  activeDurationMinutes?: number;
  totalRestSeconds?: number;
  totalVolumeKg: number;
  targetSetsTotal?: number;
  completedSets?: number;
  perceivedExertion?: number;
  personalRecords?: { exerciseName: string; weightKg: number }[];
};
type LastPerformance = {
  metricType: 'strength' | 'cardio';
  reps?: number;
  weightKg?: number;
  durationMinutes?: number;
  distanceKm?: number;
  level?: number;
};
const initialDeviceDay = new Date().getDay();
const dayTabs = [
  { value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' }, { value: 5, label: 'Vie' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
];
const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const levelNames = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };
const KG_PER_LB = 2.20462;
const emptyInput = (): MetricValues => ({ reps: '', weightKg: '', durationMinutes: '', distanceKm: '', level: '' });
const ACTIVE_WORKOUT_DRAFT_KEY = '@gymgo_active_workout_draft';
const PENDING_WORKOUTS_KEY = '@gymgo_pending_workouts';
const ROUTINES_CACHE_KEY = '@gymgo_routines_cache';

function minutesSince(start: number | null) {
  return start ? Math.round((Date.now() - start) / 60000) : 0;
}

function secondsSince(start: number | null) {
  return start ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0;
}

function now() {
  return Date.now();
}

function isNetworkError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'response' in error && !(error as { response?: unknown }).response);
}

async function flushPendingWorkouts() {
  const stored = await AsyncStorage.getItem(PENDING_WORKOUTS_KEY);
  if (!stored) return;
  let queue: WorkoutSessionPayload[];
  try {
    queue = JSON.parse(stored) as WorkoutSessionPayload[];
  } catch {
    await AsyncStorage.removeItem(PENDING_WORKOUTS_KEY);
    return;
  }
  const remaining: WorkoutSessionPayload[] = [];
  for (const payload of queue) {
    try {
      await api.post('/workouts', payload);
    } catch {
      remaining.push(payload);
      break;
    }
  }
  if (remaining.length) await AsyncStorage.setItem(PENDING_WORKOUTS_KEY, JSON.stringify(remaining));
  else await AsyncStorage.removeItem(PENDING_WORKOUTS_KEY);
}

function routineBlocks(routine: Routine): RoutineBlock[] {
  if (routine.blocks?.length) return routine.blocks;
  return (routine.exercises ?? []).map((exercise, order) => ({
    _id: `legacy-${exercise._id ?? order}`,
    day: exercise.day ?? 0,
    blockType: 'single' as const,
    sets: exercise.sets ?? 3,
    restSeconds: exercise.restSeconds ?? 60,
    order,
    exercises: [exercise],
  }));
}

function inputKey(block: RoutineBlock, setNumber: number, exercise: Exercise, index: number) {
  return `${block._id ?? block.order}.${setNumber}.${exercise._id ?? index}`;
}

function isCardio(exercise: Exercise) {
  return exercise.metricType === 'cardio'
    || (typeof exercise.equipmentId === 'object' && exercise.equipmentId !== null && exercise.equipmentId.type === 'cardio');
}

function performanceKey(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function buildLastPerformanceMap(sessions: WorkoutSessionLog[]) {
  const result = new Map<string, LastPerformance>();
  for (const session of sessions) {
    for (const block of session.blocks ?? []) {
      for (const set of block.sets) {
        for (const exercise of set.exercises) {
          if (exercise.skipped) continue;
          const performance: LastPerformance = {
            metricType: exercise.metricType,
            reps: exercise.reps,
            weightKg: exercise.weightKg,
            durationMinutes: exercise.durationMinutes,
            distanceKm: exercise.distanceKm,
            level: exercise.level,
          };
          if (!result.has(exercise.routineExerciseId)) result.set(exercise.routineExerciseId, performance);
          const nameKey = performanceKey(exercise.exerciseName);
          if (!result.has(nameKey)) result.set(nameKey, performance);
        }
      }
    }
  }
  return result;
}

const oneDecimal = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });

function formatLastPerformance(performance: LastPerformance) {
  if (performance.metricType === 'cardio') {
    return [performance.durationMinutes ? `${oneDecimal.format(performance.durationMinutes)} min` : '', performance.distanceKm !== undefined ? `${oneDecimal.format(performance.distanceKm)} km` : '', performance.level !== undefined ? `Nivel ${performance.level}` : ''].filter(Boolean).join(' · ');
  }
  return `${oneDecimal.format(performance.weightKg ?? 0)} kg × ${performance.reps ?? 0} reps`;
}

function isEquipmentOutOfService(exercise: Exercise) {
  return typeof exercise.equipmentId === 'object' && exercise.equipmentId?.status === 'out_of_service';
}

const trafficPriority: Record<EquipmentTraffic['trafficLevel'], number> = { free: 0, moderate: 1, busy: 2, out_of_service: 3 };

function trafficForExercise(exercise: Exercise, trafficById: Map<string, EquipmentTraffic>) {
  if (!exercise.equipmentId && !exercise.equipment) return null;
  const equipmentId = typeof exercise.equipmentId === 'object' ? exercise.equipmentId._id : exercise.equipmentId;
  if (equipmentId && trafficById.has(equipmentId)) return trafficById.get(equipmentId) ?? null;
  const equipmentName = (exercise.equipment ?? (typeof exercise.equipmentId === 'object' ? exercise.equipmentId.name : '')).trim().toLocaleLowerCase();
  return equipmentName ? [...trafficById.values()].find((item) => item.name.toLocaleLowerCase() === equipmentName) ?? null : null;
}

function blockTrafficLevel(block: RoutineBlock, trafficById: Map<string, EquipmentTraffic>): EquipmentTraffic['trafficLevel'] {
  return block.exercises.reduce<EquipmentTraffic['trafficLevel']>((worst, exercise) => {
    const traffic = trafficForExercise(exercise, trafficById);
    return traffic && trafficPriority[traffic.trafficLevel] > trafficPriority[worst] ? traffic.trafficLevel : worst;
  }, 'free');
}

function trafficLabel(traffic: EquipmentTraffic | null) {
  if (!traffic || traffic.trafficLevel === 'free') return 'Aparato libre · Sugerido ahora';
  if (traffic.trafficLevel === 'moderate') return `Demanda media · ~${traffic.estimatedWaitMinutes} min`;
  if (traffic.trafficLevel === 'busy') return `Alta demanda · ~${traffic.estimatedWaitMinutes} min`;
  return 'En mantenimiento';
}

function isSetComplete(block: RoutineBlock, setNumber: number, inputs: Record<string, MetricValues>, skipped: Record<string, boolean>) {
  return block.exercises.every((exercise, index) => {
    if (skipped[inputKey(block, setNumber, exercise, index)]) return true;
    const values = inputs[inputKey(block, setNumber, exercise, index)];
    if (!values) return false;
    if (isCardio(exercise)) {
      const duration = values.durationMinutes ? Number(values.durationMinutes) : undefined;
      const distance = values.distanceKm ? Number(values.distanceKm.replace(',', '.')) : undefined;
      const level = values.level ? Number(values.level) : undefined;
      return Boolean(
        (duration !== undefined && Number.isInteger(duration) && duration > 0 && duration <= 600)
        || (distance !== undefined && Number.isFinite(distance) && distance > 0 && distance <= 1000)
        || (level !== undefined && Number.isInteger(level) && level >= 1 && level <= 100),
      );
    }
    const reps = Number(values.reps);
    const weight = Number(values.weightKg.replace(',', '.'));
    return values.reps.trim() !== '' && Number.isInteger(reps) && reps >= 0 && reps <= 300
      && values.weightKg.trim() !== '' && Number.isFinite(weight) && weight >= 0 && weight <= 1000;
  });
}

export default function RoutinesScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const isClient = user?.role === 'Cliente';
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);
  const [selectedDay, setSelectedDay] = useState(initialDeviceDay);
  const [inputs, setInputs] = useState<Record<string, MetricValues>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [lastPerformance, setLastPerformance] = useState<Map<string, LastPerformance>>(new Map());
  const [completedSets, setCompletedSets] = useState<Record<string, number[]>>({});
  const [restTimer, setRestTimer] = useState<RestTimer | null>(null);
  const [restTracking, setRestTracking] = useState<Record<string, RestTracking>>({});
  const [restTime, setRestTime] = useState<number | null>(null);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [activeGif, setActiveGif] = useState<ExerciseDetailTarget | null>(null);
  const [workoutReward, setWorkoutReward] = useState<WorkoutReward | null>(null);
  const [equipmentTraffic, setEquipmentTraffic] = useState<EquipmentTraffic[]>([]);
  const [smartOrderEnabled, setSmartOrderEnabled] = useState(true);
  const [pendingWorkout, setPendingWorkout] = useState<WorkoutSessionPayload | null>(null);
  const [perceivedExertion, setPerceivedExertion] = useState(3);
  const [clientNotes, setClientNotes] = useState('');
  const [savingDay, setSavingDay] = useState(false);
  const [logMessage, setLogMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [deferredRoutineReload, setDeferredRoutineReload] = useState(false);

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    if (retryNumber > 0) setError('');
    Promise.all([
      api.get<{ routines: Routine[] }>('/routines'),
      isClient ? api.get<{ sessions: WorkoutSessionLog[] }>('/workouts/me') : Promise.resolve({ data: { sessions: [] as WorkoutSessionLog[] } }),
      isClient ? getEquipmentTraffic() : Promise.resolve([] as EquipmentTraffic[]),
    ])
      .then(([routineResponse, historyResponse, traffic]) => {
        if (!isCurrent) return;
        setRoutines(routineResponse.data.routines);
        void AsyncStorage.setItem(ROUTINES_CACHE_KEY, JSON.stringify(routineResponse.data.routines));
        setLastPerformance(buildLastPerformanceMap(historyResponse.data.sessions));
        setEquipmentTraffic(traffic);
      })
      .catch(async (requestError: unknown) => {
        if (!isCurrent) return;
        try {
          const cached = await AsyncStorage.getItem(ROUTINES_CACHE_KEY);
          if (cached) {
            setRoutines(JSON.parse(cached) as Routine[]);
            setLogMessage({ text: 'Mostrando la última rutina guardada sin conexión.', error: false });
            return;
          }
        } catch {
          // Cache failures should not hide the original request error.
        }
        setError(getApiErrorMessage(requestError, 'No se pudieron cargar las rutinas.'));
      })
      .finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [isClient, retryNumber]));

  useEffect(() => {
    const realtime = connectSocket();
    const refreshRoutines = () => {
      if (startedAt !== null || Object.keys(completedSets).length > 0) {
        setDeferredRoutineReload(true);
        return;
      }
      // Realtime refreshes are silent: the current routines stay visible while reloading.
      setRetryNumber((value) => value + 1);
    };
    realtime.on('routine-updated', refreshRoutines);
    return () => { realtime.off('routine-updated', refreshRoutines); };
  }, [completedSets, startedAt]);

  useEffect(() => {
    if (!deferredRoutineReload || startedAt !== null || Object.keys(completedSets).length > 0) return;
    const reloadTimer = setTimeout(() => {
      setDeferredRoutineReload(false);
      setRetryNumber((value) => value + 1);
    }, 0);
    return () => clearTimeout(reloadTimer);
  }, [completedSets, deferredRoutineReload, startedAt]);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([
      AsyncStorage.getItem(ACTIVE_WORKOUT_DRAFT_KEY),
      AsyncStorage.getItem(PENDING_WORKOUTS_KEY),
    ]).then(([draft, pending]) => {
      if (!isCurrent) return;
      if (draft) {
        try {
          const value = JSON.parse(draft) as {
            selectedDay?: number;
            inputs?: Record<string, MetricValues>;
            skipped?: Record<string, boolean>;
            completedSets?: Record<string, number[]>;
            restTracking?: Record<string, RestTracking>;
            restTimer?: RestTimer | null;
            startedAt?: number | null;
          };
          if (value.selectedDay !== undefined) setSelectedDay(value.selectedDay);
          if (value.inputs) setInputs(value.inputs);
          if (value.skipped) setSkipped(value.skipped);
          if (value.completedSets) setCompletedSets(value.completedSets);
          if (value.restTracking) setRestTracking(value.restTracking);
          if (value.restTimer) {
            setRestTimer(value.restTimer);
            setRestTime(value.restTimer.remaining);
          }
          if (value.startedAt) {
            setStartedAt(value.startedAt);
            setElapsedSeconds(secondsSince(value.startedAt));
          }
        } catch {
          void AsyncStorage.removeItem(ACTIVE_WORKOUT_DRAFT_KEY);
        }
      }
      setDraftLoaded(true);
      if (pending) void flushPendingWorkouts();
    }).catch(() => setDraftLoaded(true));
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    if (!startedAt) return undefined;
    const interval = setInterval(() => setElapsedSeconds(secondsSince(startedAt)), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    if (!draftLoaded || !startedAt) return;
    void AsyncStorage.setItem(ACTIVE_WORKOUT_DRAFT_KEY, JSON.stringify({
      selectedDay, inputs, skipped, completedSets, restTracking, startedAt,
      restTimer,
    }));
  }, [completedSets, draftLoaded, inputs, restTimer, restTracking, selectedDay, skipped, startedAt]);

  useEffect(() => {
    if (!restTimer) return undefined;
    const interval = setInterval(() => {
      setRestTimer((current) => {
        if (!current) return null;
        if (current.remaining <= 1) {
          finalizeRest(current, false);
          return null;
        }
        return { ...current, remaining: current.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [restTimer]);

  useEffect(() => {
    if (restTime === 0) {
      Vibration.vibrate([0, 500, 200, 500]);
      const clearTimer = setTimeout(() => setRestTime(null), 0);
      return () => clearTimeout(clearTimer);
    }
    if (restTime === null || restTime < 1) return undefined;
    const interval = setInterval(() => {
      setRestTime((current) => (current === null || current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [restTime]);

  const routine = routines.find((entry) => entry.status === 'active') ?? routines[0];
  const allBlocks = routine ? routineBlocks(routine) : [];
  const dayBlocks = allBlocks.filter((block) => block.day === selectedDay).sort((left, right) => left.order - right.order);
  const trafficById = new Map(equipmentTraffic.map((item) => [item.equipmentId, item]));
  const blockHasStarted = (block: RoutineBlock) => (completedSets[block._id] ?? []).length > 0
    || Object.keys(inputs).some((key) => key.startsWith(`${block._id}.`))
    || Object.keys(skipped).some((key) => key.startsWith(`${block._id}.`));
  const startedBlocks = dayBlocks.filter(blockHasStarted);
  const unstartedBlocks = dayBlocks.filter((block) => !blockHasStarted(block));
  const optimizedUnstartedBlocks = [...unstartedBlocks].sort((left, right) => (
    trafficPriority[blockTrafficLevel(left, trafficById)] - trafficPriority[blockTrafficLevel(right, trafficById)]
      || left.order - right.order
  ));
  const displayDayBlocks = smartOrderEnabled ? [...startedBlocks, ...optimizedUnstartedBlocks] : dayBlocks;
  const hasTrafficOptimization = smartOrderEnabled && optimizedUnstartedBlocks.some((block, index) => block._id !== unstartedBlocks[index]?._id);

  function updateMetric(block: RoutineBlock, setNumber: number, exercise: Exercise, index: number, field: keyof MetricValues, value: string) {
    const cleaned = value.replace(/[^0-9.,]/g, '').slice(0, 8);
    const key = inputKey(block, setNumber, exercise, index);
    setInputs((current) => ({ ...current, [key]: { ...(current[key] ?? emptyInput()), [field]: cleaned } }));
  }

  function toggleSkipped(block: RoutineBlock, setNumber: number, exercise: Exercise, index: number) {
    const key = inputKey(block, setNumber, exercise, index);
    setSkipped((current) => ({ ...current, [key]: !current[key] }));
  }

  function prefillLastPerformance(block: RoutineBlock, exercise: Exercise, index: number, performance: LastPerformance) {
    const done = completedSets[block._id ?? String(block.order)] ?? [];
    setInputs((current) => {
      const next = { ...current };
      for (let setNumber = 1; setNumber <= block.sets; setNumber += 1) {
        if (done.includes(setNumber)) continue;
        next[inputKey(block, setNumber, exercise, index)] = {
          ...emptyInput(),
          reps: performance.reps === undefined ? '' : String(performance.reps),
          weightKg: performance.weightKg === undefined ? '' : String(performance.weightKg),
          durationMinutes: performance.durationMinutes === undefined ? '' : String(performance.durationMinutes),
          distanceKm: performance.distanceKm === undefined ? '' : String(performance.distanceKm),
          level: performance.level === undefined ? '' : String(performance.level),
        };
      }

      return next;
    });
  }

  function finalizeRest(timer: RestTimer, restSkipped: boolean) {
    const key = `${timer.blockId}.${timer.setNumber}`;
    const actualRestSeconds = Math.max(0, Math.floor((Date.now() - timer.startedAt) / 1000));
    setRestTracking((current) => ({
      ...current,
      [key]: { actualRestSeconds, addedRestCount: timer.addedRestCount, restSkipped },
    }));
  }

  function startWorkout() {
    if (!startedAt) {
      setStartedAt(Date.now());
      setElapsedSeconds(0);
      setLogMessage(null);
    }
  }

  function discardWorkout() {
    setStartedAt(null);
    setElapsedSeconds(0);
    setInputs({});
    setSkipped({});
    setCompletedSets({});
    setRestTracking({});
    setRestTimer(null);
    setRestTime(null);
    setPendingWorkout(null);
    void AsyncStorage.removeItem(ACTIVE_WORKOUT_DRAFT_KEY);
    setLogMessage({ text: 'Entrenamiento descartado.', error: false });
  }

  function confirmDiscardWorkout() {
    Alert.alert('¿Descartar entrenamiento?', 'Se perderán todas las series registradas en esta sesión.', [
      { text: 'Seguir entrenando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: discardWorkout },
    ]);
  }

  function finishBlockSet(block: RoutineBlock, setNumber: number) {
    const blockId = block._id ?? String(block.order);
    const done = completedSets[blockId] ?? [];
    const expectedSetNumber = Array.from({ length: block.sets }, (_, index) => index + 1).find((number) => !done.includes(number));
    if (restTimer?.blockId === blockId) {
      setLogMessage({ text: 'Espera a que termine el descanso de este bloque.', error: true });
      return;
    }
    if (setNumber !== expectedSetNumber) {
      setLogMessage({ text: 'Completa las rondas de este bloque en orden.', error: true });
      return;
    }
    if (!isSetComplete(block, setNumber, inputs, skipped)) {
      setLogMessage({ text: 'Completa cada ejercicio de este bloque antes de terminar la serie.', error: true });
      return;
    }
    setCompletedSets((current) => {
      const previous = current[blockId] ?? [];
      return { ...current, [blockId]: previous.includes(setNumber) ? previous : [...previous, setNumber].sort((a, b) => a - b) };
    });
    setLogMessage(null);
    const activeExercise = block.exercises.find((exercise, index) => !skipped[inputKey(block, setNumber, exercise, index)]);
    if (activeExercise) {
      const timeToRest = activeExercise.restSeconds || block.restSeconds || 60;
      setRestTime(timeToRest);
      if (setNumber < block.sets) setRestTimer({ blockId, setNumber, remaining: timeToRest, startedAt: now(), addedRestCount: 0 });
    }
  }

  async function saveSession() {
    if (!routine) return;
    if (!startedAt) {
      setLogMessage({ text: 'Inicia el entrenamiento antes de guardar.', error: true });
      return;
    }
    if (restTimer) {
      setLogMessage({ text: 'Termina o salta el descanso antes de guardar.', error: true });
      return;
    }
    const totalRestSeconds = Object.values(restTracking).reduce((total, rest) => total + rest.actualRestSeconds, 0);
    const payloadBlocks = dayBlocks.flatMap((block) => {
      const blockId = block._id ?? String(block.order);
      const done = completedSets[blockId] ?? [];
      const sets = done.map((setNumber) => ({
        setNumber,
        ...(restTracking[`${blockId}.${setNumber}`] ?? { actualRestSeconds: 0, addedRestCount: 0, restSkipped: false }),
        exercises: block.exercises.map((exercise, index) => {
          const values = inputs[inputKey(block, setNumber, exercise, index)] ?? emptyInput();
          const exerciseSkipped = skipped[inputKey(block, setNumber, exercise, index)] === true;
          return {
            routineExerciseId: exercise._id,
            skipped: exerciseSkipped,
            ...(isCardio(exercise)
              ? {
                  ...(!exerciseSkipped && values.durationMinutes ? { durationMinutes: Number(values.durationMinutes) } : {}),
                  ...(!exerciseSkipped && values.distanceKm ? { distanceKm: Number(values.distanceKm.replace(',', '.')) } : {}),
                  ...(!exerciseSkipped && values.level ? { level: Number(values.level) } : {}),
                }
              : (!exerciseSkipped ? { reps: Math.round(Number(values.reps)), weightKg: Number(values.weightKg.replace(',', '.')) } : {})),
          };
        }).filter((exercise): exercise is typeof exercise & { routineExerciseId: string } => Boolean(exercise.routineExerciseId)),
      }));
      return sets.length ? [{ routineBlockId: block._id, sets }] : [];
    });
    if (!payloadBlocks.length) {
      setLogMessage({ text: 'Completa y termina al menos una serie de bloque para guardar.', error: true });
      return;
    }

    setPendingWorkout({
        routineId: routine._id,
        trainingDay: selectedDay,
        durationMinutes: Math.min(600, minutesSince(startedAt)),
        activeDurationMinutes: Math.min(600, Math.max(0, minutesSince(startedAt) - totalRestSeconds / 60)),
        totalRestSeconds,
        blocks: payloadBlocks,
      });
    setPerceivedExertion(3);
    setClientNotes('');
    setLogMessage(null);
  }

  async function confirmWorkoutSession() {
    if (!pendingWorkout) return;
    setSavingDay(true);
    setLogMessage(null);
    try {
      const response = await api.post<{ session: WorkoutReward }>('/workouts', {
        ...pendingWorkout,
        perceivedExertion,
        ...(clientNotes.trim() ? { clientNotes: clientNotes.trim() } : {}),
      });
      setPendingWorkout(null);
      setInputs({});
      setSkipped({});
      setCompletedSets({});
      setRestTracking({});
      setRestTimer(null);
      setRestTime(null);
      setStartedAt(null);
      setElapsedSeconds(0);
      await AsyncStorage.removeItem(ACTIVE_WORKOUT_DRAFT_KEY);
      setWorkoutReward(response.data.session);
    } catch (requestError) {
      if (isNetworkError(requestError)) {
        const stored = await AsyncStorage.getItem(PENDING_WORKOUTS_KEY);
        const queue = stored ? JSON.parse(stored) as WorkoutSessionPayload[] : [];
        queue.push({ ...pendingWorkout, perceivedExertion, ...(clientNotes.trim() ? { clientNotes: clientNotes.trim() } : {}) });
        await AsyncStorage.setItem(PENDING_WORKOUTS_KEY, JSON.stringify(queue));
        setPendingWorkout(null);
        discardWorkout();
        setLogMessage({ text: 'Guardado sin conexión. Se sincronizará al recuperar red', error: false });
      } else {
      setLogMessage({ text: getApiErrorMessage(requestError, 'No se pudo guardar el entrenamiento.'), error: true });
      }
    } finally {
      setSavingDay(false);
    }
  }

  const daySetTotal = displayDayBlocks.reduce((total, block) => total + block.sets, 0);
  const daySetDone = displayDayBlocks.reduce((total, block) => total + (completedSets[block._id ?? String(block.order)]?.length ?? 0), 0);
  const restBlock = restTimer ? displayDayBlocks.find((block) => (block._id ?? String(block.order)) === restTimer.blockId) : undefined;
  const restTotal = restBlock ? restBlock.restSeconds + 15 * (restTimer?.addedRestCount ?? 0) : 0;
  const hasLoggedSets = Object.values(completedSets).some((sets) => sets.length > 0);
  const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  const floatingRestTimer = restTime !== null ? (
    <View style={styles.restDock} pointerEvents="box-none">
      <View style={styles.floatingRestTimer} accessibilityLiveRegion="polite" accessibilityLabel={`Descanso, quedan ${restTime} segundos`}>
        <View style={styles.restTimerCopy}>
          <Text style={styles.restTimerLabel}>Descanso</Text>
          <Text style={styles.restTimerValue}>{clock(restTime)}</Text>
          {restTotal > 0 ? <ProgressBar value={1 - restTime / restTotal} height={4} style={styles.restProgress} /> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Añadir 15 segundos al descanso"
          onPress={() => {
            setRestTime((previous) => (previous || 0) + 15);
            setRestTimer((current) => (current ? { ...current, remaining: current.remaining + 15, addedRestCount: current.addedRestCount + 1 } : current));
          }}
          style={({ pressed }) => [styles.restTimerButton, pressed && styles.pressed]}>
          <Text style={styles.restTimerButtonText}>+15s</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Saltar descanso"
          onPress={() => {
            if (restTimer) finalizeRest(restTimer, true);
            setRestTime(null);
            setRestTimer(null);
          }}
          style={({ pressed }) => [styles.restTimerSkipButton, pressed && styles.pressed]}>
          <MaterialIcons name="skip-next" size={22} color={colors.heroText} />
        </Pressable>
      </View>
    </View>
  ) : null;

  return (
    <Page overlay={floatingRestTimer}>
      <ScreenHeader
        eyebrow={isClient ? 'Entrenar' : 'Coach'}
        title={isClient ? 'Tu rutina' : 'Rutinas'}
        subtitle={isClient ? 'Elige el día, inicia y registra cada serie.' : 'Rutinas asignadas a tus clientes.'}
      />

      {!isClient ? (
        <>
          <View style={styles.coachActions}>
            <Button icon="person-add-alt-1" onPress={() => router.push(routineEditorHref())} style={styles.flex}>Para cliente</Button>
            <Button variant="secondary" icon="library-add" onPress={() => router.push(routineEditorHref({ mode: 'template' }))} style={styles.flex}>Plantilla</Button>
          </View>
          <CoachTemplates onAssigned={() => setRetryNumber((current) => current + 1)} />
        </>
      ) : null}

      {isLoading && !routines.length ? (
        <View style={styles.skeletons}>
          <Skeleton height={88} radius={20} />
          <Skeleton height={64} radius={16} />
          <Skeleton height={220} radius={20} />
        </View>
      ) : null}
      {error ? <ErrorBanner message={error} onRetry={() => { setError(''); setIsLoading(true); setRetryNumber((current) => current + 1); }} /> : null}
      {logMessage ? <Notice error={logMessage.error}>{logMessage.text}</Notice> : null}

      {!isClient && routines.length ? (
        <CoachRoutineList routines={routines} groupByClient onChanged={() => setRetryNumber((current) => current + 1)} />
      ) : null}

      {isClient && routine ? (
        <>
          <FadeIn>
            <Card variant="raised">
              <View style={styles.summaryTop}>
                <IconTile name="assignment" size={44} />
                <View style={styles.flex}>
                  <Text style={styles.routineTitle} numberOfLines={2}>{routine.title}</Text>
                  <Text style={styles.meta}>{levelNames[routine.level]} · {routine.daysPerWeek} días/sem · {routine.durationWeeks} semanas</Text>
                </View>
              </View>
              <View style={styles.unitRow}>
                <Text style={styles.meta}>Unidad de peso</Text>
                <Segmented
                  value={weightUnit}
                  onChange={setWeightUnit}
                  options={[{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lb' }]}
                  style={styles.unitSegmented}
                />
              </View>
            </Card>
          </FadeIn>

          <FadeIn index={1} style={styles.section}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
              {dayTabs.map((day) => {
                const selected = selectedDay === day.value;
                const count = allBlocks.filter((block) => block.day === day.value).length;
                const isToday = day.value === initialDeviceDay;
                return (
                  <Pressable
                    key={day.value}
                    accessibilityRole="tab"
                    accessibilityLabel={`${dayNames[day.value]}${isToday ? ', hoy' : ''}${count ? `, ${count} bloques` : ', descanso'}`}
                    accessibilityState={{ selected, disabled: Boolean(startedAt) }}
                    onPress={() => {
                      if (startedAt) { setLogMessage({ text: 'Termina o descarta el entrenamiento actual antes de cambiar de día.', error: true }); return; }
                      setSelectedDay(day.value); setRestTimer(null); setRestTime(null); setLogMessage(null);
                    }}
                    style={[styles.dayTab, selected && styles.dayTabSelected, !selected && isToday && styles.dayTabToday]}>
                    <Text style={[styles.dayTabText, selected && styles.dayTabTextSelected]}>{day.label}</Text>
                    <View style={[styles.dayDot, count > 0 && (selected ? styles.dayDotSelected : styles.dayDotActive)]} />
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.dayHeader}>
              <Text style={styles.dayTitle} accessibilityRole="header">{dayNames[selectedDay]}</Text>
              {dayBlocks.length ? <Badge tone="neutral">{`${dayBlocks.length} ${dayBlocks.length === 1 ? 'bloque' : 'bloques'} · ${daySetTotal} series`}</Badge> : null}
            </View>
            {selectedDay !== new Date().getDay() && dayBlocks.length ? (
              <Badge tone="info" icon="history">{`Recuperando rutina del ${dayNames[selectedDay]}`}</Badge>
            ) : null}
          </FadeIn>

          {dayBlocks.length ? (
            <FadeIn index={2}>
              {!startedAt ? (
                <View style={styles.sessionHero}>
                  <View style={styles.flex}>
                    <Text style={styles.sessionHeroTitle}>¿Listo para entrenar?</Text>
                    <Text style={styles.sessionHeroMeta}>Inicia para desbloquear tus series y medir el tiempo real.</Text>
                  </View>
                  <Button variant="accent" size="large" icon="play-arrow" onPress={startWorkout}>Iniciar entrenamiento</Button>
                </View>
              ) : (
                <View style={styles.sessionLive}>
                  <View style={styles.sessionLiveTop}>
                    <View style={styles.liveDot} />
                    <Text style={styles.sessionLiveLabel}>En curso</Text>
                    <Pressable accessibilityRole="button" onPress={confirmDiscardWorkout} hitSlop={8} style={styles.discardButton}>
                      <Text style={styles.discardText}>Descartar</Text>
                    </Pressable>
                  </View>
                  <View style={styles.sessionLiveStats}>
                    <View>
                      <Text style={styles.sessionClock} accessibilityLabel={`Tiempo activo ${Math.floor(elapsedSeconds / 60)} minutos`}>{clock(elapsedSeconds)}</Text>
                      <Text style={styles.sessionHeroMeta}>Tiempo activo</Text>
                    </View>
                    <View style={styles.sessionSets}>
                      <Text style={styles.sessionSetsValue}>{daySetDone}<Text style={styles.sessionSetsTotal}>/{daySetTotal}</Text></Text>
                      <Text style={styles.sessionHeroMeta}>Series</Text>
                    </View>
                  </View>
                  <ProgressBar value={daySetTotal ? daySetDone / daySetTotal : 0} height={6} />
                </View>
              )}
            </FadeIn>
          ) : null}

          {dayBlocks.length ? (
            <View style={styles.smartOrderControls}>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: smartOrderEnabled }}
                onPress={() => setSmartOrderEnabled((enabled) => !enabled)}
                style={[styles.smartOrderToggle, smartOrderEnabled && styles.smartOrderToggleActive]}>
                <MaterialIcons name="alt-route" size={20} color={smartOrderEnabled ? colors.accent : colors.textSecondary} />
                <View style={styles.flex}>
                  <Text style={[styles.smartOrderText, smartOrderEnabled && styles.smartOrderTextActive]}>Orden inteligente</Text>
                  <Text style={styles.smartOrderHint}>Empieza por los aparatos más libres</Text>
                </View>
                <View style={[styles.switchTrack, smartOrderEnabled && styles.switchTrackOn]}>
                  <View style={[styles.switchThumb, smartOrderEnabled && styles.switchThumbOn]} />
                </View>
              </Pressable>
              <IconButton icon="refresh" label="Actualizar tráfico de equipos" onPress={() => { setIsLoading(true); setRetryNumber((value) => value + 1); }} />
            </View>
          ) : null}
          {hasTrafficOptimization ? <Badge tone="accent" icon="bolt">Ruta optimizada según el tráfico actual</Badge> : null}

          {!dayBlocks.length ? (
            <Card variant="sunken">
              <EmptyState icon="self-improvement" title="Día de descanso" message="No hay bloques programados. Recupérate y vuelve con energía." />
            </Card>
          ) : (
            <>
              {displayDayBlocks.map((block, blockIndex) => {
                const blockId = block._id ?? String(block.order);
                const done = completedSets[blockId] ?? [];
                const typeLabel = block.blockType === 'single' ? 'Individual' : block.blockType === 'superset' ? 'Superset' : 'Circuito';
                const blockTraffic = blockTrafficLevel(block, trafficById);
                const blockTrafficItem = block.exercises.map((exercise) => trafficForExercise(exercise, trafficById)).find((traffic) => traffic?.trafficLevel === blockTraffic) ?? null;
                const blockComplete = done.length >= block.sets;
                return (
                  <FadeIn key={blockId} index={3 + blockIndex}>
                    <Card variant="raised" style={[styles.blockCard, blockComplete && styles.blockCardDone]}>
                      <View style={styles.blockHeader}>
                        <ProgressRing value={block.sets ? done.length / block.sets : 0} size={52} stroke={5}>
                          {blockComplete
                            ? <MaterialIcons name="check" size={22} color={colors.accent} />
                            : <Text style={styles.blockRingText}>{done.length}/{block.sets}</Text>}
                        </ProgressRing>
                        <View style={styles.flex}>
                          <Text style={styles.blockEyebrow}>Bloque {blockIndex + 1} · {typeLabel}</Text>
                          <Text style={styles.blockMeta}>
                            {restTimer?.blockId === blockId ? `Descansando · ${restTimer.remaining}s` : `${block.sets} rondas · ${block.restSeconds}s de descanso`}
                          </Text>
                          <TrafficPill level={blockTraffic} waitMinutes={blockTrafficItem?.estimatedWaitMinutes ?? 0} />
                        </View>
                      </View>

                      <View style={styles.exerciseList}>
                        {block.exercises.map((exercise, exerciseIndex) => {
                          const cardio = isCardio(exercise);
                          const equipment = exercise.equipment ?? (typeof exercise.equipmentId === 'object' && exercise.equipmentId !== null ? exercise.equipmentId.name : exercise.bodyweight ? 'Peso corporal / libre' : 'Equipo');
                          const last = (lastPerformance.get(exercise._id ?? '') ?? lastPerformance.get(performanceKey(exercise.name))) as LastPerformance | undefined;
                          const traffic = trafficForExercise(exercise, trafficById);
                          const target = cardio
                            ? [exercise.targetDurationMinutes ? `${exercise.targetDurationMinutes} min` : '', exercise.targetDistanceKm ? `${exercise.targetDistanceKm} km` : '', exercise.targetLevel ? `Nivel ${exercise.targetLevel}` : ''].filter(Boolean).join(' · ') || 'Cardio'
                            : `${exercise.reps ?? ''}${exercise.suggestedWeight !== undefined ? ` · ${exercise.suggestedWeight} kg` : ''}`;
                          return (
                            <View key={exercise._id ?? `${exercise.name}-${exerciseIndex}`} style={styles.exerciseCard}>
                              <View style={styles.exerciseLetter}><Text style={styles.exerciseLetterText}>{String.fromCharCode(65 + exerciseIndex)}</Text></View>
                              <View style={styles.flex}>
                                <Text style={styles.exerciseName}>{exercise.name}</Text>
                                <Text style={styles.exerciseMeta}>{exercise.muscleGroup} · {equipment}</Text>
                                {target ? <Text style={styles.exerciseTarget}>Meta: {target}</Text> : null}
                                <View style={styles.exerciseTags}>
                                  <TrafficPill level={traffic?.trafficLevel ?? 'free'} waitMinutes={traffic?.estimatedWaitMinutes ?? 0} />
                                  {isEquipmentOutOfService(exercise) ? <Badge tone="warning" icon="build">En mantenimiento</Badge> : null}
                                </View>
                                {last ? (
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityHint="Copia tu última marca en las series"
                                    onPress={() => prefillLastPerformance(block, exercise, exerciseIndex, last)}
                                    style={({ pressed }) => [styles.lastPerformancePill, pressed && styles.pressed]}>
                                    <MaterialIcons name="history" size={15} color={colors.accent} />
                                    <Text style={styles.lastPerformance}>Última vez · {formatLastPerformance(last)}</Text>
                                  </Pressable>
                                ) : null}
                              </View>
                              {exercise.gifUrl || exercise.catalogExerciseId ? (
                                <IconButton
                                  icon="play-arrow"
                                  label={`Ver cómo hacer ${exercise.name}`}
                                  color={colors.info}
                                  onPress={() => setActiveGif({ name: exercise.name, gifUrl: exercise.gifUrl, catalogExerciseId: exercise.catalogExerciseId })}
                                />
                              ) : null}
                            </View>
                          );
                        })}
                      </View>

                      {Array.from({ length: block.sets }, (_, index) => index + 1).map((setNumber) => {
                        const isDone = done.includes(setNumber);
                        const canComplete = isSetComplete(block, setNumber, inputs, skipped);
                        const timerActive = restTimer?.blockId === blockId;
                        const nextSetNumber = Array.from({ length: block.sets }, (_, setIndex) => setIndex + 1).find((number) => !done.includes(number));
                        const waitingOnRest = timerActive && setNumber === nextSetNumber;
                        const isNext = !isDone && setNumber === nextSetNumber && Boolean(startedAt);
                        return (
                          <View key={`set-${setNumber}`} style={[styles.setRow, isNext && styles.setRowNext, isDone && styles.setRowDone]}>
                            <View style={[styles.setNumberBadge, isDone && styles.setNumberBadgeDone]}>
                              <Text style={[styles.setNumberText, isDone && styles.setNumberTextDone]}>{setNumber}</Text>
                            </View>
                            <View style={styles.setMetrics}>
                              {block.exercises.map((exercise, exerciseIndex) => {
                                const cardio = isCardio(exercise);
                                const values = inputs[inputKey(block, setNumber, exercise, exerciseIndex)] ?? emptyInput();
                                const disabled = isDone || savingDay || !startedAt;
                                const exerciseKey = inputKey(block, setNumber, exercise, exerciseIndex);
                                const exerciseSkipped = skipped[exerciseKey] === true;
                                return (
                                  <View key={exercise._id ?? `${exercise.name}-${exerciseIndex}`} style={[styles.exerciseMetrics, exerciseSkipped && styles.skippedExercise]}>
                                    {block.exercises.length > 1 ? <Text style={styles.exerciseTag}>{String.fromCharCode(65 + exerciseIndex)}</Text> : null}
                                    {exerciseSkipped ? (
                                      <View style={styles.skippedFill}><Badge tone="warning">Saltado</Badge></View>
                                    ) : cardio ? (
                                      <>
                                        <MetricInput label="min" keyboard="number-pad" value={values.durationMinutes} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'durationMinutes', value)} disabled={disabled} />
                                        <MetricInput label="km" keyboard="decimal-pad" value={values.distanceKm} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'distanceKm', value)} disabled={disabled} />
                                        <MetricInput label="nivel" keyboard="number-pad" value={values.level} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'level', value)} disabled={disabled} />
                                      </>
                                    ) : (
                                      <>
                                        <MetricInput label="reps" keyboard="number-pad" value={values.reps} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'reps', value)} disabled={disabled} />
                                        <WeightInput unit={weightUnit} value={values.weightKg} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'weightKg', value)} onToggle={() => setWeightUnit((unit) => unit === 'kg' ? 'lbs' : 'kg')} disabled={disabled} />
                                      </>
                                    )}
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel={exerciseSkipped ? `Registrar ${exercise.name}` : `Saltar ${exercise.name}`}
                                      disabled={disabled}
                                      onPress={() => toggleSkipped(block, setNumber, exercise, exerciseIndex)}
                                      hitSlop={4}
                                      style={({ pressed }) => [styles.skipButton, isEquipmentOutOfService(exercise) && styles.skipButtonMaintenance, disabled && styles.dimmed, pressed && styles.pressed]}>
                                      <MaterialIcons name={exerciseSkipped ? 'replay' : 'skip-next'} size={20} color={exerciseSkipped ? colors.accent : colors.textSecondary} />
                                    </Pressable>
                                  </View>
                                );
                              })}
                            </View>
                            <Pressable
                              accessibilityRole="checkbox"
                              accessibilityLabel={`Completar serie ${setNumber} del bloque ${blockIndex + 1}`}
                              accessibilityState={{ checked: isDone, disabled: !canComplete || savingDay || waitingOnRest }}
                              disabled={!canComplete || isDone || savingDay || waitingOnRest || !startedAt}
                              onPress={() => finishBlockSet(block, setNumber)}
                              style={[styles.roundCheck, isDone && styles.roundCheckDone, canComplete && !isDone && !waitingOnRest && startedAt ? styles.roundCheckReady : null, (!canComplete || waitingOnRest || !startedAt) && !isDone && styles.dimmed]}>
                              {isDone
                                ? <MaterialIcons name="check" size={26} color={colors.onAccentFill} />
                                : waitingOnRest
                                  ? <Text style={styles.restCountdown}>{restTimer?.remaining}</Text>
                                  : <MaterialIcons name="check" size={24} color={canComplete && startedAt ? colors.accent : colors.textTertiary} />}
                            </Pressable>
                          </View>
                        );
                      })}
                    </Card>
                  </FadeIn>
                );
              })}
              <Button
                variant="accent"
                size="large"
                icon="flag"
                loading={savingDay}
                disabled={savingDay || !startedAt || !hasLoggedSets}
                onPress={() => void saveSession()}
                style={styles.saveButton}>
                Terminar y guardar
              </Button>
              {/* Keeps the last rows reachable above the floating rest timer. */}
              {restTime !== null ? <View style={styles.restSpacer} /> : null}
            </>
          )}
        </>
      ) : !isLoading && !error && !routines.length ? (
        <Card variant="sunken">
          <EmptyState
            icon="event-note"
            title={isClient ? 'Aún no tienes rutina' : 'Sin rutinas asignadas'}
            message={isClient ? 'Tu coach te asignará una rutina pronto. Mientras tanto, revisa tu progreso.' : 'Crea una rutina para alguno de tus clientes.'}
          />
        </Card>
      ) : null}

      <ExerciseDetailModal exercise={activeGif} onClose={() => setActiveGif(null)} />
      <WorkoutFeedbackModal
        visible={Boolean(pendingWorkout)}
        perceivedExertion={perceivedExertion}
        clientNotes={clientNotes}
        saving={savingDay}
        onChangeExertion={setPerceivedExertion}
        onChangeNotes={setClientNotes}
        onCancel={() => { if (!savingDay) setPendingWorkout(null); }}
        onConfirm={() => void confirmWorkoutSession()}
      />
      <WorkoutRewardModal
        reward={workoutReward}
        onClose={() => {
          setWorkoutReward(null);
          router.replace('/(main)');
        }}
      />
    </Page>
  );
}

const EXERTION_LABELS = ['Muy fácil', 'Fácil', 'Moderado', 'Duro', 'Máximo'];

function WorkoutFeedbackModal({
  visible, perceivedExertion, clientNotes, saving, onChangeExertion, onChangeNotes, onCancel, onConfirm,
}: {
  visible: boolean;
  perceivedExertion: number;
  clientNotes: string;
  saving: boolean;
  onChangeExertion: (value: number) => void;
  onChangeNotes: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const styles = useStyles();
  return (
    <Sheet visible={visible} onClose={onCancel} title="¿Cómo te sentiste?" subtitle="Tu coach usa esto para ajustar tu plan.">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetBody}>
        <Text style={styles.modalLabel}>Esfuerzo percibido</Text>
        <View accessibilityRole="radiogroup" style={styles.exertionOptions}>
          {[1, 2, 3, 4, 5].map((value) => {
            const selected = perceivedExertion === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityLabel={`${value}, ${EXERTION_LABELS[value - 1]}`}
                accessibilityState={{ checked: selected }}
                onPress={() => onChangeExertion(value)}
                style={[styles.exertionOption, selected && styles.exertionOptionSelected]}>
                <Text style={[styles.exertionOptionText, selected && styles.exertionOptionTextSelected]}>{value}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.exertionCaption}>{EXERTION_LABELS[perceivedExertion - 1]}</Text>
        <TextField
          label="Notas (opcional)"
          multiline
          value={clientNotes}
          onChangeText={onChangeNotes}
          placeholder="¿Cómo fue tu entrenamiento?"
        />
        <Button variant="accent" size="large" loading={saving} disabled={saving} onPress={onConfirm}>Guardar sesión</Button>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

function TrafficPill({ level, waitMinutes }: { level: EquipmentTraffic['trafficLevel']; waitMinutes: number }) {
  const traffic = { trafficLevel: level, estimatedWaitMinutes: waitMinutes } as EquipmentTraffic;
  const tone = level === 'free' ? 'success' : level === 'moderate' ? 'warning' : level === 'busy' ? 'danger' : 'neutral';
  return <Badge tone={tone} dot>{trafficLabel(traffic)}</Badge>;
}

function MetricInput({ label, keyboard, value, onChange, disabled }: { label: string; keyboard: 'number-pad' | 'decimal-pad'; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.metricGroup}>
      <TextInput
        accessibilityLabel={label}
        editable={!disabled}
        keyboardType={keyboard}
        value={value}
        onChangeText={onChange}
        placeholder="—"
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        maxFontSizeMultiplier={1.3}
        style={[styles.metricInput, disabled && styles.inputDisabled]}
      />
      <Text style={styles.metricUnit}>{label}</Text>
    </View>
  );
}

function WeightInput({ unit, value, onChange, onToggle, disabled }: { unit: 'kg' | 'lbs'; value: string; onChange: (value: string) => void; onToggle: () => void; disabled: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const formatValue = (weightKg: string, displayUnit: 'kg' | 'lbs') => {
    const weight = Number(weightKg.replace(',', '.'));
    if (weightKg === '' || !Number.isFinite(weight)) return '';
    return displayUnit === 'lbs' ? (weight * KG_PER_LB).toFixed(1) : weightKg;
  };
  const [displayValue, setDisplayValue] = useState(() => formatValue(value, unit));
  const lastUnit = useRef(unit);
  const lastCommittedValue = useRef(value);

  useEffect(() => {
    if (unit !== lastUnit.current || value !== lastCommittedValue.current) {
      setDisplayValue(formatValue(value, unit));
      lastUnit.current = unit;
      lastCommittedValue.current = value;
    }
  }, [unit, value]);

  return (
    <View style={styles.metricGroup}>
      <TextInput
        accessibilityLabel={`Peso en ${unit}`}
        editable={!disabled}
        keyboardType="decimal-pad"
        value={displayValue}
        onChangeText={(text) => {
          const normalizedText = text.replace(',', '.');
          if ((normalizedText.match(/\./g) ?? []).length > 1 || /[^0-9.]/.test(normalizedText)) return;
          setDisplayValue(text);
          if (normalizedText === '') {
            lastCommittedValue.current = '';
            onChange('');
            return;
          }
          const numVal = Number.parseFloat(normalizedText);
          if (!Number.isFinite(numVal)) return;
          const finalKg = unit === 'lbs' ? numVal / KG_PER_LB : numVal;
          const nextValue = String(finalKg);
          lastCommittedValue.current = nextValue;
          onChange(nextValue);
        }}
        placeholder="—"
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        maxFontSizeMultiplier={1.3}
        style={[styles.metricInput, styles.weightInput, disabled && styles.inputDisabled]}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={`Cambiar unidad de peso, actual ${unit}`} disabled={disabled} onPress={onToggle} hitSlop={8}>
        <Text style={[styles.metricUnit, styles.metricUnitToggle]}>{unit === 'lbs' ? 'lb' : 'kg'}</Text>
      </Pressable>
    </View>
  );
}

function WorkoutRewardModal({ reward, onClose }: { reward: WorkoutReward | null; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const number = (value: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Math.round(value));
  return (
    <Modal visible={Boolean(reward)} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <SafeAreaView style={styles.rewardScreen}>
        <ScrollView contentContainerStyle={styles.rewardContent}>
          <FadeIn style={styles.rewardIcon}><MaterialIcons name="emoji-events" size={48} color={colors.accent} /></FadeIn>
          <FadeIn index={1}>
            <Text style={styles.rewardEyebrow}>Entrenamiento completado</Text>
            <Text style={styles.rewardTitle}>Buen trabajo.</Text>
            <Text style={styles.rewardSubtitle}>Cada sesión cuenta. Esto sumaste hoy.</Text>
          </FadeIn>

          <FadeIn index={2} style={styles.rewardCalories}>
            <MaterialIcons name="local-fire-department" size={28} color="#FFC24D" />
            <Text style={styles.rewardCaloriesValue}>{reward ? number(reward.caloriesBurned) : '—'}</Text>
            <Text style={styles.rewardCaloriesUnit}>kcal</Text>
          </FadeIn>

          <FadeIn index={3} style={styles.rewardGrid}>
            <RewardMetric icon="schedule" value={reward ? `${number(reward.durationMinutes)} min` : '—'} label="Tiempo" />
            <RewardMetric icon="fitness-center" value={reward ? `${number(reward.totalVolumeKg)} kg` : '—'} label="Volumen" />
            <RewardMetric icon="check-circle" value={reward ? `${reward.completedSets ?? '—'}/${reward.targetSetsTotal ?? '—'}` : '—'} label="Series" />
            <RewardMetric icon="insights" value={`RPE ${reward?.perceivedExertion ?? '—'}`} label="Esfuerzo" />
          </FadeIn>
          <Text style={styles.rewardRestText}>
            Tiempo efectivo: {reward ? number(reward.activeDurationMinutes ?? reward.durationMinutes) : '—'} min · Descanso: {reward ? number(reward.totalRestSeconds ?? 0) : '—'} s
          </Text>
          {reward?.personalRecords?.length ? (
            <FadeIn index={4} style={styles.prList}>
              <Text style={styles.prTitle}>Nuevas mejores marcas</Text>
              {reward.personalRecords.map((record) => (
                <View key={record.exerciseName} style={styles.prRow}>
                  <MaterialIcons name="military-tech" size={18} color="#FFC24D" />
                  <Text style={styles.prText}>{record.exerciseName}: {record.weightKg} kg</Text>
                </View>
              ))}
            </FadeIn>
          ) : null}
        </ScrollView>
        <Button variant="accent" size="large" icon="home" onPress={onClose}>Volver al inicio</Button>
      </SafeAreaView>
    </Modal>
  );
}

function RewardMetric({ icon, value, label }: { icon: keyof typeof MaterialIcons.glyphMap; value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.rewardMetric}>
      <MaterialIcons name={icon} size={20} color="#A9C2B5" />
      <Text style={styles.rewardMetricValue}>{value}</Text>
      <Text style={styles.rewardMetricLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors, scheme }) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.45 },
  section: { gap: space.md },
  skeletons: { gap: space.md },
  coachActions: { flexDirection: 'row', gap: space.sm },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  routineTitle: { color: colors.text, fontSize: 20, lineHeight: 24, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space.md },
  unitSegmented: { width: 132 },
  dayTabs: { gap: space.sm, paddingVertical: 2 },
  dayTab: { width: 52, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dayTabToday: { borderColor: colors.accent },
  dayTabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayTabText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  dayTabTextSelected: { color: colors.onPrimary },
  dayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent' },
  dayDotActive: { backgroundColor: colors.accentFill },
  dayDotSelected: { backgroundColor: colors.onPrimary },
  dayTitle: { color: colors.text, fontSize: 26, lineHeight: 30, fontWeight: '700', fontFamily: 'display' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
  sessionHero: { gap: space.lg, borderRadius: radius.xl, backgroundColor: colors.hero, padding: space.xl },
  sessionHeroTitle: { color: colors.heroText, fontSize: 26, lineHeight: 30, fontWeight: '800', fontFamily: 'display' },
  sessionHeroMeta: { color: colors.heroTextSecondary, fontSize: 13, lineHeight: 18 },
  sessionLive: { gap: space.md, borderRadius: radius.xl, backgroundColor: colors.hero, padding: space.xl },
  sessionLiveTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10FF85' },
  sessionLiveLabel: { flex: 1, color: '#10FF85', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  discardButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  discardText: { color: colors.heroText, fontSize: 13, fontWeight: '700' },
  sessionLiveStats: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sessionClock: { color: colors.heroText, fontSize: 48, lineHeight: 52, fontWeight: '800', fontFamily: 'display', fontVariant: ['tabular-nums'] },
  sessionSets: { alignItems: 'flex-end' },
  sessionSetsValue: { color: '#10FF85', fontSize: 32, lineHeight: 36, fontWeight: '800', fontFamily: 'display' },
  sessionSetsTotal: { color: colors.heroTextSecondary, fontSize: 22, fontWeight: '600', fontFamily: 'display' },
  smartOrderControls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  smartOrderToggle: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: space.md },
  smartOrderToggleActive: { borderColor: colors.accent },
  smartOrderText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  smartOrderTextActive: { color: colors.text },
  smartOrderHint: { color: colors.textSecondary, fontSize: 12 },
  switchTrack: { width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.borderStrong },
  switchTrackOn: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  switchThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textTertiary },
  switchThumbOn: { backgroundColor: colors.onAccentFill, transform: [{ translateX: 18 }] },
  blockCard: { gap: space.lg },
  blockCardDone: { borderColor: colors.accent },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  blockRingText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  blockEyebrow: { color: colors.text, fontSize: 17, fontWeight: '700' },
  blockMeta: { color: colors.textSecondary, fontSize: 13, marginBottom: 6 },
  exerciseList: { gap: space.sm },
  exerciseCard: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, padding: space.md },
  exerciseLetter: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  exerciseLetterText: { color: colors.accent, fontSize: 15, fontWeight: '800', fontFamily: 'display' },
  exerciseName: { color: colors.text, fontSize: 18, lineHeight: 22, fontWeight: '700' },
  exerciseMeta: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  exerciseTarget: { color: colors.accent, fontSize: 14, fontWeight: '700', marginTop: 4 },
  exerciseTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
  lastPerformancePill: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, marginTop: space.sm },
  lastPerformance: { color: colors.text, fontSize: 13, fontWeight: '600' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: 'transparent' },
  setRowNext: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  setRowDone: { backgroundColor: colors.surfaceRaised },
  setNumberBadge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken },
  setNumberBadgeDone: { backgroundColor: colors.accentFill },
  setNumberText: { color: colors.text, fontSize: 15, fontWeight: '800', fontFamily: 'display' },
  setNumberTextDone: { color: colors.onAccentFill },
  setMetrics: { flex: 1, gap: space.sm },
  exerciseMetrics: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  exerciseTag: { width: 14, color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
  skippedExercise: { opacity: 0.75 },
  skippedFill: { flex: 1 },
  skipButton: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  skipButtonMaintenance: { borderColor: colors.warning },
  metricGroup: { alignItems: 'center', gap: 3 },
  metricInput: { width: 60, height: 48, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, textAlign: 'center', fontSize: 20, fontWeight: '700', fontFamily: 'display', paddingHorizontal: 2, paddingVertical: 0 },
  weightInput: { width: 72 },
  inputDisabled: { backgroundColor: colors.surfaceRaised, color: colors.textSecondary, borderColor: colors.divider },
  metricUnit: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  metricUnitToggle: { color: colors.accent, textDecorationLine: 'underline' },
  roundCheck: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  roundCheckReady: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  roundCheckDone: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  restCountdown: { color: colors.accent, fontSize: 16, fontWeight: '800', fontFamily: 'display' },
  restDock: { position: 'absolute', left: 0, right: 0, bottom: space.md, paddingHorizontal: space.lg, zIndex: 9999 },
  floatingRestTimer: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, backgroundColor: colors.hero, padding: space.md, paddingLeft: space.lg, borderWidth: 1, borderColor: '#1F3A2C', ...elevation(colors, scheme, 3) },
  restTimerCopy: { flex: 1, gap: 2 },
  restTimerLabel: { color: colors.heroTextSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  restTimerValue: { color: '#10FF85', fontSize: 36, lineHeight: 40, fontWeight: '800', fontFamily: 'display', fontVariant: ['tabular-nums'] },
  restProgress: { marginTop: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  restTimerButton: { minWidth: 64, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: '#10FF85' },
  restTimerButtonText: { color: '#04120A', fontSize: 17, fontWeight: '800' },
  restTimerSkipButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  saveButton: { marginBottom: space.xxxl },
  restSpacer: { height: 96 },
  sheetBody: { gap: space.lg },
  modalLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  exertionOptions: { flexDirection: 'row', gap: space.sm },
  exertionOption: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  exertionOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  exertionOptionText: { color: colors.text, fontSize: 22, fontWeight: '700', fontFamily: 'display' },
  exertionOptionTextSelected: { color: colors.onPrimary },
  exertionCaption: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: -space.sm },
  rewardScreen: { flex: 1, backgroundColor: colors.hero, paddingHorizontal: space.xxl, paddingBottom: space.xl },
  rewardContent: { flexGrow: 1, justifyContent: 'center', gap: space.lg, paddingVertical: space.xxl },
  rewardIcon: { width: 88, height: 88, borderRadius: 30, backgroundColor: 'rgba(16,255,133,0.12)', alignItems: 'center', justifyContent: 'center' },
  rewardEyebrow: { color: '#10FF85', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  rewardTitle: { color: colors.heroText, fontSize: 44, lineHeight: 48, fontWeight: '800', fontFamily: 'display' },
  rewardSubtitle: { color: colors.heroTextSecondary, fontSize: 15, lineHeight: 22 },
  rewardCalories: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  rewardCaloriesValue: { color: colors.heroText, fontSize: 72, lineHeight: 76, fontWeight: '800', fontFamily: 'display' },
  rewardCaloriesUnit: { color: '#10FF85', fontSize: 20, fontWeight: '700' },
  rewardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  rewardMetric: { flexBasis: '47%', flexGrow: 1, gap: 4, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: space.md },
  rewardMetricValue: { color: colors.heroText, fontSize: 24, lineHeight: 28, fontWeight: '700', fontFamily: 'display' },
  rewardMetricLabel: { color: colors.heroTextSecondary, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  rewardRestText: { color: colors.heroTextSecondary, fontSize: 13, textAlign: 'center' },
  prList: { borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,194,77,0.4)', backgroundColor: 'rgba(255,194,77,0.08)', padding: space.md, gap: space.sm },
  prTitle: { color: '#FFC24D', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  prText: { color: colors.heroText, fontSize: 14, fontWeight: '600', flex: 1 },
}));
