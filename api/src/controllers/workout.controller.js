const { z } = require('zod');
const Routine = require('../models/routine.model');
const User = require('../models/user.model');
const Membership = require('../models/membership.model');
const WorkoutSession = require('../models/workout-session.model');
const HttpError = require('../utils/http-error');
const { calculateCurrentTrainingStreak } = require('../utils/training-streak');
const { resolveTenant } = require('../utils/tenant');
const { findClientMember, isAssignedCoach } = require('../utils/members');
const { normalizeBlocks } = require('./routine.controller');
const { normalizeMuscleGroup } = require('../constants/muscle-groups');

function toNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function calculateCaloriesBurned(weightKg, durationMinutes, includesCardio, totalRestSeconds = 0) {
  const met = includesCardio ? 6 : 3.5;
  const effectiveMinutes = Math.max(1, durationMinutes - (totalRestSeconds / 60) * 0.7);
  return ((met * 3.5 * weightKg) / 200) * effectiveMinutes;
}

const workoutSchema = z.object({
  routineId: z.string().regex(/^[a-f\d]{24}$/i),
  trainingDay: z.number().int().min(0).max(6),
  durationMinutes: z.number().int().min(0).max(600),
  totalRestSeconds: z.number().int().min(0).max(86400).default(0),
  activeDurationMinutes: z.number().min(0).max(600).optional(),
  perceivedExertion: z.number().int().min(1).max(5).optional(),
  clientNotes: z.string().optional(),
  blocks: z.array(z.object({
    routineBlockId: z.string().regex(/^[a-f\d]{24}$/i),
    sets: z.array(z.object({
      setNumber: z.number().int().min(1).max(50),
      actualRestSeconds: z.number().int().min(0).max(86400).default(0),
      addedRestCount: z.number().int().min(0).max(1000).default(0),
      restSkipped: z.boolean().default(false),
      exercises: z.array(z.object({
        routineExerciseId: z.string().regex(/^[a-f\d]{24}$/i),
        skipped: z.boolean().default(false),
        reps: z.number().int().min(0).max(300).optional(),
        weightKg: z.number().min(0).max(1000).optional(),
        durationMinutes: z.number().int().min(1).max(600).optional(),
        distanceKm: z.number().min(0).max(1000).optional(),
        level: z.number().int().min(1).max(100).optional(),
      })).min(1).max(20),
    })).min(1).max(50),
  })).min(1).max(100),
});

const workoutUpdateSchema = z.object({
  durationMinutes: z.number().int().min(0).max(600).optional(),
  perceivedExertion: z.number().int().min(1).max(5).nullable().optional(),
  clientNotes: z.string().max(5000).nullable().optional(),
  blocks: z.array(z.object({
    routineBlockId: z.string(),
    sets: z.array(z.object({
      setNumber: z.number().int().min(1),
      actualRestSeconds: z.number().int().min(0).max(86400).optional(),
      addedRestCount: z.number().int().min(0).max(1000).optional(),
      restSkipped: z.boolean().optional(),
      exercises: z.array(z.object({
        routineExerciseId: z.string(),
        skipped: z.boolean().optional(),
        reps: z.number().int().min(0).max(300).optional(),
        weightKg: z.number().min(0).max(1000).optional(),
        durationMinutes: z.number().int().min(1).max(600).optional(),
        distanceKm: z.number().min(0).max(1000).optional(),
        level: z.number().int().min(1).max(100).optional(),
      })),
    })),
  })).optional(),
});

