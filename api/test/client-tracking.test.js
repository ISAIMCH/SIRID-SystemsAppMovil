const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';

const OrganizationMember = require('../src/models/organization-member.model');
const WorkoutSession = require('../src/models/workout-session.model');
const Routine = require('../src/models/routine.model');
const { getClientWorkoutHistory } = require('../src/controllers/workout.controller');
const { getClientExercise, getClientExercises, getClientOverview, getClientSession, getCoachClientsActivity } = require('../src/controllers/client-tracking.controller');
const tracking = require('../src/utils/client-tracking');
const { fillCatalogIds } = require('../scripts/backfill-workout-catalog-ids');

const id = () => new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

function query(value, calls = {}) {
  const chain = {
    select: () => chain,
    populate: () => chain,
    sort: (sort) => { calls.sort = sort; return chain; },
    limit: (limit) => { calls.limit = limit; return chain; },
    lean: async () => value,
  };
  chain.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  return chain;
}

function coachRequest({ organizationId, clientId, coachId, query: params = {}, extra = {} }) {
  return {
    params: { clientId: String(clientId), ...extra },
    query: params,
    user: { id: String(coachId), _id: coachId },
    tenant: { organizationId, role: 'Coach', gymIds: [id()], gymId: id() },
    tenantContext: { member: { roles: [], gyms: [] } },
  };
}

function clientMember(clientId, organizationId, coachId) {
  return { userId: clientId, organizationId, roles: ['Cliente'], gyms: [], assignedCoach: coachId };
}

// A session with one block whose rounds log `logs` (one array of exercise logs per round).
function session({ at, rounds, routine = id(), trainingDay, ...rest }) {
  return {
    _id: id(),
    routine,
    routineTitle: 'Fuerza',
    completedAt: new Date(at),
    trainingDay: trainingDay ?? new Date(at).getDay(),
    durationMinutes: 50,
    totalVolumeKg: 0,
    blocks: [{ routineBlockId: id(), blockType: 'single', restSeconds: 60, sets: rounds.map((exercises, index) => ({ setNumber: index + 1, completedAt: new Date(at), exercises })) }],
    ...rest,
  };
}

const strength = (routineExerciseId, reps, weightKg, extra = {}) => ({
  routineExerciseId, exerciseName: 'Press banca', muscleGroup: 'Pecho', metricType: 'strength', reps, weightKg, targetReps: 8, targetWeightKg: 60, ...extra,
});

/* ───────────── Cursor and filters ───────────── */

test('the history cursor round-trips and rejects anything else', () => {
  const row = { _id: id(), completedAt: new Date('2026-11-10T15:30:00.123Z') };
  const cursor = tracking.encodeCursor(row);
  assert.deepEqual(tracking.decodeCursor(cursor), { completedAt: row.completedAt, id: String(row._id) });
  assert.equal(tracking.decodeCursor('2026-11-10_abc'), null);
  assert.equal(tracking.decodeCursor({ $gt: '' }), null);
});

test('recovered sessions compare the routine day with the local weekday', () => {
  assert.equal(tracking.tzString(-360), '-06:00');
  assert.equal(tracking.tzString(330), '+05:30');
  const condition = tracking.historyFilterCondition('recovered', -360);
  assert.equal(condition.$expr.$ne[1].$subtract[0].$dayOfWeek.timezone, '-06:00');
  assert.deepEqual(tracking.historyFilterCondition('highRpe', 0), { perceivedExertion: { $gte: 4 } });
  assert.deepEqual(tracking.historyFilterCondition('all', 0), {});
});

