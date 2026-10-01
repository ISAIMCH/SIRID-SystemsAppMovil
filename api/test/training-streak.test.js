const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCurrentTrainingStreak } = require('../src/utils/training-streak');

test('ignora días de descanso programados al calcular la racha', () => {
  const sessions = [
    '2026-09-25T18:00:00.000Z',
    '2026-09-23T18:00:00.000Z',
    '2026-09-21T18:00:00.000Z',
  ];
  assert.equal(calculateCurrentTrainingStreak(sessions, [1, 3, 5], new Date('2026-09-26T10:00:00.000Z')), 3);
});

test('no rompe la racha durante el día programado actual antes de entrenar', () => {
  const sessions = ['2026-09-23T18:00:00.000Z', '2026-09-21T18:00:00.000Z'];
  assert.equal(calculateCurrentTrainingStreak(sessions, [1, 3, 5], new Date('2026-09-25T08:00:00.000Z')), 2);
});

test('rompe la racha si se omite un día de entrenamiento programado', () => {
  const sessions = ['2026-09-21T18:00:00.000Z'];
  assert.equal(calculateCurrentTrainingStreak(sessions, [1, 3, 5], new Date('2026-09-25T20:00:00.000Z')), 0);
});