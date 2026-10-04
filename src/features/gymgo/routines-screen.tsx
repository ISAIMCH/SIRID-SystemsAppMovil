import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import CoachTemplates from './coach-templates';
import { routineEditorHref } from './routine-links';
import { palette } from './theme';
import type { Exercise, Routine } from './types';
import { ActionButton, AppHeader, Notice, Page, SectionTitle, Surface } from './ui';

const levelNames = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

export default function RoutinesScreen() {
  const { user } = useAuth();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);
  const [substituteExerciseId, setSubstituteExerciseId] = useState<string | null>(null);
  const [setLogs, setSetLogs] = useState<Record<string, { reps: string; weight: string }[]>>({});
  const [savingDay, setSavingDay] = useState<string | null>(null);
  const [savedDays, setSavedDays] = useState<string[]>([]);
  const [logMessage, setLogMessage] = useState<{ text: string; error: boolean } | null>(null);
  const startedAt = useRef<number | null>(null);

  function updateSet(exercise: Exercise, setIndex: number, field: 'reps' | 'weight', value: string) {
    const key = exercise._id;
    if (!key) return;
    startedAt.current ??= Date.now();
    const cleaned = value.replace(/[^0-9.,]/g, '').slice(0, 6);
    setSetLogs((current) => {
      const rows = Array.from({ length: exercise.sets }, (_, index) => current[key]?.[index] ?? { reps: '', weight: '' });
      rows[setIndex] = { ...rows[setIndex], [field]: cleaned };
      return { ...current, [key]: rows };
    });
  }

  async function saveSession(routine: Routine, day: number, dayExercises: Exercise[]) {
    const dayKey = `${routine._id}-${day}`;
    const exercises = dayExercises.flatMap((exercise) => {
      if (!exercise._id) return [];
      const sets = (setLogs[exercise._id] ?? [])
        .filter((entry) => entry.reps.trim() !== '')
        .map((entry) => ({
          reps: Math.round(Number(entry.reps.replace(',', '.'))),
          weightKg: Number(entry.weight.replace(',', '.')) || 0,
          restSeconds: exercise.restSeconds,
        }));
      return sets.length ? [{ routineExerciseId: exercise._id, sets }] : [];
    });
    if (!exercises.length) {
      setLogMessage({ text: 'Anota las repeticiones de al menos una serie.', error: true });
      return;
    }

    setLogMessage(null);
    setSavingDay(dayKey);
    try {
      const minutes = minutesSince(startedAt.current);
      await api.post('/workouts', {
        routineId: routine._id,
        trainingDay: day,
        durationMinutes: Math.min(600, minutes),
        exercises,
      });
      setSavedDays((current) => [...current, dayKey]);
      setSetLogs((current) => {
        const next = { ...current };
        dayExercises.forEach((exercise) => { if (exercise._id) delete next[exercise._id]; });
        return next;
      });
      startedAt.current = null;
      setLogMessage({ text: 'Sesión guardada. Tus estadísticas se actualizaron.', error: false });
    } catch (requestError) {
      setLogMessage({ text: getApiErrorMessage(requestError, 'No se pudo guardar la sesión.'), error: true });
    } finally {
      setSavingDay(null);
    }
  }

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    api.get<{ routines: Routine[] }>('/routines')
      .then((response) => {
        if (isCurrent) setRoutines(response.data.routines);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudieron cargar las rutinas.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
    // retryNumber solo fuerza una nueva carga al reintentar o al asignar una plantilla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNumber]));

  return (
    <Page>
      <AppHeader
        title="Rutinas"
        detail={user?.role === 'Coach' ? 'Coach Creator y planes de tus clientes.' : 'Planes de entrenamiento disponibles para tu cuenta.'}
      />
      {user?.role === 'Coach' ? (
        <View style={styles.coachActions}>
          <ActionButton onPress={() => router.push(routineEditorHref())}>Nueva rutina para cliente</ActionButton>
          <ActionButton secondary onPress={() => router.push(routineEditorHref({ mode: 'template' }))}>Nueva plantilla base</ActionButton>
        </View>
      ) : null}
      {user?.role === 'Coach' ? <CoachTemplates onAssigned={() => setRetryNumber((current) => current + 1)} /> : null}
      <SectionTitle>{routines.length ? `${routines.length} planes` : 'Tu plan de entrenamiento'}</SectionTitle>
      {isLoading ? <ActivityIndicator color={palette.green} size="large" /> : null}
      {logMessage ? <Notice error={logMessage.error}>{logMessage.text}</Notice> : null}
      {error ? (
        <View style={styles.feedback}>
          <Notice error>{error}</Notice>
          <Pressable accessibilityRole="button" onPress={() => { setError(''); setIsLoading(true); setRetryNumber((current) => current + 1); }}>
            <Text style={styles.retry}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
      {!isLoading && !error && routines.length === 0 ? (
        <Notice>Aún no tienes rutinas asignadas. Cuando tu Coach publique un plan, aparecerá aquí.</Notice>
      ) : null}
      {routines.map((routine) => (
        <Surface key={routine._id} style={styles.routine}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{routine.title}</Text>
            <Text style={[styles.status, routine.status === 'active' ? styles.active : styles.paused]}>
              {routine.status === 'active' ? 'Activa' : 'En pausa'}
            </Text>
          </View>
          {routine.description ? <Text style={styles.description}>{routine.description}</Text> : null}
          <Text style={styles.meta}>
            {levelNames[routine.level]}  ·  {routine.daysPerWeek} días/semana  ·  {routine.durationWeeks} semanas
          </Text>
          {routine.goal ? <Text style={styles.goal}>Objetivo · {routine.goal}</Text> : null}
          {user?.role === 'Coach' ? (
            <View style={styles.coachRow}>
              {typeof routine.assignedTo === 'object' ? <Text style={styles.goal}>Cliente · {routine.assignedTo.name}</Text> : null}
              <Pressable accessibilityRole="button" onPress={() => router.push(routineEditorHref({ routineId: routine._id }))}>
                <Text style={styles.retry}>Editar rutina</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.rule} />
          {getRoutineDays(routine).map((day) => {
            const dayExercises = getExercisesForDay(routine, day);
            return (
              <View key={day} style={styles.daySection}>
                <Text style={styles.dayTitle}>{weekDayNames[day]}</Text>
                {dayExercises.map((exercise, index) => {
                  const equipment = typeof exercise.equipmentId === 'object'
                    ? exercise.equipmentId
                    : undefined;
                  const equipmentName = equipment?.name ?? exercise.equipment ?? 'Equipo registrado';
                  return (
                    <View key={exercise._id ?? `${exercise.name}-${index}`} style={styles.exerciseBlock}>
                      <View style={styles.exercise}>
                        <View style={styles.exerciseNumber}><Text style={styles.numberText}>{index + 1}</Text></View>
                        <View style={styles.exerciseInfo}>
                          <Text style={styles.exerciseName}>{exercise.name}</Text>
                          <Text style={styles.exerciseMeta}>{exercise.muscleGroup} · {equipmentName}</Text>
                          <Text style={styles.exerciseMeta}>
                            {exercise.sets} × {exercise.reps}
                            {exercise.suggestedWeight !== undefined ? ` · ${exercise.suggestedWeight} kg` : ''}
                            {` · ${exercise.restSeconds}s descanso`}
                          </Text>
                        </View>
                      </View>
                      {user?.role === 'Cliente' && routine.status === 'active' && exercise._id ? (
                        <View style={styles.setTable}>
                          {Array.from({ length: exercise.sets }, (_, setIndex) => {
                            const entry = setLogs[exercise._id as string]?.[setIndex];
                            return (
                              <View key={setIndex} style={styles.setRow}>
                                <Text style={styles.setLabel}>Serie {setIndex + 1}</Text>
                                <TextInput
                                  keyboardType="numeric"
                                  value={entry?.reps ?? ''}
                                  onChangeText={(value) => updateSet(exercise, setIndex, 'reps', value)}
                                  placeholder={exercise.reps}
                                  placeholderTextColor={palette.muted}
                                  style={styles.setInput}
                                />
                                <Text style={styles.setUnit}>reps</Text>
                                <TextInput
                                  keyboardType="decimal-pad"
                                  value={entry?.weight ?? ''}
                                  onChangeText={(value) => updateSet(exercise, setIndex, 'weight', value)}
                                  placeholder={exercise.suggestedWeight !== undefined ? String(exercise.suggestedWeight) : '0'}
                                  placeholderTextColor={palette.muted}
                                  style={styles.setInput}
                                />
                                <Text style={styles.setUnit}>kg</Text>
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                      {user?.role === 'Cliente' ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setSubstituteExerciseId((current) => (
                            current === (exercise._id ?? exercise.name) ? null : (exercise._id ?? exercise.name)
                          ))}
                          style={styles.replaceButton}>
                          <Text style={styles.replaceText}>Sustituir ejercicio</Text>
                        </Pressable>
                      ) : null}
                      {user?.role === 'Cliente' && substituteExerciseId === (exercise._id ?? exercise.name) ? (
                        <Text style={styles.replaceNotice}>Las recomendaciones por disponibilidad se conectarán en la Fase 5.</Text>
                      ) : null}
                    </View>
                  );
                })}
                {!dayExercises.length ? <Text style={styles.noExercises}>Sin ejercicios programados.</Text> : null}
                {user?.role === 'Cliente' && routine.status === 'active' && dayExercises.length ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={savingDay === `${routine._id}-${day}`}
                    onPress={() => void saveSession(routine, day, dayExercises)}
                    style={[styles.finishButton, savingDay === `${routine._id}-${day}` && styles.finishDisabled]}>
                    {savingDay === `${routine._id}-${day}`
                      ? <ActivityIndicator color={palette.deepGreen} />
                      : <Text style={styles.finishText}>{savedDays.includes(`${routine._id}-${day}`) ? 'Guardar otra sesión' : 'Finalizar y guardar sesión'}</Text>}
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </Surface>
      ))}
    </Page>
  );
}

const weekDayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function getRoutineDays(routine: Routine) {
  if (routine.scheduleDays?.length) return [...routine.scheduleDays].sort((left, right) => left - right);
  return [...new Set(routine.exercises.map((exercise) => exercise.day ?? 1))].sort((left, right) => left - right);
}

function getExercisesForDay(routine: Routine, day: number) {
  const hasDayAssignments = routine.exercises.some((exercise) => exercise.day !== undefined);
  return hasDayAssignments
    ? routine.exercises.filter((exercise) => (exercise.day ?? 0) === day)
    : routine.exercises;
}

const styles = StyleSheet.create({
  coachActions: { gap: 10 },
  coachRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  feedback: { gap: 8 },
  retry: { color: palette.green, fontSize: 13, fontWeight: '800', paddingVertical: 6 },
  routine: { gap: 14, borderRadius: 24, borderWidth: 0, padding: 20, shadowColor: '#1C2A25', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 18, elevation: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { color: palette.ink, flex: 1, fontSize: 19, lineHeight: 25, fontWeight: '800' },
  status: { overflow: 'hidden', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  active: { color: palette.green, backgroundColor: '#E6EED7' },
  paused: { color: palette.muted, backgroundColor: '#ECEDE8' },
  description: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  meta: { color: palette.green, fontSize: 12, fontWeight: '700' },
  goal: { color: palette.muted, fontSize: 13 },
  rule: { height: 1, backgroundColor: palette.line },
  daySection: { gap: 10 },
  dayTitle: { color: palette.green, fontSize: 14, fontWeight: '800' },
  exerciseBlock: { gap: 8 },
  exercise: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  exerciseNumber: { width: 25, height: 25, borderRadius: 13, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: palette.deepGreen, fontSize: 11, fontWeight: '800' },
  exerciseInfo: { flex: 1, gap: 2 },
  exerciseName: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  exerciseMeta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  rest: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  replaceButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: palette.line, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7, marginLeft: 35 },
  replaceText: { color: palette.green, fontSize: 11, fontWeight: '800' },
  replaceNotice: { color: palette.muted, fontSize: 11, lineHeight: 16, marginLeft: 35 },
  noExercises: { color: palette.muted, fontSize: 12, paddingLeft: 4 },
  setTable: { gap: 6, marginLeft: 35 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setLabel: { width: 54, color: palette.muted, fontSize: 12, fontWeight: '700' },
  setInput: { width: 62, height: 38, borderRadius: 12, backgroundColor: '#F2F4EE', color: palette.ink, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  setUnit: { color: palette.muted, fontSize: 11, marginRight: 6 },
  finishButton: { minHeight: 48, borderRadius: 16, backgroundColor: palette.neon, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  finishDisabled: { opacity: 0.6 },
  finishText: { color: palette.deepGreen, fontSize: 14, fontWeight: '800' },
});
function minutesSince(start: number | null) {
  return start ? Math.round((Date.now() - start) / 60000) : 0;
}
