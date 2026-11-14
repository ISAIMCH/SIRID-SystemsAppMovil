// Pure helpers behind the Coach's client tracking (history pages, period comparison, per-exercise progress).
// They take plain session objects so they can be tested without a database.

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TZ_OFFSET_MINUTES = -360;
const HISTORY_FILTERS = ['all', 'notes', 'skipped', 'recovered', 'highRpe'];
const PERIOD_DAYS = [7, 14, 30, 90];
// RPE is logged on a 1–5 scale: 4 and 5 are "hard" sessions.
const HIGH_RPE = 4;
// A trend needs a change bigger than this to count as up or down.
const TREND_THRESHOLD = 0.025;
const RECENT_POINTS = 12;

/* ───────────── Time ───────────── */

// Minutes east of UTC, as the app sends `-new Date().getTimezoneOffset()`.
function clampTzOffset(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= -840 && number <= 840 ? Math.round(number) : DEFAULT_TZ_OFFSET_MINUTES;
}

function tzString(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// The local Monday (YYYY-MM-DD) of the week an instant falls in.
function localWeekKey(value, tzOffsetMinutes) {
  const local = new Date(new Date(value).getTime() + tzOffsetMinutes * 60 * 1000);
  const fromMonday = (local.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - fromMonday)).toISOString().slice(0, 10);
}

/* ───────────── History pages ───────────── */

// The cursor is the last session of a page: its completion instant plus its id, so ties never skip or repeat rows.
function encodeCursor(session) {
  return `${new Date(session.completedAt).toISOString()}_${session._id}`;
}

function decodeCursor(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)_([a-f\d]{24})$/i.exec(value);
  if (!match) return null;
  const completedAt = new Date(match[1]);
  return Number.isNaN(completedAt.getTime()) ? null : { completedAt, id: match[2] };
}

function cursorCondition(cursor, toObjectId) {
  return { $or: [
    { completedAt: { $lt: cursor.completedAt } },
    { completedAt: cursor.completedAt, _id: { $lt: toObjectId(cursor.id) } },
  ] };
}

// Mongo conditions for each history filter. "Recovered" sessions were trained on a different weekday than the
// routine day they log, in the client's local time.
function historyFilterCondition(filter, tzOffsetMinutes) {
  switch (filter) {
    case 'notes': return { clientNotes: /\S/ };
    case 'skipped': return { 'blocks.sets.exercises.skipped': true };
    case 'highRpe': return { perceivedExertion: { $gte: HIGH_RPE } };
    case 'recovered': return { $expr: { $ne: [
      '$trainingDay',
      { $subtract: [{ $dayOfWeek: { date: '$completedAt', timezone: tzString(tzOffsetMinutes) } }, 1] },
    ] } };
    default: return {};
  }
}

/* ───────────── Period comparison and weeks ───────────── */

function emptyMetrics() {
  return { sessions: 0, volumeKg: 0, rpeSum: 0, rpeCount: 0, completedSets: 0, skippedSets: 0, durationSum: 0 };
}

function addRow(metrics, row) {
  metrics.sessions += 1;
  metrics.volumeKg += row.totalVolumeKg ?? 0;
  if (typeof row.perceivedExertion === 'number') {
    metrics.rpeSum += row.perceivedExertion;
    metrics.rpeCount += 1;
  }
  metrics.completedSets += row.completedSets ?? 0;
  metrics.skippedSets += row.skippedSets ?? 0;
  metrics.durationSum += row.durationMinutes ?? 0;
}

function finishMetrics({ rpeSum, durationSum, ...metrics }) {
  return {
    ...metrics,
    volumeKg: Math.round(metrics.volumeKg),
    avgRpe: metrics.rpeCount ? Math.round((rpeSum / metrics.rpeCount) * 10) / 10 : null,
    avgDurationMinutes: metrics.sessions ? Math.round(durationSum / metrics.sessions) : null,
  };
}

/**
 * Totals, the last `periodDays` against the `periodDays` before them (same length, rolling, so a half-finished
 * calendar week is never compared with a full one), and one bucket per local week that has sessions.
 * `rows` are sessions reduced to { _id, completedAt, totalVolumeKg, perceivedExertion, durationMinutes, routine,
 * completedSets, skippedSets, plannedSessionsPerWeek? }; `plannedByRoutine` maps a routine id to
 * { planned (its current days per week), updatedAt }.
 */
