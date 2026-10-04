const test = require('node:test');
const assert = require('node:assert/strict');
const { workoutSchema } = require('../src/controllers/workout.controller');

const ids = {
  routine: '507f1f77bcf86cd799439011',
  block: '507f1f77bcf86cd799439012',
  exerciseA: '507f1f77bcf86cd799439013',
  exerciseB: '507f1f77bcf86cd799439014',
};

function workout(overrides = {}) {
  return {
    routineId: ids.routine,
    trainingDay: 1,
    durationMinutes: 40,
    blocks: [{
      routineBlockId: ids.block,
      sets: [{
        setNumber: 1,
        exercises: [
          { routineExerciseId: ids.exerciseA, reps: 10, weightKg: 20 },
          { routineExerciseId: ids.exerciseB, durationMinutes: 12, distanceKm: 2.1 },
        ],
      }],
    }],
    ...overrides,
  };
}

test('accepts one full block set with strength and cardio metrics', () => {
  assert.equal(workoutSchema.safeParse(workout()).success, true);
});

test('accepts cardio time, distance, or level metrics without strength fields', () => {
  const input = workout();
  input.blocks[0].sets[0].exercises[1] = { routineExerciseId: ids.exerciseB, level: 7 };
  assert.equal(workoutSchema.safeParse(input).success, true);
});

test('rejects set rounds without the required routine identifiers', () => {
  const input = workout();
  input.blocks[0].sets[0].exercises[0].routineExerciseId = 'bad-id';
  assert.equal(workoutSchema.safeParse(input).success, false);
});
