const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const ExerciseDictionary = require('../src/models/exercise-dictionary.model');
const { listExercises, createExercise, updateExercise } = require('../src/controllers/platform-exercise.controller');

const valid = {
  name: 'Press con balón',
  targetMuscle: 'Pecho',
  equipment: 'Balones / Accesorios',
  gifUrl: 'https://media.example/press.gif',
  steps: ['Acuéstate', 'Empuja'],
};

function response() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (value) => { res.body = value; return res; };
  return res;
}

function datasetDoc(overrides = {}) {
  const doc = new ExerciseDictionary({ sourceId: '0001', origin: 'dataset', lockedFields: [], ...valid, ...overrides });
  doc.save = async () => doc;
  return doc;
}

test('crea ejercicios de SIRID con origin sirid y sourceId propio', async (t) => {
  let created;
  t.mock.method(ExerciseDictionary, 'create', async (value) => { created = value; return new ExerciseDictionary(value); });
  const res = response();
  await createExercise({ body: valid }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.origin, 'sirid');
  assert.equal(created.sourceId, `sirid-${created._id}`);
  assert.deepEqual(res.body.exercise.steps, valid.steps);
});

test('rechaza categorías de equipo fuera del catálogo', async () => {
  await assert.rejects(createExercise({ body: { ...valid, equipment: 'Trampolín' } }, response()));
});

test('editar un ejercicio del dataset bloquea los campos tocados y unlock los libera', async (t) => {
  const doc = datasetDoc({ lockedFields: ['steps'] });
  t.mock.method(ExerciseDictionary, 'findById', async () => doc);
  const id = String(doc._id);

  const res = response();
  await updateExercise({ params: { id }, body: { name: 'Press editado', unlock: ['steps'] } }, res);
  assert.equal(res.body.exercise.name, 'Press editado');
  assert.deepEqual(res.body.exercise.lockedFields, ['name']);

  await updateExercise({ params: { id }, body: { isActive: false } }, res);
  assert.equal(res.body.exercise.isActive, false);
  assert.deepEqual(res.body.exercise.lockedFields, ['name']);
});

test('no acepta campos que no se pueden editar', async (t) => {
  t.mock.method(ExerciseDictionary, 'findById', async () => datasetDoc());
  await assert.rejects(updateExercise({ params: { id: String(new mongoose.Types.ObjectId()) }, body: { origin: 'sirid' } }, response()));
});

test('la lista del editor incluye inactivos salvo que se filtre', async (t) => {
  const filters = [];
  const chain = { sort: () => chain, skip: () => chain, limit: () => chain, lean: async () => [] };
  t.mock.method(ExerciseDictionary, 'find', (filter) => { filters.push(filter); return chain; });
  t.mock.method(ExerciseDictionary, 'countDocuments', async () => 0);
  await listExercises({ query: {} }, response());
  await listExercises({ query: { status: 'inactive', origin: 'sirid' } }, response());
  assert.deepEqual(filters[0], {});
  assert.deepEqual(filters[1], { isActive: false, origin: 'sirid' });
});

test('guarda como clave los medios del bucket y devuelve la URL pública', async (t) => {
  const previous = process.env.EXERCISES_MEDIA_PUBLIC_URL;
  process.env.EXERCISES_MEDIA_PUBLIC_URL = 'https://media.gymgo.mx';
  t.after(() => {
    if (previous === undefined) delete process.env.EXERCISES_MEDIA_PUBLIC_URL;
    else process.env.EXERCISES_MEDIA_PUBLIC_URL = previous;
  });
  let created;
  t.mock.method(ExerciseDictionary, 'create', async (value) => { created = value; return new ExerciseDictionary(value); });
  const res = response();
  await createExercise({ body: { ...valid, gifUrl: 'https://media.gymgo.mx/sirid/videos/a.gif', imageUrl: 'sirid/images/a.png' } }, res);
  assert.equal(created.gifUrl, 'sirid/videos/a.gif');
  assert.equal(created.imageUrl, 'sirid/images/a.png');
  assert.equal(res.body.exercise.gifUrl, 'https://media.gymgo.mx/sirid/videos/a.gif');
  assert.equal(res.body.exercise.imageUrl, 'https://media.gymgo.mx/sirid/images/a.png');
  await assert.rejects(createExercise({ body: { ...valid, gifUrl: '../.env' } }, response()));
});