function sessionResponse(session) {
  const value = session.toObject ? session.toObject() : session;
  const routine = value.routine && typeof value.routine === 'object' ? value.routine : null;
  const historicalTitle = value.routineTitle || routine?.title || 'Rutina histórica';
  const historicalGoal = value.routineGoal || routine?.goal;
  const response = {
    ...value,
    routineTitle: historicalTitle,
    ...(historicalGoal ? { routineGoal: historicalGoal } : {}),
  };
  if (value.blocks?.length) {
    return {
      ...response,
      completedSets: value.blocks.reduce((total, block) => total + (block.sets?.length ?? 0), 0),
    };
  }
  return {
    ...response,
    blocks: (value.exercises ?? []).map((exercise, order) => ({
      routineBlockId: exercise.routineExerciseId,
      blockType: 'single',
      restSeconds: exercise.sets?.[0]?.restSeconds ?? 60,
      order,
      sets: (exercise.sets ?? []).map((set, index) => ({
        setNumber: index + 1,
        completedAt: value.completedAt,
        exercises: [{
          routineExerciseId: exercise.routineExerciseId,
          exerciseName: exercise.exerciseName,
          muscleGroup: normalizeMuscleGroup(exercise.muscleGroup),
          equipmentId: exercise.equipmentId,
          metricType: 'strength',
          reps: set.reps,
          weightKg: set.weightKg,
        }],
      })),
    })),
  };
}

// The gym a session counts for: the client's selected gym when it belongs to the routine's organization,
// else the client's home gym there.
async function sessionGym(req, routine) {
  const tenant = resolveTenant(req);
  if (String(tenant.organizationId) === String(routine.organizationId)) return tenant.gymId;
  const membership = await Membership.findOne({ userId: req.user._id, organizationId: routine.organizationId }).select('homeGymId').lean();
  return membership?.homeGymId ?? null;
}

