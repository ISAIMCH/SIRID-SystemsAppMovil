const test = require('node:test');
const assert = require('node:assert/strict');
const { routineSchema, routineBaseSchema } = require('../src/controllers/routine.controller');

function validRoutine(overrides = {}) {
  return {
    title: 'Fuerza base',
    level: 'principiante',
    durationWeeks: 4,
    daysPerWeek: 1,
    scheduleDays: [1],
    assignedTo: '507f1f77bcf86cd799439011',
    exercises: [{
      name: 'Prensa',
      muscleGroup: 'Pierna',
      equipmentId: '507f1f77bcf86cd799439022',
      day: 1,
      sets: 3,
      reps: '10',
      restSeconds: 60,
      order: 0,
    }],
    ...overrides,
  };
}

test('acepta rutina con equipo del catálogo y día programado', () => {
  assert.equal(routineSchema.safeParse(validRoutine()).success, true);
});

test('rechaza ejercicios sin equipo seleccionado del inventario', () => {
  const input = validRoutine();
  delete input.exercises[0].equipmentId;
  assert.equal(routineSchema.safeParse(input).success, false);
});

test('rechaza ejercicios asignados a un día no programado', () => {
  const input = validRoutine();
  input.exercises[0].day = 2;
  assert.equal(routineSchema.safeParse(input).success, false);
});

test('permite modificar campos simples mediante PATCH parcial', () => {
  assert.equal(routineBaseSchema.partial().omit({ assignedTo: true }).safeParse({ status: 'paused' }).success, true);
});

test('acepta ejercicios de peso corporal sin equipo', () => {
  const input = validRoutine();
  delete input.exercises[0].equipmentId;
  input.exercises[0].bodyweight = true;
  assert.equal(routineSchema.safeParse(input).success, true);
});
