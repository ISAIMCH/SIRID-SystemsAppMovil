import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { connectSocket } from '../../services/socket';
import { api, getApiErrorMessage, getEquipmentTraffic } from './api';
import { useAuth } from './auth-context';
import CoachTemplates from './coach-templates';
import { FloatingCard, IconBadge } from './fit-ui';
import { routineEditorHref } from './routine-links';
import { palette } from './theme';
import type { EquipmentTraffic, Exercise, Routine, RoutineBlock, WorkoutSessionLog, WorkoutSessionPayload } from './types';
import { ActionButton, AppHeader, Notice, Page, SectionTitle } from './ui';

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

function formatLastPerformance(performance: LastPerformance) {
  if (performance.metricType === 'cardio') {
    return [performance.durationMinutes ? `${performance.durationMinutes} min` : '', performance.distanceKm !== undefined ? `${performance.distanceKm} km` : '', performance.level !== undefined ? `Nivel ${performance.level}` : ''].filter(Boolean).join(' · ');
  }
  return `${performance.weightKg ?? 0} kg × ${performance.reps ?? 0} reps`;
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
  const [activeGif, setActiveGif] = useState<{ name: string; url: string } | null>(null);
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

  const floatingRestTimer = restTime !== null ? (
    <BlurView intensity={32} tint="dark" style={styles.floatingRestTimer} accessibilityLiveRegion="polite">
      <View style={styles.restTimerCopy}>
        <Text style={styles.restTimerLabel}>DESCANSO</Text>
        <Text style={styles.restTimerValue}>{`${Math.floor(restTime / 60).toString().padStart(2, '0')}:${(restTime % 60).toString().padStart(2, '0')}`}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Añadir 15 segundos al descanso"
        onPress={() => {
          setRestTime((previous) => (previous || 0) + 15);
          setRestTimer((current) => (current ? { ...current, remaining: current.remaining + 15, addedRestCount: current.addedRestCount + 1 } : current));
        }}
        style={styles.restTimerButton}>
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
        style={styles.restTimerSkipButton}>
        <Text style={styles.restTimerSkipText}>Saltar</Text>
      </Pressable>
    </BlurView>
  ) : null;

  return (
    <Page dark={isClient || user?.role === 'Coach'} overlay={floatingRestTimer}>
      <AppHeader showSignOut={false} title="Rutinas" detail={isClient ? 'Elige el día y registra cada ronda de tu entrenamiento.' : 'Rutinas asignadas a tus clientes.'} />

      {!isClient ? (
        <>
          <View style={styles.coachActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(routineEditorHref())}
              style={({ pressed }) => [styles.primaryCoachAction, pressed && styles.coachActionPressed]}>
              <Text style={styles.primaryCoachActionText}>Nueva rutina para cliente</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(routineEditorHref({ mode: 'template' }))}
              style={({ pressed }) => [styles.secondaryCoachAction, pressed && styles.coachActionPressed]}>
              <Text style={styles.secondaryCoachActionText}>Nueva plantilla base</Text>
            </Pressable>
          </View>
          <CoachTemplates onAssigned={() => setRetryNumber((current) => current + 1)} />
        </>
      ) : null}

      {isLoading ? <ActivityIndicator color={palette.green} size="large" /> : null}
      {error ? (
        <View style={styles.feedback}>
          <Notice error>{error}</Notice>
          <Pressable accessibilityRole="button" onPress={() => { setError(''); setIsLoading(true); setRetryNumber((current) => current + 1); }}><Text style={styles.retry}>Reintentar</Text></Pressable>
        </View>
      ) : null}
      {logMessage ? <Notice error={logMessage.error}>{logMessage.text}</Notice> : null}

      {routine ? (
        <>
          <FloatingCard style={styles.routineSummary}>
            <View style={styles.summaryTop}>
              <IconBadge name="assignment" color={palette.neon} />
              <View style={styles.flex}>
                  <Text style={[styles.routineTitle, isClient && styles.darkPrimary]}>{routine.title}</Text>
                  <Text style={[styles.meta, isClient && styles.darkMuted]}>{levelNames[routine.level]} · {routine.daysPerWeek} días/semana · {routine.durationWeeks} semanas</Text>
              </View>
              {isClient ? (
                <Pressable accessibilityRole="switch" accessibilityLabel="Cambiar unidad de peso" accessibilityState={{ checked: weightUnit === 'lbs' }} onPress={() => setWeightUnit((unit) => unit === 'kg' ? 'lbs' : 'kg')} style={styles.unitToggle}>
                  <Text style={styles.unitToggleText}>{weightUnit.toUpperCase()}</Text>
                </Pressable>
              ) : null}
            </View>
          </FloatingCard>

          {isClient ? (
            <>
              <View style={[styles.dayTabs, styles.dayTabsDark]}>
                {dayTabs.map((day) => {
                  const selected = selectedDay === day.value;
                  const count = allBlocks.filter((block) => block.day === day.value).length;
                  return (
                    <Pressable key={day.value} accessibilityRole="tab" accessibilityState={{ selected, disabled: Boolean(startedAt) }} onPress={() => { if (startedAt) { setLogMessage({ text: 'Termina o descarta el entrenamiento actual antes de cambiar de día.', error: true }); return; } setSelectedDay(day.value); setRestTimer(null); setRestTime(null); setLogMessage(null); }} style={[styles.dayTab, styles.dayTabDark, selected && styles.dayTabSelectedDark]}>
                      <Text style={[styles.dayTabText, styles.dayTabTextDark, selected && styles.dayTabTextSelectedDark]}>{day.label}</Text>
                      <View style={[styles.dayDot, count > 0 && (selected ? styles.dayDotSelected : styles.dayDotActive)]} />
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.selectedDayTitleDark}>{dayNames[selectedDay]}</Text>
              {selectedDay !== new Date().getDay() && dayBlocks.length ? (
                <Text style={styles.makeupBanner}>Recuperando rutina del {dayNames[selectedDay]}</Text>
              ) : null}

              {dayBlocks.length ? (
                <View style={styles.workoutStartCard}>
                  <View style={styles.flex}>
                    <Text style={styles.workoutStartTitle}>{startedAt ? 'Entrenamiento en curso' : '¿Listo para entrenar?'}</Text>
                    <Text style={styles.workoutStartMeta}>
                      {startedAt
                        ? `Tiempo activo: ${Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:${(elapsedSeconds % 60).toString().padStart(2, '0')}`
                        : 'Inicia para desbloquear tus series y registrar el tiempo real.'}
                    </Text>
                  </View>
                  {!startedAt ? (
                    <Pressable accessibilityRole="button" onPress={startWorkout} style={styles.startWorkoutButton}>
                      <Text style={styles.startWorkoutButtonText}>Iniciar entrenamiento</Text>
                    </Pressable>
                  ) : (
                    <Pressable accessibilityRole="button" onPress={confirmDiscardWorkout} style={styles.discardWorkoutButton}>
                      <Text style={styles.discardWorkoutText}>Descartar</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}

              {dayBlocks.length ? (
                <View style={styles.smartOrderControls}>
                  <Pressable accessibilityRole="switch" accessibilityState={{ checked: smartOrderEnabled }} onPress={() => setSmartOrderEnabled((enabled) => !enabled)} style={[styles.smartOrderToggle, smartOrderEnabled && styles.smartOrderToggleActive]}>
                    <MaterialIcons name="alt-route" size={17} color={smartOrderEnabled ? '#081009' : '#91A098'} />
                    <Text style={[styles.smartOrderText, smartOrderEnabled && styles.smartOrderTextActive]}>Orden inteligente (Anti-tráfico)</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Actualizar tráfico de equipos" onPress={() => { setIsLoading(true); setRetryNumber((value) => value + 1); }} style={styles.refreshTrafficButton}>
                    <MaterialIcons name="refresh" size={19} color="#9BFF63" />
                  </Pressable>
                </View>
              ) : null}
              {hasTrafficOptimization ? <Text style={styles.optimizationBanner}>Ruta optimizada: empezamos por los aparatos más libres</Text> : null}

              {!dayBlocks.length ? (
                <FloatingCard style={[styles.restCard, styles.darkBlockCard]}>
                  <IconBadge name="self-improvement" color={palette.cyan} size={56} />
                  <Text style={styles.darkHeading}>Día de descanso</Text>
                  <Text style={styles.darkBody}>No hay bloques programados para hoy. Recupérate y vuelve con energía.</Text>
                </FloatingCard>
              ) : (
                <>
                  {displayDayBlocks.map((block, blockIndex) => {
                    const blockId = block._id ?? String(block.order);
                    const done = completedSets[blockId] ?? [];
                    const typeLabel = block.blockType === 'single' ? 'Individual' : block.blockType === 'superset' ? 'Superset' : 'Circuito';
                    const blockTraffic = blockTrafficLevel(block, trafficById);
                    const blockTrafficItem = block.exercises.map((exercise) => trafficForExercise(exercise, trafficById)).find((traffic) => traffic?.trafficLevel === blockTraffic) ?? null;
                    return (
                      <FloatingCard key={blockId} style={[styles.blockCard, styles.darkBlockCard]}>
                        <View style={styles.blockHeader}>
                          <IconBadge name={block.blockType === 'single' ? 'fitness-center' : block.blockType === 'superset' ? 'sync-alt' : 'autorenew'} color={block.blockType === 'single' ? palette.neon : palette.violet} />
                          <View style={styles.blockHeaderContent}>
                            <View style={styles.blockHeaderTitleRow}>
                              <View style={styles.blockHeaderTitleColumn}>
                                <Text style={styles.darkHeading}>Bloque {blockIndex + 1} · {typeLabel}</Text>
                                <Text style={styles.darkMuted}>{restTimer?.blockId === blockId ? `Descanso · ${restTimer.remaining}s` : `${block.sets} rondas · ${block.restSeconds}s descanso`}</Text>
                              </View>
                              <View style={styles.progressPill}><Text style={styles.progressText}>{done.length}/{block.sets}</Text></View>
                            </View>
                            <TrafficPill level={blockTraffic} waitMinutes={blockTrafficItem?.estimatedWaitMinutes ?? 0} />
                          </View>
                        </View>

                        <View style={styles.exerciseList}>
                          {block.exercises.map((exercise, exerciseIndex) => {
                          const cardio = isCardio(exercise);
                          const equipment = exercise.equipment ?? (typeof exercise.equipmentId === 'object' && exercise.equipmentId !== null ? exercise.equipmentId.name : exercise.bodyweight ? 'Peso corporal / libre' : 'Equipo');
                          return (
                            <View key={exercise._id ?? `${exercise.name}-${exerciseIndex}`} style={styles.exerciseCard}>
                              <Text style={styles.exerciseNumberDark}>{String.fromCharCode(65 + exerciseIndex)}</Text>
                              <View style={styles.flex}>
                                <View style={styles.exerciseNameRow}>
                                  <Text style={styles.exerciseNameDark}>{exercise.name}</Text>
                                  {exercise.gifUrl ? (
                                    <Pressable accessibilityRole="button" accessibilityLabel={`Ver animación de ${exercise.name}`} onPress={() => setActiveGif({ name: exercise.name, url: exercise.gifUrl as string })}>
                                      <MaterialIcons name="play-circle-filled" size={22} color="#55D6D0" />
                                    </Pressable>
                                  ) : null}
                                </View>
                                <Text style={styles.darkMuted}>{exercise.muscleGroup} · {equipment}</Text>
                                <View style={styles.exerciseTrafficRow}>
                                  <TrafficPill level={trafficForExercise(exercise, trafficById)?.trafficLevel ?? 'free'} waitMinutes={trafficForExercise(exercise, trafficById)?.estimatedWaitMinutes ?? 0} />
                                  {isEquipmentOutOfService(exercise) ? <Text style={styles.maintenanceBadge}>En mantenimiento</Text> : null}
                                </View>
                                {(lastPerformance.get(exercise._id ?? '') ?? lastPerformance.get(performanceKey(exercise.name))) ? (
                                  <Pressable accessibilityRole="button" onPress={() => prefillLastPerformance(block, exercise, exerciseIndex, (lastPerformance.get(exercise._id ?? '') ?? lastPerformance.get(performanceKey(exercise.name))) as LastPerformance)}>
                                    <View style={styles.lastPerformancePill}>
                                      <MaterialIcons name="history" size={13} color="#91A098" />
                                      <Text style={styles.lastPerformance}>Última vez · {formatLastPerformance((lastPerformance.get(exercise._id ?? '') ?? lastPerformance.get(performanceKey(exercise.name))) as LastPerformance)}</Text>
                                    </View>
                                  </Pressable>
                                ) : null}
                                <Text style={styles.darkAccent}>{cardio ? [exercise.targetDurationMinutes ? `${exercise.targetDurationMinutes} min` : '', exercise.targetDistanceKm ? `${exercise.targetDistanceKm} km` : '', exercise.targetLevel ? `Nivel ${exercise.targetLevel}` : ''].filter(Boolean).join(' · ') || 'Cardio' : `${exercise.reps ?? ''}${exercise.suggestedWeight !== undefined ? ` · ${exercise.suggestedWeight} kg` : ''}`}</Text>
                              </View>
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
                          return (
                            <View key={`set-${setNumber}`} style={styles.compactSetRow}>
                              <View style={[styles.setNumberBadge, isDone && styles.setNumberBadgeDone]}>
                                <Text style={[styles.setNumberText, isDone && styles.setNumberTextDone]}>{setNumber}</Text>
                              </View>
                              <View style={styles.compactSetMetrics}>
                                {block.exercises.map((exercise, exerciseIndex) => {
                                  const cardio = isCardio(exercise);
                                  const values = inputs[inputKey(block, setNumber, exercise, exerciseIndex)] ?? emptyInput();
                                  const disabled = isDone || savingDay || !startedAt;
                                  const exerciseKey = inputKey(block, setNumber, exercise, exerciseIndex);
                                  const exerciseSkipped = skipped[exerciseKey] === true;
                                  return (
                                    <View key={exercise._id ?? `${exercise.name}-${exerciseIndex}`} style={[styles.compactExerciseMetrics, exerciseSkipped && styles.skippedExercise]}>
                                      {block.exercises.length > 1 ? <Text style={styles.compactExerciseTag}>{String.fromCharCode(65 + exerciseIndex)}</Text> : null}
                                      {exerciseSkipped ? <Text style={styles.skippedPill}>Saltado</Text> : null}
                                      {cardio ? (
                                        <>
                                          <MetricInput label="min" keyboard="number-pad" value={values.durationMinutes} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'durationMinutes', value)} disabled={disabled || exerciseSkipped} />
                                          <MetricInput label="km" keyboard="decimal-pad" value={values.distanceKm} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'distanceKm', value)} disabled={disabled || exerciseSkipped} />
                                          <MetricInput label="lvl" keyboard="number-pad" value={values.level} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'level', value)} disabled={disabled || exerciseSkipped} />
                                        </>
                                      ) : (
                                        <>
                                          <MetricInput label="reps" keyboard="number-pad" value={values.reps} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'reps', value)} disabled={disabled || exerciseSkipped} />
                                          <WeightInput unit={weightUnit} value={values.weightKg} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'weightKg', value)} onToggle={() => setWeightUnit((unit) => unit === 'kg' ? 'lbs' : 'kg')} disabled={disabled || exerciseSkipped} />
                                        </>
                                      )}
                                      <Pressable accessibilityRole="button" accessibilityLabel={exerciseSkipped ? `Registrar ${exercise.name}` : `Saltar ${exercise.name}`} disabled={disabled} onPress={() => toggleSkipped(block, setNumber, exercise, exerciseIndex)} style={[styles.skipButton, isEquipmentOutOfService(exercise) && styles.skipButtonMaintenance]}>
                                        <MaterialIcons name={exerciseSkipped ? 'replay' : 'skip-next'} size={15} color={exerciseSkipped ? '#9BFF63' : '#DCE8E0'} />
                                        <Text style={styles.skipButtonText}>{exerciseSkipped ? 'Registrar' : 'Saltar'}</Text>
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
                                style={[styles.roundCheck, isDone && styles.roundCheckDone, (!canComplete || waitingOnRest) && styles.roundCheckDisabled]}>
                                {isDone ? <MaterialIcons name="check" size={19} color="#081009" /> : waitingOnRest ? <Text style={styles.restCountdown}>{restTimer?.remaining}</Text> : null}
                              </Pressable>
                            </View>
                          );
                        })}
                      </FloatingCard>
                    );
                  })}
                  <Pressable
                    accessibilityRole="button"
                    disabled={savingDay || !startedAt || !Object.values(completedSets).some((sets) => sets.length > 0)}
                    onPress={() => void saveSession()}
                    style={({ pressed }) => [styles.saveWorkoutButton, (savingDay || !startedAt || !Object.values(completedSets).some((sets) => sets.length > 0)) && styles.saveWorkoutButtonDisabled, pressed && styles.saveWorkoutButtonPressed]}>
                    {savingDay ? <ActivityIndicator color="#081009" /> : <><Text style={styles.saveWorkoutText}>Guardar entrenamiento</Text><MaterialIcons name="arrow-forward" size={20} color="#081009" /></>}
                  </Pressable>
                </>
              )}
            </>
          ) : (
            <>
              <SectionTitle>Bloques de la rutina</SectionTitle>
              {allBlocks.map((block, index) => (
                <FloatingCard key={block._id ?? block.order} style={styles.blockCard}>
                          <Text style={[styles.blockTitle, styles.darkPrimary]}>{dayNames[block.day]} · {block.blockType} · {block.sets} series</Text>
                          {block.exercises.map((exercise) => <Text key={exercise._id} style={[styles.exerciseMeta, styles.darkMuted]}>{exercise.name} · {exercise.metricType === 'cardio' ? 'Cardio' : exercise.reps}</Text>)}
                  <Pressable accessibilityRole="button" onPress={() => router.push(routineEditorHref({ routineId: routine?._id ?? '' }))}><Text style={styles.retry}>Editar rutina</Text></Pressable>
                </FloatingCard>
              ))}
            </>
          )}
        </>
      ) : !isLoading && !error ? <Notice>Aún no tienes rutinas asignadas.</Notice> : null}

      <Modal visible={Boolean(activeGif)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setActiveGif(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text numberOfLines={2} style={styles.modalTitle}>{activeGif?.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar animación" onPress={() => setActiveGif(null)}>
                <MaterialIcons name="close" size={24} color={palette.ink} />
              </Pressable>
            </View>
            {activeGif ? <Image source={{ uri: activeGif.url }} resizeMode="contain" style={styles.gifImage} /> : null}
          </View>
        </View>
      </Modal>
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.flex}>
              <Text style={styles.modalTitle}>¿Cómo te sentiste?</Text>
              <Text style={styles.modalSubtitle}>Registra tu esfuerzo y una nota opcional.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancelar guardado" onPress={onCancel} disabled={saving}>
              <MaterialIcons name="close" size={24} color={palette.ink} />
            </Pressable>
          </View>
          <Text style={styles.modalLabel}>Esfuerzo percibido (1-5)</Text>
          <View style={styles.exertionOptions}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: perceivedExertion === value }} onPress={() => onChangeExertion(value)} style={[styles.exertionOption, perceivedExertion === value && styles.exertionOptionSelected]}>
                <Text style={[styles.exertionOptionText, perceivedExertion === value && styles.exertionOptionTextSelected]}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            multiline
            value={clientNotes}
            onChangeText={onChangeNotes}
            placeholder="¿Cómo fue tu entrenamiento? (opcional)"
            placeholderTextColor={palette.muted}
            style={styles.feedbackNotesInput}
            textAlignVertical="top"
          />
          <ActionButton onPress={onConfirm} disabled={saving}>
            {saving ? <ActivityIndicator color={palette.white} /> : 'Guardar sesión'}
          </ActionButton>
        </View>
      </View>
    </Modal>
  );
}

