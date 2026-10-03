const { z } = require('zod');
const MuscleGroup = require('../models/muscle-group.model');

const defaultGroups = ['Pecho', 'Espalda', 'Pierna', 'Hombro', 'Bíceps', 'Tríceps', 'Core', 'Glúteo'];

const keyOf = (name) => name.trim().toLowerCase();

async function ensureDefaults() {
  if (await MuscleGroup.estimatedDocumentCount() > 0) return;
  await MuscleGroup.insertMany(defaultGroups.map((name) => ({ name, key: keyOf(name) })), { ordered: false }).catch(() => {});
}

async function listMuscleGroups(req, res) {
  await ensureDefaults();
  const groups = await MuscleGroup.find({}).sort({ name: 1 }).lean();
  res.json({ groups });
}

// Si el grupo ya existe (sin importar mayúsculas) se devuelve el existente.
async function createMuscleGroup(req, res) {
  const { name } = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
  const group = await MuscleGroup.findOneAndUpdate(
    { key: keyOf(name) },
    { $setOnInsert: { name, key: keyOf(name) } },
    { upsert: true, new: true, runValidators: true },
  );
  res.status(201).json({ group });
}

module.exports = { listMuscleGroups, createMuscleGroup };
