const mongoose = require('mongoose');
const Routine = require('../models/routine.model');
const WorkoutSession = require('../models/workout-session.model');
const HttpError = require('../utils/http-error');
const { coachClientIds } = require('../utils/members');
const { resolveTenant } = require('../utils/tenant');
const { clientSessionScope, sessionResponse } = require('./workout.controller');
const {
  EXERCISE_KEY_PATTERN,
  PERIOD_DAYS,
  buildExerciseProgress,
  clampTzOffset,
  routineExerciseIndex,
  summarizeSessions,
} = require('../utils/client-tracking');

const objectId = (value) => new mongoose.Types.ObjectId(String(value));

// Sets of every block round, counted by whether the client skipped them. Old sessions without blocks kept one
// entry per performed set.
function countSets(skipped) {
  const fromBlocks = { $sum: { $map: {
    input: { $ifNull: ['$blocks', []] },
    as: 'block',
    in: { $sum: { $map: {
      input: { $ifNull: ['$$block.sets', []] },
      as: 'set',
      in: { $size: { $filter: {
        input: { $ifNull: ['$$set.exercises', []] },
        as: 'exercise',
        cond: skipped ? { $eq: ['$$exercise.skipped', true] } : { $ne: ['$$exercise.skipped', true] },
      } } },
    } } },
  } } };
  if (skipped) return fromBlocks;
  return { $add: [fromBlocks, { $sum: { $map: {
    input: { $ifNull: ['$exercises', []] },
    as: 'exercise',
    in: { $size: { $ifNull: ['$$exercise.sets', []] } },
  } } }] };
}

// Current scheduled days per week of each routine (deleted ones too: old weeks still refer to them) and when it
// last changed, so summarizeSessions only applies it to weeks that began after that change.
async function plannedSessionsByRoutine(routineIds) {
  if (!routineIds.length) return new Map();
  const routines = await Routine.find({ _id: { $in: routineIds } }).select('scheduleDays daysPerWeek updatedAt').lean();
  return new Map(routines.map((routine) => [String(routine._id), {
    planned: routine.scheduleDays?.length || routine.daysPerWeek || null,
    updatedAt: routine.updatedAt ?? null,
  }]));
}

// Totals, the chosen period against the previous one of equal length, and a summary of every week.
async function getClientOverview(req, res) {
  const scope = await clientSessionScope(req);
  const periodDays = PERIOD_DAYS.includes(Number(req.query?.periodDays)) ? Number(req.query.periodDays) : 7;
  const rows = await WorkoutSession.aggregate([
    { $match: { user: objectId(scope.user), organizationId: objectId(scope.organizationId) } },
    { $project: {
      completedAt: 1,
      totalVolumeKg: 1,
      perceivedExertion: 1,
      durationMinutes: 1,
      routine: 1,
      plannedSessionsPerWeek: 1,
      completedSets: countSets(false),
      skippedSets: countSets(true),
    } },
  ]);
  const routineIds = [...new Set(rows.map((row) => row.routine && String(row.routine)).filter(Boolean))];
  res.json(summarizeSessions(rows, {
    now: new Date(),
    tzOffsetMinutes: clampTzOffset(req.query?.tzOffsetMinutes),
    periodDays,
    plannedByRoutine: await plannedSessionsByRoutine(routineIds),
  }));
}

// Every logged exercise of the client, grouped by its stable identity.
async function loadExerciseProgress(scope) {
  const sessions = await WorkoutSession.find(scope)
    .select('completedAt routine routineTitle trainingDay blocks exercises')
    .sort({ completedAt: -1 })
    .lean();
  const routineIds = [...new Set(sessions.map((session) => session.routine && String(session.routine)).filter(Boolean))];
  const routines = routineIds.length
    ? await Routine.find({ _id: { $in: routineIds } }).select('blocks exercises').lean()
    : [];
  return buildExerciseProgress(sessions.map(sessionResponse), routineExerciseIndex(routines));
}

async function getClientExercises(req, res) {
  const progress = await loadExerciseProgress(await clientSessionScope(req));
  const exercises = [...progress.values()]
    .map(({ summary }) => summary)
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  res.json({ exercises });
}

async function getClientExercise(req, res) {
  if (!EXERCISE_KEY_PATTERN.test(req.params.key)) throw new HttpError(400, 'Ejercicio inválido.');
  const progress = await loadExerciseProgress(await clientSessionScope(req));
  const exercise = progress.get(req.params.key);
  if (!exercise) throw new HttpError(404, 'No hay registros de este ejercicio.');
  res.json({ exercise: exercise.summary, entries: exercise.entries });
}

async function getClientSession(req, res) {
  const scope = await clientSessionScope(req);
  if (!/^[a-f\d]{24}$/i.test(req.params.sessionId)) throw new HttpError(400, 'ID de sesión inválido.');
  const session = await WorkoutSession.findOne({ _id: req.params.sessionId, ...scope }).lean();
  if (!session) throw new HttpError(404, 'No se encontró la sesión.');
  res.json({ session: sessionResponse(session) });
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Last activity of each of the Coach's clients, so the client list can show who needs attention.
async function getCoachClientsActivity(req, res) {
  const clientIds = await coachClientIds(req);
  if (!clientIds.length) return res.json({ clients: [] });
  const since = new Date(Date.now() - WEEK_MS);
  const rows = await WorkoutSession.aggregate([
    { $match: { organizationId: objectId(resolveTenant(req).organizationId), user: { $in: clientIds.map(objectId) } } },
    { $sort: { completedAt: -1 } },
    { $group: {
      _id: '$user',
      lastSessionAt: { $first: '$completedAt' },
      lastRpe: { $first: '$perceivedExertion' },
      sessionsLast7Days: { $sum: { $cond: [{ $gte: ['$completedAt', since] }, 1, 0] } },
    } },
  ]);
  res.json({ clients: rows.map((row) => ({
    clientId: String(row._id),
    lastSessionAt: row.lastSessionAt,
    lastRpe: row.lastRpe ?? null,
    sessionsLast7Days: row.sessionsLast7Days,
  })) });
}

module.exports = {
  getCoachClientsActivity,
  getClientOverview,
  getClientExercises,
  getClientExercise,
  getClientSession,
};
