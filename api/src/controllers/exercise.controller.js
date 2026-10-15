const { z } = require('zod');
const mongoose = require('mongoose');
const Exercise = require('../models/exercise.model');
const HttpError = require('../utils/http-error');

const MOCK_GYM_ID = '60d5ecb8b392d700153ee123';
const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  muscleGroup: z.string().trim().min(1).max(80),
  equipment: z.string().trim().max(100).nullable().optional(),
  videoUrl: z.string().trim().max(500).nullable().optional(),
});

function getGymId(req) {
  const gymId = req.user?.gymId ?? req.auth?.gymId ?? req.gymId ?? MOCK_GYM_ID;
  if (!mongoose.isValidObjectId(gymId)) throw new HttpError(400, 'No se pudo determinar el gimnasio autenticado.');
  return gymId;
}

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de ejercicio inválido.');
}

async function getExercises(req, res) {
  const exercises = await Exercise.find({ gymId: getGymId(req) }).sort({ muscleGroup: 1, name: 1 }).lean();
  res.json({ exercises });
}

async function createExercise(req, res) {
  const exercise = await Exercise.create({ ...exerciseSchema.parse(req.body), gymId: getGymId(req) });
  res.status(201).json({ exercise });
}

async function updateExercise(req, res) {
  assertId(req.params.id);
  const input = exerciseSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const exercise = await Exercise.findOneAndUpdate({ _id: req.params.id, gymId: getGymId(req) }, input, {
    new: true,
    runValidators: true,
  }).lean();
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado.');
  res.json({ exercise });
}

async function deleteExercise(req, res) {
  assertId(req.params.id);
  const exercise = await Exercise.findOneAndDelete({ _id: req.params.id, gymId: getGymId(req) });
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado.');
  res.status(204).end();
}

module.exports = { getExercises, createExercise, updateExercise, deleteExercise };
