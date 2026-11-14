import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, SectionList, Text as RNText, View } from 'react-native';

import { Chip, EmptyState, ErrorBanner, Skeleton, Text } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

import { api, getApiErrorMessage } from '../api';
import type { WorkoutSessionLog } from '../types';
import { DAY_NAMES, formatDayDate, formatNumber, formatVolume, isRecovered, localWeekKey, sessionSkips, tzOffsetMinutes, weekRangeLabel } from './format';
import type { ClientOverview, HistoryFilter } from './types';

const PAGE_SIZE = 20;
const FILTERS: { value: HistoryFilter; label: string; icon?: 'chat-bubble-outline' | 'skip-next' | 'history' | 'battery-alert' }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'notes', label: 'Con notas', icon: 'chat-bubble-outline' },
  { value: 'skipped', label: 'Con omitidos', icon: 'skip-next' },
  { value: 'recovered', label: 'Recuperadas', icon: 'history' },
  { value: 'highRpe', label: 'RPE alto (4–5)', icon: 'battery-alert' },
];

type Section = { key: string; data: WorkoutSessionLog[] };

function toSections(sessions: WorkoutSessionLog[]): Section[] {
  const sections: Section[] = [];
  for (const session of sessions) {
    const key = localWeekKey(session.completedAt);
    const last = sections[sections.length - 1];
    if (last?.key === key) last.data.push(session);
    else sections.push({ key, data: [session] });
  }
  return sections;
}

export function HistoryTab({ clientId, overview, onOpenSession, onOpenSharedHistory }: {
  clientId: string;
  overview: ClientOverview | null;
  onOpenSession: (session: WorkoutSessionLog) => void;
  /** History from other gyms lives in Perfil, next to the client's consent. */
  onOpenSharedHistory: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [sessions, setSessions] = useState<WorkoutSessionLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Discards answers of a filter the coach already left.
  const request = useRef(0);

  // Only fetches; callers raise their own loading flag first (event handlers), so the effect below sets no state
  // synchronously.
  const loadPage = useCallback((mode: 'reset' | 'more' | 'refresh', after: string | null, activeFilter: HistoryFilter) => {
    const current = mode === 'more' ? request.current : request.current + 1;
    request.current = current;
    api.get<{ sessions: WorkoutSessionLog[]; nextCursor: string | null }>(`/workouts/client/${clientId}`, {
      params: { limit: PAGE_SIZE, filter: activeFilter, tzOffsetMinutes: tzOffsetMinutes(), ...(after ? { before: after } : {}) },
    })
      .then((response) => {
        if (request.current !== current) return;
        setSessions((previous) => (mode === 'more' ? [...previous, ...response.data.sessions] : response.data.sessions));
        setCursor(response.data.nextCursor);
        setHasMore(Boolean(response.data.nextCursor));
        setError('');
      })
      .catch((requestError: unknown) => {
        if (request.current === current) setError(getApiErrorMessage(requestError, 'No se pudo cargar el historial.'));
      })
      .finally(() => {
        if (request.current !== current) return;
        setIsLoading(false);
        setIsLoadingMore(false);
        setIsRefreshing(false);
      });
  }, [clientId]);

  useEffect(() => {
    loadPage('reset', null, filter);
  }, [filter, loadPage]);

  const changeFilter = (next: HistoryFilter) => {
    if (next === filter) return;
    setIsLoading(true);
    setSessions([]);
    setHasMore(true);
    setFilter(next);
  };

  const loadMore = () => {
    if (!hasMore || isLoadingMore || isLoading || error || !cursor) return;
    setIsLoadingMore(true);
    loadPage('more', cursor, filter);
  };

  const refresh = () => {
    setIsRefreshing(true);
    loadPage('refresh', null, filter);
  };

  const retry = () => {
    setError('');
    if (sessions.length && cursor) { setIsLoadingMore(true); loadPage('more', cursor, filter); }
    else { setIsLoading(true); loadPage('reset', null, filter); }
  };

  const weeks = new Map((overview?.weeks ?? []).map((week) => [week.weekStart, week]));
  const total = overview?.totals.sessions ?? 0;
  const filterLabel = FILTERS.find((item) => item.value === filter)?.label ?? '';

  const header = (
    <View style={styles.header}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((item) => <Chip key={item.value} label={item.label} icon={item.icon} selected={filter === item.value} onPress={() => changeFilter(item.value)} />)}
      </ScrollView>
      <Text variant="caption" tone="secondary">
        {filter === 'all'
          ? `${formatNumber(total)} ${total === 1 ? 'sesión registrada' : 'sesiones registradas'} · se cargan ${PAGE_SIZE} a la vez`
          : `Filtro: ${filterLabel.toLowerCase()} · busca en todo el historial`}
      </Text>
      {error ? <ErrorBanner message={error} onRetry={retry} /> : null}
    </View>
  );

  return (
    <SectionList
      sections={toSections(sessions)}
      keyExtractor={(item) => item._id}
      contentContainerStyle={styles.content}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      initialNumToRender={12}
      windowSize={9}
      onEndReachedThreshold={0.4}
      onEndReached={loadMore}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accentFill]} progressBackgroundColor={colors.surface} />}
      renderSectionHeader={({ section }) => {
        const week = weeks.get(section.key);
        const shown = section.data.length;
        const parts = [
          week ? `${week.sessions}${week.plannedSessions ? ` de ${week.plannedSessions}` : ''} ${week.sessions === 1 && !week.plannedSessions ? 'sesión' : 'sesiones'}` : null,
          week ? formatVolume(week.volumeKg) : null,
          filter !== 'all' ? `${shown} ${shown === 1 ? 'coincide' : 'coinciden'}` : null,
        ].filter(Boolean);
        return (
          <View style={styles.weekHeader} accessibilityRole="header">
            <RNText style={styles.weekTitle}>Semana del {weekRangeLabel(section.key)}</RNText>
            <RNText style={styles.weekMeta}>{parts.join(' · ')}</RNText>
          </View>
        );
      }}
      renderItem={({ item, index, section }) => (
        <SessionRow session={item} first={index === 0} last={index === section.data.length - 1} onPress={() => onOpenSession(item)} />
      )}
      ListEmptyComponent={isLoading ? (
        <View style={styles.skeletons}>{[0, 1, 2, 3].map((item) => <Skeleton key={item} height={64} radius={radius.md} />)}</View>
      ) : error ? undefined : (
        <EmptyState
          icon={filter === 'all' ? 'event-note' : 'filter-list'}
          title={filter === 'all' ? 'Aún no hay sesiones' : 'Sin coincidencias'}
          message={filter === 'all' ? 'Las sesiones que registre el cliente aparecerán aquí.' : 'Ninguna sesión del historial cumple este filtro.'}
          action={filter === 'all' ? undefined : 'Ver todas'}
          onAction={filter === 'all' ? undefined : () => changeFilter('all')}
        />
      )}
      ListFooterComponent={(
        <View style={styles.footer}>
          {isLoadingMore ? <ActivityIndicator color={colors.accent} /> : null}
          {!hasMore && sessions.length > 0 ? <Text variant="caption" tone="secondary" style={styles.center}>Inicio del historial · {sessions.length} {sessions.length === 1 ? 'sesión' : 'sesiones'}</Text> : null}
          {!hasMore && filter === 'all' ? (
            <Pressable accessibilityRole="button" onPress={onOpenSharedHistory} style={styles.link}>
              <RNText style={styles.linkText}>Historial de otros gimnasios (en Perfil)</RNText>
              <MaterialIcons name="chevron-right" size={20} color={colors.accent} />
            </Pressable>
          ) : null}
        </View>
      )}
    />
  );
}

