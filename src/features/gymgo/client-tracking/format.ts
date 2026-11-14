import type { Href } from 'expo-router';

import type { WorkoutSessionLog } from '../types';
import type { EntryStats, PrimaryMetric } from './types';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
/** Monday-first initials for week strips. */
export const WEEK_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const BLOCK_LABELS: Record<string, string> = { single: 'Individual', superset: 'Superserie', circuit: 'Circuito' };
export const blockTypeLabel = (type?: string) => BLOCK_LABELS[type ?? ''] ?? 'Bloque';

/**
 * 8 hex chars (FNV-1a) of a normalized exercise name: the same digest the API puts in a custom exercise's key
 * (api/src/utils/client-tracking.js), so a reused routine slot never mixes two exercises.
 */
export function nameDigest(value: string | null | undefined) {
  const name = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Whether a routine has kept its current schedule since `since`: every edit, status change or reassignment moves
 * its updatedAt, so an older updatedAt proves the schedule then was the one it has now.
 */
export function scheduleUnchangedSince(routine: { updatedAt?: string } | null | undefined, since: Date | string) {
  if (!routine?.updatedAt) return false;
  const changed = new Date(routine.updatedAt).getTime();
  return Number.isFinite(changed) && changed <= new Date(since).getTime();
}

/** Minutes east of UTC, as the API expects. */
export const tzOffsetMinutes = () => -new Date().getTimezoneOffset();

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** Training volume: kilograms below a tonne, tonnes above. */
export function formatVolume(kg: number | null | undefined) {
  if (kg === null || kg === undefined) return '—';
  return kg >= 1000 ? `${formatNumber(kg / 1000, 1)} t` : `${formatNumber(kg)} kg`;
}

export function formatDate(value: string | Date, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Date(value).toLocaleDateString('es-MX', options);
}

export function formatDayDate(value: string | Date) {
  const date = new Date(value);
  return `${DAY_SHORT[date.getDay()]} ${formatDate(date)}`;
}

export function daysSince(value: string | Date, now = Date.now()) {
  const start = new Date(value);
  const today = new Date(now);
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((todayDay - startDay) / DAY_MS));
}

export function relativeDays(value: string | Date, now = Date.now()) {
  const days = daysSince(value, now);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days < 14) return 'hace 1 semana';
  if (days < 60) return `hace ${Math.floor(days / 7)} semanas`;
  return `hace ${Math.floor(days / 30)} meses`;
}

/** Local Monday (YYYY-MM-DD) of a date: the same week key the API uses with this device's offset. */
export function localWeekKey(value: string | Date) {
  const date = new Date(value);
  const fromMonday = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - fromMonday);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

export function weekKeyToDate(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function weekRangeLabel(key: string) {
  const start = weekKeyToDate(key);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${start.getDate()} al ${formatDate(end)}`
    : `${formatDate(start)} al ${formatDate(end)}`;
}

export function formatTopSet(stats?: EntryStats | null) {
  const top = stats?.topSet;
  if (!top) return '—';
  return top.weightKg > 0 ? `${formatNumber(top.weightKg, 1)} kg × ${top.reps}` : `${top.reps} reps`;
}

export function formatCardio(stats?: EntryStats | null) {
  if (!stats) return '—';
  return [
    stats.durationMinutes ? `${formatNumber(stats.durationMinutes)} min` : '',
    stats.distanceKm ? `${formatNumber(stats.distanceKm, 2)} km` : '',
    stats.level ? `Nivel ${stats.level}` : '',
  ].filter(Boolean).join(' · ') || '—';
}

export const METRIC_LABELS: Record<PrimaryMetric, string> = {
  e1rm: '1RM estimado',
  reps: 'Repeticiones máx.',
  distanceKm: 'Distancia',
  durationMinutes: 'Duración',
  level: 'Nivel',
};

export function formatMetric(metric: PrimaryMetric | 'weightKg' | 'volumeKg' | 'totalReps', value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  switch (metric) {
    case 'e1rm':
    case 'weightKg': return `${formatNumber(value, 1)} kg`;
    case 'volumeKg': return formatVolume(value);
    case 'reps':
    case 'totalReps': return `${formatNumber(value)} reps`;
    case 'distanceKm': return `${formatNumber(value, 2)} km`;
    case 'durationMinutes': return `${formatNumber(value)} min`;
    default: return `Nivel ${formatNumber(value)}`;
  }
}

/** Sessions trained on a different weekday than the routine day they log. */
export function isRecovered(session: Pick<WorkoutSessionLog, 'completedAt' | 'trainingDay'>) {
  return new Date(session.completedAt).getDay() !== session.trainingDay;
}

export function sessionSkips(session: WorkoutSessionLog) {
  const names = new Set<string>();
  let sets = 0;
  for (const block of session.blocks ?? []) {
    for (const round of block.sets) {
      for (const exercise of round.exercises) {
        if (exercise.skipped) { sets += 1; names.add(exercise.exerciseName); }
      }
    }
  }
  return { sets, names: [...names] };
}

export const sessionHref = (clientId: string, sessionId: string) => ({
  pathname: '/(main)/directory/client-session',
  params: { clientId, sessionId },
}) as unknown as Href;

export const exerciseHref = (clientId: string, key: string, name?: string) => ({
  pathname: '/(main)/directory/client-exercise',
  params: { clientId, key, ...(name ? { name } : {}) },
}) as unknown as Href;
