const test = require('node:test');
const assert = require('node:assert/strict');
const { translateText } = require('../scripts/translate-dictionary');

test('translates equipment, movement, and muscle keywords case-insensitively', () => {
  assert.equal(translateText('Dumbbell Bench Press'), 'Press de banca con mancuerna');
  assert.equal(translateText('Seated Cable Row'), 'Sentado Polea Remo');
  assert.equal(translateText('CHEST and Back'), 'Pecho and Espalda');
});

test('uses whole-word matching and is idempotent', () => {
  assert.equal(translateText('Flywheel Squat'), 'Flywheel Sentadilla');
  assert.equal(translateText('Dumbbell Squat'), 'Mancuerna Sentadilla');
  assert.equal(translateText(translateText('Dumbbell Bench Press')), 'Press de banca con mancuerna');
  assert.equal(translateText(translateText('Cable Row')), 'Polea Remo');
});

test('translates common dataset-specific exercise words', () => {
  assert.equal(translateText('one arm split squat for male'), 'A una mano Sentadilla dividida for Hombre');
  assert.equal(translateText('Delts'), 'Deltoides');
  assert.equal(translateText('One arm dip against wall with medicine ball'), 'A una mano Fondo Contra la pared Con Balón medicinal');
});
