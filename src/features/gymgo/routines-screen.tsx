import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { ActionButton, AppHeader, Notice, Page, SectionTitle, Surface } from './ui';
import { palette } from './theme';
import type { Routine } from './types';

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

  useEffect(() => {
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
  }, [retryNumber]);

  return (
    <Page>
      <AppHeader
        title="Rutinas"
        detail={user?.role === 'Coach' ? 'Coach Creator y planes de tus clientes.' : 'Planes de entrenamiento disponibles para tu cuenta.'}
      />
      {user?.role === 'Coach' ? (
        <ActionButton onPress={() => router.push('/(main)/routine-create')}>Crear y asignar rutina</ActionButton>
      ) : null}
      <SectionTitle>{routines.length ? `${routines.length} planes` : 'Tu plan de entrenamiento'}</SectionTitle>
      {isLoading ? <ActivityIndicator color={palette.green} size="large" /> : null}
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
  feedback: { gap: 8 },
  retry: { color: palette.green, fontSize: 13, fontWeight: '800', paddingVertical: 6 },
  routine: { gap: 14 },
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
});