async function createWorkoutSession(req, res) {
  const input = workoutSchema.parse(req.body);
  const routine = await Routine.findOne({
    _id: input.routineId,
    assignedTo: req.user.id,
    status: 'active',
    isDeleted: { $ne: true },
  });
  if (!routine) throw new HttpError(404, 'No se encontró una rutina activa asignada.');
  if (!routine.scheduleDays.includes(input.trainingDay)) {
    throw new HttpError(400, 'Este día no está programado en tu rutina.');
  }

  const routineBlocks = normalizeBlocks(routine.toObject()).filter((block) => block.day === input.trainingDay);
  const blocksById = new Map(routineBlocks.map((block) => [String(block._id), block]));
  const usedBlockIds = new Set();
  let completedExerciseCount = 0;
  const sessionBlocks = input.blocks.map((entry) => {
    const block = blocksById.get(entry.routineBlockId);
    if (!block || usedBlockIds.has(entry.routineBlockId)) throw new HttpError(400, 'La sesión contiene un bloque inválido o repetido.');
    usedBlockIds.add(entry.routineBlockId);
    const exercisesById = new Map(block.exercises.map((exercise) => [String(exercise._id), exercise]));
    const usedSetNumbers = new Set();
    const rounds = entry.sets.map((round) => {
      if (round.setNumber > block.sets || usedSetNumbers.has(round.setNumber)) {
        throw new HttpError(400, 'La sesión contiene un número de serie inválido o repetido.');
      }
      usedSetNumbers.add(round.setNumber);
      if (round.exercises.length !== block.exercises.length) {
        throw new HttpError(400, 'Completa todos los ejercicios del bloque antes de registrar la serie.');
      }
      const usedExerciseIds = new Set();
      const loggedExercises = round.exercises.map((entryExercise) => {
        const exercise = exercisesById.get(entryExercise.routineExerciseId);
        if (!exercise || usedExerciseIds.has(entryExercise.routineExerciseId)) {
          throw new HttpError(400, 'La serie contiene un ejercicio inválido o repetido.');
        }
        usedExerciseIds.add(entryExercise.routineExerciseId);
        const isCardio = exercise.metricType === 'cardio';
        if (!entryExercise.skipped) completedExerciseCount += 1;
        if (entryExercise.skipped) {
          // Skipped exercises remain in the record but bypass metric validation.
        } else if (isCardio) {
          if (!entryExercise.durationMinutes && entryExercise.distanceKm === undefined && entryExercise.level === undefined) {
            throw new HttpError(400, 'Registra duración, distancia o nivel para el ejercicio de cardio.');
          }
          if (entryExercise.reps !== undefined || entryExercise.weightKg !== undefined) {
            throw new HttpError(400, 'Los ejercicios de cardio no aceptan repeticiones ni peso.');
          }
        } else if (entryExercise.reps === undefined || entryExercise.weightKg === undefined) {
          throw new HttpError(400, 'Registra repeticiones y peso para cada ejercicio de fuerza.');
        }
        return {
          routineExerciseId: exercise._id,
          exerciseName: exercise.name,
          muscleGroup: normalizeMuscleGroup(exercise.muscleGroup),
          gifUrl: exercise.gifUrl,
          equipmentId: exercise.equipmentId ?? null,
          metricType: isCardio ? 'cardio' : 'strength',
          skipped: entryExercise.skipped,
          reps: entryExercise.skipped ? (isCardio ? null : 0) : entryExercise.reps,
          weightKg: entryExercise.skipped ? (isCardio ? null : 0) : entryExercise.weightKg,
          durationMinutes: entryExercise.skipped ? null : entryExercise.durationMinutes,
          distanceKm: entryExercise.skipped ? null : entryExercise.distanceKm,
          level: entryExercise.skipped ? null : entryExercise.level,
          targetReps: toNumberOrNull(exercise.reps),
          targetWeightKg: toNumberOrNull(exercise.suggestedWeight),
          targetDurationMinutes: exercise.targetDurationMinutes ?? null,
          targetDistanceKm: exercise.targetDistanceKm ?? null,
          targetLevel: exercise.targetLevel ?? null,
        };
      });
      if (usedExerciseIds.size !== exercisesById.size) throw new HttpError(400, 'Completa todos los ejercicios del bloque.');
      return {
        setNumber: round.setNumber,
        completedAt: new Date(),
        actualRestSeconds: round.actualRestSeconds,
        addedRestCount: round.addedRestCount,
        restSkipped: round.restSkipped,
        exercises: loggedExercises,
      };
    });
    return {
      routineBlockId: block._id,
      blockType: block.blockType,
      restSeconds: block.restSeconds,
      targetSets: block.sets,
      sets: rounds,
    };
  });
  if (completedExerciseCount === 0) throw new HttpError(400, 'Completa al menos un ejercicio no saltado antes de guardar.');

  const totalVolumeKg = sessionBlocks.reduce((blockTotal, block) => (
    blockTotal + block.sets.reduce((setTotal, round) => (
      setTotal + round.exercises.reduce((exerciseTotal, exercise) => (
        exerciseTotal + (exercise.metricType === 'strength' ? (exercise.reps ?? 0) * (exercise.weightKg ?? 0) : 0)
      ), 0)
    ), 0)
  ), 0);
  const client = await User.findById(req.user.id).select('weightKg').lean();
  const weightKg = client?.weightKg ?? 70;
  const includesCardio = sessionBlocks.some((block) => block.sets.some((round) => (
    round.exercises.some((exercise) => exercise.metricType === 'cardio')
  )));
  const totalRestSeconds = input.totalRestSeconds ?? sessionBlocks.reduce((total, block) => (
    total + block.sets.reduce((blockTotal, round) => blockTotal + round.actualRestSeconds, 0)
  ), 0);
  const activeDurationMinutes = input.activeDurationMinutes ?? Math.max(0, input.durationMinutes - totalRestSeconds / 60);
  const caloriesBurned = calculateCaloriesBurned(weightKg, input.durationMinutes, includesCardio, totalRestSeconds);
  const targetSetsTotal = routineBlocks.reduce((total, block) => total + block.sets, 0);
  const previousSessions = await WorkoutSession.find({ user: req.user.id }).select('blocks').lean();
  const previousBest = new Map();
  for (const previous of previousSessions) {
    for (const block of previous.blocks ?? []) {
      for (const set of block.sets ?? []) {
        for (const exercise of set.exercises ?? []) {
          if (exercise.metricType !== 'strength' || exercise.skipped) continue;
          const key = String(exercise.routineExerciseId);
          const best = previousBest.get(key) ?? { weightKg: 0, volume: 0 };
          previousBest.set(key, {
            weightKg: Math.max(best.weightKg, exercise.weightKg ?? 0),
            volume: Math.max(best.volume, (exercise.reps ?? 0) * (exercise.weightKg ?? 0)),
          });
        }
      }
    }
  }
  const personalRecords = [];
  for (const block of sessionBlocks) {
    for (const set of block.sets) {
      for (const exercise of set.exercises) {
        if (exercise.metricType !== 'strength' || exercise.skipped) continue;
        const best = previousBest.get(String(exercise.routineExerciseId));
        if (best && ((exercise.weightKg ?? 0) > best.weightKg || (exercise.reps ?? 0) * (exercise.weightKg ?? 0) > best.volume)) {
          personalRecords.push({ exerciseName: exercise.exerciseName, weightKg: exercise.weightKg ?? 0 });
          previousBest.set(String(exercise.routineExerciseId), { weightKg: exercise.weightKg ?? 0, volume: (exercise.reps ?? 0) * (exercise.weightKg ?? 0) });
        }
      }
    }
  }

  const [session] = await WorkoutSession.create([{
    organizationId: routine.organizationId,
    gymId: await sessionGym(req, routine),
    user: req.user.id,
    routine: routine.id,
    routineTitle: routine.title,
    routineGoal: routine.goal,
    trainingDay: input.trainingDay,
    completedAt: new Date(),
    durationMinutes: input.durationMinutes,
    totalRestSeconds,
    activeDurationMinutes,
    targetSetsTotal,
    totalVolumeKg,
    caloriesBurned,
    ...(input.perceivedExertion !== undefined ? { perceivedExertion: input.perceivedExertion } : {}),
    ...(input.clientNotes !== undefined ? { clientNotes: input.clientNotes } : {}),
    blocks: sessionBlocks,
  }]);

  res.status(201).json({ session: { ...sessionResponse(session), personalRecords } });
}

