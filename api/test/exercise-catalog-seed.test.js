const test = require('node:test');
const assert = require('node:assert/strict');
const { mapExercise, buildOperations } = require('../scripts/seed-external-exercises');
const { nextCategory } = require('../scripts/migrate-equipment-categories');
const { normalizeEquipmentCategory, inferEquipmentCategory } = require('../src/constants/equipment-families');

const record = {
  id: '0001',
  name: 'dumbbell bench press',
  equipment: 'dumbbell',
  target: 'pectorals',
  secondary_muscles: ['triceps', 'chest', 'rear deltoids'],
  image: 'images/0001-2gPfomN.jpg',
  gif_url: 'videos/0001-2gPfomN.gif',
  media_id: '2gPfomN',
  instruction_steps: { en: ['Lie down.'], es: [' Túmbate en el banco. ', 'Empuja hacia arriba.'] },
};

test('maps a dataset record into the global catalog shape', () => {
  const exercise = mapExercise(record, 'https://media.example.com/catalog');
  assert.equal(exercise.sourceId, '0001');
  assert.equal(exercise.name, 'Press de banca con mancuerna');
  assert.equal(exercise.targetMuscle, 'Pecho');
  assert.deepEqual(exercise.secondaryMuscles, ['Tríceps', 'Deltoides posterior']);
  assert.equal(exercise.equipment, 'Pesas / Mancuernas');
  assert.equal(exercise.gifUrl, 'https://media.example.com/catalog/videos/0001-2gPfomN.gif');
  assert.equal(exercise.imageUrl, 'https://media.example.com/catalog/images/0001-2gPfomN.jpg');
  assert.deepEqual(exercise.steps, ['Túmbate en el banco.', 'Empuja hacia arriba.']);
  assert.equal(exercise.metricType, 'strength');
});

test('skips records without id, name or animation', () => {
  assert.equal(mapExercise({ ...record, id: undefined }), null);
  assert.equal(mapExercise({ ...record, gif_url: '' }), null);
});

test('maps every dataset equipment to a category a gym can register', () => {
  assert.equal(normalizeEquipmentCategory('smith machine'), 'Smith');
  assert.equal(normalizeEquipmentCategory('stability ball'), 'Balones / Accesorios');
  assert.equal(normalizeEquipmentCategory('wheel roller'), 'Balones / Accesorios');
  assert.equal(normalizeEquipmentCategory('barbell'), 'Barras');
  assert.equal(normalizeEquipmentCategory('kettlebell'), 'Pesas rusas');
});

test('the stored equipment category wins over the name', () => {
  assert.equal(inferEquipmentCategory({ name: 'Rack 1', equipmentCategory: 'Barras' }), 'Barras');
  assert.equal(inferEquipmentCategory({ name: 'Máquina Smith', zone: 'Pesas' }), 'Smith');
});

test('reseeding keeps locked fields and platform-made records', () => {
  const exercise = mapExercise(record);
  const existing = new Map([
    ['0001', { sourceId: '0001', origin: 'dataset', lockedFields: ['name', 'steps'] }],
    ['0002', { sourceId: '0002', origin: 'sirid', lockedFields: [] }],
  ]);
  const operations = buildOperations([exercise, { ...exercise, sourceId: '0002' }, { ...exercise, sourceId: '0003' }], existing);
  assert.equal(operations.length, 2);
  const [locked, fresh] = operations.map((operation) => operation.updateOne);
  assert.equal(locked.update.$set.name, undefined);
  assert.equal(locked.update.$set.steps, undefined);
  assert.equal(locked.update.$set.gifUrl, exercise.gifUrl);
  assert.equal(fresh.filter.sourceId, '0003');
  assert.equal(fresh.upsert, true);
});

test('equipment migration fills missing categories and only upgrades generic ones', () => {
  assert.equal(nextCategory({ name: 'Mancuernas 10kg' }), 'Pesas / Mancuernas');
  assert.equal(nextCategory({ name: 'Máquina Smith', equipmentCategory: 'Máquinas' }), 'Smith');
  assert.equal(nextCategory({ name: 'Balón medicinal', equipmentCategory: 'Otro' }), 'Balones / Accesorios');
  assert.equal(nextCategory({ name: 'Prensa', equipmentCategory: 'Máquinas' }), null);
  assert.equal(nextCategory({ name: 'Máquina Smith', equipmentCategory: 'Barras' }), 'Smith');
});
