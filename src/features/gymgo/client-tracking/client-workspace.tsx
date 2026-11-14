import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Badge, ErrorBanner, IconButton, Screen, Segmented, Skeleton, Text } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { DISPLAY, space } from '@/theme/tokens';

import type { DirectoryClient } from '../directory-types';
import type { Routine } from '../types';
import { buildAlerts, clientStatus, type ClientAlert } from './alerts';
import { exerciseHref, formatDayDate, relativeDays, sessionHref } from './format';
import { HistoryTab } from './history-tab';
import { ProgressTab } from './progress-tab';
import { SummaryTab } from './summary-tab';
import type { ClientTab, ExerciseSummary } from './types';
import { useClientTracking } from './use-client-tracking';

const TABS: { value: ClientTab; label: string }[] = [
  { value: 'summary', label: 'Resumen' },
  { value: 'progress', label: 'Progreso' },
  { value: 'history', label: 'Historial' },
  { value: 'profile', label: 'Perfil' },
];

/**
 * The Coach's view of one client: a fixed header (name, state, last activity) over four tabs that answer
 * how the client is (Resumen), how they evolve (Progreso), what they did (Historial) and who they are (Perfil).
 * Tabs stay mounted once opened so their scroll position and loaded pages survive switching.
 */
export function ClientWorkspace({ person, routines, routinesError, onRetryRoutines, profile }: {
  person: DirectoryClient;
  /** null while loading or after a failed request: never read as "no routines". */
  routines: Routine[] | null;
  routinesError: string;
  onRetryRoutines: () => void;
  /** Perfil content: personal data, membership, observations and routine management. */
  profile: ReactNode;
}) {
  const styles = useStyles();
  const tracking = useClientTracking(person.id);
  const [tab, setTab] = useState<ClientTab>('summary');
  const [visited, setVisited] = useState<Set<ClientTab>>(() => new Set(['summary']));
  const activeRoutine = routines?.find((routine) => routine.status === 'active') ?? null;
  // Alerts, state and schedule depend on the active routine: without the routines they would wrongly read
  // as "no routine" (no schedule, everything in order), so they wait for them.
  const routinesReady = routines !== null;
  const alerts = tracking.overview && routinesReady
    ? buildAlerts({ now: tracking.loadedAt, overview: tracking.overview, recentSessions: tracking.recentSessions, exercises: tracking.exercises ?? [], activeRoutine })
    : [];
  const status = clientStatus(alerts, tracking.overview);
  const lastSession = tracking.overview?.totals.lastSession;
  const fullName = [person.name, person.lastName].filter(Boolean).join(' ');
  // Short on screen so it fits beside the state at large text sizes; the date stays in Resumen and Historial.
  const lastSessionText = lastSession ? `Entrenó ${relativeDays(lastSession.completedAt, tracking.loadedAt)}` : 'Sin sesiones registradas';
  const lastSessionLabel = lastSession
    ? `Última sesión ${relativeDays(lastSession.completedAt, tracking.loadedAt)}, ${formatDayDate(lastSession.completedAt)}`
    : lastSessionText;

  const open = (next: ClientTab) => {
    setVisited((current) => (current.has(next) ? current : new Set([...current, next])));
    setTab(next);
  };
  const openExercise = (exercise: ExerciseSummary) => router.push(exerciseHref(person.id, exercise.key, exercise.name));
  const onAlertPress = (alert: ClientAlert) => {
    if (alert.target?.type === 'session') router.push(sessionHref(person.id, alert.target.sessionId));
    else if (alert.target?.type === 'exercise') router.push(exerciseHref(person.id, alert.target.key, alert.target.name));
    else if (alert.target?.type === 'history') open('history');
  };

  const routinesPending = (
    <View style={styles.pending}>
      {routinesError ? <ErrorBanner message={routinesError} onRetry={onRetryRoutines} /> : <Skeleton height={160} />}
    </View>
  );

  const render = (key: ClientTab) => {
    if (!routinesReady && (key === 'summary' || key === 'progress')) return routinesPending;
    switch (key) {
      case 'summary':
        return <SummaryTab clientId={person.id} tracking={tracking} alerts={alerts} activeRoutine={activeRoutine} now={tracking.loadedAt} onOpenTab={open} onAlertPress={onAlertPress} onOpenExercise={openExercise} />;
      case 'progress':
        return <ProgressTab tracking={tracking} activeRoutine={activeRoutine} onOpenExercise={openExercise} />;
      case 'history':
        return <HistoryTab clientId={person.id} overview={tracking.overview} onOpenSession={(session) => router.push(sessionHref(person.id, session._id))} onOpenSharedHistory={() => open('profile')} />;
      default:
        return <ScrollView contentContainerStyle={styles.profile}>{profile}</ScrollView>;
    }
  };

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <IconButton icon="arrow-back" label="Volver a clientes" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(main)/directory'))} />
          {/* One line so small screens and large text leave room for the tab content; the full name stays in
              Perfil and for screen readers. */}
          <Text variant="title" accessibilityRole="header" accessibilityLabel={fullName} numberOfLines={1} style={styles.name}>{fullName}</Text>
        </View>
        {tracking.overview ? (
          <View style={styles.statusRow} accessible accessibilityLabel={[routinesReady ? status.label : null, lastSessionLabel].filter(Boolean).join('. ')}>
            {routinesReady ? <Badge tone={status.tone} dot>{status.label}</Badge> : null}
            <Text variant="caption" tone="secondary" maxFontSizeMultiplier={1.3}>{lastSessionText}</Text>
          </View>
        ) : tracking.isLoading ? <Skeleton width={220} height={20} /> : null}
        <Segmented value={tab} options={TABS} onChange={open} fitLabels />
      </View>
      {TABS.map(({ value }) => (visited.has(value) ? (
        <View key={value} style={[styles.body, tab !== value && styles.hidden]} accessibilityElementsHidden={tab !== value} importantForAccessibility={tab === value ? 'auto' : 'no-hide-descendants'}>
          {render(value)}
        </View>
      ) : null))}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, maxWidth: undefined },
  header: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // fontFamily keeps the display face: withFonts gives the body face to any style with only a size.
  name: { flex: 1, fontFamily: DISPLAY, fontWeight: '700', fontSize: 24, lineHeight: 28 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm, rowGap: space.xxs },
  body: { flex: 1 },
  hidden: { display: 'none' },
  pending: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.lg },
  profile: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.huge * 2, gap: space.xxl },
}));