async function getMyWorkoutHistory(req, res) {
  const sessions = await WorkoutSession.find({ user: req.user.id })
    .populate('routine', 'title goal')
    .sort({ completedAt: -1 })
    .limit(100)
    .lean();
  res.json({ sessions: sessions.map(sessionResponse) });
}

async function getClientWorkoutHistory(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.clientId)) throw new HttpError(400, 'ID de cliente inválido.');
  const member = await findClientMember(req, req.params.clientId);
  if (resolveTenant(req).role === 'Coach' && !isAssignedCoach(member, req.user.id)) {
    throw new HttpError(404, 'Cliente no encontrado.');
  }

  const sessions = await WorkoutSession.find({ user: member.userId, organizationId: resolveTenant(req).organizationId })
    .sort({ completedAt: -1 })
    .limit(100)
    .lean();
  res.json({ sessions: sessions.map(sessionResponse) });
}

// Clients reach their own sessions; Admins the sessions their organization's clients trained with it.
async function findManagedSession(req, id) {
  const { role, organizationId } = resolveTenant(req);
  if (role !== 'Admin') return WorkoutSession.findOne({ _id: id, user: req.user.id });
  const session = await WorkoutSession.findOne({ _id: id, organizationId });
  if (session) await findClientMember(req, session.user, 'No se encontró el entrenamiento.');
  return session;
}

function recalculateSession(session) {
  let totalVolumeKg = 0;
  let totalRestSeconds = 0;
  let includesCardio = false;
  for (const block of session.blocks ?? []) {
    for (const set of block.sets ?? []) {
      totalRestSeconds += set.actualRestSeconds ?? 0;
      for (const exercise of set.exercises ?? []) {
        if (exercise.metricType === 'cardio') includesCardio = true;
        if (exercise.metricType === 'strength' && !exercise.skipped) {
          totalVolumeKg += (exercise.reps ?? 0) * (exercise.weightKg ?? 0);
        }
      }
    }
  }
  session.totalRestSeconds = totalRestSeconds;
  session.activeDurationMinutes = Math.max(0, session.durationMinutes - totalRestSeconds / 60);
  session.totalVolumeKg = totalVolumeKg;
  return { includesCardio };
}

