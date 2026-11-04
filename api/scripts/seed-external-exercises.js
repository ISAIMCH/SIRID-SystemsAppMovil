// Carga el catálogo global desde https://github.com/hasaneyldrm/exercises-dataset (datos MIT, medios © Gym visual).
// Uso: npm run seed:exercises -- <ruta a exercises-dataset-main>   (o EXERCISES_DATASET_PATH; sin ruta lo descarga)
// Guarda las rutas de los medios como claves ("videos/0001-x.gif"); la API arma la URL con EXERCISES_MEDIA_PUBLIC_URL
// (bucket público de R2) o, sin ella, con el repo en GitHub. Sube los archivos antes con `npm run media:upload`.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const ExerciseDictionary = require('../src/models/exercise-dictionary.model');
const { normalizeEquipmentCategory } = require('../src/constants/equipment-families');
const { translateText } = require('./translate-dictionary');
const { isMediaKey, toMediaKey } = require('../src/utils/catalog-media');

const apiRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(apiRoot, '.env') });
dotenv.config({ path: path.resolve(apiRoot, '..', '.env') });

const DATASET_URL = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json';
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
// Secondary muscles are display labels, so they may be more specific than MUSCLE_GROUPS.
const secondaryMuscleLabels = {
  ...muscleAliases,
  'hip flexors': 'Flexores de cadera', obliques: 'Oblicuos', rhomboids: 'Romboides', 'ankle stabilizers': 'Estabilizadores del tobillo',
  core: 'Core', 'rear deltoids': 'Deltoides posterior', ankles: 'Tobillos', feet: 'Pies', brachialis: 'Braquial', groin: 'Ingle',
  wrists: 'Muñecas', 'rotator cuff': 'Manguito rotador', 'upper chest': 'Pecho superior', 'wrist flexors': 'Flexores de muñeca',
  'wrist extensors': 'Extensores de muñeca', 'grip muscles': 'Agarre', 'lower abs': 'Abdomen bajo', 'inner thighs': 'Aductores',
  hands: 'Manos', shins: 'Tibiales',
};

function canonical(value, aliases, fallback) {
  const key = String(value ?? '').trim().toLocaleLowerCase();
  return aliases[key] ?? fallback;
}

// A bucket key, or an absolute URL when the record points somewhere else.
function mediaKey(value) {
  const key = toMediaKey(value);
  return key && (isMediaKey(key) || /^https?:\/\//i.test(key)) ? key : undefined;
}

function mapExercise(record) {
  if (record?.id === undefined || record?.id === null || !record?.name) return null;
  const gifUrl = mediaKey(record.gif_url ?? record.gifUrl);
  if (!gifUrl) return null;
  const targetMuscle = canonical(record.target ?? record.body_part ?? record.bodyPart, muscleAliases, 'Abdominales');
  const secondaryMuscles = [...new Set((record.secondary_muscles ?? [])
    .map((muscle) => canonical(muscle, secondaryMuscleLabels, translateText(String(muscle).trim())))
    .filter((muscle) => muscle && muscle !== targetMuscle))];
  return {
    sourceId: String(record.id),
    name: translateText(String(record.name).trim()),
    targetMuscle,
    secondaryMuscles,
    equipment: normalizeEquipmentCategory(record.equipment),
    gifUrl,
    imageUrl: mediaKey(record.image),
    mediaId: record.media_id ? String(record.media_id) : undefined,
    steps: (record.instruction_steps?.es ?? []).map((step) => String(step).trim()).filter(Boolean),
    metricType: targetMuscle === 'Cardio' ? 'cardio' : 'strength',
    attribution,
  };
}

// Accepts the dataset folder (as downloaded from GitHub) or the exercises.json file itself.
function resolveDatasetFile(localPath) {
  const resolved = path.resolve(localPath);
  return fs.statSync(resolved).isDirectory() ? path.join(resolved, 'data', 'exercises.json') : resolved;
}

async function fetchDataset(localPath) {
  if (localPath) return JSON.parse(fs.readFileSync(resolveDatasetFile(localPath), 'utf8'));
  const response = await fetch(DATASET_URL);
  if (!response.ok) throw new Error(`No se pudo descargar el dataset (${response.status}). Pasa la ruta de la carpeta descargada.`);
  return response.json();
}

// Builds upserts that leave hand-edited fields (lockedFields) and platform-made records untouched.
function buildOperations(exercises, existingBySourceId) {
  return exercises.flatMap((exercise) => {
    const existing = existingBySourceId.get(exercise.sourceId);
    if (existing?.origin === 'sirid') return [];
    const update = { ...exercise };
    for (const field of existing?.lockedFields ?? []) delete update[field];
    return [{
      updateOne: {
        filter: { sourceId: exercise.sourceId },
        update: { $set: update, $setOnInsert: { origin: 'dataset', isActive: true } },
        upsert: true,
      },
    }];
  });
}

async function main() {
  if (!process.env.MONGO_URI || process.env.MONGO_URI.includes('<')) throw new Error('MONGO_URI no está definida o todavía contiene un placeholder.');
  const records = await fetchDataset(process.argv[2] ?? process.env.EXERCISES_DATASET_PATH);
  if (!Array.isArray(records) || !records.length) throw new Error('El dataset no contiene registros de ejercicios.');
  const exercises = records.map((record) => mapExercise(record)).filter(Boolean);
  if (!exercises.length) throw new Error('No se encontraron registros válidos para importar.');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    const existing = await ExerciseDictionary.find({ sourceId: { $in: exercises.map((exercise) => exercise.sourceId) } })
      .select('sourceId origin lockedFields').lean();
    const operations = buildOperations(exercises, new Map(existing.map((item) => [item.sourceId, item])));
    let inserted = 0; let modified = 0;
    for (let index = 0; index < operations.length; index += 500) {
      const result = await ExerciseDictionary.bulkWrite(operations.slice(index, index + 500), { ordered: false });
      inserted += result.upsertedCount; modified += result.modifiedCount;
    }
    console.log(`External exercise seed complete: ${operations.length} processed, ${inserted} inserted, ${modified} updated, ${exercises.length - operations.length} skipped.`);
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { mapExercise, fetchDataset, resolveDatasetFile, buildOperations, mediaKey };
if (require.main === module) main().catch((error) => { console.error(`External exercise seed failed: ${error.message}`); process.exitCode = 1; });