function TrafficPill({ level, waitMinutes }: { level: EquipmentTraffic['trafficLevel']; waitMinutes: number }) {
  const traffic = { trafficLevel: level, estimatedWaitMinutes: waitMinutes } as EquipmentTraffic;
  return (
    <View style={[styles.trafficPill, styles[`trafficPill_${level}`]]}>
      <View style={[styles.trafficDot, styles[`trafficDot_${level}`]]} />
      <Text style={styles.trafficPillText}>{trafficLabel(traffic)}</Text>
    </View>
  );
}

function MetricInput({ label, keyboard, value, onChange, disabled }: { label: string; keyboard: 'number-pad' | 'decimal-pad'; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <View style={styles.metricGroup}><TextInput editable={!disabled} keyboardType={keyboard} value={value} onChangeText={onChange} placeholder="—" placeholderTextColor={palette.muted} style={[styles.metricInput, disabled && styles.inputDone]} /><Text style={styles.metricUnit}>{label}</Text></View>;
}

function WeightInput({ unit, value, onChange, onToggle, disabled }: { unit: 'kg' | 'lbs'; value: string; onChange: (value: string) => void; onToggle: () => void; disabled: boolean }) {
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
        placeholderTextColor={palette.muted}
        style={[styles.metricInput, disabled && styles.inputDone]}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={`Cambiar unidad de peso, actual ${unit}`} disabled={disabled} onPress={onToggle} hitSlop={6}>
        <Text style={styles.metricUnit}>{unit}</Text>
      </Pressable>
    </View>
  );
}

