const test = require('node:test');
const assert = require('node:assert/strict');
const { routineSchema, routineBaseSchema, normalizeBlocks } = require('../src/controllers/routine.controller');

function validRoutine(overrides = {}) {
  return {
    title: 'Fuerza base',
    level: 'principiante',
    durationWeeks: 4,
    daysPerWeek: 1,
    scheduleDays: [1],
    assignedTo: '507f1f77bcf86cd799439011',
    blocks: [{
      day: 1,
      blockType: 'single',
      sets: 3,
      restSeconds: 60,
      order: 0,
      exercises: [{
        name: 'Prensa',
        muscleGroup: 'Pierna',
        equipmentId: '507f1f77bcf86cd799439022',
        reps: '10',
        order: 0,
      }],
    }],
    ...overrides,
  };
}

test('acepta rutina con equipo del catálogo y día programado', () => {
  assert.equal(routineSchema.safeParse(validRoutine()).success, true);
});

test('rechaza ejercicios sin equipo o marca de peso corporal', () => {
  const input = validRoutine();
  delete input.blocks[0].exercises[0].equipmentId;
  assert.equal(routineSchema.safeParse(input).success, false);
});

test('rechaza ejercicios asignados a un día no programado', () => {
  const input = validRoutine();
  input.blocks[0].day = 2;
  assert.equal(routineSchema.safeParse(input).success, false);
});

test('permite modificar campos simples mediante PATCH parcial', () => {
  assert.equal(routineBaseSchema.partial().omit({ assignedTo: true }).safeParse({ status: 'paused' }).success, true);
});

test('acepta ejercicios de peso corporal sin equipo', () => {
  const input = validRoutine();
  delete input.blocks[0].exercises[0].equipmentId;
  input.blocks[0].exercises[0].bodyweight = true;
  assert.equal(routineSchema.safeParse(input).success, true);
});

test('requiere dos ejercicios en superset y circuito', () => {
  const input = validRoutine();
  input.blocks[0].blockType = 'superset';
  assert.equal(routineSchema.safeParse(input).success, false);
});

test('acepta un superset con series y descanso compartidos', () => {
  const input = validRoutine();
  input.blocks[0].blockType = 'superset';
  input.blocks[0].exercises.push({
    name: 'Remo',
    muscleGroup: 'Espalda',
    equipmentId: '507f1f77bcf86cd799439023',
    reps: '12',
    order: 1,
  });
  assert.equal(routineSchema.safeParse(input).success, true);
});

test('accepts cardio target metrics without strength prescriptions', () => {
  const input = validRoutine();
  const exercise = input.blocks[0].exercises[0];
  exercise.metricType = 'cardio';
  exercise.targetDurationMinutes = 20;
  delete exercise.reps;
  delete exercise.suggestedWeight;
  assert.equal(routineSchema.safeParse(input).success, true);
});

test('normalizes a legacy flat routine into stable single blocks', () => {
  const id = '507f1f77bcf86cd799439022';
  const routine = { exercises: [{ _id: id, day: 2, sets: 4, reps: '8', restSeconds: 90, name: 'Press', muscleGroup: 'Pecho' }] };
  const first = normalizeBlocks(routine);
  const second = normalizeBlocks(routine);
  assert.equal(first[0].blockType, 'single');
  assert.equal(String(first[0]._id), String(second[0]._id));
  assert.equal(first[0].sets, 4);
  assert.equal(first[0].exercises[0]._id, id);
});
