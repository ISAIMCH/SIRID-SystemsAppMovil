const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Equipment = require('../src/models/equipment.model');
const Exercise = require('../src/models/exercise.model');
const ExerciseDictionary = require('../src/models/exercise-dictionary.model');
const { getCatalog, getCatalogExercise, searchExercises } = require('../src/controllers/exercise-dictionary.controller');

const id = () => new mongoose.Types.ObjectId();
const gymId = id();

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

// A chainable query that records how it was built.
function query(value, calls = {}) {
  const chain = {};
  for (const method of ['select', 'sort', 'skip', 'limit']) chain[method] = (arg) => { calls[method] = arg; return chain; };
  chain.lean = async () => value;
  return chain;
}

async function run(handler, { query: params = {}, params: routeParams = {}, inventory = [], globals = [], total = globals.length, customs = [] } = {}) {
  const seen = { dictionary: null, calls: {}, customFilter: null };
  const restore = [
    stub(Equipment, 'find', () => query(inventory)),
    stub(ExerciseDictionary, 'find', (filter) => { seen.dictionary = filter; return query(globals, seen.calls); }),
    stub(ExerciseDictionary, 'findOne', (filter) => { seen.dictionary = filter; return query(globals[0] ?? null); }),
    stub(ExerciseDictionary, 'countDocuments', async () => total),
    stub(Exercise, 'find', (filter) => { seen.customFilter = filter; return query(customs); }),
  ];
  let body;
  try {
    const req = { query: params, params: routeParams, tenant: { organizationId: id(), gymIds: [gymId], gymId } };
    await handler(req, { json(value) { body = value; } });
  } finally {
    restore.forEach((undo) => undo());
  }
  return { body, ...seen };
}

const global = (name, equipment = 'Sin equipo') => ({ _id: id(), name, targetMuscle: 'Pecho', equipment, gifUrl: 'https://x/a.gif', metricType: 'strength' });

test('a gym without equipment only unlocks bodyweight exercises', async () => {
  const { body, dictionary } = await run(getCatalog);
  assert.deepEqual(dictionary.equipment, { $in: ['Sin equipo'] });
  assert.deepEqual(body.unlockedCategories, ['Sin equipo']);
});

test('registered equipment unlocks its category, using the stored category first', async () => {
  const inventory = [
    { name: 'Rack 1', zone: 'Pesas', equipmentCategory: 'Barras', status: 'available' },
    { name: 'Mancuernas 10 kg', zone: 'Pesas', status: 'available' },
  ];
  const { dictionary, body } = await run(getCatalog, { inventory });
  assert.deepEqual(dictionary.equipment.$in, ['Sin equipo', 'Barras', 'Pesas / Mancuernas']);
  assert.deepEqual(body.outOfServiceCategories, []);
});

test('equipment in maintenance keeps its exercises unlocked but flags the category', async () => {
  const inventory = [{ name: 'Máquina Smith', zone: 'Pesas', equipmentCategory: 'Smith', status: 'out_of_service' }];
  const { dictionary, body } = await run(getCatalog, { inventory });
  assert.ok(dictionary.equipment.$in.includes('Smith'));
  assert.deepEqual(body.outOfServiceCategories, ['Smith']);
});

test('a category filter cannot reach equipment the gym does not own', async () => {
  const { dictionary } = await run(getCatalog, { query: { category: 'Poleas' } });
  assert.deepEqual(dictionary.equipment, { $in: [] });
  const all = await run(getCatalog, { query: { category: 'Poleas', availableOnly: 'false' } });
  assert.deepEqual(all.dictionary.equipment, { $in: ['Poleas / Cables'] });
});

test('custom exercises come first on page one and never on later pages', async () => {
  const customs = [
    { _id: id(), name: 'Remo inventado', muscleGroup: 'Espalda', equipment: 'Mancuernas' },
    { _id: id(), name: 'Plancha propia', muscleGroup: 'Abdominales', equipment: null },
  ];
  const first = await run(getCatalog, { customs, globals: [global('Lagartija')], total: 31 });
  assert.deepEqual(first.body.exercises.map((exercise) => exercise.source), ['custom', 'custom', 'global']);
  assert.equal(first.body.hasMore, true);
  assert.equal(first.customFilter.isDeleted.$ne, true);

  const second = await run(getCatalog, { query: { page: '2' }, customs, globals: [global('Sentadilla')], total: 31 });
  assert.deepEqual(second.body.exercises.map((exercise) => exercise.source), ['global']);
  assert.equal(second.calls.skip, 30);
  assert.equal(second.body.hasMore, false);
});

test('custom exercises follow the muscle and equipment filters', async () => {
  const customs = [
    { _id: id(), name: 'Remo inventado', muscleGroup: 'Espalda', equipment: 'Mancuernas' },
    { _id: id(), name: 'Plancha propia', muscleGroup: 'Abdominales', equipment: null },
  ];
  const { body } = await run(getCatalog, { query: { muscleGroup: 'Abdominales', category: 'Sin equipo' }, customs });
  assert.deepEqual(body.exercises.map((exercise) => exercise.name), ['Plancha propia']);
});

test('search text is escaped and inactive exercises are hidden', async () => {
  const { dictionary, customFilter } = await run(getCatalog, { query: { q: 'curl (barra' } });
  assert.equal(dictionary.isActive.$ne, false);
  assert.ok(dictionary.name.test('Curl (barra) EZ'));
  assert.ok(customFilter.name.test('curl (barra'));
});

test('the detail returns the steps and secondary muscles', async () => {
  const exercise = { ...global('Press de banca', 'Barras'), steps: ['Paso 1'], secondaryMuscles: ['Tríceps'], attribution: '© Gym visual' };
  const { body } = await run(getCatalogExercise, { params: { id: String(exercise._id) }, globals: [exercise] });
  assert.deepEqual(body.exercise.steps, ['Paso 1']);
  assert.deepEqual(body.exercise.secondaryMuscles, ['Tríceps']);
  assert.equal(body.exercise.source, 'global');
  await assert.rejects(run(getCatalogExercise, { params: { id: 'nope' } }), /inválido/);
});

test('the legacy dictionary search no longer shows the whole catalog to an empty gym', async () => {
  const { dictionary, body } = await run(searchExercises);
  assert.deepEqual(dictionary.equipment, { $in: ['Sin equipo'] });
  assert.deepEqual(body.availableEquipmentCategories, ['Sin equipo']);
});
