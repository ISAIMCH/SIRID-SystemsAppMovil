import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { AppHeader, Notice, Page, SectionTitle, Surface } from './ui';
import { palette } from './theme';
import type { Routine } from './types';

const levelNames = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

export default function RoutinesScreen() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

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
  }, []);

  return (
    <Page>
      <AppHeader title="Rutinas" detail="Planes de entrenamiento disponibles para tu cuenta." />
      <SectionTitle>{routines.length ? `${routines.length} planes` : 'Tu plan de entrenamiento'}</SectionTitle>
      {isLoading ? <ActivityIndicator color={palette.green} size="large" /> : null}
      {error ? <Notice error>{error}</Notice> : null}
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
          {routine.exercises.map((exercise, index) => (
            <View key={exercise._id ?? `${exercise.name}-${index}`} style={styles.exercise}>
              <View style={styles.exerciseNumber}><Text style={styles.numberText}>{index + 1}</Text></View>
              <View style={styles.exerciseInfo}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                <Text style={styles.exerciseMeta}>
                  {exercise.muscleGroup}  ·  {exercise.sets} × {exercise.reps}
                  {exercise.suggestedWeight !== undefined ? `  ·  ${exercise.suggestedWeight} kg` : ''}
                </Text>
              </View>
              <Text style={styles.rest}>{exercise.restSeconds}s</Text>
            </View>
          ))}
        </Surface>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
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
  exercise: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  exerciseNumber: { width: 25, height: 25, borderRadius: 13, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: palette.deepGreen, fontSize: 11, fontWeight: '800' },
  exerciseInfo: { flex: 1, gap: 2 },
  exerciseName: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  exerciseMeta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  rest: { color: palette.muted, fontSize: 11, fontWeight: '700' },
});