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
const OrganizationMember = require('../src/models/organization-member.model');
const Document = require('../src/models/document.model');
const Gym = require('../src/models/gym.model');
const Membership = require('../src/models/membership.model');
const MembershipPlan = require('../src/models/membership-plan.model');
const User = require('../src/models/user.model');
const { isWithinSchedule, evaluateAccess } = require('../src/utils/access-rules');
const { activateMembership } = require('../src/utils/membership');
const { createPlan } = require('../src/controllers/plan.controller');
const { registerQrAccess } = require('../src/controllers/access.controller');

const id = () => new mongoose.Types.ObjectId();
const [mainGym, northGym] = [id(), id()];
const MEXICO_CITY = 'America/Mexico_City';
// Mexico City is UTC-6 all year, so 12:00 UTC is 06:00 there.
const at = (utcTime) => new Date(`2026-10-31T${utcTime}:00Z`);

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

// Mongoose queries are chained (select, session, lean) before they resolve.
function query(value) {
  const chain = { select: () => chain, sort: () => chain, session: () => chain, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  return chain;
}

const activeUser = { _id: id(), isActive: true };
const now = at('18:00');
const membership = (rules = {}) => ({
  userId: activeUser._id,
  organizationId: id(),
  homeGymId: mainGym,
  status: 'active',
  startsAt: new Date('2026-10-01T00:00:00Z'),
  expiresAt: new Date('2026-11-30T00:00:00Z'),
  gymAccess: { scope: 'all', gymIds: [] },
  schedule: null,
  requiredDocument: null,
  ...rules,
});
const check = (rules, extra = {}) => evaluateAccess({ user: activeUser, isMember: true, membership: membership(rules), gymId: mainGym, now, ...extra });

test('a daytime schedule lets the client in from the start time until just before the end time', () => {
  const schedule = { startTime: '06:00', endTime: '14:00' };
  assert.equal(isWithinSchedule(schedule, at('11:59'), MEXICO_CITY), false);
  assert.equal(isWithinSchedule(schedule, at('12:00'), MEXICO_CITY), true);
  assert.equal(isWithinSchedule(schedule, at('19:59'), MEXICO_CITY), true);
  assert.equal(isWithinSchedule(schedule, at('20:00'), MEXICO_CITY), false);
});

test('a schedule that crosses midnight lets the client in late at night and early in the morning', () => {
  const schedule = { startTime: '22:00', endTime: '06:00' };
  assert.equal(isWithinSchedule(schedule, at('04:30'), MEXICO_CITY), true); // 22:30
  assert.equal(isWithinSchedule(schedule, at('11:00'), MEXICO_CITY), true); // 05:00
  assert.equal(isWithinSchedule(schedule, at('18:00'), MEXICO_CITY), false); // 12:00
});

test('the schedule is read in the time zone of the gym', () => {
  const schedule = { startTime: '06:00', endTime: '14:00' };
  assert.equal(isWithinSchedule(schedule, at('12:00'), MEXICO_CITY), true);
  assert.equal(isWithinSchedule(schedule, at('12:00'), 'America/Tijuana'), false);
  assert.equal(isWithinSchedule(null, at('03:00'), MEXICO_CITY), true);
});

test('access is checked in order: account, membership, gym, schedule and document', async () => {
  const restore = [
    stub(Gym, 'findById', () => query({ timezone: MEXICO_CITY })),
    stub(Document, 'exists', () => query(null)),
  ];
  try {
    const everyRule = { gymAccess: { scope: 'list', gymIds: [northGym] }, schedule: { startTime: '06:00', endTime: '07:00' }, requiredDocument: 'student_id' };
    assert.equal((await check(everyRule, { user: { isActive: false } })).code, 'account_disabled');
    assert.equal((await check(everyRule, { isMember: false })).code, 'account_disabled');
    assert.equal((await check({ ...everyRule, status: 'expired' })).code, 'membership_inactive');
    assert.equal((await check(everyRule)).code, 'gym_not_included');
    assert.equal((await check({ ...everyRule, gymAccess: { scope: 'all' } })).code, 'outside_schedule');
    assert.equal((await check({ requiredDocument: 'student_id', schedule: { startTime: '06:00', endTime: '14:00' } })).code, 'document_required');
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('the rejection explains the rule that failed', async () => {
  const restore = [
    stub(Gym, 'findById', () => query({ timezone: MEXICO_CITY })),
    stub(Document, 'exists', () => query(null)),
  ];
  try {
    assert.equal((await check({ schedule: { startTime: '18:00', endTime: '22:00' } })).message, 'El plan permite entrar de 18:00 a 22:00.');
    assert.match((await check({ requiredDocument: 'student_id' })).message, /credencial de estudiante/);
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('a client who meets every rule of the plan is let in', async () => {
  let documentFilter;
  const restore = [
    stub(Gym, 'findById', () => query({ timezone: MEXICO_CITY })),
    stub(Document, 'exists', (filter) => { documentFilter = filter; return query({ _id: id() }); }),
  ];
  try {
    const decision = await check({ gymAccess: { scope: 'home' }, schedule: { startTime: '06:00', endTime: '14:00' }, requiredDocument: 'student_id' });
    assert.deepEqual(decision, { allowed: true });
    // Only a verified document that has not expired counts.
    assert.equal(documentFilter.status, 'verified');
    assert.deepEqual(documentFilter.$or[0], { validUntil: null });
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('a membership without schedule or document skips those lookups', async () => {
  const restore = [
    stub(Gym, 'findById', () => { throw new Error('should not look up the gym'); }),
    stub(Document, 'exists', () => { throw new Error('should not look up documents'); }),
  ];
  try {
    assert.deepEqual(await check({}), { allowed: true });
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('selling a plan copies its rules and does not wait for the required document', async () => {
  const organizationId = id();
  const plan = {
    _id: id(),
    gymAccess: { scope: 'home', gymIds: [] },
    schedule: { startTime: '06:00', endTime: '14:00' },
    requiredDocument: 'student_id',
  };
  const sold = { userId: activeUser._id, organizationId, homeGymId: null, save: async () => {} };
  const restore = [
    stub(Membership, 'findOne', () => query(sold)),
    stub(MembershipPlan, 'findOne', () => query(plan)),
    stub(User, 'updateOne', async () => ({})),
    stub(Document, 'exists', () => { throw new Error('the sale should not check documents'); }),
  ];
  try {
    await activateMembership(null, { userId: activeUser._id, organizationId, gymId: mainGym, planId: plan._id, durationDays: 30, planName: 'Estudiante', amount: 300, currency: 'MXN' });
  } finally {
    restore.forEach((undo) => undo());
  }
  assert.equal(sold.status, 'active');
  assert.deepEqual(sold.gymAccess, plan.gymAccess);
  assert.deepEqual(sold.schedule, plan.schedule);
  assert.equal(sold.requiredDocument, 'student_id');
  assert.equal(sold.homeGymId, mainGym);
});

test('a plan keeps the schedule and type it is given, and rejects a schedule that starts and ends at the same time', async () => {
  let created;
  const restore = stub(MembershipPlan, 'create', async (value) => { created = value; return value; });
  const req = (body) => ({ body, tenant: { role: 'Admin', organizationId: id() } });
  const res = { status: () => res, json: () => {} };
  try {
    const body = { name: 'Mañanas', price: 300, durationInDays: 30, planType: 'limited_hours', schedule: JSON.stringify({ startTime: '06:00', endTime: '14:00' }) };
    await createPlan(req(body), res);
    assert.equal(created.planType, 'limited_hours');
    assert.deepEqual(created.schedule, { startTime: '06:00', endTime: '14:00' });

    await createPlan(req({ ...body, schedule: '' }), res);
    assert.equal(created.schedule, null);

    await assert.rejects(createPlan(req({ ...body, schedule: { startTime: '06:00', endTime: '06:00' } }), res));
    await assert.rejects(createPlan(req({ ...body, schedule: { startTime: '6:00', endTime: '14:00' } }), res));
  } finally {
    restore();
  }
});

// Scans a client's QR at mainGym, with the client's last access and membership as given.
async function scan({ lastAccess, membership: clientMembership }) {
  const organizationId = clientMembership.organizationId;
  const qrToken = jwt.sign({ typ: 'gym-access', jti: String(id()), org: String(organizationId) }, env.QR_TOKEN_SECRET, {
    subject: String(activeUser._id), issuer: 'gymgo-api', audience: 'gymgo-iot', expiresIn: 60,
  });
  const created = [];
  const restore = [
    stub(User, 'startSession', async () => ({ withTransaction: (work) => work(), endSession: async () => {} })),
    stub(User, 'findById', () => query({ ...activeUser, id: String(activeUser._id), name: 'Ana' })),
    stub(User, 'updateOne', async () => ({})),
    stub(AccessIoT, 'exists', () => query(null)),
    stub(AccessIoT, 'findOne', () => query(lastAccess)),
    stub(AccessIoT, 'create', async ([access]) => { created.push(access); return [{ ...access, occurredAt: now }]; }),
    stub(OrganizationMember, 'exists', () => query({ _id: id() })),
    stub(Membership, 'findOne', () => query(clientMembership)),
  ];
  let body;
  try {
    const req = { body: { qrToken }, accessPoint: { organizationId, gymId: mainGym, deviceId: id() } };
    await registerQrAccess(req, { status: () => ({ json: (value) => { body = value; } }) });
    return { body, created };
  } finally {
    restore.forEach((undo) => undo());
  }
}

test('a client is let out even when their membership ran out while inside', async () => {
  const expired = membership({ status: 'expired' });
  const { body } = await scan({ membership: expired, lastAccess: { event: 'check-in', organizationId: expired.organizationId, gymId: mainGym } });
  assert.equal(body.access.event, 'check-out');
});

test('an entry the plan does not allow is rejected with the code of the rule', async () => {
  await assert.rejects(scan({ membership: membership({ status: 'expired' }), lastAccess: null }), (error) => {
    assert.equal(error.statusCode, 403);
    assert.deepEqual(error.extra, { code: 'membership_inactive' });
    return true;
  });
});
