import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { FloatingCard, IconBadge } from './fit-ui';
import { routineEditorHref } from './routine-links';
import { palette } from './theme';
import type { Exercise, Routine, RoutineBlock, WorkoutSessionLog } from './types';
import { Notice, SectionTitle } from './ui';

const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
type ActualLog = { completedAt: string; reps?: number; weightKg?: number; durationMinutes?: number; distanceKm?: number; level?: number };
type ExerciseHistory = {
  completedAt: string;
  values: ActualLog[];
  best?: ActualLog;
  previous?: ActualLog;
  skippedLast: boolean;
};

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

function isCardio(exercise: Exercise | { metricType?: 'strength' | 'cardio'; equipmentId?: Exercise['equipmentId'] }) {
  return exercise.metricType === 'cardio' || (typeof exercise.equipmentId === 'object' && exercise.equipmentId.type === 'cardio');
}

function formatActual(log: Omit<ActualLog, 'completedAt'>) {
  if (log.durationMinutes || log.distanceKm !== undefined || log.level !== undefined) {
    return [log.durationMinutes ? `${log.durationMinutes} min` : '', log.distanceKm !== undefined ? `${log.distanceKm} km` : '', log.level !== undefined ? `Nivel ${log.level}` : ''].filter(Boolean).join(' · ');
  }
  return `${log.reps ?? '—'} reps · ${log.weightKg ?? '—'} kg`;
}

function formatNumber(value: number | undefined, digits = 0) {
  return value === undefined ? '—' : value.toFixed(digits).replace(/\.0$/, '');
}

function formatRest(set: { actualRestSeconds?: number; addedRestCount?: number; restSkipped?: boolean }) {
  if (set.restSkipped) return 'Descanso saltado';
  const base = `${set.actualRestSeconds ?? 0}s`;
  return set.addedRestCount ? `${base} · +15s ×${set.addedRestCount}` : base;
}

function sessionDate(session: WorkoutSessionLog) {
  return new Date(session.completedAt);
}

function getSessionExerciseLogs(session: WorkoutSessionLog) {
  const logs = new Map<string, { values: ActualLog[]; skipped: boolean }>();
  for (const block of session.blocks ?? []) {
    for (const round of block.sets) {
      for (const exercise of round.exercises) {
        const current = logs.get(exercise.routineExerciseId) ?? { values: [], skipped: false };
        current.skipped ||= Boolean(exercise.skipped);
        if (!exercise.skipped) {
          current.values.push({
            completedAt: round.completedAt ?? session.completedAt,
            reps: exercise.reps,
            weightKg: exercise.weightKg,
            durationMinutes: exercise.durationMinutes,
            distanceKm: exercise.distanceKm,
            level: exercise.level,
          });
        }
        logs.set(exercise.routineExerciseId, current);
      }
    }
  }
  return logs;
}

function buildExerciseHistory(sessions: WorkoutSessionLog[]) {
  const lastLogs = new Map<string, ExerciseHistory>();
  const allLogs = new Map<string, ActualLog[]>();
  const orderedSessions = [...sessions].sort((a, b) => sessionDate(b).getTime() - sessionDate(a).getTime());
  for (const session of orderedSessions) {
    for (const [id, entry] of getSessionExerciseLogs(session)) {
      allLogs.set(id, [...(allLogs.get(id) ?? []), ...entry.values]);
      if (!lastLogs.has(id)) {
        lastLogs.set(id, {
          completedAt: session.completedAt,
          values: entry.values,
          skippedLast: entry.skipped,
        });
      } else {
        const current = lastLogs.get(id);
        if (current?.values.length === 0 && entry.values.length) {
          lastLogs.set(id, { ...current, completedAt: session.completedAt, values: entry.values });
        } else if (current && !current.previous && entry.values.length) {
          lastLogs.set(id, { ...current, previous: entry.values[0] });
        }
      }
    }
  }
  for (const [id, entry] of lastLogs) {
    const values = allLogs.get(id) ?? [];
    const best = values.reduce<ActualLog | undefined>((winner, value) => {
      if (!winner) return value;
      if (value.weightKg !== undefined) return (value.weightKg * (value.reps ?? 0)) > (winner.weightKg ?? 0) * (winner.reps ?? 0) ? value : winner;
      return (value.distanceKm ?? 0) > (winner.distanceKm ?? 0) || (value.durationMinutes ?? 0) > (winner.durationMinutes ?? 0) ? value : winner;
    }, undefined);
    lastLogs.set(id, { ...entry, best });
  }
  return lastLogs;
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'danger' | 'success' }) {
  const toneStyle = tone === 'warning' ? styles.badgeWarning : tone === 'danger' ? styles.badgeDanger : tone === 'success' ? styles.badgeSuccess : styles.badgeNeutral;
  return <View style={[styles.badge, toneStyle]}><Text style={styles.badgeText}>{children}</Text></View>;
}

