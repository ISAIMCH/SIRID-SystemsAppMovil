import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, getApiErrorMessage } from '../api';
import type { WorkoutSessionLog } from '../types';
import { tzOffsetMinutes } from './format';
import type { ClientOverview, ExerciseSummary } from './types';

// Enough to cover the last weeks the alerts and the week strip look at.
const RECENT_LIMIT = 20;
// Coming back from a detail screen does not reload what was just loaded.
const STALE_AFTER_MS = 30_000;

export type ClientTracking = {
  overview: ClientOverview | null;
  recentSessions: WorkoutSessionLog[];
  exercises: ExerciseSummary[] | null;
  periodDays: 7 | 30;
  setPeriodDays: (days: 7 | 30) => void;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string;
  /** When the data was loaded: the "now" every relative date and alert is computed against. */
  loadedAt: number;
  reload: () => void;
};

export function useClientTracking(clientId: string): ClientTracking {
  const [overview, setOverview] = useState<ClientOverview | null>(null);
  const [recentSessions, setRecentSessions] = useState<WorkoutSessionLog[]>([]);
  const [exercises, setExercises] = useState<ExerciseSummary[] | null>(null);
  const [periodDays, setPeriodDays] = useState<7 | 30>(7);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [loadedAtState, setLoadedAt] = useState(() => Date.now());
  const loadedAt = useRef(0);
  const request = useRef(0);

  const load = useCallback((refreshing: boolean, days: 7 | 30) => {
    const current = request.current + 1;
    request.current = current;
    if (refreshing) setIsRefreshing(true);
    const params = { tzOffsetMinutes: tzOffsetMinutes() };
    Promise.all([
      api.get<ClientOverview>(`/workouts/client/${clientId}/overview`, { params: { ...params, periodDays: days } }),
      api.get<{ sessions: WorkoutSessionLog[] }>(`/workouts/client/${clientId}`, { params: { ...params, limit: RECENT_LIMIT } }),
      api.get<{ exercises: ExerciseSummary[] }>(`/workouts/client/${clientId}/exercises`),
    ])
      .then(([overviewResponse, sessionsResponse, exercisesResponse]) => {
        if (request.current !== current) return;
        setOverview(overviewResponse.data);
        setRecentSessions(sessionsResponse.data.sessions);
        setExercises(exercisesResponse.data.exercises);
        setError('');
        const at = Date.now();
        loadedAt.current = at;
        setLoadedAt(at);
      })
      .catch((requestError: unknown) => {
        if (request.current === current) setError(getApiErrorMessage(requestError, 'No se pudo cargar el seguimiento del cliente.'));
      })
      .finally(() => {
        if (request.current !== current) return;
        setIsLoading(false);
        setIsRefreshing(false);
      });
  }, [clientId]);

  useFocusEffect(useCallback(() => {
    if (Date.now() - loadedAt.current > STALE_AFTER_MS) load(false, periodDays);
  }, [load, periodDays]));

  // Changing the compared period only reloads the overview.
  const firstPeriod = useRef(true);
  useEffect(() => {
    if (firstPeriod.current) { firstPeriod.current = false; return; }
    let isCurrent = true;
    api.get<ClientOverview>(`/workouts/client/${clientId}/overview`, { params: { tzOffsetMinutes: tzOffsetMinutes(), periodDays } })
      .then((response) => { if (isCurrent) setOverview(response.data); })
      .catch((requestError: unknown) => { if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar la comparación.')); });
    return () => { isCurrent = false; };
  }, [clientId, periodDays]);

  return {
    overview,
    recentSessions,
    exercises,
    periodDays,
    setPeriodDays,
    isLoading,
    isRefreshing,
    error,
    loadedAt: loadedAtState,
    reload: () => load(true, periodDays),
  };
}
