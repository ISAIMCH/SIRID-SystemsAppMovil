const { z } = require('zod');
const Routine = require('../models/routine.model');
const User = require('../models/user.model');
const WorkoutSession = require('../models/workout-session.model');
const HttpError = require('../utils/http-error');
const { calculateCurrentTrainingStreak } = require('../utils/training-streak');

const workoutSchema = z.object({
  routineId: z.string().regex(/^[a-f\d]{24}$/i),
  trainingDay: z.number().int().min(0).max(6),
  durationMinutes: z.number().int().min(0).max(600),
  exercises: z.array(z.object({
    routineExerciseId: z.string().regex(/^[a-f\d]{24}$/i),
    sets: z.array(z.object({
      reps: z.number().int().min(0).max(300),
      weightKg: z.number().min(0).max(1000),
      restSeconds: z.number().int().min(0).max(3600),
    })).min(1).max(50),
    observations: z.string().trim().max(1000).optional(),
  })).min(1).max(100),
});

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

  const routineExercises = routine.exercises.filter((exercise) => exercise.day === input.trainingDay);
  const exercisesById = new Map(routineExercises.map((exercise) => [String(exercise._id), exercise]));
  const usedExerciseIds = new Set();
  const exerciseLogs = input.exercises.map((entry) => {
    const exercise = exercisesById.get(entry.routineExerciseId);
    if (!exercise || usedExerciseIds.has(entry.routineExerciseId)) {
      throw new HttpError(400, 'La sesión contiene un ejercicio inválido o repetido.');
    }
    usedExerciseIds.add(entry.routineExerciseId);
    return {
      routineExerciseId: exercise._id,
      exerciseName: exercise.name,
      muscleGroup: exercise.muscleGroup,
      equipmentId: exercise.equipmentId ?? null,
      sets: entry.sets,
      observations: entry.observations,
    };
  });

  const totalVolumeKg = exerciseLogs.reduce((exerciseTotal, exercise) => (
    exerciseTotal + exercise.sets.reduce((setTotal, set) => setTotal + set.reps * set.weightKg, 0)
  ), 0);

  const [session] = await WorkoutSession.create([{
    user: req.user.id,
    routine: routine.id,
    trainingDay: input.trainingDay,
    completedAt: new Date(),
    durationMinutes: input.durationMinutes,
    totalVolumeKg,
    exercises: exerciseLogs,
  }]);

  res.status(201).json({ session });
}

async function getMyWorkoutHistory(req, res) {
  const sessions = await WorkoutSession.find({ user: req.user.id })
    .populate('routine', 'title goal')
    .sort({ completedAt: -1 })
    .limit(100)
    .lean();
  res.json({ sessions });
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

module.exports = { createWorkoutSession, getMyWorkoutHistory, getMyWorkoutStats };