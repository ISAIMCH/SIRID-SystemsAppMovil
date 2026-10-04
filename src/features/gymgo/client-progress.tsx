import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { FloatingCard, IconBadge } from './fit-ui';
import { routineEditorHref } from './routine-links';
import { palette } from './theme';
import type { Exercise, Routine, RoutineBlock, WorkoutSessionLog } from './types';
import { ActionButton, Notice, SectionTitle } from './ui';

const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
type ActualLog = { completedAt: string; reps?: number; weightKg?: number; durationMinutes?: number; distanceKm?: number; level?: number };

function getBlocks(routine: Routine): RoutineBlock[] {
  if (routine.blocks?.length) return routine.blocks;
  return (routine.exercises ?? []).map((exercise, order) => ({
    _id: `legacy-${exercise._id ?? order}`,
    day: exercise.day ?? 0,
    blockType: 'single',
    sets: exercise.sets ?? 3,
    restSeconds: exercise.restSeconds ?? 60,
    order,
    exercises: [exercise],
  }));
}

function isCardio(exercise: Exercise) {
  return exercise.metricType === 'cardio' || (typeof exercise.equipmentId === 'object' && exercise.equipmentId.type === 'cardio');
}

function formatActual(log: Omit<ActualLog, 'completedAt'>) {
  if (log.durationMinutes || log.distanceKm !== undefined || log.level !== undefined) {
    return [log.durationMinutes ? `${log.durationMinutes} min` : '', log.distanceKm !== undefined ? `${log.distanceKm} km` : '', log.level !== undefined ? `Nivel ${log.level}` : ''].filter(Boolean).join(' · ');
  }
  return `${log.reps ?? '—'} reps · ${log.weightKg ?? '—'} kg`;
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
      .catch((requestError: unknown) => { if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar el progreso del cliente.')); })
      .finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [clientId]));

  const lastLogs = new Map<string, { completedAt: string; values: ActualLog[] }>();
  for (const session of sessions) {
    const sessionLogs = new Map<string, { completedAt: string; values: ActualLog[] }>();
    for (const block of session.blocks ?? []) {
      for (const round of block.sets) {
        for (const exercise of round.exercises) {
          const key = exercise.routineExerciseId;
          const completedAt = round.completedAt ?? session.completedAt;
          const current = sessionLogs.get(key) ?? { completedAt, values: [] };
          current.values.push({
              completedAt: round.completedAt ?? session.completedAt,
              reps: exercise.reps,
              weightKg: exercise.weightKg,
              durationMinutes: exercise.durationMinutes,
              distanceKm: exercise.distanceKm,
              level: exercise.level,
          });
          sessionLogs.set(key, current);
        }
      }
    }
    for (const exercise of session.exercises ?? []) {
      if (!sessionLogs.has(exercise.routineExerciseId)) {
        sessionLogs.set(exercise.routineExerciseId, {
          completedAt: session.completedAt,
          values: exercise.sets.map((set) => ({ completedAt: session.completedAt, reps: set.reps, weightKg: set.weightKg })),
        });
      }
    }
    for (const [id, entry] of sessionLogs) {
      if (!lastLogs.has(id)) lastLogs.set(id, entry);
    }
  }

  const blocks = routine ? getBlocks(routine).sort((a, b) => a.day - b.day || a.order - b.order) : [];

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
                <Text style={styles.meta}>{routine.level} · {routine.daysPerWeek} días/semana · {sessions.length} sesiones</Text>
                {routine.sourceTemplate ? <Text style={styles.meta}>Copia independiente de una plantilla</Text> : null}
              </View>
            </View>
            <ActionButton onPress={() => router.push(routineEditorHref({ routineId: routine._id }))}>Editar rutina del cliente</ActionButton>
          </FloatingCard>

          {blocks.map((block, index) => (
            <FloatingCard key={block._id ?? block.order} style={styles.blockCard}>
              <View style={styles.top}>
                <IconBadge name={block.blockType === 'single' ? 'fitness-center' : 'sync-alt'} color={block.blockType === 'single' ? palette.neon : palette.violet} size={38} />
                <View style={styles.flex}>
                  <Text style={styles.blockTitle}>{days[block.day]} · Bloque {index + 1} · {block.blockType}</Text>
                  <Text style={styles.meta}>{block.sets} rondas · {block.restSeconds}s descanso</Text>
                </View>
              </View>
              {block.exercises.map((exercise, exerciseIndex) => {
                const last = exercise._id ? lastLogs.get(exercise._id) : undefined;
                return (
                  <ProgressExercise key={exercise._id ?? exercise.name} exercise={exercise} actual={last} index={exerciseIndex} />
                );
              })}
            </FloatingCard>
          ))}
        </>
      ) : null}
    </View>
  );
}

function ProgressExercise({ exercise, actual, index }: { exercise: Exercise; actual?: { completedAt: string; values: ActualLog[] }; index: number }) {
  const cardio = isCardio(exercise);
  const assigned = cardio
    ? [exercise.targetDurationMinutes ? `${exercise.targetDurationMinutes} min` : '', exercise.targetDistanceKm ? `${exercise.targetDistanceKm} km` : '', exercise.targetLevel ? `Nivel ${exercise.targetLevel}` : ''].filter(Boolean).join(' · ')
    : `${exercise.reps ?? '—'} reps${exercise.suggestedWeight !== undefined ? ` · ${exercise.suggestedWeight} kg` : ''}`;
  const actualLabel = actual?.values.map(({ completedAt: _completedAt, ...values }) => formatActual(values)).join(' / ');

  return (
    <View style={styles.exercise}>
      <Text style={styles.exerciseName}>{String.fromCharCode(65 + index)}. {exercise.name}</Text>
      <View style={styles.compare}>
        <View style={styles.column}>
          <Text style={styles.columnLabel}>Asignado</Text>
          <Text style={styles.columnValue}>{assigned || 'Sin objetivo'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.column}>
          <Text style={styles.columnLabel}>Último registro</Text>
          <Text style={styles.columnValue}>{actualLabel || 'Sin registros'}</Text>
          {actual ? <Text style={styles.columnMeta}>{new Date(actual.completedAt).toLocaleDateString('es-MX')}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 14 },
  flex: { flex: 1 },
  routineCard: { gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routineTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  blockCard: { gap: 12 },
  blockTitle: { color: palette.ink, fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
  meta: { color: palette.muted, fontSize: 12 },
  exercise: { gap: 7, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 10 },
  exerciseName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  compare: { flexDirection: 'row', gap: 12, backgroundColor: '#F2F4EE', borderRadius: 15, padding: 11 },
  column: { flex: 1, gap: 3 },
  divider: { width: 1, backgroundColor: palette.line },
  columnLabel: { color: palette.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  columnValue: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  columnMeta: { color: palette.muted, fontSize: 11 },
});
