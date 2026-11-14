import type { IconName, Tone } from '@/components/sirid';

import type { Routine, WorkoutSessionLog } from '../types';
import { DAY_MS, DAY_NAMES, daysSince, formatDayDate, formatMetric, isRecovered, localWeekKey, sessionSkips, weekKeyToDate } from './format';
import type { ClientOverview, ExerciseSummary } from './types';

/**
 * Alert rules for the Coach's client summary. RPE is logged on a 1–5 scale.
 *
 * Crítico   · 14+ days without training · RPE 5 in each of the last two sessions ·
 *             no session 7+ days after the active routine was created.
 * Atención  · 7–13 days without training · fatigue (latest RPE 5, or 7-day average ≥ 4.5) ·
 *             skipped sets in the last 7 days · last full week below the routine's schedule.
 * Informativo · client notes, recovered sessions and new records of the last 7 days.
 *
 * Every alert comes from one rule, so the list never repeats itself, and "Todo en orden" is shown only when the
 * list has no critical or attention alert (it is derived, never decided apart).
 */

export type AlertLevel = 'critical' | 'attention' | 'info';
export type AlertTarget =
  | { type: 'session'; sessionId: string }
  | { type: 'exercise'; key: string; name: string }
  | { type: 'history' };

export type ClientAlert = {
  id: string;
  level: AlertLevel;
  icon: IconName;
  title: string;
  detail?: string;
  target?: AlertTarget;
};

export const INACTIVE_ATTENTION_DAYS = 7;
export const INACTIVE_CRITICAL_DAYS = 14;
const RECENT_DAYS = 7;
const MAX_PER_KIND = 3;
const MAX_RPE = 5;
const HIGH_AVERAGE_RPE = 4.5;

const sortNewest = (sessions: WorkoutSessionLog[]) => [...sessions].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