// The instant a local week (YYYY-MM-DD Monday) begins.
function weekStartInstant(weekKey, tzOffsetMinutes) {
  return Date.parse(`${weekKey}T00:00:00Z`) - tzOffsetMinutes * 60 * 1000;
}

// Scheduled days per week that applied to one session, or null when it cannot be known. New sessions store it;
// for older ones the routine's current schedule only counts when the routine was not modified after the week began
// (every edit, status change or reassignment moves its updatedAt), so a later change is never applied backwards.
function plannedForRow(row, weekStart, plannedByRoutine) {
  if (typeof row.plannedSessionsPerWeek === 'number' && row.plannedSessionsPerWeek > 0) return row.plannedSessionsPerWeek;
  const routine = row.routine ? plannedByRoutine.get(String(row.routine)) : undefined;
  if (!routine?.planned || !routine.updatedAt) return null;
  return new Date(routine.updatedAt).getTime() <= weekStart ? routine.planned : null;
}

function summarizeSessions(rows, { now = new Date(), tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES, periodDays = 7, plannedByRoutine = new Map() } = {}) {
  const nowMs = new Date(now).getTime();
  const currentStart = nowMs - periodDays * DAY_MS;
  const previousStart = currentStart - periodDays * DAY_MS;
  const current = emptyMetrics();
  const previous = emptyMetrics();
  const weeks = new Map();
  let first = null;
  let last = null;

  for (const row of rows) {
    const at = new Date(row.completedAt).getTime();
    if (!first || at < first) first = at;
    if (!last || at > new Date(last.completedAt).getTime()) last = row;
    if (at >= currentStart && at <= nowMs) addRow(current, row);
    else if (at >= previousStart && at < currentStart) addRow(previous, row);

    const key = localWeekKey(row.completedAt, tzOffsetMinutes);
    const week = weeks.get(key) ?? { metrics: emptyMetrics(), plannedValues: new Set(), plannedUnknown: false };
    addRow(week.metrics, row);
    const planned = plannedForRow(row, weekStartInstant(key, tzOffsetMinutes), plannedByRoutine);
    if (planned === null) week.plannedUnknown = true;
    else week.plannedValues.add(planned);
    weeks.set(key, week);
  }

  return {
    totals: {
      sessions: rows.length,
      firstSessionAt: first ? new Date(first).toISOString() : null,
      lastSession: last ? { _id: String(last._id), completedAt: new Date(last.completedAt).toISOString() } : null,
    },
    period: {
      days: periodDays,
      currentStart: new Date(currentStart).toISOString(),
      previousStart: new Date(previousStart).toISOString(),
      current: finishMetrics(current),
      previous: finishMetrics(previous),
    },
    weeks: [...weeks.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      // A week only shows its plan when every session agrees on it; unknown or mixed plans show none.
      .map(([weekStart, { metrics, plannedValues, plannedUnknown }]) => ({
        weekStart,
        plannedSessions: !plannedUnknown && plannedValues.size === 1 ? [...plannedValues][0] : null,
        ...finishMetrics(metrics),
      })),
  };
}

/* ───────────── Per-exercise progress ───────────── */

const normalizeName = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const sameName = (a, b) => normalizeName(a) === normalizeName(b);

// 8 hex chars (FNV-1a) of the normalized name. The app computes the same digest (client-tracking/format.ts).
function nameDigest(value) {
  const name = normalizeName(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * A stable identity for an exercise across routines: the global catalog exercise when there is one. Custom
 * exercises are never merged by name across routines; they are the routine slot plus the name logged in it, since
 * a Coach may reuse a slot for a different exercise (renaming one starts a new series, but no record is lost).
 * Strength and cardio logs never share a key.
 */
function exerciseKey({ catalogExerciseId, routineExerciseId, metricType, name }) {
  const metric = metricType === 'cardio' ? 'c' : 's';
  return catalogExerciseId ? `c-${catalogExerciseId}-${metric}` : `r-${routineExerciseId}-${metric}-${nameDigest(name)}`;
}
const EXERCISE_KEY_PATTERN = /^(?:c-[a-f\d]{24}-[sc]|r-[a-f\d]{24}-[sc]-[a-f\d]{8})$/i;

// The catalog exercise a log belongs to. Logs saved before the field existed are resolved through their routine,
// but only while that routine slot still holds the same exercise (a slot edited to another exercise keeps its id).
function resolveCatalogId(log, routineExercises) {
  if (log.catalogExerciseId) return String(log.catalogExerciseId);
  const slot = routineExercises.get(String(log.routineExerciseId));
  return slot?.catalogExerciseId && sameName(slot.name, log.exerciseName) ? String(slot.catalogExerciseId) : null;
}

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

// Epley estimate; a single rep is the lift itself.
function estimatedOneRepMax(weightKg, reps) {
  if (!weightKg || !reps) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

function entryStats(entry) {
  const done = entry.sets.filter((set) => !set.skipped);
  if (entry.metricType === 'cardio') {
    return {
      durationMinutes: done.reduce((sum, set) => sum + (set.durationMinutes ?? 0), 0) || null,
      distanceKm: done.reduce((sum, set) => sum + (set.distanceKm ?? 0), 0) || null,
      level: done.reduce((best, set) => Math.max(best, set.level ?? 0), 0) || null,
    };
  }
  const top = done.reduce((best, set) => {
    if (!best) return set;
    if ((set.weightKg ?? 0) !== (best.weightKg ?? 0)) return (set.weightKg ?? 0) > (best.weightKg ?? 0) ? set : best;
    return (set.reps ?? 0) > (best.reps ?? 0) ? set : best;
  }, null);
  return {
    topSet: top ? { weightKg: top.weightKg ?? 0, reps: top.reps ?? 0 } : null,
    volumeKg: Math.round(done.reduce((sum, set) => sum + (set.reps ?? 0) * (set.weightKg ?? 0), 0)),
    totalReps: done.reduce((sum, set) => sum + (set.reps ?? 0), 0),
    maxReps: done.reduce((best, set) => Math.max(best, set.reps ?? 0), 0),
    e1rm: round(done.reduce((best, set) => Math.max(best, estimatedOneRepMax(set.weightKg ?? 0, set.reps ?? 0)), 0)),
  };
}

// Which number tells this exercise's story: estimated 1RM for loaded lifts, reps for bodyweight work, and the
// cardio measure the client actually logs.
function primaryMetric(metricType, entries) {
  const done = entries.filter((entry) => !entry.skipped);
  if (metricType === 'cardio') {
    if (done.some((entry) => entry.stats.distanceKm)) return 'distanceKm';
    if (done.some((entry) => entry.stats.durationMinutes)) return 'durationMinutes';
    return 'level';
  }
  return done.some((entry) => (entry.stats.topSet?.weightKg ?? 0) > 0) ? 'e1rm' : 'reps';
}

function primaryValue(metric, stats) {
  if (metric === 'e1rm') return stats.e1rm || null;
  if (metric === 'reps') return stats.maxReps || null;
  return stats[metric] ?? null;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// Latest value against the median of up to three before it, so one odd session does not flip the trend.
function trendOf(points) {
  if (points.length < 2) return null;
  const latest = points[points.length - 1].value;
  const base = median(points.slice(-4, -1).map((point) => point.value));
  if (!base) return null;
  const change = (latest - base) / base;
  return { direction: change > TREND_THRESHOLD ? 'up' : change < -TREND_THRESHOLD ? 'down' : 'flat', changePct: round(change * 100) };
}

function summarize(key, entries) {
  // `entries` are newest first.
  const latestEntry = entries[0];
  const metric = primaryMetric(latestEntry.metricType, entries);
  const done = entries.filter((entry) => !entry.skipped);
  const points = done
    .map((entry) => ({ completedAt: entry.completedAt, sessionId: entry.sessionId, value: primaryValue(metric, entry.stats) }))
    .filter((point) => point.value !== null)
    .reverse();

  let pr = null;
  for (const entry of [...done].reverse()) {
    const candidate = metric === 'e1rm'
      ? entry.stats.topSet && { weightKg: entry.stats.topSet.weightKg, reps: entry.stats.topSet.reps, value: entry.stats.topSet.weightKg }
      : { value: primaryValue(metric, entry.stats), ...(metric === 'reps' ? { reps: entry.stats.maxReps } : {}) };
    if (!candidate?.value) continue;
    const better = !pr || candidate.value > pr.value || (metric === 'e1rm' && candidate.value === pr.value && candidate.reps > pr.reps);
    if (better) pr = { ...candidate, completedAt: entry.completedAt, sessionId: entry.sessionId };
  }

  let best = -Infinity;
  let bestIndex = -1;
  points.forEach((point, index) => { if (point.value > best) { best = point.value; bestIndex = index; } });

  const lastDone = done[0];
  return {
    key,
    name: latestEntry.name,
    muscleGroup: latestEntry.muscleGroup,
    metricType: latestEntry.metricType,
    catalogExerciseId: latestEntry.catalogExerciseId,
    primaryMetric: metric,
    sessions: done.length,
    skippedSessions: entries.length - done.length,
    firstAt: entries[entries.length - 1].completedAt,
    lastAt: latestEntry.completedAt,
    lastSkipped: latestEntry.skipped,
    last: lastDone ? {
      completedAt: lastDone.completedAt,
      sessionId: lastDone.sessionId,
      value: primaryValue(metric, lastDone.stats),
      ...lastDone.stats,
    } : null,
    pr,
    recent: points.slice(-RECENT_POINTS),
    trend: trendOf(points),
    // Sessions logged after the best result; a long run means a plateau.
    sessionsSinceBest: bestIndex === -1 ? null : points.length - 1 - bestIndex,
  };
}

/**
 * Groups every logged exercise of `sessions` (normalized with sessionResponse, any order) by its stable key.
 * Returns Map(key → { summary, entries }) with entries newest first.
 */
function buildExerciseProgress(sessions, routineExercises = new Map()) {
  const byKey = new Map();
  const ordered = [...sessions].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  for (const session of ordered) {
    const inSession = new Map();
    for (const block of session.blocks ?? []) {
      for (const set of block.sets ?? []) {
        for (const log of set.exercises ?? []) {
          const metricType = log.metricType === 'cardio' ? 'cardio' : 'strength';
          const catalogExerciseId = resolveCatalogId(log, routineExercises);
          const key = exerciseKey({ catalogExerciseId, routineExerciseId: log.routineExerciseId, metricType, name: log.exerciseName });
          const entry = inSession.get(key) ?? {
            sessionId: String(session._id),
            completedAt: new Date(session.completedAt).toISOString(),
            routineTitle: session.routineTitle,
            name: log.exerciseName,
            muscleGroup: log.muscleGroup,
            metricType,
            catalogExerciseId,
            blockType: block.blockType,
            target: {
              reps: log.targetReps ?? null,
              weightKg: log.targetWeightKg ?? null,
              durationMinutes: log.targetDurationMinutes ?? null,
              distanceKm: log.targetDistanceKm ?? null,
              level: log.targetLevel ?? null,
            },
            sets: [],
          };
          entry.sets.push({
            setNumber: set.setNumber,
            skipped: Boolean(log.skipped),
            ...(metricType === 'cardio'
              ? { durationMinutes: log.durationMinutes ?? null, distanceKm: log.distanceKm ?? null, level: log.level ?? null }
              : { reps: log.reps ?? null, weightKg: log.weightKg ?? null }),
          });
          inSession.set(key, entry);
        }
      }
    }
    for (const [key, entry] of inSession) {
      entry.sets.sort((a, b) => a.setNumber - b.setNumber);
      entry.skipped = entry.sets.every((set) => set.skipped);
      entry.stats = entryStats(entry);
      byKey.set(key, [...(byKey.get(key) ?? []), entry]);
    }
  }
  const result = new Map();
  for (const [key, entries] of byKey) result.set(key, { summary: summarize(key, entries), entries });
  return result;
}

// routine id → { catalogExerciseId, name } for every exercise slot of the given routines (blocks or legacy list).
function routineExerciseIndex(routines) {
  const index = new Map();
  for (const routine of routines) {
    const exercises = [
      ...(routine.blocks ?? []).flatMap((block) => block.exercises ?? []),
      ...(routine.exercises ?? []),
    ];
    for (const exercise of exercises) {
      if (exercise?._id) index.set(String(exercise._id), { catalogExerciseId: exercise.catalogExerciseId ?? null, name: exercise.name });
    }
  }
  return index;
}

module.exports = {
  HISTORY_FILTERS,
  sameName,
  PERIOD_DAYS,
  HIGH_RPE,
  clampTzOffset,
  tzString,
  localWeekKey,
  encodeCursor,
  decodeCursor,
  cursorCondition,
  historyFilterCondition,
  summarizeSessions,
  exerciseKey,
  EXERCISE_KEY_PATTERN,
  nameDigest,
  weekStartInstant,
  resolveCatalogId,
  estimatedOneRepMax,
  buildExerciseProgress,
  routineExerciseIndex,
};
