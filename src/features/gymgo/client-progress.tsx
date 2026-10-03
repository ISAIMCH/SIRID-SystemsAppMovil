import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { FloatingCard, IconBadge } from './fit-ui';
import { routineEditorHref } from './routine-links';
import { palette } from './theme';
import type { Exercise, Routine, WorkoutSessionLog } from './types';
import { ActionButton, Notice, SectionTitle } from './ui';

const weekDayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

type LastLog = { completedAt: string; sets: { reps: number; weightKg: number }[] };

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function ClientProgress({ clientId }: { clientId: string }) {
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [sessions, setSessions] = useState<WorkoutSessionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    Promise.all([
      api.get<{ routines: Routine[] }>('/routines', { params: { clientId } }),
      api.get<{ sessions: WorkoutSessionLog[] }>(`/workouts/client/${clientId}`),
    ])
      .then(([routinesResponse, sessionsResponse]) => {
        if (!isCurrent) return;
        const routines = routinesResponse.data.routines;
        setRoutine(routines.find((entry) => entry.status === 'active') ?? routines[0] ?? null);
        setSessions(sessionsResponse.data.sessions);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar el progreso del cliente.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [clientId]));

  const lastLogs = new Map<string, LastLog>();
  for (const session of sessions) {
    for (const entry of session.exercises) {
      if (!lastLogs.has(entry.routineExerciseId)) {
        lastLogs.set(entry.routineExerciseId, { completedAt: session.completedAt, sets: entry.sets });
      }
    }
  }

  const exercises = routine
    ? [...routine.exercises].sort((a, b) => (a.day ?? 0) - (b.day ?? 0) || a.order - b.order)
    : [];

  return (
    <View style={styles.wrapper}>
      <SectionTitle>Rutina actual y progreso</SectionTitle>
      {isLoading ? <ActivityIndicator color={palette.green} /> : null}
      {error ? <Notice error>{error}</Notice> : null}
      {!isLoading && !error && !routine ? <Notice>Este cliente aún no tiene una rutina asignada.</Notice> : null}

      {routine ? (
        <>
          <FloatingCard style={styles.routineCard}>
            <View style={styles.top}>
              <IconBadge name="assignment" color={palette.neon} />
              <View style={styles.flex}>
                <Text style={styles.routineTitle}>{routine.title}</Text>
                <Text style={styles.meta}>
                  {routine.level} · {routine.daysPerWeek} días/semana · {sessions.length} sesiones registradas
                </Text>
                {routine.sourceTemplate ? <Text style={styles.meta}>Copia independiente de una plantilla</Text> : null}
              </View>
            </View>
            <ActionButton onPress={() => router.push(routineEditorHref({ routineId: routine._id }))}>Editar rutina del cliente</ActionButton>
          </FloatingCard>

          {exercises.map((exercise) => (
            <ExerciseComparison key={exercise._id ?? exercise.name} exercise={exercise} last={exercise._id ? lastLogs.get(exercise._id) : undefined} />
          ))}
        </>
      ) : null}
    </View>
  );
}

function ExerciseComparison({ exercise, last }: { exercise: Exercise; last?: LastLog }) {
  const bestWeight = last ? Math.max(...last.sets.map((set) => set.weightKg)) : undefined;
  const delta = bestWeight !== undefined && exercise.suggestedWeight !== undefined ? bestWeight - exercise.suggestedWeight : undefined;
  const color = delta === undefined ? palette.muted : delta >= 0 ? palette.neon : palette.orange;

  return (
    <FloatingCard style={styles.exerciseCard}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <Text style={styles.meta}>{weekDayNames[exercise.day ?? 0]} · {exercise.muscleGroup}</Text>
        </View>
        {delta !== undefined ? (
          <View style={[styles.deltaChip, { backgroundColor: `${color}26` }]}>
            <MaterialIcons name={delta >= 0 ? 'trending-up' : 'trending-down'} size={14} color={delta >= 0 ? palette.green : palette.orange} />
            <Text style={[styles.deltaText, { color: delta >= 0 ? palette.green : palette.orange }]}>
              {delta >= 0 ? '+' : ''}{delta} kg
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.compare}>
        <View style={styles.column}>
          <Text style={styles.columnLabel}>Asignado</Text>
          <Text style={styles.columnValue}>{exercise.sets} × {exercise.reps}</Text>
          <Text style={styles.columnMeta}>{exercise.suggestedWeight !== undefined ? `${exercise.suggestedWeight} kg` : 'Sin peso sugerido'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.column}>
          <Text style={styles.columnLabel}>{last ? `Registrado · ${formatDate(last.completedAt)}` : 'Registrado'}</Text>
          {last ? (
            <Text style={styles.columnValue}>{last.sets.map((set) => `${set.reps}×${set.weightKg}`).join('  ')}</Text>
          ) : (
            <Text style={styles.columnMeta}>Sin registros todavía</Text>
          )}
          {last ? <Text style={styles.columnMeta}>reps × kg por serie</Text> : null}
        </View>
      </View>
    </FloatingCard>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 14 },
  flex: { flex: 1 },
  routineCard: { gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routineTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  meta: { color: palette.muted, fontSize: 12, textTransform: 'capitalize' },
  exerciseCard: { gap: 12 },
  exerciseName: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  deltaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  deltaText: { fontSize: 12, fontWeight: '800' },
  compare: { flexDirection: 'row', gap: 12, backgroundColor: '#F2F4EE', borderRadius: 16, padding: 12 },
  column: { flex: 1, gap: 3 },
  divider: { width: 1, backgroundColor: palette.line },
  columnLabel: { color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  columnValue: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  columnMeta: { color: palette.muted, fontSize: 12 },
});
