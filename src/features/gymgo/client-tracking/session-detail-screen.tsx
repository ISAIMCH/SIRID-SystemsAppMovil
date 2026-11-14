import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text as RNText, View } from 'react-native';

import { Badge, Card, ErrorBanner, Screen, ScreenHeader, SectionHeader, Skeleton, Text } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { radius, space } from '@/theme/tokens';

import { api, getApiErrorMessage } from '../api';
import type { WorkoutSessionLog } from '../types';
import { blockTypeLabel, DAY_NAMES, formatDate, formatNumber, formatVolume, isRecovered, sessionSkips } from './format';

type Block = NonNullable<WorkoutSessionLog['blocks']>[number];
type Round = Block['sets'][number];
type LoggedExercise = Round['exercises'][number] & { observations?: string };

function formatSet(exercise: LoggedExercise) {
  if (exercise.skipped) return 'Omitida';
  if (exercise.metricType === 'cardio') {
    return [
      exercise.durationMinutes ? `${exercise.durationMinutes} min` : '',
      exercise.distanceKm !== undefined && exercise.distanceKm !== null ? `${formatNumber(exercise.distanceKm, 2)} km` : '',
      exercise.level ? `nivel ${exercise.level}` : '',
    ].filter(Boolean).join(' · ') || '—';
  }
  return `${exercise.reps ?? '—'} × ${formatNumber(exercise.weightKg ?? 0, 1)} kg`;
}

