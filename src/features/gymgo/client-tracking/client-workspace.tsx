import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Badge, IconButton, Screen, Segmented, Skeleton, Text } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { space } from '@/theme/tokens';

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
export function ClientWorkspace({ person, routines, profile }: {
  person: DirectoryClient;
  routines: Routine[] | null;
  /** Perfil content: personal data, membership, observations and routine management. */
  profile: ReactNode;
}) {
  const styles = useStyles();
  const tracking = useClientTracking(person.id);
  const [tab, setTab] = useState<ClientTab>('summary');
  const [visited, setVisited] = useState<Set<ClientTab>>(() => new Set(['summary']));
  const activeRoutine = routines?.find((routine) => routine.status === 'active') ?? null;
  const alerts = tracking.overview
    ? buildAlerts({ now: tracking.loadedAt, overview: tracking.overview, recentSessions: tracking.recentSessions, exercises: tracking.exercises ?? [], activeRoutine })
    : [];
  const status = clientStatus(alerts, tracking.overview);
  const lastSession = tracking.overview?.totals.lastSession;
  const fullName = [person.name, person.lastName].filter(Boolean).join(' ');

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

  const render = (key: ClientTab) => {
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
          <View style={styles.headerText}>
            <Text variant="title" accessibilityRole="header">{fullName}</Text>
            {tracking.overview ? (
              <View style={styles.statusRow}>
                <Badge tone={status.tone} dot>{status.label}</Badge>
                <Text variant="caption" tone="secondary">
                  {lastSession ? `Última sesión ${relativeDays(lastSession.completedAt, tracking.loadedAt)} · ${formatDayDate(lastSession.completedAt)}` : 'Sin sesiones registradas'}
                </Text>
              </View>
            ) : tracking.isLoading ? <Skeleton width={220} height={20} /> : null}
          </View>
        </View>
        <Segmented value={tab} options={TABS} onChange={open} />
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
  header: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: space.md, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1, gap: space.xs },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm, rowGap: space.xs },
  body: { flex: 1 },
  hidden: { display: 'none' },
  profile: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.huge * 2, gap: space.xxl },
}));
