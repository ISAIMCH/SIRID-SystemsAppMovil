const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const ExerciseDictionary = require('../src/models/exercise-dictionary.model');
const { translateText } = require('./translate-dictionary');

const apiRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(apiRoot, '.env') });
dotenv.config({ path: path.resolve(apiRoot, '..', '.env') });

const DATASET_URLS = [
  'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/master/exercises.json',
  'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/exercises.json',
];
const attribution = '© Gym visual — https://gymvisual.com/';
const muscleAliases = {
  abdominals: 'Abdominales', abs: 'Abdominales', waist: 'Abdominales', abductors: 'Abductores', adductors: 'Aductores',
  forearms: 'Antebrazos', biceps: 'Bíceps', 'cardiovascular system': 'Cardio', cardio: 'Cardio',
  neck: 'Cuello', sternocleidomastoid: 'Cuello', quads: 'Cuádriceps', quadriceps: 'Cuádriceps',
  lats: 'Dorsales', 'latissimus dorsi': 'Dorsales', 'upper back': 'Espalda', back: 'Espalda', spine: 'Espalda',
  'serratus anterior': 'Espalda', hamstrings: 'Femoral', calves: 'Gemelos', soleus: 'Gemelos', gastrocnemius: 'Gemelos',
  glutes: 'Glúteos', gluteus: 'Glúteos', delts: 'Hombros', deltoids: 'Hombros', shoulders: 'Hombros',
  'lower back': 'Lumbar', pectorals: 'Pecho', chest: 'Pecho', traps: 'Trapecio', trapezius: 'Trapecio',
  'levator scapulae': 'Trapecio', triceps: 'Tríceps',
};
const equipmentAliases = {
  'body weight': 'Sin equipo', assisted: 'Sin equipo', barbell: 'Barras', 'ez barbell': 'Barras',
  'olympic barbell': 'Barras', 'trap bar': 'Barras', dumbbell: 'Pesas / Mancuernas', weighted: 'Pesas / Mancuernas',
  'leverage machine': 'Máquinas', 'smith machine': 'Máquinas', 'sled machine': 'Máquinas',
  'assisted machine': 'Máquinas', 'stationary bike': 'Máquinas', 'elliptical machine': 'Máquinas',
  'stepmill machine': 'Máquinas', 'skierg machine': 'Máquinas', 'upper body ergometer': 'Máquinas', hammer: 'Máquinas',
  cable: 'Poleas / Cables', rope: 'Poleas / Cables', band: 'Bandas', 'resistance band': 'Bandas',
  kettlebell: 'Pesas rusas',
};

function canonical(value, aliases, fallback) {
  const key = String(value ?? '').trim().toLocaleLowerCase();
  return aliases[key] ?? fallback;
}

function gifUrl(record) {
  const original = String(record.gifUrl ?? record.gif_url ?? '').trim();
  if (/^https:\/\/raw\.githubusercontent\.com\//i.test(original)) return original;
  if (original && !/d205bpvrqc9yn1\.cloudfront\.net/i.test(original)) return original;
  if (record.id === undefined || record.id === null) return original;
  return `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/master/exercises/${String(record.id).padStart(4, '0')}.gif`;
}

function mapExercise(record) {
  if (record?.id === undefined || record?.id === null || !record?.name) return null;
  const targetMuscle = canonical(record.target ?? record.bodyPart ?? record.body_part, muscleAliases, 'Abdominales');
  return {
    sourceId: String(record.id),
    name: translateText(String(record.name).trim()),
    targetMuscle,
    equipment: canonical(record.equipment, equipmentAliases, 'Otro'),
    gifUrl: gifUrl(record),
    metricType: targetMuscle === 'Cardio' ? 'cardio' : 'strength',
    attribution,
  };
}

async function fetchDataset(localPath = process.env.EXERCISES_DATASET_PATH) {
  if (localPath) {
    return JSON.parse(fs.readFileSync(path.resolve(localPath), 'utf8'));
  }
  for (const url of DATASET_URLS) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Try the next branch before reporting a network failure.
    }
  }
  throw new Error('No se pudo descargar el dataset. Define EXERCISES_DATASET_PATH para usar un JSON local.');
}

async function main() {
  if (!process.env.MONGO_URI || process.env.MONGO_URI.includes('<')) throw new Error('MONGO_URI no está definida o todavía contiene un placeholder.');
  const records = await fetchDataset(process.argv[2] ?? process.env.EXERCISES_DATASET_PATH);
  if (!Array.isArray(records) || !records.length) throw new Error('El dataset no contiene registros de ejercicios.');
  const operations = records.map(mapExercise).filter(Boolean).map((exercise) => ({
    updateOne: { filter: { sourceId: exercise.sourceId }, update: { $set: exercise }, upsert: true },
  }));
  if (!operations.length) throw new Error('No se encontraron registros válidos para importar.');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    let inserted = 0; let modified = 0;
    for (let index = 0; index < operations.length; index += 500) {
      const result = await ExerciseDictionary.bulkWrite(operations.slice(index, index + 500), { ordered: false });
      inserted += result.upsertedCount; modified += result.modifiedCount;
    }
    console.log(`External exercise seed complete: ${operations.length} processed, ${inserted} inserted, ${modified} updated.`);
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { mapExercise, fetchDataset };
if (require.main === module) main().catch((error) => { console.error(`External exercise seed failed: ${error.message}`); process.exitCode = 1; });
