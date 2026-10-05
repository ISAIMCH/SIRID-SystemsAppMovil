const { z } = require('zod');
const ExerciseDictionary = require('../models/exercise-dictionary.model');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function searchExercises(req, res) {
  const { q } = z.object({ q: z.string().trim().max(80).default('') }).parse(req.query);
  if (q.length < 2) return res.json({ exercises: [] });

  const expression = new RegExp(escapeRegex(q), 'i');
  const exercises = await ExerciseDictionary.find({ name: expression })
    .select('name targetMuscle equipment gifUrl metricType')
    .sort({ name: 1 })
    .limit(15)
    .lean();
  res.json({ exercises });
}

module.exports = { searchExercises };