function WorkoutRewardModal({ reward, onClose }: { reward: WorkoutReward | null; onClose: () => void }) {
  const number = (value: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Math.round(value));
  return (
    <Modal visible={Boolean(reward)} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <SafeAreaView style={styles.rewardScreen}>
        <View style={styles.rewardContent}>
          <View style={styles.rewardIcon}><MaterialIcons name="emoji-events" size={44} color="#A3FF68" /></View>
          <Text style={styles.rewardEyebrow}>ENTRENAMIENTO COMPLETADO</Text>
          <Text style={styles.rewardTitle}>Buen trabajo.</Text>
          <Text style={styles.rewardSubtitle}>Cada sesión cuenta. Mira lo que sumaste hoy.</Text>

          <View style={styles.rewardCalories}>
            <MaterialIcons name="local-fire-department" size={23} color="#A3FF68" />
            <Text style={styles.rewardCaloriesValue}>{reward ? number(reward.caloriesBurned) : '—'}</Text>
            <Text style={styles.rewardCaloriesUnit}>kcal</Text>
          </View>

          <View style={styles.rewardMetrics}>
            <View style={styles.rewardMetric}>
              <MaterialIcons name="schedule" size={21} color="#55D6D0" />
              <Text style={styles.rewardMetricValue}>{reward ? number(reward.durationMinutes) : '—'} min</Text>
              <Text style={styles.rewardMetricLabel}>TIEMPO ACTIVO</Text>
            </View>
          <View style={styles.rewardMetrics}>
            <View style={styles.rewardMetric}>
              <MaterialIcons name="check-circle" size={21} color="#A3FF68" />
              <Text style={styles.rewardMetricValue}>{reward ? `${reward.completedSets ?? '—'} / ${reward.targetSetsTotal ?? '—'}` : '—'}</Text>
              <Text style={styles.rewardMetricLabel}>SERIES</Text>
            </View>
            <View style={styles.rewardDivider} />
            <View style={styles.rewardMetric}>
              <MaterialIcons name="insights" size={21} color="#55D6D0" />
              <Text style={styles.rewardMetricValue}>RPE {reward?.perceivedExertion ?? '—'}</Text>
              <Text style={styles.rewardMetricLabel}>ESFUERZO</Text>
            </View>
          </View>
          <Text style={styles.rewardRestText}>Tiempo efectivo: {reward ? number(reward.activeDurationMinutes ?? reward.durationMinutes) : '—'} min · Descanso: {reward ? number(reward.totalRestSeconds ?? 0) : '—'}s</Text>
          {reward?.personalRecords?.length ? (
            <View style={styles.prList}>
              <Text style={styles.prTitle}>MEJORES MARCAS</Text>
              {reward.personalRecords.map((record) => <Text key={record.exerciseName} style={styles.prText}>Nuevo récord en {record.exerciseName}: {record.weightKg} kg</Text>)}
            </View>
          ) : null}
            <View style={styles.rewardDivider} />
            <View style={styles.rewardMetric}>
              <MaterialIcons name="fitness-center" size={21} color="#A3FF68" />
              <Text style={styles.rewardMetricValue}>{reward ? number(reward.totalVolumeKg) : '—'} kg</Text>
              <Text style={styles.rewardMetricLabel}>VOLUMEN</Text>
            </View>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.rewardButton}>
          <Text style={styles.rewardButtonText}>Volver al inicio</Text>
          <MaterialIcons name="arrow-forward" size={20} color="#081009" />
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  feedback: { gap: 8 },
  retry: { color: palette.green, fontSize: 13, fontWeight: '800', paddingVertical: 6 },
  coachActions: { gap: 10 },
  primaryCoachAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#10FF85', paddingHorizontal: 18 },
  primaryCoachActionText: { color: '#081009', fontSize: 15, fontWeight: '800' },
  secondaryCoachAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#27272A', backgroundColor: 'transparent', paddingHorizontal: 18 },
  secondaryCoachActionText: { color: '#F4F8F5', fontSize: 15, fontWeight: '700' },
  coachActionPressed: { opacity: 0.78 },
  routineSummary: { gap: 12 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  unitToggle: { minWidth: 48, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#9BFF63', backgroundColor: '#9BFF631C' },
  unitToggleText: { color: '#9BFF63', fontSize: 11, fontWeight: '900' },
  routineTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  darkPrimary: { color: '#F4F8F5' },
  darkMuted: { color: '#91A098' },
  meta: { color: palette.muted, fontSize: 12 },
  dayTabs: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#E9ECE3', borderRadius: 20, padding: 5 },
  dayTabsDark: { backgroundColor: '#111815', borderWidth: 1, borderColor: '#27342E' },
  dayTab: { width: 42, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 16 },
  dayTabSelected: { backgroundColor: palette.deepGreen },
  dayTabText: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  dayTabTextSelected: { color: palette.white },
  dayTabDark: { backgroundColor: 'transparent' },
  dayTabSelectedDark: { backgroundColor: '#9BFF63' },
  dayTabTextDark: { color: '#91A098' },
  dayTabTextSelectedDark: { color: '#081009' },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  dayDotActive: { backgroundColor: palette.cyan },
  dayDotSelected: { backgroundColor: palette.neon },
  selectedDayTitle: { color: palette.ink, fontSize: 19, fontWeight: '800' },
  selectedDayTitleDark: { color: '#F4F8F5', fontSize: 19, fontWeight: '800' },
  makeupBanner: { color: '#9BFF63', backgroundColor: '#9BFF631C', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, fontSize: 11, fontWeight: '800' },
  workoutStartCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: '#9BFF6350', backgroundColor: '#111815', padding: 13 },
  workoutStartTitle: { color: '#F4F8F5', fontSize: 14, fontWeight: '900' },
  workoutStartMeta: { color: '#91A098', fontSize: 11, lineHeight: 16, marginTop: 3 },
  startWorkoutButton: { minHeight: 40, justifyContent: 'center', borderRadius: 10, backgroundColor: '#9BFF63', paddingHorizontal: 12 },
  startWorkoutButtonText: { color: '#081009', fontSize: 11, fontWeight: '900' },
  discardWorkoutButton: { minHeight: 36, justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: '#52635A', paddingHorizontal: 10 },
  discardWorkoutText: { color: '#DCE8E0', fontSize: 10, fontWeight: '800' },
  restCard: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  restTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  restCopy: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  darkBlockCard: { backgroundColor: '#161B1E', borderColor: '#2B2B2B', shadowColor: '#000000', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.24, shadowRadius: 14, elevation: 5 },
  darkHeading: { color: '#F4F8F5', fontSize: 16, fontWeight: '800' },
  darkBody: { color: '#91A098', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  darkAccent: { color: '#9BFF63', fontSize: 12, fontWeight: '700' },
  smartOrderControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smartOrderToggle: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, borderWidth: 1, borderColor: '#27342E', paddingHorizontal: 12 },
  smartOrderToggleActive: { borderColor: '#9BFF63', backgroundColor: '#9BFF631C' },
  smartOrderText: { color: '#91A098', fontSize: 12, fontWeight: '800' },
  smartOrderTextActive: { color: '#9BFF63' },
  refreshTrafficButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#27342E' },
  optimizationBanner: { color: '#9BFF63', backgroundColor: '#9BFF631C', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, fontSize: 11, fontWeight: '800' },
  trafficPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  trafficPill_free: { borderColor: '#10FF85', backgroundColor: '#10FF8512' },
  trafficPill_moderate: { borderColor: '#F7C948', backgroundColor: '#F7C94812' },
  trafficPill_busy: { borderColor: '#FF9868', backgroundColor: '#FF986812' },
  trafficPill_out_of_service: { borderColor: '#71717A', backgroundColor: '#71717A18' },
  trafficPillText: { color: '#DCE8E0', fontSize: 10, fontWeight: '800' },
  trafficDot: { width: 6, height: 6, borderRadius: 3 },
  trafficDot_free: { backgroundColor: '#10FF85' },
  trafficDot_moderate: { backgroundColor: '#F7C948' },
  trafficDot_busy: { backgroundColor: '#FF9868' },
  trafficDot_out_of_service: { backgroundColor: '#A1A1AA' },
  exerciseList: { gap: 9, borderTopWidth: 1, borderTopColor: '#27342E', paddingTop: 10 },
  exerciseSummary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exerciseNumberDark: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#10FF8512', borderWidth: 1, borderColor: '#10FF85', color: '#10FF85', fontSize: 12, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' },
  exerciseCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: '#2B2B2B', borderRadius: 14, backgroundColor: '#1E1E1E', padding: 11 },
  exerciseNameDark: { flex: 1, color: '#FFFFFF', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  exerciseTrafficRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 7 },
  lastPerformancePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: '#262626', paddingHorizontal: 7, paddingVertical: 4, marginTop: 7 },
  compactSetRow: { minHeight: 48, flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderTopWidth: 1, borderTopColor: '#2B2B2B', paddingTop: 9 },
  setNumberBadge: { width: 27, height: 27, borderRadius: 14, backgroundColor: '#18211D', borderWidth: 1, borderColor: '#3A4A41', alignItems: 'center', justifyContent: 'center' },
  setNumberBadgeDone: { backgroundColor: '#9BFF63', borderColor: '#9BFF63' },
  setNumberText: { color: '#DCE8E0', fontSize: 12, fontWeight: '900' },
  setNumberTextDone: { color: '#081009' },
  compactSetMetrics: { flex: 1, gap: 7 },
  compactExerciseMetrics: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  skippedExercise: { opacity: 0.58 },
  skippedPill: { color: '#081009', backgroundColor: '#F7C948', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 3, fontSize: 9, fontWeight: '900' },
  skipButton: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 3, justifyContent: 'center', paddingHorizontal: 7, borderRadius: 8, borderWidth: 1, borderColor: '#52635A', backgroundColor: 'transparent' },
  skipButtonMaintenance: { borderColor: '#F7C948' },
  skipButtonText: { color: '#DCE8E0', fontSize: 9, fontWeight: '800' },
  maintenanceBadge: { alignSelf: 'flex-start', color: '#F7C948', fontSize: 10, fontWeight: '900', marginTop: 3 },
  lastPerformance: { color: '#A1A1AA', fontSize: 10, fontWeight: '700' },
  compactExerciseTag: { width: 14, color: '#91A098', fontSize: 10, fontWeight: '800' },
  roundCheck: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#60716A', alignItems: 'center', justifyContent: 'center' },
  roundCheckDone: { backgroundColor: '#9BFF63', borderColor: '#9BFF63' },
  roundCheckDisabled: { opacity: 0.45 },
  restCountdown: { color: '#9BFF63', fontSize: 10, fontWeight: '900' },
  floatingRestTimer: { position: 'absolute', bottom: 100, left: 20, right: 20, zIndex: 9999, elevation: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#10FF85', borderRadius: 18, backgroundColor: '#1C1C1EF2', padding: 12, shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, overflow: 'hidden' },
  restTimerCopy: { flex: 1 },
  restTimerLabel: { color: '#91A098', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  restTimerValue: { color: '#9BFF63', fontSize: 26, fontWeight: '900', marginTop: 2 },
  restTimerButton: { minWidth: 58, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#9BFF63' },
  restTimerButtonText: { color: '#081009', fontSize: 13, fontWeight: '900' },
  restTimerSkipButton: { minWidth: 58, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: '#52635A' },
  restTimerSkipText: { color: '#DCE8E0', fontSize: 12, fontWeight: '800' },
  blockCard: { gap: 12, padding: 16 },
  blockHeader: { width: '100%', flexDirection: 'column', alignItems: 'flex-start', gap: 10 },
  blockHeaderContent: { width: '100%', gap: 8 },
  blockHeaderTitleRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  blockHeaderTitleColumn: { flex: 1, gap: 4 },
  blockTitle: { color: palette.ink, fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  progressPill: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#19D98B26' },
  progressText: { color: '#10FF85', fontSize: 12, fontWeight: '800' },
  saveWorkoutButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 12, backgroundColor: '#10FF85', paddingHorizontal: 18, marginTop: 4, marginBottom: 22, shadowColor: '#10FF85', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 4 },
  saveWorkoutButtonDisabled: { opacity: 0.42, shadowOpacity: 0 },
  saveWorkoutButtonPressed: { transform: [{ scale: 0.98 }] },
  saveWorkoutText: { color: '#081009', fontSize: 15, fontWeight: '900' },
  exercisePanel: { gap: 8, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 11 },
  exerciseHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exerciseNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  exerciseNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#7C5CFF26', color: palette.violet, fontSize: 13, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' },
  exerciseName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  exerciseMeta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  targetText: { color: palette.green, fontSize: 12, fontWeight: '700' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 38 },
  setLabel: { width: 48, color: palette.muted, fontSize: 11, fontWeight: '700' },
  metricGroup: { flexDirection: 'column', alignItems: 'center', gap: 2 },
  metricInput: { width: 46, height: 32, borderWidth: 1, borderColor: '#3A3A3A', borderRadius: 7, backgroundColor: '#262626', color: '#FFFFFF', textAlign: 'center', fontSize: 13, fontWeight: '800', paddingHorizontal: 1, paddingVertical: 2 },
  inputDone: { borderBottomColor: '#9BFF63', color: '#9BFF63' },
  metricUnit: { color: '#91A098', fontSize: 9, fontWeight: '700' },
  completeSetButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 42, borderRadius: 15, backgroundColor: palette.neon },
  completeDisabled: { backgroundColor: '#E9ECE3' },
  completeText: { color: palette.deepGreen, fontSize: 13, fontWeight: '800' },
  completeTextDone: { color: palette.green },
  modalBackdrop: { flex: 1, backgroundColor: '#07130FC7', alignItems: 'center', justifyContent: 'center', padding: 22 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 24, backgroundColor: palette.white, padding: 16, gap: 14, shadowColor: '#000000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalTitle: { flex: 1, color: palette.ink, fontSize: 16, fontWeight: '800' },
  modalSubtitle: { color: palette.muted, fontSize: 13, marginTop: 3 },
  modalLabel: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  exertionOptions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  exertionOption: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: palette.line, backgroundColor: '#F2F4EE' },
  exertionOptionSelected: { borderColor: palette.deepGreen, backgroundColor: palette.deepGreen },
  exertionOptionText: { color: palette.ink, fontSize: 16, fontWeight: '800' },
  exertionOptionTextSelected: { color: palette.white },
  feedbackNotesInput: { minHeight: 100, borderRadius: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.white, color: palette.ink, padding: 14, fontSize: 15, lineHeight: 21 },
  gifImage: { width: '100%', aspectRatio: 1, borderRadius: 18, backgroundColor: '#F2F4EE' },
  rewardScreen: { flex: 1, backgroundColor: '#070B09', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 36, paddingBottom: 22 },
  rewardContent: { flex: 1, justifyContent: 'center', gap: 13 },
  rewardIcon: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#A3FF681C', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  rewardEyebrow: { color: '#A3FF68', fontSize: 10, fontWeight: '900' },
  rewardTitle: { color: '#F4F8F5', fontSize: 36, fontWeight: '900' },
  rewardSubtitle: { color: '#91A098', fontSize: 14, lineHeight: 20 },
  rewardCalories: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 },
  rewardCaloriesValue: { color: '#F4F8F5', fontSize: 54, lineHeight: 62, fontWeight: '900' },
  rewardCaloriesUnit: { color: '#A3FF68', fontSize: 16, fontWeight: '800' },
  rewardMetrics: { flexDirection: 'row', alignItems: 'center', borderRadius: 22, borderWidth: 1, borderColor: '#27342E', backgroundColor: '#111815', paddingVertical: 20, marginTop: 10 },
  rewardMetric: { flex: 1, alignItems: 'center', gap: 7 },
  rewardMetricValue: { color: '#F4F8F5', fontSize: 20, fontWeight: '900' },
  rewardMetricLabel: { color: '#91A098', fontSize: 9, fontWeight: '900' },
  rewardDivider: { width: 1, height: 55, backgroundColor: '#27342E' },
  rewardRestText: { color: '#91A098', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 14 },
  prList: { width: '100%', borderRadius: 14, borderWidth: 1, borderColor: '#A3FF6850', backgroundColor: '#A3FF6812', padding: 13, gap: 6, marginTop: 12 },
  prTitle: { color: '#A3FF68', fontSize: 11, fontWeight: '900' },
  prText: { color: '#F4F8F5', fontSize: 12, fontWeight: '700' },
  rewardButton: { minHeight: 56, borderRadius: 18, backgroundColor: '#A3FF68', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  rewardButtonText: { color: '#081009', fontSize: 15, fontWeight: '900' },
});