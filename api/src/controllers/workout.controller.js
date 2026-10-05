const { z } = require('zod');
const Routine = require('../models/routine.model');
const User = require('../models/user.model');
const WorkoutSession = require('../models/workout-session.model');
const HttpError = require('../utils/http-error');
const { calculateCurrentTrainingStreak } = require('../utils/training-streak');
const { normalizeBlocks } = require('./routine.controller');

const workoutSchema = z.object({
  routineId: z.string().regex(/^[a-f\d]{24}$/i),
  trainingDay: z.number().int().min(0).max(6),
  durationMinutes: z.number().int().min(0).max(600),
  blocks: z.array(z.object({
    routineBlockId: z.string().regex(/^[a-f\d]{24}$/i),
    sets: z.array(z.object({
      setNumber: z.number().int().min(1).max(50),
      exercises: z.array(z.object({
        routineExerciseId: z.string().regex(/^[a-f\d]{24}$/i),
        reps: z.number().int().min(0).max(300).optional(),
        weightKg: z.number().min(0).max(1000).optional(),
        durationMinutes: z.number().int().min(1).max(600).optional(),
        distanceKm: z.number().min(0).max(1000).optional(),
        level: z.number().int().min(1).max(100).optional(),
      })).min(1).max(20),
    })).min(1).max(50),
  })).min(1).max(100),
});

function sessionResponse(session) {
  const value = session.toObject ? session.toObject() : session;
  if (value.blocks?.length) return value;
  return {
    ...value,
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
          muscleGroup: exercise.muscleGroup,
          equipmentId: exercise.equipmentId,
          metricType: 'strength',
          reps: set.reps,
          weightKg: set.weightKg,
        }],
      })),
    })),
  };
}

async function createWorkoutSession(req, res) {
  const input = workoutSchema.parse(req.body);
  const routine = await Routine.findOne({
    _id: input.routineId,
    assignedTo: req.user.id,
    status: 'active',
  });
  if (!routine) throw new HttpError(404, 'No se encontró una rutina activa asignada.');
  if (!routine.scheduleDays.includes(input.trainingDay)) {
    throw new HttpError(400, 'Este día no está programado en tu rutina.');
  }

  const routineBlocks = normalizeBlocks(routine.toObject()).filter((block) => block.day === input.trainingDay);
  const blocksById = new Map(routineBlocks.map((block) => [String(block._id), block]));
  const usedBlockIds = new Set();
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
        if (isCardio) {
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
          muscleGroup: exercise.muscleGroup,
          gifUrl: exercise.gifUrl,
          equipmentId: exercise.equipmentId ?? null,
          metricType: isCardio ? 'cardio' : 'strength',
          reps: entryExercise.reps,
          weightKg: entryExercise.weightKg,
          durationMinutes: entryExercise.durationMinutes,
          distanceKm: entryExercise.distanceKm,
          level: entryExercise.level,
        };
      });
      if (usedExerciseIds.size !== exercisesById.size) throw new HttpError(400, 'Completa todos los ejercicios del bloque.');
      return { setNumber: round.setNumber, completedAt: new Date(), exercises: loggedExercises };
    });
    return {
      routineBlockId: block._id,
      blockType: block.blockType,
      restSeconds: block.restSeconds,
      sets: rounds,
    };
  });

  const totalVolumeKg = sessionBlocks.reduce((blockTotal, block) => (
    blockTotal + block.sets.reduce((setTotal, round) => (
      setTotal + round.exercises.reduce((exerciseTotal, exercise) => (
        exerciseTotal + (exercise.metricType === 'strength' ? (exercise.reps ?? 0) * (exercise.weightKg ?? 0) : 0)
      ), 0)
    ), 0)
  ), 0);

  const [session] = await WorkoutSession.create([{
    user: req.user.id,
    routine: routine.id,
    trainingDay: input.trainingDay,
    completedAt: new Date(),
    durationMinutes: input.durationMinutes,
    totalVolumeKg,
    blocks: sessionBlocks,
  }]);

  res.status(201).json({ session: sessionResponse(session) });
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
  const client = await User.findOne({ _id: req.params.clientId, role: 'Cliente' }).select('assignedCoach');
  if (!client || (req.user.role === 'Coach' && String(client.assignedCoach) !== req.user.id)) {
    throw new HttpError(404, 'Cliente no encontrado.');
  }
  const sessions = await WorkoutSession.find({ user: client._id })
    .sort({ completedAt: -1 })
    .limit(20)
    .lean();
  res.json({ sessions: sessions.map(sessionResponse) });
}

async function getMyWorkoutStats(req, res) {
  const today = new Date();
  const startOfWeek = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6));
  const [user, routines, sessions, aggregate] = await Promise.all([
    User.findById(req.user.id).select('availableTrainingDays'),
    Routine.find({ assignedTo: req.user.id, status: 'active' }).select('scheduleDays').lean(),
    WorkoutSession.find({ user: req.user.id }).select('completedAt').sort({ completedAt: -1 }).limit(366).lean(),
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
    currentStreak: calculateCurrentTrainingStreak(sessions.map((session) => session.completedAt), scheduledDays, today),
    scheduledDays,
    totalSessions: totals.totalSessions,
    completedThisWeek: totals.completedThisWeek,
    totalVolumeKg: totals.totalVolumeKg,
    lastWorkoutAt: sessions[0]?.completedAt ?? null,
  });
}

module.exports = { createWorkoutSession, getMyWorkoutHistory, getMyWorkoutStats, getClientWorkoutHistory, workoutSchema };