function SessionRow({ session, first, last, onPress }: { session: WorkoutSessionLog; first: boolean; last: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const skips = sessionSkips(session);
  const recovered = isRecovered(session);
  const flags = [
    session.clientNotes?.trim() ? { icon: 'chat-bubble-outline' as const, label: 'Con nota', color: colors.info } : null,
    skips.sets ? { icon: 'skip-next' as const, label: `${skips.sets} ${skips.sets === 1 ? 'omitida' : 'omitidas'}`, color: colors.warning } : null,
    recovered ? { icon: 'history' as const, label: 'Recuperada', color: colors.warning } : null,
  ].filter((flag): flag is NonNullable<typeof flag> => Boolean(flag));
  const metrics = [
    `${formatNumber(session.durationMinutes)} min`,
    formatVolume(session.totalVolumeKg),
    session.perceivedExertion ? `RPE ${session.perceivedExertion}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatDayDate(session.completedAt)}, ${session.routineTitle ?? 'Rutina'}, ${metrics}${flags.length ? `, ${flags.map((flag) => flag.label).join(', ')}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, first && styles.rowFirst, last && styles.rowLast, !last && styles.rowDivider, pressed && styles.pressed]}>
      <View style={styles.flex}>
        <RNText style={styles.rowTitle}>
          {formatDayDate(session.completedAt)} · {session.routineTitle ?? 'Rutina histórica'}
          {recovered ? <RNText style={styles.rowHint}> · del {DAY_NAMES[session.trainingDay].toLowerCase()}</RNText> : null}
        </RNText>
        <View style={styles.rowMeta}>
          <RNText style={styles.rowMetrics}>{metrics}</RNText>
          {flags.map((flag) => (
            <View key={flag.icon} style={styles.flag}>
              <MaterialIcons name={flag.icon} size={13} color={flag.color} />
              <RNText style={[styles.flagText, { color: flag.color }]}>{flag.label}</RNText>
            </View>
          ))}
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.huge * 2 },
  header: { gap: space.sm, marginBottom: space.sm },
  filters: { gap: space.sm, paddingRight: space.xl },
  weekHeader: { paddingTop: space.xl, paddingBottom: space.sm, gap: 2 },
  weekTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  weekMeta: { color: colors.textSecondary, fontSize: 13 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, backgroundColor: colors.surface, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { backgroundColor: colors.surfaceRaised },
  flex: { flex: 1, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowHint: { color: colors.warning, fontSize: 13, fontWeight: '600' },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm, rowGap: 2 },
  rowMetrics: { color: colors.textSecondary, fontSize: 13 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  flagText: { fontSize: 12, fontWeight: '700' },
  skeletons: { gap: space.sm, paddingTop: space.lg },
  footer: { gap: space.lg, paddingTop: space.lg },
  center: { textAlign: 'center' },
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  linkText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
}));