export default function ClientProgress({ clientId }: { clientId: string }) {
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [sessions, setSessions] = useState<WorkoutSessionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [now] = useState(() => Date.now());

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

  const history = buildExerciseHistory(sessions);
  const blocks = routine ? getBlocks(routine).sort((a, b) => a.day - b.day || a.order - b.order) : [];
  const weekStart = now - 7 * 24 * 60 * 60 * 1000;
  const weeklySessions = sessions.filter((session) => sessionDate(session).getTime() >= weekStart);
  const averageRpe = weeklySessions.filter((session) => session.perceivedExertion !== undefined).reduce((sum, session) => sum + (session.perceivedExertion ?? 0), 0) / (weeklySessions.filter((session) => session.perceivedExertion !== undefined).length || 1);
  const latestSession = [...sessions].sort((a, b) => sessionDate(b).getTime() - sessionDate(a).getTime())[0];
  const daysSinceLastSession = latestSession ? Math.floor((now - sessionDate(latestSession).getTime()) / (24 * 60 * 60 * 1000)) : null;
  const skippedExercises = weeklySessions.reduce((count, session) => count + [...getSessionExerciseLogs(session).values()].filter((entry) => entry.skipped).length, 0);
  const bestLift = [...history.values()].filter((entry) => entry.best?.weightKg !== undefined).sort((a, b) => ((b.best?.weightKg ?? 0) * (b.best?.reps ?? 0)) - ((a.best?.weightKg ?? 0) * (a.best?.reps ?? 0)))[0];

  const toggleSession = (id: string) => {
    setExpandedSessions((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
            <Pressable accessibilityRole="button" onPress={() => router.push(routineEditorHref({ routineId: routine._id }))} style={({ pressed }) => [styles.editRoutineButton, pressed && styles.editRoutineButtonPressed]}>
              <Text style={styles.editRoutineButtonText}>Editar rutina del cliente</Text>
            </Pressable>
          </FloatingCard>

          <SectionTitle>Resumen y Alertas del Cliente</SectionTitle>
          <FloatingCard style={styles.insightsCard}>
            <View style={styles.insightGrid}>
              <InsightValue label="Adherencia · 7 días" value={`${weeklySessions.length}/${routine.daysPerWeek}`} detail="sesiones esta semana" />
              <InsightValue label="RPE promedio" value={weeklySessions.length ? formatNumber(averageRpe, 1) : '—'} detail="escala 1–5" />
              <InsightValue label="Volumen semanal" value={`${formatNumber(weeklySessions.reduce((sum, session) => sum + (session.totalVolumeKg ?? 0), 0))} kg`} detail={`${formatNumber(weeklySessions.reduce((sum, session) => sum + (session.caloriesBurned ?? 0), 0))} kcal`} />
              <InsightValue label="Mejor levantamiento" value={bestLift?.best ? `${formatNumber(bestLift.best.weightKg)} kg` : '—'} detail={bestLift?.best ? `${bestLift.best.reps ?? 0} reps` : 'Sin PR registrado'} />
            </View>
            <View style={styles.alertList}>
              {daysSinceLastSession === null || daysSinceLastSession >= 7 ? <Badge tone="danger">{daysSinceLastSession === null ? 'Sin sesiones registradas' : `Inactivo hace ${daysSinceLastSession} días`}</Badge> : null}
              {averageRpe >= 4.5 || latestSession?.perceivedExertion !== undefined && latestSession.perceivedExertion >= 4.5 ? <Badge tone="warning">Fatiga alta · RPE {formatNumber(latestSession?.perceivedExertion ?? averageRpe, 1)}</Badge> : null}
              {latestSession?.clientNotes ? <View style={styles.noteAlert}><Text style={styles.noteLabel}>Nota del cliente</Text><Text style={styles.noteText}>{latestSession.clientNotes}</Text></View> : null}
              {skippedExercises ? <Badge tone="warning">{skippedExercises} ejercicio{skippedExercises === 1 ? '' : 's'} omitido{skippedExercises === 1 ? '' : 's'} recientemente</Badge> : null}
              {daysSinceLastSession !== null && daysSinceLastSession < 7 && !latestSession?.clientNotes && !skippedExercises && averageRpe < 4.5 ? <Badge tone="success">Sin alertas recientes</Badge> : null}
            </View>
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
              {block.exercises.map((exercise, exerciseIndex) => <ProgressExercise key={exercise._id ?? exercise.name} exercise={exercise} actual={exercise._id ? history.get(exercise._id) : undefined} index={exerciseIndex} />)}
            </FloatingCard>
          ))}

          <SectionTitle>Bitácora de Sesiones Recientes</SectionTitle>
          {sessions.length ? sessions.slice(0, 10).map((session) => <SessionCard key={session._id} session={session} expanded={expandedSessions.has(session._id)} onToggle={() => toggleSession(session._id)} />) : <Notice>Aún no hay sesiones para mostrar.</Notice>}
        </>
      ) : null}
    </View>
  );
}

