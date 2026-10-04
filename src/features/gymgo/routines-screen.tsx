import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import CoachTemplates from './coach-templates';
import { FloatingCard, IconBadge } from './fit-ui';
import { routineEditorHref } from './routine-links';
import { palette } from './theme';
import type { Exercise, Routine, RoutineBlock } from './types';
import { ActionButton, AppHeader, Notice, Page, SectionTitle } from './ui';

type MetricValues = { reps: string; weightKg: string; durationMinutes: string; distanceKm: string; level: string };
type RestTimer = { blockId: string; remaining: number };
const initialDeviceDay = new Date().getDay();
const dayTabs = [
  { value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' }, { value: 5, label: 'Vie' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
];
const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const levelNames = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };
const emptyInput = (): MetricValues => ({ reps: '', weightKg: '', durationMinutes: '', distanceKm: '', level: '' });

function minutesSince(start: number | null) {
  return start ? Math.round((Date.now() - start) / 60000) : 0;
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
    || (typeof exercise.equipmentId === 'object' && exercise.equipmentId.type === 'cardio');
}

function isSetComplete(block: RoutineBlock, setNumber: number, inputs: Record<string, MetricValues>) {
  return block.exercises.every((exercise, index) => {
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
  const [completedSets, setCompletedSets] = useState<Record<string, number[]>>({});
  const [restTimer, setRestTimer] = useState<RestTimer | null>(null);
  const [savingDay, setSavingDay] = useState(false);
  const [logMessage, setLogMessage] = useState<{ text: string; error: boolean } | null>(null);
  const startedAt = useRef<number | null>(null);

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    if (retryNumber > 0) setError('');
    api.get<{ routines: Routine[] }>('/routines')
      .then((response) => { if (isCurrent) setRoutines(response.data.routines); })
      .catch((requestError: unknown) => { if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudieron cargar las rutinas.')); })
      .finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [retryNumber]));

  useEffect(() => {
    if (!restTimer) return undefined;
    const interval = setInterval(() => {
      setRestTimer((current) => {
        if (!current || current.remaining <= 1) return null;
        return { ...current, remaining: current.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [restTimer]);

  const routine = routines.find((entry) => entry.status === 'active') ?? routines[0];
  const allBlocks = routine ? routineBlocks(routine) : [];
  const dayBlocks = allBlocks.filter((block) => block.day === selectedDay).sort((left, right) => left.order - right.order);

  function updateMetric(block: RoutineBlock, setNumber: number, exercise: Exercise, index: number, field: keyof MetricValues, value: string) {
    startedAt.current ??= Date.now();
    const cleaned = value.replace(/[^0-9.,]/g, '').slice(0, 8);
    const key = inputKey(block, setNumber, exercise, index);
    setInputs((current) => ({ ...current, [key]: { ...(current[key] ?? emptyInput()), [field]: cleaned } }));
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
    if (!isSetComplete(block, setNumber, inputs)) {
      setLogMessage({ text: 'Completa cada ejercicio de este bloque antes de terminar la serie.', error: true });
      return;
    }
    setCompletedSets((current) => {
      const previous = current[blockId] ?? [];
      return { ...current, [blockId]: previous.includes(setNumber) ? previous : [...previous, setNumber].sort((a, b) => a - b) };
    });
    setLogMessage(null);
    if (block.restSeconds > 0 && setNumber < block.sets) setRestTimer({ blockId, remaining: block.restSeconds });
  }

  async function saveSession() {
    if (!routine) return;
    const payloadBlocks = dayBlocks.flatMap((block) => {
      const blockId = block._id ?? String(block.order);
      const done = completedSets[blockId] ?? [];
      const sets = done.map((setNumber) => ({
        setNumber,
        exercises: block.exercises.map((exercise, index) => {
          const values = inputs[inputKey(block, setNumber, exercise, index)] ?? emptyInput();
          return {
            routineExerciseId: exercise._id,
            ...(isCardio(exercise)
              ? {
                  ...(values.durationMinutes ? { durationMinutes: Number(values.durationMinutes) } : {}),
                  ...(values.distanceKm ? { distanceKm: Number(values.distanceKm.replace(',', '.')) } : {}),
                  ...(values.level ? { level: Number(values.level) } : {}),
                }
              : { reps: Math.round(Number(values.reps)), weightKg: Number(values.weightKg.replace(',', '.')) }),
          };
        }).filter((exercise) => Boolean(exercise.routineExerciseId)),
      }));
      return sets.length ? [{ routineBlockId: block._id, sets }] : [];
    });
    if (!payloadBlocks.length) {
      setLogMessage({ text: 'Completa y termina al menos una serie de bloque para guardar.', error: true });
      return;
    }

    setSavingDay(true);
    setLogMessage(null);
    try {
      await api.post('/workouts', {
        routineId: routine._id,
        trainingDay: selectedDay,
        durationMinutes: Math.min(600, minutesSince(startedAt.current)),
        blocks: payloadBlocks,
      });
      setInputs({});
      setCompletedSets({});
      setRestTimer(null);
      startedAt.current = null;
      setLogMessage({ text: 'Entrenamiento guardado. Tu progreso se actualizó.', error: false });
    } catch (requestError) {
      setLogMessage({ text: getApiErrorMessage(requestError, 'No se pudo guardar el entrenamiento.'), error: true });
    } finally {
      setSavingDay(false);
    }
  }

  return (
    <Page>
      <AppHeader title="Rutinas" detail={isClient ? 'Elige el día y registra cada ronda de tu entrenamiento.' : 'Rutinas asignadas a tus clientes.'} />

      {!isClient ? (
        <>
          <View style={styles.coachActions}>
            <ActionButton onPress={() => router.push(routineEditorHref())}>Nueva rutina para cliente</ActionButton>
            <ActionButton secondary onPress={() => router.push(routineEditorHref({ mode: 'template' }))}>Nueva plantilla base</ActionButton>
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
                <Text style={styles.routineTitle}>{routine.title}</Text>
                <Text style={styles.meta}>{levelNames[routine.level]} · {routine.daysPerWeek} días/semana · {routine.durationWeeks} semanas</Text>
              </View>
            </View>
          </FloatingCard>

          {isClient ? (
            <>
              <View style={styles.dayTabs}>
                {dayTabs.map((day) => {
                  const selected = selectedDay === day.value;
                  const count = allBlocks.filter((block) => block.day === day.value).length;
                  return (
                    <Pressable key={day.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => { setSelectedDay(day.value); setRestTimer(null); setLogMessage(null); }} style={[styles.dayTab, selected && styles.dayTabSelected]}>
                      <Text style={[styles.dayTabText, selected && styles.dayTabTextSelected]}>{day.label}</Text>
                      <View style={[styles.dayDot, count > 0 && (selected ? styles.dayDotSelected : styles.dayDotActive)]} />
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.selectedDayTitle}>{dayNames[selectedDay]}</Text>

              {!dayBlocks.length ? (
                <FloatingCard style={styles.restCard}>
                  <IconBadge name="self-improvement" color={palette.cyan} size={56} />
                  <Text style={styles.restTitle}>Día de descanso</Text>
                  <Text style={styles.restCopy}>No hay bloques programados para hoy. Recupérate y vuelve con energía.</Text>
                </FloatingCard>
              ) : (
                <>
                  {dayBlocks.map((block, blockIndex) => {
                    const blockId = block._id ?? String(block.order);
                    const done = completedSets[blockId] ?? [];
                    const typeLabel = block.blockType === 'single' ? 'Individual' : block.blockType === 'superset' ? 'Superset' : 'Circuito';
                    return (
                      <FloatingCard key={blockId} style={styles.blockCard}>
                        <View style={styles.blockHeader}>
                          <IconBadge name={block.blockType === 'single' ? 'fitness-center' : block.blockType === 'superset' ? 'sync-alt' : 'autorenew'} color={block.blockType === 'single' ? palette.neon : palette.violet} />
                          <View style={styles.flex}>
                            <Text style={styles.blockTitle}>Bloque {blockIndex + 1} · {typeLabel}</Text>
                            <Text style={styles.meta}>{block.sets} rondas · {block.restSeconds}s descanso entre rondas</Text>
                          </View>
                          <View style={styles.progressPill}><Text style={styles.progressText}>{done.length}/{block.sets}</Text></View>
                        </View>

                        {block.exercises.map((exercise, exerciseIndex) => {
                          const cardio = isCardio(exercise);
                          const equipment = typeof exercise.equipmentId === 'object' ? exercise.equipmentId.name : exercise.bodyweight ? 'Peso corporal / libre' : 'Equipo';
                          return (
                            <View key={exercise._id ?? `${exercise.name}-${exerciseIndex}`} style={styles.exercisePanel}>
                              <View style={styles.exerciseHeading}>
                                <Text style={styles.exerciseNumber}>{String.fromCharCode(65 + exerciseIndex)}</Text>
                                <View style={styles.flex}>
                                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                                  <Text style={styles.exerciseMeta}>{exercise.muscleGroup} · {equipment}</Text>
                                  {cardio ? <Text style={styles.targetText}>{[exercise.targetDurationMinutes ? `${exercise.targetDurationMinutes} min` : '', exercise.targetDistanceKm ? `${exercise.targetDistanceKm} km` : '', exercise.targetLevel ? `Nivel ${exercise.targetLevel}` : ''].filter(Boolean).join(' · ') || 'Meta de cardio'}</Text> : <Text style={styles.targetText}>{exercise.reps}{exercise.suggestedWeight !== undefined ? ` · ${exercise.suggestedWeight} kg` : ''}</Text>}
                                </View>
                              </View>
                              {Array.from({ length: block.sets }, (_, index) => {
                                const setNumber = index + 1;
                                const values = inputs[inputKey(block, setNumber, exercise, exerciseIndex)] ?? emptyInput();
                                const isDone = done.includes(setNumber);
                                return (
                                  <View key={setNumber} style={styles.setRow}>
                                    <Text style={styles.setLabel}>Ronda {setNumber}</Text>
                                    {cardio ? (
                                      <>
                                        <MetricInput label="min" keyboard="number-pad" value={values.durationMinutes} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'durationMinutes', value)} disabled={isDone} />
                                        <MetricInput label="km" keyboard="decimal-pad" value={values.distanceKm} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'distanceKm', value)} disabled={isDone} />
                                        <MetricInput label="nivel" keyboard="number-pad" value={values.level} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'level', value)} disabled={isDone} />
                                      </>
                                    ) : (
                                      <>
                                        <MetricInput label="reps" keyboard="number-pad" value={values.reps} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'reps', value)} disabled={isDone} />
                                        <MetricInput label="kg" keyboard="decimal-pad" value={values.weightKg} onChange={(value) => updateMetric(block, setNumber, exercise, exerciseIndex, 'weightKg', value)} disabled={isDone} />
                                      </>
                                    )}
                                  </View>
                                );
                              })}
                            </View>
                          );
                        })}

                        {Array.from({ length: block.sets }, (_, index) => index + 1).map((setNumber) => {
                          const isDone = done.includes(setNumber);
                          const canComplete = isSetComplete(block, setNumber, inputs);
                          const timerActive = restTimer?.blockId === blockId;
                          const nextSetNumber = Array.from({ length: block.sets }, (_, setIndex) => setIndex + 1).find((number) => !done.includes(number));
                          return (
                            <Pressable key={`complete-${setNumber}`} accessibilityRole="button" disabled={!canComplete || isDone || savingDay || (timerActive && setNumber === nextSetNumber)} onPress={() => finishBlockSet(block, setNumber)} style={[styles.completeSetButton, (!canComplete || isDone || (timerActive && setNumber === nextSetNumber)) && styles.completeDisabled]}>
                              <MaterialIcons name={isDone ? 'check-circle' : 'check'} size={18} color={isDone ? palette.green : palette.deepGreen} />
                              <Text style={[styles.completeText, isDone && styles.completeTextDone]}>{isDone ? `Ronda ${setNumber} completada` : timerActive && setNumber === nextSetNumber ? `Descanso ${restTimer.remaining}s` : `Completar ronda ${setNumber}`}</Text>
                            </Pressable>
                          );
                        })}
                      </FloatingCard>
                    );
                  })}
                  <ActionButton onPress={() => void saveSession()} disabled={savingDay || !Object.values(completedSets).some((sets) => sets.length > 0)}>
                    {savingDay ? <ActivityIndicator color={palette.white} /> : 'Guardar entrenamiento del día'}
                  </ActionButton>
                </>
              )}
            </>
          ) : (
            <>
              <SectionTitle>Bloques de la rutina</SectionTitle>
              {allBlocks.map((block, index) => (
                <FloatingCard key={block._id ?? block.order} style={styles.blockCard}>
                  <Text style={styles.blockTitle}>{dayNames[block.day]} · {block.blockType} · {block.sets} series</Text>
                  {block.exercises.map((exercise) => <Text key={exercise._id} style={styles.exerciseMeta}>{exercise.name} · {exercise.metricType === 'cardio' ? 'Cardio' : exercise.reps}</Text>)}
                  <Pressable accessibilityRole="button" onPress={() => router.push(routineEditorHref({ routineId: routine._id }))}><Text style={styles.retry}>Editar rutina</Text></Pressable>
                </FloatingCard>
              ))}
            </>
          )}
        </>
      ) : !isLoading && !error ? <Notice>Aún no tienes rutinas asignadas.</Notice> : null}
    </Page>
  );
}

function MetricInput({ label, keyboard, value, onChange, disabled }: { label: string; keyboard: 'number-pad' | 'decimal-pad'; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <View style={styles.metricGroup}><TextInput editable={!disabled} keyboardType={keyboard} value={value} onChangeText={onChange} placeholder="—" placeholderTextColor={palette.muted} style={[styles.metricInput, disabled && styles.inputDone]} /><Text style={styles.metricUnit}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  feedback: { gap: 8 },
  retry: { color: palette.green, fontSize: 13, fontWeight: '800', paddingVertical: 6 },
  coachActions: { gap: 10 },
  routineSummary: { gap: 12 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routineTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  meta: { color: palette.muted, fontSize: 12 },
  dayTabs: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#E9ECE3', borderRadius: 20, padding: 5 },
  dayTab: { width: 42, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 16 },
  dayTabSelected: { backgroundColor: palette.deepGreen },
  dayTabText: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  dayTabTextSelected: { color: palette.white },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  dayDotActive: { backgroundColor: palette.cyan },
  dayDotSelected: { backgroundColor: palette.neon },
  selectedDayTitle: { color: palette.ink, fontSize: 19, fontWeight: '800' },
  restCard: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  restTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  restCopy: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  blockCard: { gap: 12, padding: 16 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  blockTitle: { color: palette.ink, fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  progressPill: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#19D98B26' },
  progressText: { color: palette.green, fontSize: 12, fontWeight: '800' },
  exercisePanel: { gap: 8, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 11 },
  exerciseHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exerciseNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#7C5CFF26', color: palette.violet, fontSize: 13, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' },
  exerciseName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  exerciseMeta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  targetText: { color: palette.green, fontSize: 12, fontWeight: '700' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 38 },
  setLabel: { width: 48, color: palette.muted, fontSize: 11, fontWeight: '700' },
  metricGroup: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metricInput: { width: 54, height: 38, borderRadius: 12, backgroundColor: '#F2F4EE', color: palette.ink, textAlign: 'center', fontSize: 14, fontWeight: '700' },
  inputDone: { backgroundColor: '#E6EED7' },
  metricUnit: { color: palette.muted, fontSize: 10, fontWeight: '700' },
  completeSetButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 42, borderRadius: 15, backgroundColor: palette.neon },
  completeDisabled: { backgroundColor: '#E9ECE3' },
  completeText: { color: palette.deepGreen, fontSize: 13, fontWeight: '800' },
  completeTextDone: { color: palette.green },
});
