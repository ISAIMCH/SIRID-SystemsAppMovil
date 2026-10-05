const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCaloriesBurned } = require('../src/controllers/workout.controller');
const {
  calculatePeriodRange,
  buildClientChart,
  buildTimeGroupExpression,
} = require('../src/controllers/analytics.controller');

test('calculates ACSM calories at strength and cardio MET values', () => {
  assert.equal(calculateCaloriesBurned(70, 60, false), 257.25);
  assert.equal(calculateCaloriesBurned(70, 60, true), 441);
});

test('uses hour grouping for day analytics and local-date grouping otherwise', () => {
  assert.deepEqual(buildTimeGroupExpression('day', 'America/Los_Angeles'), {
    $dateToString: { format: '%H', date: '$completedAt', timezone: 'America/Los_Angeles' },
  });
  assert.deepEqual(buildTimeGroupExpression('week', 'UTC'), {
    $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: 'UTC' },
  });
  assert.deepEqual(buildTimeGroupExpression('month', 'UTC'), buildTimeGroupExpression('week', 'UTC'));
});

test('fills all day-hour chart buckets with local hour labels', () => {
  const chart = buildClientChart('day', [
    { _id: '06', durationMinutes: 30, totalVolumeKg: 500, caloriesBurned: 120 },
    { _id: '18', durationMinutes: 45, totalVolumeKg: 800, caloriesBurned: 200 },
  ], '2026-10-05', '2026-10-06');
  assert.equal(chart.length, 24);
  assert.equal(chart[6].label, '06:00');
  assert.equal(chart[6].totalVolumeKg, 500);
  assert.equal(chart[18].caloriesBurned, 200);
  assert.equal(chart[7].totalVolumeKg, 0);
});

test('fills week and month chart data by calendar day', () => {
  const week = buildClientChart('week', [{ _id: '2026-10-05', durationMinutes: 20, totalVolumeKg: 100, caloriesBurned: 80 }], '2026-10-05', '2026-10-12');
  assert.equal(week.length, 7);
  assert.equal(week[0].label, '2026-10-05');
  assert.equal(week[1].durationMinutes, 0);

  const month = buildClientChart('month', [], '2026-02-01', '2026-03-01');
  assert.equal(month.length, 28);
});

test('computes date ranges in the requested timezone across daylight-saving transitions', () => {
  const range = calculatePeriodRange('day', '2026-03-08', 'America/New_York');
  assert.equal(range.start.toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-03-09T04:00:00.000Z');
  assert.equal((range.end.getTime() - range.start.getTime()) / 3600000, 23);
});

test('uses Monday as the start of a week and validates month dates', () => {
  const range = calculatePeriodRange('week', '2026-10-07', 'UTC');
  assert.equal(range.startDate, '2026-10-05');
  assert.equal(range.endDateExclusive, '2026-10-12');
  assert.throws(() => calculatePeriodRange('month', '2026-02-30', 'UTC'));
});
