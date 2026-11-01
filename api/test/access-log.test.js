const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// The controllers read the environment when they load.
const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';

const env = require('../src/config/env');
const AccessIoT = require('../src/models/access-iot.model');
const Gym = require('../src/models/gym.model');
const Membership = require('../src/models/membership.model');
const OrganizationMember = require('../src/models/organization-member.model');
const User = require('../src/models/user.model');
const { gymTimezoneExpression, isTimeZone } = require('../src/utils/timezone');
const { gymPeriodStarts } = require('../src/controllers/analytics.controller');
const { dateRangeFilter, getOccupancy } = require('../src/controllers/access-log.controller');
const { registerQrAccess } = require('../src/controllers/access.controller');

const id = () => new mongoose.Types.ObjectId();

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

// A mongoose query stand-in: chainable, awaitable and lean() resolving to `value`.
function query(value) {
  const chain = {
    sort: () => chain,
    select: () => chain,
    session: () => chain,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return chain;
}

test('only IANA time zone names are accepted for a gym', () => {
  assert.equal(isTimeZone('America/Mexico_City'), true);
  assert.equal(isTimeZone('America/Tijuana'), true);
  assert.equal(isTimeZone('Hora del centro'), false);
});

test('each gym counts today and the week from its own local midnight', () => {
  const [mexico, tijuana] = [{ _id: id(), timezone: 'America/Mexico_City' }, { _id: id(), timezone: 'America/Tijuana' }];
  // 2026-11-02 03:00 UTC is still November 1st in both gyms.
  const now = new Date('2026-11-02T03:00:00Z');
  const [mexicoDay, tijuanaDay] = gymPeriodStarts([mexico, tijuana], 1, now);
  assert.equal(mexicoDay.todayStart.toISOString(), '2026-11-01T06:00:00.000Z');
  // Tijuana leaves daylight saving time at 02:00 that day, so its midnight is still UTC-7.
  assert.equal(tijuanaDay.todayStart.toISOString(), '2026-11-01T07:00:00.000Z');
  assert.equal(mexicoDay.periodStart.toISOString(), mexicoDay.todayStart.toISOString());

  const [mexicoWeek] = gymPeriodStarts([mexico], 7, now);
  assert.equal(mexicoWeek.periodStart.toISOString(), '2026-10-26T06:00:00.000Z');
});

test('aggregations read each event in the time zone of its gym', () => {
  const gyms = [{ _id: id(), timezone: 'America/Mexico_City' }, { _id: id(), timezone: 'America/Cancun' }];
  const expression = gymTimezoneExpression(gyms);
  assert.deepEqual(expression.$switch.branches.map((branch) => branch.then), ['America/Mexico_City', 'America/Cancun']);
  assert.equal(gymTimezoneExpression([]), 'UTC');
});

test('log dates are whole local days of each gym, the end date included', () => {
  const gym = { _id: id(), timezone: 'America/Mexico_City' };
  const filter = dateRangeFilter([gym], '2026-11-01', '2026-11-01');
  assert.equal(filter.$or[0].occurredAt.$gte.toISOString(), '2026-11-01T06:00:00.000Z');
  assert.equal(filter.$or[0].occurredAt.$lt.toISOString(), '2026-11-02T06:00:00.000Z');
  assert.deepEqual(dateRangeFilter([gym]), { gymId: { $in: [gym._id] } });
});

test('a refused entry is written to the access log and sent live to the gym staff', async () => {
  const [organizationId, gymId, clientId] = [id(), id(), id()];
  const qrToken = jwt.sign({ typ: 'gym-access', jti: String(id()), org: String(organizationId) }, env.QR_TOKEN_SECRET, {
    subject: String(clientId), issuer: 'gymgo-api', audience: 'gymgo-iot', expiresIn: 60,
  });
  const created = [];
  const emitted = [];
  const restores = [
    stub(User, 'startSession', async () => ({ withTransaction: async (work) => work(), endSession: async () => {} })),
    stub(User, 'findById', () => query({ _id: clientId, id: String(clientId), name: 'Ana', isActive: true })),
    stub(AccessIoT, 'exists', () => query(null)),
    stub(AccessIoT, 'findOne', () => query(null)),
    stub(OrganizationMember, 'exists', () => query({ _id: id() })),
    stub(Membership, 'findOne', () => query({ status: 'expired' })),
    stub(AccessIoT, 'create', async (doc) => {
      created.push(doc);
      return { ...doc, _id: id(), occurredAt: new Date() };
    }),
  ];
  const io = { to: (rooms) => ({ emit: (event, payload) => emitted.push({ rooms, event, payload }) }) };
  const req = {
    body: { qrToken },
    accessPoint: { organizationId, gymId, deviceId: id(), deviceName: 'Torniquete 1' },
    app: { get: () => io },
  };

  let error;
  try {
    await registerQrAccess(req, {});
  } catch (caught) {
    error = caught;
  } finally {
    restores.forEach((restore) => restore());
  }

  assert.equal(error.statusCode, 403);
  assert.equal(created.length, 1);
  assert.equal(created[0].event, 'denied');
  assert.equal(created[0].reason.code, 'membership_inactive');
  assert.equal(created[0].qrJti, undefined);
  assert.equal(emitted[0].event, 'access:recorded');
  assert.equal(emitted[0].payload.event, 'denied');
  assert.ok(emitted[0].rooms.includes(`gym:${gymId}:reception`));
});

test('the capacity monitor lists who is inside each gym against its capacity', async () => {
  const organizationId = id();
  const [north, south] = [{ _id: id(), name: 'Norte', timezone: 'America/Mexico_City', capacity: 50 }, { _id: id(), name: 'Sur', timezone: 'America/Mexico_City' }];
  const [ana, luis, gone] = [id(), id(), id()];
  const restores = [
    stub(Gym, 'find', () => query([north, south])),
    stub(AccessIoT, 'aggregate', async () => [
      { _id: ana, event: 'check-in', gymId: north._id, since: new Date('2026-11-01T15:00:00Z') },
      { _id: luis, event: 'check-in', gymId: north._id, since: new Date('2026-11-01T16:00:00Z') },
      { _id: gone, event: 'check-in', gymId: south._id, since: new Date('2026-11-01T10:00:00Z') },
    ]),
    // `gone` is no longer marked inside (or their account was deactivated).
    stub(User, 'find', () => query([{ _id: ana, name: 'Ana' }, { _id: luis, name: 'Luis', lastName: 'Pérez' }])),
  ];
  let body;
  try {
    await getOccupancy({ tenant: { organizationId, gymIds: [north._id, south._id] } }, { json: (value) => { body = value; } });
  } finally {
    restores.forEach((restore) => restore());
  }

  assert.deepEqual(body.gyms.map((gym) => [gym.name, gym.count, gym.capacity]), [['Norte', 2, 50], ['Sur', 0, null]]);
  assert.deepEqual(body.gyms[0].people.map((person) => person.name), ['Luis Pérez', 'Ana']);
});
