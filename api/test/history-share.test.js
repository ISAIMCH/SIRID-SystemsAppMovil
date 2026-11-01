const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// auth.controller reads the environment when it loads.
const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';

const HistoryShare = require('../src/models/history-share.model');
const HistoryAccessLog = require('../src/models/history-access-log.model');
const OrganizationMember = require('../src/models/organization-member.model');
const User = require('../src/models/user.model');
const WorkoutSession = require('../src/models/workout-session.model');
const Routine = require('../src/models/routine.model');
const Organization = require('../src/models/organization.model');
const Gym = require('../src/models/gym.model');
const controller = require('../src/controllers/history-share.controller');

const id = () => new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

// A query that supports the chained calls the controller makes and resolves to `value`.
function query(value) {
  const chain = { select: () => chain, populate: () => chain, sort: () => chain, limit: () => chain, lean: async () => value };
  chain.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  return chain;
}

// Runs a handler and resolves with { error } or { status, body }.
async function call(handler, req) {
  const result = { status: 200 };
  const res = { status(code) { result.status = code; return res; }, json(body) { result.body = body; } };
  try {
    await handler(req, res);
  } catch (error) {
    result.error = error;
  }
  return result;
}

// A share document that saves and populates without a database.
function shareDocument(fields) {
  const share = new HistoryShare({ requestedBy: id(), ...fields });
  share.save = async () => share;
  share.populate = async () => share;
  return share;
}

const organizationId = id();
const gymId = id();
const clientId = id();
const coachId = id();

function staffRequest({ role = 'Admin', body = {}, params = {}, query: requestQuery = {}, gymIds = [gymId] } = {}) {
  return {
    body,
    params,
    query: requestQuery,
    app: { get: () => null },
    user: { id: String(coachId), _id: coachId },
    tenant: { organizationId, role, gymIds, gymId: gymIds[0] },
    tenantContext: { member: { roles: role === 'Admin' ? ['Propietario'] : [], gyms: [] } },
  };
}

function clientMember(assignedCoach = null) {
  return stub(OrganizationMember, 'findOne', async () => ({ userId: clientId, organizationId, roles: ['Cliente'], gyms: [], assignedCoach }));
}

test("a Coach can only ask for the history of their own clients", async () => {
  const restore = clientMember(id());
  try {
    const { error } = await call(controller.requestHistoryShare, staffRequest({ role: 'Coach', body: { clientId: String(clientId) } }));
    assert.equal(error.statusCode, 404);
  } finally {
    restore();
  }
});

test('staff who see several gyms must say which one asks', async () => {
  const restore = clientMember();
  try {
    const { error } = await call(controller.requestHistoryShare, staffRequest({ body: { clientId: String(clientId) }, gymIds: [gymId, id()] }));
    assert.equal(error.statusCode, 400);
  } finally {
    restore();
  }
});

test('a gym never has two open requests for the same client', async () => {
  for (const status of ['pending', 'approved']) {
    const restore = [clientMember(), stub(HistoryShare, 'findOne', async () => shareDocument({ userId: clientId, organizationId, gymId, status }))];
    try {
      const { error } = await call(controller.requestHistoryShare, staffRequest({ body: { clientId: String(clientId) } }));
      assert.equal(error.statusCode, 409);
    } finally {
      restore.forEach((undo) => undo());
    }
  }
});

test('after a rejection or a revocation the gym waits 30 days to ask again', async () => {
  const recent = [
    { status: 'rejected', respondedAt: new Date(Date.now() - 5 * DAY) },
    { status: 'revoked', revokedAt: new Date(Date.now() - 29 * DAY) },
  ];
  for (const fields of recent) {
    const restore = [clientMember(), stub(HistoryShare, 'findOne', async () => shareDocument({ userId: clientId, organizationId, gymId, ...fields }))];
    try {
      const { error } = await call(controller.requestHistoryShare, staffRequest({ body: { clientId: String(clientId) } }));
      assert.equal(error.statusCode, 409);
      assert.equal(error.extra.code, 'history_share_cooldown');
    } finally {
      restore.forEach((undo) => undo());
    }
  }

  const old = shareDocument({ userId: clientId, organizationId, gymId, status: 'rejected', respondedAt: new Date(Date.now() - 31 * DAY), includeSensitive: true });
  const restore = [clientMember(), stub(HistoryShare, 'findOne', async () => old)];
  try {
    const { status, body } = await call(controller.requestHistoryShare, staffRequest({ body: { clientId: String(clientId) } }));
    assert.equal(status, 200);
    assert.equal(body.share.status, 'pending');
    assert.equal(body.share.includeSensitive, false);
  } finally {
    restore.forEach((undo) => undo());
  }
});

