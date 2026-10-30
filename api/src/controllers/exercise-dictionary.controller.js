const { z } = require('zod');
const ExerciseDictionary = require('../models/exercise-dictionary.model');
const Equipment = require('../models/equipment.model');
const { normalizeMuscleGroup } = require('../constants/muscle-groups');
const { inferEquipmentCategory } = require('../constants/equipment-families');
const { gymFilter } = require('../utils/tenant');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function searchExercises(req, res) {
  const { q, muscleGroup, availableOnly } = z.object({
    q: z.string().trim().max(80).default(''),
    muscleGroup: z.string().trim().max(100).default(''),
    availableOnly: z.preprocess((value) => value === undefined ? undefined : value === 'true', z.boolean().optional()),
  }).parse(req.query);

  const query = {};
  if (q.length >= 2) query.name = new RegExp(escapeRegex(q), 'i');
  if (muscleGroup) query.targetMuscle = new RegExp(`^${escapeRegex(muscleGroup)}$`, 'i');
  // Exercises are suggested from the equipment of the request's gyms.
  const inventory = await Equipment.find({ ...gymFilter(req), isDeleted: { $ne: true }, status: { $ne: 'out_of_service' } }).lean();
  const availableEquipmentCategories = [...new Set(inventory.map(inferEquipmentCategory)), 'Sin equipo'];
  const shouldFilter = availableOnly !== false && inventory.length > 0;
  if (shouldFilter) query.equipment = { $in: availableEquipmentCategories };
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
    availableEquipmentCategories,
  });
}

module.exports = { searchExercises };
