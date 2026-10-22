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

test('uses the local Mexico date for late-night UTC timestamps', () => {
  const sessions = [
    '2026-09-26T01:00:00.000Z',
    '2026-09-24T01:00:00.000Z',
    '2026-09-22T01:00:00.000Z',
  ];
  assert.equal(calculateCurrentTrainingStreak(sessions, [1, 3, 5], new Date('2026-09-26T10:00:00.000Z'), -360), 3);
});

test('counts a make-up session for its scheduled training day within the week', () => {
  const sessions = [{ completedAt: '2026-09-22T18:00:00.000Z', trainingDay: 1 }];
  assert.equal(calculateCurrentTrainingStreak(sessions, [1], new Date('2026-09-23T12:00:00.000Z'), -360), 1);
});