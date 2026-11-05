// Sube los GIFs y miniaturas del dataset al bucket público de R2 (EXERCISES_MEDIA_BUCKET).
// Uso: npm run media:upload -- <ruta a exercises-dataset-main> [--dry-run] [--force]
// Solo sube lo que falta (las claves llevan el media id, así que un archivo nunca cambia); --force resube todo.
const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');

const apiRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(apiRoot, '.env') });
dotenv.config({ path: path.resolve(apiRoot, '..', '.env') });

const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { r2Client } = require('../src/utils/storage');
const { MAX_MEDIA_SIZE, contentTypeFor, isMediaKey, mediaBucket, putMedia, resolveMediaUrl } = require('../src/utils/catalog-media');
const { resolveDatasetFile } = require('./seed-external-exercises');

const CONCURRENCY = 8;

// Every media key the dataset references, once, and only keys that are safe paths inside the folder.
function collectMediaKeys(records) {
  const keys = new Set();
  for (const record of records) {
    for (const value of [record?.gif_url ?? record?.gifUrl, record?.image]) {
      const key = String(value ?? '').trim().replace(/^\/+/, '');
      if (key && isMediaKey(key)) keys.add(key);
    }
  }
  return [...keys].sort();
}

async function listExistingKeys(bucket) {
  const keys = new Set();
  let ContinuationToken;
  do {
    const page = await r2Client().send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken }));
    for (const object of page.Contents ?? []) keys.add(object.Key);
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

async function runPool(items, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const datasetPath = args.find((arg) => !arg.startsWith('--')) ?? process.env.EXERCISES_DATASET_PATH;
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  if (!datasetPath) throw new Error('Pasa la ruta de la carpeta exercises-dataset-main (o EXERCISES_DATASET_PATH).');

  const datasetFile = resolveDatasetFile(datasetPath);
  const datasetRoot = path.resolve(path.dirname(datasetFile), '..');
  const records = JSON.parse(await fs.readFile(datasetFile, 'utf8'));
  const keys = collectMediaKeys(records);
  const bucket = mediaBucket();
  const existing = force ? new Set() : await listExistingKeys(bucket);
  const pending = keys.filter((key) => !existing.has(key));
  console.log(`${keys.length} medios en el dataset, ${keys.length - pending.length} ya en ${bucket}, ${pending.length} por subir.`);
  if (dryRun || !pending.length) return;

  let uploaded = 0;
  const failed = [];
  await runPool(pending, async (key) => {
    try {
      const file = path.join(datasetRoot, key);
      const body = await fs.readFile(file);
      if (body.length > MAX_MEDIA_SIZE) throw new Error('excede 5 MB');
      await putMedia(key, body, contentTypeFor(key));
      uploaded += 1;
      if (uploaded % 100 === 0) console.log(`  ${uploaded}/${pending.length}`);
    } catch (error) {
      failed.push(`${key}: ${error.message}`);
    }
  });
  console.log(`Subidos ${uploaded}. Ejemplo: ${resolveMediaUrl(pending[0])}`);
  if (failed.length) {
    console.error(`Fallaron ${failed.length}:\n${failed.slice(0, 20).join('\n')}`);
    process.exitCode = 1;
  }
}

module.exports = { collectMediaKeys };
if (require.main === module) main().catch((error) => { console.error(`Media upload failed: ${error.message}`); process.exitCode = 1; });
