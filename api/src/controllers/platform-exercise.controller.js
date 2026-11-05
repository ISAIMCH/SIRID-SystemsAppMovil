const mongoose = require('mongoose');
const { z } = require('zod');
const ExerciseDictionary = require('../models/exercise-dictionary.model');
const HttpError = require('../utils/http-error');
const { MUSCLE_GROUPS, normalizeMuscleGroup } = require('../constants/muscle-groups');
const { EQUIPMENT_CATEGORIES } = require('../constants/equipment-families');
const { isMediaKey, resolveMediaUrl, toMediaKey, uploadPlatformMedia } = require('../utils/catalog-media');

// Fields SIRID can edit; editing one on a dataset record locks it so the seed script keeps the hand-made value.
const EDITABLE_FIELDS = ['name', 'targetMuscle', 'secondaryMuscles', 'equipment', 'gifUrl', 'imageUrl', 'steps', 'metricType'];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// An external http(s) URL or a key in the media bucket; our own public URLs are stored back as keys.
const url = z.string().trim().max(500).transform(toMediaKey)
  .refine((value) => isMediaKey(value) || /^https?:\/\/\S+$/i.test(value), 'Debe ser una URL http(s) o un archivo subido al catálogo.');
// No defaults here: a partial update must not reset the fields it does not send.
const fields = {
  name: z.string().trim().min(2).max(160),
  targetMuscle: z.enum(MUSCLE_GROUPS),
  secondaryMuscles: z.array(z.string().trim().min(1).max(60)).max(12),
  equipment: z.enum(EQUIPMENT_CATEGORIES),
  gifUrl: url,
  imageUrl: z.union([url, z.literal('')]).optional(),
  steps: z.array(z.string().trim().min(1).max(600)).max(20),
  metricType: z.enum(['strength', 'cardio']),
};
const fieldsSchema = z.object({
  ...fields,
  secondaryMuscles: fields.secondaryMuscles.default([]),
  steps: fields.steps.default([]),
  metricType: fields.metricType.default('strength'),
});
const updateSchema = z.object(fields).partial().extend({
  isActive: z.boolean().optional(),
  // Gives a field back to the dataset: the next seed run overwrites it again.
  unlock: z.array(z.enum(EDITABLE_FIELDS)).max(EDITABLE_FIELDS.length).optional(),
}).strict();

const listSchema = z.object({
  q: z.string().trim().max(80).default(''),
  muscleGroup: z.string().trim().max(100).default(''),
  category: z.string().trim().max(40).default(''),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  origin: z.enum(['dataset', 'sirid', '']).default(''),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de ejercicio inválido.');
}

function serialize(exercise) {
  return {
    _id: exercise._id,
    sourceId: exercise.sourceId,
    name: exercise.name,
    targetMuscle: normalizeMuscleGroup(exercise.targetMuscle),
    secondaryMuscles: exercise.secondaryMuscles ?? [],
    equipment: exercise.equipment,
    gifUrl: resolveMediaUrl(exercise.gifUrl),
    imageUrl: resolveMediaUrl(exercise.imageUrl),
    steps: exercise.steps ?? [],
    metricType: exercise.metricType,
    attribution: exercise.attribution ?? null,
    origin: exercise.origin ?? 'dataset',
    isActive: exercise.isActive !== false,
    lockedFields: exercise.lockedFields ?? [],
    updatedAt: exercise.updatedAt,
  };
}

// Every record of the global catalog, inactive ones included, for SIRID's editor.
async function listExercises(req, res) {
  const { q, muscleGroup, category, status, origin, page, limit } = listSchema.parse(req.query);
  const query = {};
  if (q.length >= 2) query.name = new RegExp(escapeRegex(q), 'i');
  if (muscleGroup) query.targetMuscle = normalizeMuscleGroup(muscleGroup);
  if (category) query.equipment = category;
  if (status === 'active') query.isActive = { $ne: false };
  if (status === 'inactive') query.isActive = false;
  if (origin) query.origin = origin;
  const [exercises, total] = await Promise.all([
    ExerciseDictionary.find(query).sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ExerciseDictionary.countDocuments(query),
  ]);
  res.json({ exercises: exercises.map(serialize), page, limit, total, hasMore: page * limit < total });
}

async function createExercise(req, res) {
  const input = fieldsSchema.parse(req.body);
  const _id = new mongoose.Types.ObjectId();
  const exercise = await ExerciseDictionary.create({
    ...input,
    imageUrl: input.imageUrl || undefined,
    _id,
    sourceId: `sirid-${_id}`,
    origin: 'sirid',
    attribution: 'SIRID Systems',
    isActive: true,
  });
  res.status(201).json({ exercise: serialize(exercise.toObject()) });
}

async function updateExercise(req, res) {
  assertId(req.params.id);
  const { unlock = [], isActive, ...fields } = updateSchema.parse(req.body);
  const exercise = await ExerciseDictionary.findById(req.params.id);
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado.');
  if (!Object.keys(fields).length && isActive === undefined && !unlock.length) {
    throw new HttpError(400, 'Envía al menos un campo para actualizar.');
  }

  for (const [field, value] of Object.entries(fields)) exercise.set(field, field === 'imageUrl' && !value ? undefined : value);
  if (isActive !== undefined) exercise.isActive = isActive;
  if (exercise.origin !== 'sirid') {
    const locked = new Set(exercise.lockedFields);
    Object.keys(fields).forEach((field) => locked.add(field));
    unlock.forEach((field) => locked.delete(field));
    exercise.lockedFields = EDITABLE_FIELDS.filter((field) => locked.has(field));
  }
  await exercise.save();
  res.json({ exercise: serialize(exercise.toObject()) });
}

const mediaKindSchema = z.object({ kind: z.enum(['gif', 'image']) });

// Uploads a GIF or thumbnail to the public bucket; the editor then saves the returned key in gifUrl/imageUrl.
async function uploadMedia(req, res) {
  const { kind } = mediaKindSchema.parse(req.body ?? {});
  if (!req.file) throw new HttpError(400, 'Adjunta un archivo en el campo file.');
  res.status(201).json(await uploadPlatformMedia(req.file, kind));
}

module.exports = { EDITABLE_FIELDS, listExercises, createExercise, updateExercise, uploadMedia };
