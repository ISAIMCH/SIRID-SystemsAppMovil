import type { MuscleGroup } from '../types';

/** Answers of the Coach's client tracking endpoints (`/workouts/client/:clientId/...`). */

export type PeriodMetrics = {
  sessions: number;
  volumeKg: number;
  avgRpe: number | null;
  rpeCount: number;
  completedSets: number;
  skippedSets: number;
  avgDurationMinutes: number | null;
};

export type WeekSummary = PeriodMetrics & {
  /** Local Monday, YYYY-MM-DD. */
  weekStart: string;
  /** Scheduled days of the routines trained that week, when known. */
  plannedSessions: number | null;
};

export type ClientOverview = {
  totals: {
    sessions: number;
    firstSessionAt: string | null;
    lastSession: { _id: string; completedAt: string } | null;
  };
  period: {
    days: number;
    currentStart: string;
    previousStart: string;
    current: PeriodMetrics;
    previous: PeriodMetrics;
  };
  /** Weeks with sessions, newest first. */
  weeks: WeekSummary[];
};

export type PrimaryMetric = 'e1rm' | 'reps' | 'distanceKm' | 'durationMinutes' | 'level';

export type EntryStats = {
  topSet?: { weightKg: number; reps: number } | null;
  volumeKg?: number;
  totalReps?: number;
  maxReps?: number;
  e1rm?: number;
  durationMinutes?: number | null;
  distanceKm?: number | null;
  level?: number | null;
};

export type ExerciseSummary = {
  key: string;
  name: string;
  muscleGroup: MuscleGroup;
  metricType: 'strength' | 'cardio';
  catalogExerciseId: string | null;
  primaryMetric: PrimaryMetric;
  sessions: number;
  skippedSessions: number;
  firstAt: string;
  lastAt: string;
  lastSkipped: boolean;
  last: (EntryStats & { completedAt: string; sessionId: string; value: number | null }) | null;
  pr: { completedAt: string; sessionId: string; value: number; weightKg?: number; reps?: number } | null;
  recent: { completedAt: string; sessionId: string; value: number }[];
  trend: { direction: 'up' | 'down' | 'flat'; changePct: number } | null;
  sessionsSinceBest: number | null;
};

export type ExerciseEntry = {
  sessionId: string;
  completedAt: string;
  routineTitle?: string;
  name: string;
  blockType: 'single' | 'superset' | 'circuit';
  skipped: boolean;
  target: { reps: number | null; weightKg: number | null; durationMinutes: number | null; distanceKm: number | null; level: number | null };
  sets: { setNumber: number; skipped: boolean; reps?: number | null; weightKg?: number | null; durationMinutes?: number | null; distanceKm?: number | null; level?: number | null }[];
  stats: EntryStats;
};

export type HistoryFilter = 'all' | 'notes' | 'skipped' | 'recovered' | 'highRpe';

export type ClientTab = 'summary' | 'progress' | 'history' | 'profile';
