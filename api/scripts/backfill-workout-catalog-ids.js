// Copia a cada ejercicio registrado en entrenamientos antiguos el ejercicio del catálogo global de su rutina
// (catalogExerciseId), para que el progreso del cliente siga unido aunque la rutina se edite o se borre después.
// Solo se completa cuando el hueco de la rutina conserva el mismo ejercicio (mismo nombre); los ejercicios
// personalizados, sin catálogo, se quedan como están. La API ya resuelve estos casos al vuelo: esta migración
// solo lo hace permanente.
// Uso: npm run migrate:workout-catalog --dry-run   (o: node scripts/backfill-workout-catalog-ids.js --dry-run)
// Se puede ejecutar varias veces: solo completa lo que falta.
require('dotenv').config();
const mongoose = require('mongoose');
const WorkoutSession = require('../src/models/workout-session.model');
const Routine = require('../src/models/routine.model');
const { resolveCatalogId, routineExerciseIndex } = require('../src/utils/client-tracking');

const DRY_RUN = process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true';
const BATCH = 200;

// The session's blocks with catalog ids filled in, and how many logs changed.
function fillCatalogIds(blocks, index) {
  let changed = 0;
  const next = blocks.map((block) => ({
    ...block,
    sets: (block.sets ?? []).map((set) => ({
      ...set,
      exercises: (set.exercises ?? []).map((log) => {
        if (log.catalogExerciseId) return log;
        const catalogId = resolveCatalogId(log, index);
        if (!catalogId) return log;
        changed += 1;
        return { ...log, catalogExerciseId: new mongoose.Types.ObjectId(catalogId) };
      }),
    })),
  }));
  return { blocks: next, changed };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('Falta MONGO_URI.');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  console.log(DRY_RUN ? 'Simulación (--dry-run): no se modifica nada.\n' : 'Aplicando la migración.\n');

  const filter = { 'blocks.sets.exercises': { $elemMatch: { catalogExerciseId: { $in: [null] } } } };
  let sessions = 0;
  let logs = 0;
  let lastId = null;
  for (;;) {
    const page = await WorkoutSession.collection
      .find({ ...filter, ...(lastId ? { _id: { $gt: lastId } } : {}) }, { projection: { routine: 1, blocks: 1 } })
      .sort({ _id: 1 })
      .limit(BATCH)
      .toArray();
    if (!page.length) break;
    lastId = page[page.length - 1]._id;
    const routineIds = [...new Set(page.map((session) => String(session.routine)).filter(Boolean))];
    const routines = await Routine.collection
      .find({ _id: { $in: routineIds.map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { blocks: 1, exercises: 1 } })
      .toArray();
    const index = routineExerciseIndex(routines);
    for (const session of page) {
      const { blocks, changed } = fillCatalogIds(session.blocks ?? [], index);
      if (!changed) continue;
      sessions += 1;
      logs += changed;
      if (!DRY_RUN) await WorkoutSession.collection.updateOne({ _id: session._id }, { $set: { blocks } });
    }
  }
  console.log(`${DRY_RUN ? 'Se completarían' : 'Completados'} ${logs} registros de ejercicio en ${sessions} entrenamientos.`);
}

if (require.main === module) {
  main()
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error('La migración falló:', error.message);
      await mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = { fillCatalogIds };