async function updateWorkoutSession(req, res) {
  const input = workoutUpdateSchema.parse(req.body);
  const session = await findManagedSession(req, req.params.id);
  if (!session) throw new HttpError(404, 'No se encontró el entrenamiento.');
  if (input.durationMinutes !== undefined) session.durationMinutes = input.durationMinutes;
  if (input.perceivedExertion !== undefined) session.perceivedExertion = input.perceivedExertion;
  if (input.clientNotes !== undefined) session.clientNotes = input.clientNotes;
  if (input.blocks) {
    const blocksById = new Map(session.blocks.map((block) => [String(block.routineBlockId), block]));
    for (const blockInput of input.blocks) {
      const block = blocksById.get(blockInput.routineBlockId);
      if (!block) throw new HttpError(400, 'El bloque indicado no pertenece a esta sesión.');
      const setsByNumber = new Map(block.sets.map((set) => [set.setNumber, set]));
      for (const setInput of blockInput.sets) {
        const set = setsByNumber.get(setInput.setNumber);
        if (!set) throw new HttpError(400, 'La serie indicada no pertenece a esta sesión.');
        Object.assign(set, setInput);
        const exercisesById = new Map(set.exercises.map((exercise) => [String(exercise.routineExerciseId), exercise]));
        for (const exerciseInput of setInput.exercises) {
          const exercise = exercisesById.get(exerciseInput.routineExerciseId);
          if (!exercise) throw new HttpError(400, 'El ejercicio indicado no pertenece a esta serie.');
          Object.assign(exercise, exerciseInput);
        }
      }
    }
  }
  const { includesCardio } = recalculateSession(session);
  const client = await User.findById(session.user).select('weightKg').lean();
  session.caloriesBurned = calculateCaloriesBurned(client?.weightKg ?? 70, session.durationMinutes, includesCardio, session.totalRestSeconds);
  await session.save();
  res.json({ session: sessionResponse(session) });
}

async function deleteWorkoutSession(req, res) {
  const session = await findManagedSession(req, req.params.id);
  if (!session) throw new HttpError(404, 'No se encontró el entrenamiento.');
  await session.deleteOne();
  res.status(200).json({ ok: true });
}

async function getMyWorkoutStats(req, res) {
  const today = new Date();
  const parsedTzOffset = Number(req.query.tzOffsetMinutes);
  const tzOffsetMinutes = Number.isFinite(parsedTzOffset) && parsedTzOffset >= -840 && parsedTzOffset <= 840
    ? parsedTzOffset
    : -360;
  const startOfWeek = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6));
  const [user, routines, sessions, aggregate] = await Promise.all([
    User.findById(req.user.id).select('availableTrainingDays'),
    Routine.find({ assignedTo: req.user.id, status: 'active', isDeleted: { $ne: true } }).select('scheduleDays').lean(),
    WorkoutSession.find({ user: req.user.id }).select('completedAt trainingDay').sort({ completedAt: -1 }).limit(366).lean(),
    WorkoutSession.aggregate([
      { $match: { user: req.user._id } },
      { $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        totalVolumeKg: { $sum: '$totalVolumeKg' },
        completedThisWeek: { $sum: { $cond: [{ $gte: ['$completedAt', startOfWeek] }, 1, 0] } },
      } },
    ]),
  ]);

  const plannedDays = [...new Set(routines.flatMap((routine) => routine.scheduleDays ?? []))];
  const scheduledDays = plannedDays.length ? plannedDays : (user?.availableTrainingDays ?? []);
  const totals = aggregate[0] ?? { totalSessions: 0, totalVolumeKg: 0, completedThisWeek: 0 };
  res.json({
    currentStreak: calculateCurrentTrainingStreak(sessions, scheduledDays, today, tzOffsetMinutes),
    scheduledDays,
    totalSessions: totals.totalSessions,
    completedThisWeek: totals.completedThisWeek,
    totalVolumeKg: totals.totalVolumeKg,
    lastWorkoutAt: sessions[0]?.completedAt ?? null,
  });
}

module.exports = {
  createWorkoutSession,
  getMyWorkoutHistory,
  getMyWorkoutStats,
  getClientWorkoutHistory,
  updateWorkoutSession,
  deleteWorkoutSession,
  workoutSchema,
  calculateCaloriesBurned,
};