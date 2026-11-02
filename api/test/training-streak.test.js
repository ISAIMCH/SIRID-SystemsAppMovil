const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCurrentTrainingStreak, localWeekStartInstant } = require('../src/utils/training-streak');

// Weeks used below (Mexico, UTC-6): Mon 2026-10-19, Mon 2026-10-26, Mon 2026-11-02. 18:00Z is noon local.
const MWF = [1, 3, 5];
const at = (day, time = '18:00') => `${day}T${time}:00.000Z`;

test('cuenta los días programados asistidos e ignora los días de descanso', () => {
  const checkIns = [at('2026-10-26'), at('2026-10-28'), at('2026-10-30')];
  assert.equal(calculateCurrentTrainingStreak(checkIns, MWF, new Date(at('2026-11-01'))), 3);
});

test('varias entradas el mismo día cuentan una sola vez', () => {
  const checkIns = [at('2026-10-26', '14:00'), at('2026-10-26', '20:00'), at('2026-10-28')];
  assert.equal(calculateCurrentTrainingStreak(checkIns, MWF, new Date(at('2026-10-29'))), 2);
});

test('la semana en curso sigue abierta: una falta aún no rompe la racha', () => {
  const checkIns = [at('2026-10-26'), at('2026-10-28'), at('2026-10-30')];
  assert.equal(calculateCurrentTrainingStreak(checkIns, MWF, new Date(at('2026-11-04'))), 3);
});

test('asistir un día libre de la misma semana salva la falta sin sumar punto', () => {
  // Mon, Tue (free) and Fri attended; Wed missed.
  const checkIns = [at('2026-10-26'), at('2026-10-27'), at('2026-10-30')];
  assert.equal(calculateCurrentTrainingStreak(checkIns, MWF, new Date(at('2026-11-02', '08:00'))), 2);
});

test('una semana cerrada sin reponer la falta deja la racha en cero', () => {
  const checkIns = [at('2026-10-26'), at('2026-10-28')];
  assert.equal(calculateCurrentTrainingStreak(checkIns, MWF, new Date(at('2026-11-02', '08:00'))), 0);
});

test('la racha solo cuenta desde la última semana completa sin faltas', () => {
  // Week of 10-19 misses Friday; week of 10-26 is complete.
  const checkIns = [at('2026-10-19'), at('2026-10-21'), at('2026-10-26'), at('2026-10-28'), at('2026-10-30')];
  assert.equal(calculateCurrentTrainingStreak(checkIns, MWF, new Date(at('2026-11-02', '08:00'))), 3);
});

test('no hay reposiciones entre semanas distintas', () => {
  // Friday 10-30 missed; Tuesday 11-03 is a free day of the next week and can't make it up.
  const checkIns = [at('2026-10-26'), at('2026-10-28'), at('2026-11-02'), at('2026-11-03')];
  assert.equal(calculateCurrentTrainingStreak(checkIns, MWF, new Date(at('2026-11-03'))), 1);
});

test('los días programados antes del primer acceso no cuentan como falta', () => {
  const checkIns = [at('2026-10-28'), at('2026-10-30')];
  assert.equal(calculateCurrentTrainingStreak(checkIns, MWF, new Date(at('2026-11-02', '08:00'))), 2);
});

test('usa la fecha local para los accesos nocturnos', () => {
  // 03:00Z on Tuesday is 21:00 on Monday in Mexico.
  const checkIns = [at('2026-10-27', '03:00')];
  assert.equal(calculateCurrentTrainingStreak(checkIns, [1], new Date(at('2026-11-01')), -360), 1);
  assert.equal(calculateCurrentTrainingStreak(checkIns, [1], new Date(at('2026-11-01')), 0), 0);
});

test('sin días programados o sin accesos la racha es cero', () => {
  assert.equal(calculateCurrentTrainingStreak([at('2026-10-26')], [], new Date(at('2026-10-27'))), 0);
  assert.equal(calculateCurrentTrainingStreak([], MWF, new Date(at('2026-10-27'))), 0);
});

test('la semana local empieza el lunes a medianoche en la zona del cliente', () => {
  // Sunday 21:00 local still belongs to the week that began Monday 10-26 at 00:00 local (06:00Z).
  assert.equal(localWeekStartInstant(new Date(at('2026-11-02', '03:00')), -360).toISOString(), '2026-10-26T06:00:00.000Z');
  assert.equal(localWeekStartInstant(new Date(at('2026-11-02', '08:00')), -360).toISOString(), '2026-11-02T06:00:00.000Z');
});