export function buildAlerts({ now, overview, recentSessions, exercises, activeRoutine }: {
  now: number;
  overview: ClientOverview;
  recentSessions: WorkoutSessionLog[];
  exercises: ExerciseSummary[];
  activeRoutine: (Routine & { createdAt?: string }) | null;
}): ClientAlert[] {
  const alerts: ClientAlert[] = [];
  const sessions = sortNewest(recentSessions);
  const recent = sessions.filter((session) => now - new Date(session.completedAt).getTime() <= RECENT_DAYS * DAY_MS);
  const last = overview.totals.lastSession;

  // Activity.
  let inactive = false;
  if (!last) {
    if (activeRoutine) {
      const assignedDays = activeRoutine.createdAt ? daysSince(activeRoutine.createdAt, now) : null;
      inactive = true;
      alerts.push({
        id: 'no-sessions',
        level: assignedDays !== null && assignedDays >= INACTIVE_ATTENTION_DAYS ? 'critical' : 'attention',
        icon: 'event-busy',
        title: 'Aún no registra sesiones',
        detail: assignedDays !== null ? `Su rutina activa se creó hace ${assignedDays} ${assignedDays === 1 ? 'día' : 'días'}.` : `Rutina activa: ${activeRoutine.title}`,
      });
    }
  } else {
    const days = daysSince(last.completedAt, now);
    if (days >= INACTIVE_ATTENTION_DAYS) {
      inactive = true;
      alerts.push({
        id: 'inactive',
        level: days >= INACTIVE_CRITICAL_DAYS ? 'critical' : 'attention',
        icon: 'event-busy',
        title: `Sin entrenar desde hace ${days} días`,
        detail: `Última sesión: ${formatDayDate(last.completedAt)}`,
        target: { type: 'session', sessionId: last._id },
      });
    }
  }

  // Fatigue: a single alert, from the strongest signal.
  const [latest, beforeLatest] = sessions;
  const recentRpe = recent.filter((session) => typeof session.perceivedExertion === 'number');
  const averageRpe = recentRpe.length ? recentRpe.reduce((sum, session) => sum + (session.perceivedExertion ?? 0), 0) / recentRpe.length : null;
  // Old sessions are not fatigue now: a long gap is already reported as inactivity.
  if (latest && recent.includes(latest) && latest.perceivedExertion === MAX_RPE && beforeLatest?.perceivedExertion === MAX_RPE) {
    alerts.push({ id: 'fatigue', level: 'critical', icon: 'battery-alert', title: 'Esfuerzo máximo en sus dos últimas sesiones', detail: 'RPE 5 de 5 dos veces seguidas.', target: { type: 'session', sessionId: latest._id } });
  } else if (latest?.perceivedExertion === MAX_RPE && recent.includes(latest)) {
    alerts.push({ id: 'fatigue', level: 'attention', icon: 'battery-alert', title: 'Última sesión con esfuerzo máximo', detail: `RPE 5 de 5 · ${formatDayDate(latest.completedAt)}`, target: { type: 'session', sessionId: latest._id } });
  } else if (averageRpe !== null && recentRpe.length >= 2 && averageRpe >= HIGH_AVERAGE_RPE) {
    alerts.push({ id: 'fatigue', level: 'attention', icon: 'battery-alert', title: 'Fatiga elevada esta semana', detail: `RPE promedio ${averageRpe.toFixed(1)} de 5 en ${recentRpe.length} sesiones.`, target: { type: 'history' } });
  }

  // Skipped work, one alert per session.
  recent
    .map((session) => ({ session, skips: sessionSkips(session) }))
    .filter(({ skips }) => skips.sets > 0)
    .slice(0, MAX_PER_KIND)
    .forEach(({ session, skips }) => alerts.push({
      id: `skipped-${session._id}`,
      level: 'attention',
      icon: 'skip-next',
      title: `Omitió ${skips.sets} ${skips.sets === 1 ? 'serie' : 'series'}`,
      detail: `${skips.names.join(', ')} · ${formatDayDate(session.completedAt)}`,
      target: { type: 'session', sessionId: session._id },
    }));

  // Last full calendar week against the schedule; inactivity already covers an empty week.
  const scheduled = activeRoutine?.scheduleDays?.length ?? 0;
  const currentWeek = localWeekKey(new Date(now));
  const previousWeekStart = weekKeyToDate(currentWeek);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeekKey = localWeekKey(previousWeekStart);
  const firstAt = overview.totals.firstSessionAt ? new Date(overview.totals.firstSessionAt) : null;
  if (!inactive && scheduled > 0 && firstAt && firstAt < previousWeekStart) {
    const week = overview.weeks.find((entry) => entry.weekStart === previousWeekKey);
    const planned = week?.plannedSessions ?? scheduled;
    const done = week?.sessions ?? 0;
    if (done < planned) {
      alerts.push({ id: 'adherence', level: 'attention', icon: 'event-note', title: `Semana pasada: ${done} de ${planned} sesiones`, detail: 'Entrenó menos días de los programados.', target: { type: 'history' } });
    }
  }

  // Informative events.
  recent.filter((session) => session.clientNotes?.trim()).slice(0, MAX_PER_KIND).forEach((session) => alerts.push({
    id: `note-${session._id}`,
    level: 'info',
    icon: 'chat-bubble-outline',
    title: `Nota del cliente · ${formatDayDate(session.completedAt)}`,
    detail: session.clientNotes?.trim(),
    target: { type: 'session', sessionId: session._id },
  }));
  recent.filter(isRecovered).slice(0, MAX_PER_KIND).forEach((session) => alerts.push({
    id: `recovered-${session._id}`,
    level: 'info',
    icon: 'history',
    title: `Recuperó la rutina del ${DAY_NAMES[session.trainingDay].toLowerCase()}`,
    detail: `La entrenó el ${formatDayDate(session.completedAt)}.`,
    target: { type: 'session', sessionId: session._id },
  }));
  exercises
    // A first log is not a record: it needs history to beat.
    .filter((exercise) => exercise.pr && exercise.sessions > 1 && now - new Date(exercise.pr.completedAt).getTime() <= RECENT_DAYS * DAY_MS)
    .sort((a, b) => new Date(b.pr!.completedAt).getTime() - new Date(a.pr!.completedAt).getTime())
    .slice(0, MAX_PER_KIND)
    .forEach((exercise) => alerts.push({
      id: `pr-${exercise.key}`,
      level: 'info',
      icon: 'emoji-events',
      title: `Nuevo récord en ${exercise.name}`,
      detail: prLabel(exercise),
      target: { type: 'exercise', key: exercise.key, name: exercise.name },
    }));

  const order: Record<AlertLevel, number> = { critical: 0, attention: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

export function prLabel(exercise: ExerciseSummary) {
  const pr = exercise.pr;
  if (!pr) return '—';
  if (exercise.primaryMetric === 'e1rm') return `${formatMetric('weightKg', pr.weightKg)} × ${pr.reps}`;
  return formatMetric(exercise.primaryMetric, pr.value);
}

export const ALERT_TONE: Record<AlertLevel, Tone> = { critical: 'danger', attention: 'warning', info: 'info' };
export const ALERT_LEVEL_LABEL: Record<AlertLevel, string> = { critical: 'Crítico', attention: 'Atención', info: 'Informativo' };

/** The client's overall state, from the same alerts the summary lists. */
export function clientStatus(alerts: ClientAlert[], overview: ClientOverview | null): { tone: Tone; label: string } {
  if (alerts.some((alert) => alert.level === 'critical')) return { tone: 'danger', label: 'Requiere atención' };
  if (alerts.some((alert) => alert.level === 'attention')) return { tone: 'warning', label: 'En observación' };
  if (!overview?.totals.lastSession) return { tone: 'neutral', label: 'Sin actividad' };
  return { tone: 'success', label: 'Al día' };
}
