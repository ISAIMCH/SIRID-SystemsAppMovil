const { z } = require('zod');
const ExerciseDictionary = require('../models/exercise-dictionary.model');
const Exercise = require('../models/exercise.model');
const Equipment = require('../models/equipment.model');
const HttpError = require('../utils/http-error');
const { normalizeMuscleGroup } = require('../constants/muscle-groups');
const { EQUIPMENT_CATEGORIES, inferEquipmentCategory, normalizeEquipmentCategory } = require('../constants/equipment-families');
const { gymFilter, organizationFilter } = require('../utils/tenant');

const BODYWEIGHT = 'Sin equipo';
const LIST_FIELDS = 'name targetMuscle equipment gifUrl imageUrl metricType';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const booleanQuery = z.preprocess((value) => value === undefined ? undefined : value === 'true', z.boolean().optional());

// Owning equipment unlocks its exercises; units in maintenance only flag the category, so a coach's catalog
// does not shrink every time a machine breaks.
async function unlockedCategories(req) {
  const inventory = await Equipment.find({ ...gymFilter(req), isDeleted: { $ne: true } })
    .select('name zone equipmentCategory status').lean();
  const available = new Set([BODYWEIGHT]);
  const owned = new Set([BODYWEIGHT]);
  for (const item of inventory) {
    const category = inferEquipmentCategory(item);
    owned.add(category);
    if (item.status !== 'out_of_service') available.add(category);
  }
  return {
    unlocked: EQUIPMENT_CATEGORIES.filter((category) => owned.has(category)),
    outOfService: EQUIPMENT_CATEGORIES.filter((category) => owned.has(category) && !available.has(category)),
  };
}

async function searchExercises(req, res) {
  const { q, muscleGroup, availableOnly } = z.object({
    q: z.string().trim().max(80).default(''),
    muscleGroup: z.string().trim().max(100).default(''),
    availableOnly: booleanQuery,
  }).parse(req.query);

  const query = { isActive: { $ne: false } };
  if (q.length >= 2) query.name = new RegExp(escapeRegex(q), 'i');
  if (muscleGroup) query.targetMuscle = new RegExp(`^${escapeRegex(muscleGroup)}$`, 'i');
  const { unlocked } = await unlockedCategories(req);
  if (availableOnly !== false) query.equipment = { $in: unlocked };
  const exercises = await ExerciseDictionary.find(query)
    .select('name targetMuscle equipment gifUrl metricType')
    .sort({ name: 1 })
    .limit(50)
    .lean();
  res.json({
    exercises: exercises.map((exercise) => ({
      ...exercise,
      targetMuscle: normalizeMuscleGroup(exercise.targetMuscle),
    })),
    availableEquipmentCategories: unlocked,
  });
}

const catalogQuerySchema = z.object({
  q: z.string().trim().max(80).default(''),
  muscleGroup: z.string().trim().max(100).default(''),
  category: z.string().trim().max(40).default(''),
  availableOnly: booleanQuery,
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

function serializeGlobal(exercise) {
  return {
    _id: exercise._id,
    name: exercise.name,
    muscleGroup: normalizeMuscleGroup(exercise.targetMuscle),
    equipment: exercise.equipment,
    gifUrl: exercise.gifUrl,
    imageUrl: exercise.imageUrl ?? null,
    videoUrl: null,
    metricType: exercise.metricType,
    source: 'global',
    isCustom: false,
  };
}

function serializeCustom(exercise) {
  return {
    _id: exercise._id,
    name: exercise.name,
    muscleGroup: normalizeMuscleGroup(exercise.muscleGroup),
    equipment: exercise.equipment ?? null,
    gifUrl: null,
    imageUrl: null,
    videoUrl: exercise.videoUrl ?? null,
    metricType: normalizeMuscleGroup(exercise.muscleGroup) === 'Cardio' ? 'cardio' : 'strength',
    source: 'custom',
    isCustom: true,
  };
}

// The exercise picker: the organization's custom exercises (few, all on the first page) followed by the
// global exercises unlocked by the gym's equipment, paginated.
async function getCatalog(req, res) {
  const { q, muscleGroup, category, availableOnly, page, limit } = catalogQuerySchema.parse(req.query);
  const nameExpression = q.length >= 2 ? new RegExp(escapeRegex(q), 'i') : null;
  const muscle = muscleGroup ? normalizeMuscleGroup(muscleGroup) : '';
  const equipmentCategory = category ? normalizeEquipmentCategory(category) : '';
  const { unlocked, outOfService } = await unlockedCategories(req);

  const query = { isActive: { $ne: false } };
  if (nameExpression) query.name = nameExpression;
  if (muscle) query.targetMuscle = muscle;
  const allowed = availableOnly === false ? EQUIPMENT_CATEGORIES : unlocked;
  query.equipment = { $in: equipmentCategory ? allowed.filter((item) => item === equipmentCategory) : allowed };

  const [globals, total, customs] = await Promise.all([
    ExerciseDictionary.find(query).select(LIST_FIELDS).sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ExerciseDictionary.countDocuments(query),
    page === 1
      ? Exercise.find({ ...organizationFilter(req), isDeleted: { $ne: true }, ...(nameExpression ? { name: nameExpression } : {}) })
        .sort({ name: 1 }).lean()
      : [],
  ]);
  const matchingCustoms = customs.map(serializeCustom).filter((exercise) => (!muscle || exercise.muscleGroup === muscle)
    && (!equipmentCategory || normalizeEquipmentCategory(exercise.equipment ?? BODYWEIGHT) === equipmentCategory));

  res.json({
    exercises: [...matchingCustoms, ...globals.map(serializeGlobal)],
    page,
    limit,
    total,
    hasMore: page * limit < total,
    unlockedCategories: unlocked,
    outOfServiceCategories: outOfService,
  });
}

async function getCatalogExercise(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de ejercicio inválido.');
  const exercise = await ExerciseDictionary.findOne({ _id: req.params.id, isActive: { $ne: false } })
    .select(`${LIST_FIELDS} secondaryMuscles steps attribution`).lean();
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado.');
  res.json({
    exercise: {
      ...serializeGlobal(exercise),
      secondaryMuscles: exercise.secondaryMuscles ?? [],
      steps: exercise.steps ?? [],
      attribution: exercise.attribution ?? null,
    },
  });
}

module.exports = { searchExercises, getCatalog, getCatalogExercise, unlockedCategories };
