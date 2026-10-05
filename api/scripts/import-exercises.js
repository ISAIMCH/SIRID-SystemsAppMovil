const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const ExerciseDictionary = require('../src/models/exercise-dictionary.model');

const apiRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(apiRoot, '.env') });
dotenv.config({ path: path.resolve(apiRoot, '..', '.env') });

const repositoryUrl = 'https://github.com/hasaneyldrm/exercises-dataset.git';
const rawBaseUrl = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/';
const attribution = '© Gym visual — https://gymvisual.com/';

function mapExercise(record) {
  if (!record.id || !record.name || !record.gif_url) return null;
  return {
    sourceId: String(record.id),
    name: String(record.name).trim(),
    targetMuscle: String(record.target || record.body_part || record.category || 'General').trim(),
    equipment: String(record.equipment || 'Other').trim(),
    gifUrl: new URL(record.gif_url, rawBaseUrl).toString(),
    metricType: String(record.category).toLowerCase() === 'cardio' ? 'cardio' : 'strength',
    attribution,
  };
}

async function main() {
  if (!process.env.MONGO_URI || process.env.MONGO_URI.includes('<')) {
    throw new Error('MONGO_URI no está definida o todavía contiene un placeholder.');
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gymgo-exercises-'));
  const clonePath = path.join(tempRoot, 'dataset');
  let connected = false;
  try {
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', repositoryUrl, clonePath], { stdio: 'inherit' });
    execFileSync('git', ['-C', clonePath, 'sparse-checkout', 'set', '--no-cone', '/data/exercises.json', '/NOTICE.md'], { stdio: 'inherit' });

    const dataPath = path.join(clonePath, 'data', 'exercises.json');
    const records = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    if (!Array.isArray(records) || records.length === 0) throw new Error('El dataset no contiene registros de ejercicios.');

    const operations = records.map(mapExercise).filter(Boolean).map((exercise) => ({
      updateOne: {
        filter: { sourceId: exercise.sourceId },
        update: { $set: exercise },
        upsert: true,
      },
    }));
    if (!operations.length) throw new Error('No se encontraron registros válidos para importar.');

    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    connected = true;
    const result = await ExerciseDictionary.bulkWrite(operations, { ordered: false });
    console.log(`Exercise dictionary import complete: ${operations.length} records processed, ${result.upsertedCount} inserted, ${result.modifiedCount} updated.`);
  } finally {
    if (connected) await mongoose.disconnect();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Exercise dictionary import failed: ${error.message}`);
  process.exitCode = 1;
});