function formatTarget(exercise: LoggedExercise) {
  if (exercise.metricType === 'cardio') {
    const parts = [
      exercise.targetDurationMinutes ? `${exercise.targetDurationMinutes} min` : '',
      exercise.targetDistanceKm ? `${formatNumber(exercise.targetDistanceKm, 2)} km` : '',
      exercise.targetLevel ? `nivel ${exercise.targetLevel}` : '',
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }
  const parts = [
    exercise.targetReps !== null && exercise.targetReps !== undefined ? `${exercise.targetReps} reps` : '',
    exercise.targetWeightKg !== null && exercise.targetWeightKg !== undefined ? `${formatNumber(exercise.targetWeightKg, 1)} kg` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function formatRest(round: Round) {
  if (round.restSkipped) return 'saltado';
  const base = `${round.actualRestSeconds ?? 0} s`;
  return round.addedRestCount ? `${base} (+15 s ×${round.addedRestCount})` : base;
}

// One row per exercise of the block, with every round it was logged in.
function exercisesOf(block: Block) {
  const byId = new Map<string, { exercise: LoggedExercise; rounds: { setNumber: number; log: LoggedExercise }[] }>();
  for (const round of [...block.sets].sort((a, b) => a.setNumber - b.setNumber)) {
    for (const log of round.exercises as LoggedExercise[]) {
      const entry = byId.get(log.routineExerciseId) ?? { exercise: log, rounds: [] };
      entry.rounds.push({ setNumber: round.setNumber, log });
      byId.set(log.routineExerciseId, entry);
    }
  }
  return [...byId.values()];
}

export default function SessionDetailScreen() {
  const styles = useStyles();
  const { clientId, sessionId } = useLocalSearchParams<{ clientId: string; sessionId: string }>();
  const [session, setSession] = useState<WorkoutSessionLog | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    api.get<{ session: WorkoutSessionLog }>(`/workouts/client/${clientId}/sessions/${sessionId}`)
      .then((response) => { if (isCurrent) { setSession(response.data.session); setError(''); } })
      .catch((requestError: unknown) => { if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar la sesión.')); });
    return () => { isCurrent = false; };
  }, [clientId, sessionId, attempt]);

  if (!session) {
    return (
      <Screen>
        <ScreenHeader back eyebrow="Sesión" title="Detalle de sesión" />
        {error ? <ErrorBanner message={error} onRetry={() => setAttempt((value) => value + 1)} /> : (
          <View style={styles.gap}>
            <Skeleton height={90} radius={radius.lg} />
            <Skeleton height={200} radius={radius.lg} />
          </View>
        )}
      </Screen>
    );
  }

  const date = new Date(session.completedAt);
  const recovered = isRecovered(session);
  const skips = sessionSkips(session);
  const completedSets = (session.blocks ?? []).reduce((sum, block) => sum + block.sets.length, 0);
  const stats = [
    { label: 'Duración', value: `${formatNumber(session.durationMinutes)} min`, hint: session.activeDurationMinutes !== undefined ? `${formatNumber(session.activeDurationMinutes)} min activos` : undefined },
    { label: 'Volumen', value: formatVolume(session.totalVolumeKg) },
    { label: 'RPE', value: session.perceivedExertion ? `${session.perceivedExertion} de 5` : '—', hint: session.perceivedExertion ? undefined : 'No registrado' },
    { label: 'Descanso total', value: `${formatNumber((session.totalRestSeconds ?? 0) / 60, 1)} min` },
    { label: 'Rondas', value: session.targetSetsTotal ? `${completedSets} de ${session.targetSetsTotal}` : formatNumber(completedSets) },
    { label: 'Calorías', value: `${formatNumber(session.caloriesBurned)} kcal`, hint: 'Estimadas' },
  ];

  return (
    <Screen>
      <ScreenHeader
        back
        eyebrow="Sesión"
        title={`${DAY_NAMES[date.getDay()]} ${formatDate(date)}`}
        subtitle={`${session.routineTitle ?? 'Rutina histórica'} · ${formatDate(date, { year: 'numeric', month: 'long', day: 'numeric' })}, ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}>
        {recovered || skips.sets ? (
          <View style={styles.badges}>
            {recovered ? <Badge tone="warning" icon="history">Recuperada · rutina del {DAY_NAMES[session.trainingDay].toLowerCase()}</Badge> : null}
            {skips.sets ? <Badge tone="warning" icon="skip-next">{skips.sets} {skips.sets === 1 ? 'serie omitida' : 'series omitidas'}</Badge> : null}
          </View>
        ) : null}
      </ScreenHeader>

      <View style={styles.grid}>
        {stats.map((stat) => (
          <Card key={stat.label} style={styles.stat}>
            <RNText style={styles.statLabel}>{stat.label}</RNText>
            <Text variant="headline">{stat.value}</Text>
            {stat.hint ? <Text variant="caption" tone="secondary">{stat.hint}</Text> : null}
          </Card>
        ))}
      </View>

      {session.clientNotes?.trim() ? (
        <Card style={styles.note}>
          <RNText style={styles.noteLabel}>Nota del cliente</RNText>
          <Text variant="body">{session.clientNotes.trim()}</Text>
        </Card>
      ) : null}

      <View style={styles.gap}>
        <SectionHeader title="Ejercicios" subtitle="Repeticiones × peso por serie, frente al objetivo de la rutina" />
        {(session.blocks ?? []).map((block, blockIndex) => (
          <Card key={`${block.routineBlockId}-${blockIndex}`} variant="raised">
            <View>
              <Text variant="bodyStrong">Bloque {blockIndex + 1} · {blockTypeLabel(block.blockType)}</Text>
              <Text variant="caption" tone="secondary">
                {block.sets.length}{block.targetSets ? ` de ${block.targetSets}` : ''} {block.sets.length === 1 && !block.targetSets ? 'ronda' : 'rondas'} · {block.restSeconds} s de descanso programado
              </Text>
            </View>
            {exercisesOf(block).map(({ exercise, rounds }) => {
              const target = formatTarget(exercise);
              const observations = rounds.map(({ log }) => log.observations).find(Boolean);
              return (
                <View key={exercise.routineExerciseId} style={styles.exercise}>
                  <Text variant="bodyStrong">{exercise.exerciseName}</Text>
                  {target ? <Text variant="caption" tone="secondary">Objetivo: {target}</Text> : null}
                  <View style={styles.sets}>
                    {rounds.map(({ setNumber, log }) => (
                      <View key={setNumber} style={[styles.setChip, log.skipped && styles.setSkipped]}>
                        <RNText style={styles.setNumber}>S{setNumber}</RNText>
                        <RNText style={[styles.setValue, log.skipped && styles.setSkippedText]}>{formatSet(log)}</RNText>
                      </View>
                    ))}
                  </View>
                  {observations ? <Text variant="caption" tone="secondary">Observaciones: {observations}</Text> : null}
                </View>
              );
            })}
            <Text variant="caption" tone="secondary">
              Descansos: {[...block.sets].sort((a, b) => a.setNumber - b.setNumber).map((round) => `S${round.setNumber} ${formatRest(round)}`).join(' · ')}
            </Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  gap: { gap: space.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { flexGrow: 1, flexBasis: '30%', minWidth: 100, gap: 2, padding: space.md },
  statLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  note: { backgroundColor: colors.infoSoft, borderColor: colors.info },
  noteLabel: { color: colors.info, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  exercise: { gap: space.xs, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.divider },
  sets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  setChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, backgroundColor: colors.surfaceSunken },
  setSkipped: { backgroundColor: colors.warningSoft },
  setNumber: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  setValue: { color: colors.text, fontSize: 13, fontWeight: '600' },
  setSkippedText: { color: colors.warning },
}));