function historyStubs(share, logs) {
  return [
    clientMember(),
    stub(HistoryShare, 'findOne', () => query(share)),
    stub(User, 'findById', () => query({ _id: clientId, name: 'Ana', weightKg: 60, heightCm: 165, restrictions: 'Rodilla' })),
    stub(WorkoutSession, 'find', () => query([{ _id: id(), user: clientId, organizationId: id(), gymId: id(), routineTitle: 'Fuerza', blocks: [] }])),
    stub(Routine, 'find', () => query([])),
    stub(Organization, 'find', () => query([])),
    stub(Gym, 'find', () => query([])),
    stub(HistoryAccessLog, 'create', async (entry) => { logs.push(entry); }),
  ];
}

test('nothing is shared until the client approves', async () => {
  const share = { _id: id(), userId: clientId, organizationId, gymId: { _id: gymId, name: 'Centro' }, status: 'revoked' };
  const logs = [];
  const restore = historyStubs(share, logs);
  try {
    const { error } = await call(controller.getSharedHistory, staffRequest({ params: { id: String(share._id) } }));
    assert.equal(error.statusCode, 403);
    assert.equal(logs.length, 0);
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('sensitive data needs its own consent, and every read is logged', async () => {
  for (const includeSensitive of [false, true]) {
    const share = { _id: id(), userId: clientId, organizationId, gymId: { _id: gymId, name: 'Centro' }, status: 'approved', includeSensitive };
    const logs = [];
    const restore = historyStubs(share, logs);
    try {
      const { body } = await call(controller.getSharedHistory, staffRequest({ params: { id: String(share._id) } }));
      assert.equal(body.workouts.length, 1);
      assert.deepEqual(body.sensitive, includeSensitive ? { weightKg: 60, heightCm: 165, restrictions: 'Rodilla' } : null);
      assert.equal(logs.length, 1);
      assert.equal(String(logs[0].viewerId), String(coachId));
      assert.deepEqual(logs[0].sections, includeSensitive ? ['workouts', 'routines', 'sensitive'] : ['workouts', 'routines']);
    } finally {
      restore.forEach((undo) => undo());
    }
  }
});

function clientRequest(shareId, body = {}) {
  return { params: { id: String(shareId) }, body, app: { get: () => null }, user: { id: String(clientId), _id: clientId } };
}

test('the client approves without sensitive data unless they tick it', async () => {
  const share = shareDocument({ userId: clientId, organizationId, gymId, status: 'pending' });
  const restore = stub(HistoryShare, 'findOne', async (filter) => (String(filter.userId) === String(clientId) ? share : null));
  try {
    const { body } = await call(controller.approveHistoryShare, clientRequest(share._id));
    assert.equal(body.share.status, 'approved');
    assert.equal(body.share.includeSensitive, false);
    const again = await call(controller.approveHistoryShare, clientRequest(share._id, { includeSensitive: true }));
    assert.equal(again.error.statusCode, 409);
  } finally {
    restore();
  }
});

test('revoking ends the access and drops the sensitive consent', async () => {
  const share = shareDocument({ userId: clientId, organizationId, gymId, status: 'approved', includeSensitive: true });
  const restore = stub(HistoryShare, 'findOne', async () => share);
  try {
    const { body } = await call(controller.revokeHistoryShare, clientRequest(share._id));
    assert.equal(body.share.status, 'revoked');
    assert.equal(body.share.includeSensitive, false);
    assert.ok(share.revokedAt);
    const update = await call(controller.updateHistoryShare, clientRequest(share._id, { includeSensitive: true }));
    assert.equal(update.error.statusCode, 409);
  } finally {
    restore();
  }
});
