const { z } = require('zod');
const ExerciseDictionary = require('../models/exercise-dictionary.model');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function searchExercises(req, res) {
  const { q, muscleGroup } = z.object({
    q: z.string().trim().max(80).default(''),
    muscleGroup: z.string().trim().max(100).default(''),
  }).parse(req.query);
  if (q.length < 2 && !muscleGroup) return res.json({ exercises: [] });

  const query = {};
  if (q.length >= 2) query.name = new RegExp(escapeRegex(q), 'i');
  if (muscleGroup) query.targetMuscle = new RegExp(`^${escapeRegex(muscleGroup)}$`, 'i');
  const exercises = await ExerciseDictionary.find(query)
    .select('name targetMuscle equipment gifUrl metricType')
    .sort({ name: 1 })
    .limit(50)
    .lean();
  res.json({ exercises });
}

module.exports = { searchExercises };