test('without paging parameters the history keeps its original answer', async () => {
  const organizationId = id();
  const clientId = id();
  const coachId = id();
  const calls = {};
  let filter;
  const restore = [
    stub(OrganizationMember, 'findOne', async () => clientMember(clientId, organizationId, coachId)),
    stub(WorkoutSession, 'find', (value) => { filter = value; return query([], calls); }),
  ];
  try {
    let body;
    await getClientWorkoutHistory(coachRequest({ organizationId, clientId, coachId }), { json: (value) => { body = value; } });
    assert.deepEqual(body, { sessions: [], nextCursor: null });
    assert.equal(calls.limit, 101);
    assert.deepEqual(Object.keys(filter).sort(), ['organizationId', 'user']);
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('a page returns a cursor only when more sessions remain, and filters apply to the whole history', async () => {
  const organizationId = id();
  const clientId = id();
  const coachId = id();
  const rows = [3, 2, 1].map((day) => session({ at: Date.UTC(2026, 10, day, 18), rounds: [[strength(id(), 8, 60)]], clientNotes: 'nota' }));
  let filter;
  const restore = [
    stub(OrganizationMember, 'findOne', async () => clientMember(clientId, organizationId, coachId)),
    stub(WorkoutSession, 'find', (value) => { filter = value; return query(rows); }),
  ];
  try {
    let body;
    const before = tracking.encodeCursor(rows[0]);
    await getClientWorkoutHistory(coachRequest({ organizationId, clientId, coachId, query: { limit: '2', filter: 'notes', before } }), { json: (value) => { body = value; } });
    assert.equal(body.sessions.length, 2);
    assert.equal(body.nextCursor, tracking.encodeCursor(rows[1]));
    assert.deepEqual(filter.clientNotes, /\S/);
    assert.equal(filter.$or.length, 2);
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('invalid filters and cursors are rejected', async () => {
  const organizationId = id();
  const clientId = id();
  const coachId = id();
  const restore = [stub(OrganizationMember, 'findOne', async () => clientMember(clientId, organizationId, coachId))];
  try {
    await assert.rejects(getClientWorkoutHistory(coachRequest({ organizationId, clientId, coachId, query: { filter: 'todo' } }), {}), { statusCode: 400 });
    await assert.rejects(getClientWorkoutHistory(coachRequest({ organizationId, clientId, coachId, query: { before: 'x' } }), {}), { statusCode: 400 });
  } finally {
    restore.forEach((undo) => undo());
  }
});

test("a Coach never reads the tracking of someone else's client", async () => {
  const organizationId = id();
  const clientId = id();
  const restore = [stub(OrganizationMember, 'findOne', async () => clientMember(clientId, organizationId, id()))];
  try {
    const req = coachRequest({ organizationId, clientId, coachId: id(), extra: { key: `c-${id()}-s`, sessionId: String(id()) } });
    for (const handler of [getClientWorkoutHistory, getClientOverview, getClientExercises, getClientExercise, getClientSession]) {
      await assert.rejects(handler(req, {}), { statusCode: 404 });
    }
  } finally {
    restore.forEach((undo) => undo());
  }
});

/* ───────────── Periods and weeks ───────────── */

test('periods compare equal rolling windows and weeks group by local Monday', () => {
  const now = new Date('2026-11-13T18:00:00Z');
  const routine = id();
  const rows = [
    { _id: id(), completedAt: new Date(now - 1 * DAY), totalVolumeKg: 1000, perceivedExertion: 4, durationMinutes: 50, routine, completedSets: 10, skippedSets: 1 },
    { _id: id(), completedAt: new Date(now - 3 * DAY), totalVolumeKg: 2000, perceivedExertion: 3, durationMinutes: 70, routine, completedSets: 12, skippedSets: 0 },
    { _id: id(), completedAt: new Date(now - 9 * DAY), totalVolumeKg: 1500, durationMinutes: 40, routine, completedSets: 9, skippedSets: 2 },
    { _id: id(), completedAt: new Date(now - 20 * DAY), totalVolumeKg: 900, perceivedExertion: 5, durationMinutes: 30, routine, completedSets: 6, skippedSets: 0 },
  ];
  const result = tracking.summarizeSessions(rows, { now, tzOffsetMinutes: -360, periodDays: 7, plannedByRoutine: new Map([[String(routine), 4]]) });
  assert.equal(result.totals.sessions, 4);
  assert.equal(result.totals.lastSession._id, String(rows[0]._id));
  assert.deepEqual(
    { sessions: result.period.current.sessions, volumeKg: result.period.current.volumeKg, avgRpe: result.period.current.avgRpe, completedSets: result.period.current.completedSets, skippedSets: result.period.current.skippedSets, avgDurationMinutes: result.period.current.avgDurationMinutes },
    { sessions: 2, volumeKg: 3000, avgRpe: 3.5, completedSets: 22, skippedSets: 1, avgDurationMinutes: 60 },
  );
  // A period without RPE logs has no average rather than zero.
  assert.equal(result.period.previous.sessions, 1);
  assert.equal(result.period.previous.avgRpe, null);
  assert.equal(result.weeks[0].weekStart, '2026-11-09');
  assert.equal(result.weeks[0].sessions, 2);
  assert.equal(result.weeks[0].plannedSessions, 4);
  assert.deepEqual(result.weeks.map((week) => week.weekStart), ['2026-11-09', '2026-11-02', '2026-10-19']);
});

test('the local week follows the client timezone', () => {
  // Monday 03:00 UTC is still Sunday in Mexico City.
  assert.equal(tracking.localWeekKey('2026-11-09T03:00:00Z', -360), '2026-11-02');
  assert.equal(tracking.localWeekKey('2026-11-09T03:00:00Z', 0), '2026-11-09');
});

/* ───────────── Per-exercise progress ───────────── */

test('progress follows the catalog exercise across routines and never merges custom exercises by name', () => {
  const catalog = id();
  const oldSlot = id();
  const newSlot = id();
  const customA = id();
  const customB = id();
  const sessions = [
    session({ at: '2026-10-01T18:00:00Z', rounds: [[strength(oldSlot, 8, 60), strength(customA, 10, 20, { exerciseName: 'Remo' })]] }),
    session({ at: '2026-11-01T18:00:00Z', rounds: [[strength(newSlot, 8, 65, { catalogExerciseId: catalog }), strength(customB, 10, 22, { exerciseName: 'Remo' })]] }),
  ];
  // The old session predates the stored field: its routine slot still points at the same catalog exercise.
  const index = new Map([[String(oldSlot), { catalogExerciseId: catalog, name: 'Press banca' }]]);
  const progress = tracking.buildExerciseProgress(sessions, index);
  const bench = progress.get(`c-${catalog}-s`);
  assert.equal(bench.entries.length, 2);
  assert.ok(progress.has(`r-${customA}-s`));
  assert.ok(progress.has(`r-${customB}-s`));
  assert.equal(progress.size, 3);
});

test('a routine slot edited to another exercise is not linked to the old logs', () => {
  const slot = id();
  const log = strength(slot, 8, 60, { exerciseName: 'Press banca' });
  const index = new Map([[String(slot), { catalogExerciseId: id(), name: 'Sentadilla' }]]);
  assert.equal(tracking.resolveCatalogId(log, index), null);
});

test('exercise summaries separate PR, last result, trend and plateau', () => {
  const catalog = id();
  const slot = id();
  const lift = (reps, weightKg, extra) => strength(slot, reps, weightKg, { catalogExerciseId: catalog, ...extra });
  const sessions = [
    session({ at: '2026-10-01T18:00:00Z', rounds: [[lift(8, 60)], [lift(8, 60)]] }),
    session({ at: '2026-10-08T18:00:00Z', rounds: [[lift(8, 62.5)], [lift(6, 62.5)]] }),
    session({ at: '2026-10-15T18:00:00Z', rounds: [[lift(5, 70)], [lift(0, 0, { skipped: true })]] }),
    session({ at: '2026-10-22T18:00:00Z', rounds: [[lift(0, 0, { skipped: true })]] }),
    session({ at: '2026-10-29T18:00:00Z', rounds: [[lift(8, 62.5)]] }),
  ];
  const { summary, entries } = tracking.buildExerciseProgress(sessions).get(`c-${catalog}-s`);
  assert.equal(entries.length, 5);
  assert.equal(summary.sessions, 4);
  assert.equal(summary.skippedSessions, 1);
  assert.equal(summary.primaryMetric, 'e1rm');
  assert.deepEqual({ weightKg: summary.pr.weightKg, reps: summary.pr.reps }, { weightKg: 70, reps: 5 });
  assert.deepEqual(summary.last.topSet, { weightKg: 62.5, reps: 8 });
  assert.equal(summary.last.volumeKg, 500);
  assert.equal(summary.recent.length, 4);
  // 62.5×8 ≈ 79.2 e1RM against a median of 76, 79.2, 81.7: within the noise threshold.
  assert.equal(summary.trend.direction, 'flat');
  assert.equal(summary.sessionsSinceBest, 1);
  assert.equal(summary.lastSkipped, false);
});

test('bodyweight work is tracked by reps and cardio by its logged measure', () => {
  const catalog = id();
  const cardio = id();
  const sessions = [
    session({ at: '2026-10-01T18:00:00Z', rounds: [[strength(id(), 10, 0, { catalogExerciseId: catalog })], [strength(id(), 12, 0, { catalogExerciseId: catalog })]] }),
    session({ at: '2026-10-05T18:00:00Z', rounds: [[{ routineExerciseId: cardio, exerciseName: 'Caminadora', muscleGroup: 'Cardio', metricType: 'cardio', durationMinutes: 20, distanceKm: 2.5 }]] }),
  ];
  const progress = tracking.buildExerciseProgress(sessions);
  const bodyweight = progress.get(`c-${catalog}-s`).summary;
  assert.equal(bodyweight.primaryMetric, 'reps');
  assert.equal(bodyweight.pr.reps, 12);
  const run = progress.get(`r-${cardio}-c`).summary;
  assert.equal(run.primaryMetric, 'distanceKm');
  assert.equal(run.last.value, 2.5);
});

test('the exercises endpoint resolves old logs through their routines', async () => {
  const organizationId = id();
  const clientId = id();
  const coachId = id();
  const catalog = id();
  const slot = id();
  const routine = id();
  const rows = [session({ at: '2026-10-01T18:00:00Z', routine, rounds: [[strength(slot, 8, 60)]] })];
  const restore = [
    stub(OrganizationMember, 'findOne', async () => clientMember(clientId, organizationId, coachId)),
    stub(WorkoutSession, 'find', () => query(rows)),
    stub(Routine, 'find', () => query([{ _id: routine, blocks: [{ exercises: [{ _id: slot, name: 'Press banca', catalogExerciseId: catalog }] }] }])),
  ];
  try {
    let body;
    await getClientExercises(coachRequest({ organizationId, clientId, coachId }), { json: (value) => { body = value; } });
    assert.deepEqual(body.exercises.map((exercise) => exercise.key), [`c-${catalog}-s`]);
    let detail;
    await getClientExercise(coachRequest({ organizationId, clientId, coachId, extra: { key: `c-${catalog}-s` } }), { json: (value) => { detail = value; } });
    assert.equal(detail.entries.length, 1);
    await assert.rejects(getClientExercise(coachRequest({ organizationId, clientId, coachId, extra: { key: 'bad' } }), {}), { statusCode: 400 });
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('the backfill fills only logs it can resolve safely', () => {
  const catalog = id();
  const slot = id();
  const other = id();
  const index = new Map([[String(slot), { catalogExerciseId: catalog, name: 'Press banca' }]]);
  const { blocks, changed } = fillCatalogIds([{ sets: [{ exercises: [strength(slot, 8, 60), strength(other, 8, 60)] }] }], index);
  assert.equal(changed, 1);
  assert.equal(String(blocks[0].sets[0].exercises[0].catalogExerciseId), String(catalog));
  assert.equal(blocks[0].sets[0].exercises[1].catalogExerciseId, undefined);
});

test("the clients' activity only aggregates the Coach's own clients", async () => {
  const organizationId = id();
  const coachId = id();
  const clientId = id();
  let pipeline;
  const restore = [
    stub(OrganizationMember, 'find', () => ({ distinct: async () => [clientId] })),
    stub(WorkoutSession, 'aggregate', async (value) => { pipeline = value; return [{ _id: clientId, lastSessionAt: new Date('2026-11-10T18:00:00Z'), lastRpe: 5, sessionsLast7Days: 2 }]; }),
  ];
  try {
    let body;
    await getCoachClientsActivity(coachRequest({ organizationId, clientId, coachId }), { json: (value) => { body = value; } });
    assert.deepEqual(pipeline[0].$match.user.$in.map(String), [String(clientId)]);
    assert.equal(String(pipeline[0].$match.organizationId), String(organizationId));
    assert.deepEqual(body.clients, [{ clientId: String(clientId), lastSessionAt: new Date('2026-11-10T18:00:00Z'), lastRpe: 5, sessionsLast7Days: 2 }]);
  } finally {
    restore.forEach((undo) => undo());
  }
});