function InsightValue({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <View style={styles.insightValue}><Text style={styles.insightLabel}>{label}</Text><Text style={styles.insightNumber}>{value}</Text><Text style={styles.meta}>{detail}</Text></View>;
}

function ProgressExercise({ exercise, actual, index }: { exercise: Exercise; actual?: ExerciseHistory; index: number }) {
  const cardio = isCardio(exercise);
  const assigned = cardio
    ? [exercise.targetDurationMinutes ? `${exercise.targetDurationMinutes} min` : '', exercise.targetDistanceKm ? `${exercise.targetDistanceKm} km` : '', exercise.targetLevel ? `Nivel ${exercise.targetLevel}` : ''].filter(Boolean).join(' · ')
    : `${exercise.reps ?? '—'} reps${exercise.suggestedWeight !== undefined ? ` · ${exercise.suggestedWeight} kg` : ''}`;
  const actualLabel = actual?.values.map(({ completedAt: _completedAt, ...values }) => formatActual(values)).join(' / ');
  const latestWeight = actual?.values[0]?.weightKg;
  const delta = latestWeight !== undefined && exercise.suggestedWeight !== undefined ? latestWeight - exercise.suggestedWeight : undefined;
  const deltaLabel = delta === undefined ? '' : delta === 0 ? '=' : `${delta > 0 ? '+' : ''}${formatNumber(delta)} kg`;

  return (
    <View style={styles.exercise}>
      <View style={styles.compactLine}>
        <Text style={styles.exerciseLetter}>{String.fromCharCode(65 + index)}</Text>
        <Text numberOfLines={1} style={styles.exerciseName}>{exercise.name}</Text>
        <Text numberOfLines={1} style={styles.assignedTarget}>{assigned || 'Sin objetivo'}</Text>
        <Text numberOfLines={1} style={styles.actualTarget}>{actualLabel || (actual?.skippedLast ? 'Omitido' : 'Sin registro')}</Text>
      </View>
      <View style={styles.exerciseMeta}>
        <Text style={styles.compactLegend}>Objetivo · Último registro{actual ? ` · ${new Date(actual.completedAt).toLocaleDateString('es-MX')}` : ''}</Text>
        {actual?.skippedLast ? <Badge tone="warning">Omitido en la última sesión</Badge> : null}
        {actual?.best ? <Text style={styles.prText}>PR: {formatActual(actual.best)}{deltaLabel ? ` · ${deltaLabel}` : ''}</Text> : null}
        {actual?.previous && actual.values[0]?.weightKg !== undefined && actual.previous.weightKg !== undefined ? <Text style={styles.trendText}>Tendencia: {actual.values[0].weightKg - actual.previous.weightKg === 0 ? '=' : `${actual.values[0].weightKg - actual.previous.weightKg > 0 ? '+' : ''}${formatNumber(actual.values[0].weightKg - actual.previous.weightKg)} kg`}</Text> : null}
      </View>
    </View>
  );
}

function SessionCard({ session, expanded, onToggle }: { session: WorkoutSessionLog; expanded: boolean; onToggle: () => void }) {
  const date = sessionDate(session);
  const performedDay = date.getDay();
  const recovered = session.trainingDay !== performedDay;
  return (
    <FloatingCard style={styles.sessionCard}>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.sessionHeader}>
        <View style={styles.flex}>
          <Text style={styles.sessionTitle}>{date.toLocaleDateString('es-MX')} · {session.routineTitle ?? 'Rutina histórica'}</Text>
          <Text style={styles.meta}>Rutina de {days[session.trainingDay]} · {date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        <Text style={styles.expandText}>{expanded ? 'Ocultar' : 'Ver detalles'}</Text>
      </Pressable>
      {recovered ? <Badge tone="warning">Recuperada · Rutina de {days[session.trainingDay]}</Badge> : null}
      <View style={styles.metricRow}>
        <Text style={styles.metricText}>{session.durationMinutes} min ({formatNumber(session.activeDurationMinutes)} activos)</Text>
        <Text style={styles.metricText}>{formatNumber(session.totalRestSeconds)}s descanso</Text>
        <Text style={styles.metricText}>{formatNumber(session.totalVolumeKg)} kg · {formatNumber(session.caloriesBurned)} kcal</Text>
        <Text style={styles.metricText}>RPE {session.perceivedExertion ?? '—'}</Text>
      </View>
      {session.clientNotes ? <View style={styles.sessionNote}><Text style={styles.noteLabel}>Nota del cliente</Text><Text style={styles.noteText}>{session.clientNotes}</Text></View> : null}
      {expanded ? <SessionDetails session={session} /> : null}
    </FloatingCard>
  );
}

function SessionDetails({ session }: { session: WorkoutSessionLog }) {
  return (
    <View style={styles.details}>
      {(session.blocks ?? []).map((block, blockIndex) => (
        <View key={`${block.routineBlockId}-${blockIndex}`} style={styles.detailBlock}>
          <Text style={styles.detailTitle}>Bloque {blockIndex + 1} · {block.blockType}</Text>
          {block.sets.map((set) => (
            <View key={set.setNumber} style={styles.setRow}>
              <Text style={styles.setLabel}>Serie {set.setNumber} · {formatRest(set)}</Text>
              {set.exercises.map((exercise) => (
                <Text key={exercise.routineExerciseId} style={styles.setText}>
                  {exercise.exerciseName}: {exercise.skipped ? 'Omitido' : `${formatActual(exercise)} · objetivo ${exercise.targetReps ?? '—'} reps${exercise.targetWeightKg !== null && exercise.targetWeightKg !== undefined ? ` · ${exercise.targetWeightKg} kg` : ''}`}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 14 },
  flex: { flex: 1 },
  routineCard: { gap: 14 },
  editRoutineButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#10FF85', borderRadius: 10, backgroundColor: 'transparent', paddingHorizontal: 16 },
  editRoutineButtonText: { color: '#10FF85', fontSize: 14, fontWeight: '800' },
  editRoutineButtonPressed: { opacity: 0.78 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routineTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  blockCard: { gap: 12 },
  blockTitle: { color: palette.ink, fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
  meta: { color: palette.muted, fontSize: 12 },
  insightsCard: { gap: 16 },
  insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  insightValue: { flexGrow: 1, flexBasis: '44%', gap: 3 },
  insightLabel: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  insightNumber: { color: palette.neon, fontSize: 19, fontWeight: '900' },
  alertList: { gap: 8 },
  badge: { alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#52635A' },
  badgeNeutral: { backgroundColor: '#52635A' },
  badgeWarning: { backgroundColor: '#A66A1D' },
  badgeDanger: { backgroundColor: '#A33B49' },
  badgeSuccess: { backgroundColor: '#176B4B' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  noteAlert: { gap: 4, borderRadius: 9, padding: 10, backgroundColor: '#4E321F' },
  noteLabel: { color: '#FFC57A', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  noteText: { color: '#FFF0DC', fontSize: 13, lineHeight: 19 },
  exercise: { gap: 4, borderTopWidth: 1, borderTopColor: '#27342E', paddingTop: 9 },
  compactLine: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 7 },
  exerciseLetter: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#9BFF631C', color: '#9BFF63', fontSize: 11, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' },
  exerciseName: { flex: 1, color: '#F4F8F5', fontSize: 12, fontWeight: '800' },
  assignedTarget: { maxWidth: '25%', color: '#55D6D0', fontSize: 11, fontWeight: '700' },
  actualTarget: { maxWidth: '25%', color: '#9BFF63', fontSize: 11, fontWeight: '700', textAlign: 'right' },
  compactLegend: { color: '#91A098', fontSize: 9, textAlign: 'right' },
  exerciseMeta: { alignItems: 'flex-end', gap: 4 },
  prText: { color: '#FFC857', fontSize: 11, fontWeight: '800' },
  trendText: { color: '#55D6D0', fontSize: 11, fontWeight: '700' },
  sessionCard: { gap: 10 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  expandText: { color: palette.neon, fontSize: 11, fontWeight: '800' },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metricText: { color: '#B8C8BF', fontSize: 11 },
  sessionNote: { gap: 4, borderRadius: 9, padding: 10, backgroundColor: '#332B20' },
  details: { gap: 10, borderTopWidth: 1, borderTopColor: '#27342E', paddingTop: 10 },
  detailBlock: { gap: 6 },
  detailTitle: { color: palette.neon, fontSize: 12, fontWeight: '900' },
  setRow: { gap: 3, paddingLeft: 8 },
  setLabel: { color: '#FFC857', fontSize: 11, fontWeight: '800' },
  setText: { color: '#C8D4CD', fontSize: 11, lineHeight: 16 },
});
