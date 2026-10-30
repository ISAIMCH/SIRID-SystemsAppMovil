const { z } = require('zod');
const Exercise = require('../models/exercise.model');
const HttpError = require('../utils/http-error');
const { resolveTenant } = require('../utils/tenant');
const { MUSCLE_GROUPS, normalizeMuscleGroup } = require('../constants/muscle-groups');

const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  muscleGroup: z.enum(MUSCLE_GROUPS),
  equipment: z.string().trim().max(100).nullable().optional(),
  videoUrl: z.string().trim().max(500).nullable().optional(),
});

function getGymId(req) {
  return resolveTenant(req).gymId;
}

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de ejercicio inválido.');
}

function serializeExercise(exercise) {
  return { ...exercise, isCustom: true };
}

async function getExercises(req, res) {
  const exercises = (await Exercise.find({ gymId: getGymId(req), isDeleted: { $ne: true } }).sort({ muscleGroup: 1, name: 1 }).lean())
    .map((exercise) => serializeExercise({ ...exercise, muscleGroup: normalizeMuscleGroup(exercise.muscleGroup) }));
  res.json({ exercises });
}

async function createExercise(req, res) {
  const exercise = await Exercise.create({ ...exerciseSchema.parse(req.body), gymId: getGymId(req) });
  res.status(201).json({ exercise: serializeExercise(exercise.toObject()) });
}

async function updateExercise(req, res) {
  assertId(req.params.id);
  const input = exerciseSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const exercise = await Exercise.findOneAndUpdate({ _id: req.params.id, gymId: getGymId(req), isDeleted: { $ne: true } }, input, {
    new: true,
    runValidators: true,
  }).lean();
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado.');
  res.json({ exercise: serializeExercise({ ...exercise, muscleGroup: normalizeMuscleGroup(exercise.muscleGroup) }) });
}

async function deleteExercise(req, res) {
  assertId(req.params.id);
  const exercise = await Exercise.findOneAndUpdate(
    { _id: req.params.id, gymId: getGymId(req), isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  );
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado.');
  res.status(204).end();
}

module.exports = { getExercises, createExercise, updateExercise, deleteExercise };
