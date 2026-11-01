const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// auth.controller reads the environment when it loads.
const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';

const User = require('../src/models/user.model');
const Gym = require('../src/models/gym.model');
const Membership = require('../src/models/membership.model');
const OrganizationMember = require('../src/models/organization-member.model');
const controller = require('../src/controllers/client-enrollment.controller');
const Organization = require('../src/models/organization.model');
const { login } = require('../src/controllers/auth.controller');
const { createActivation, isActivationUsable, MAX_FAILED_ATTEMPTS } = require('../src/utils/client-activation');

const id = () => new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

// A query that supports the chained calls the controller makes and resolves to `value`.
function query(value) {
  const chain = { select: () => chain, populate: () => chain, sort: () => chain, session: () => chain, lean: async () => value };
  chain.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  return chain;
}

async function call(handler, req) {
  const result = { status: 200 };
  const res = { status(code) { result.status = code; return res; }, json(body) { result.body = body; }, end() {} };
  try {
    await handler(req, res);
  } catch (error) {
    result.error = error;
  }
  return result;
}

const organizationId = id();
const gymId = id();
const gym = { _id: gymId, organizationId, name: 'Principal', isActive: true };
const body = { name: 'Ana López', email: 'ana@ejemplo.com', phone: '55 1234 5678' };

function receptionRequest(fields = body) {
  const emitted = [];
  const io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
  return {
    body: fields,
    params: {},
    user: { _id: id(), id: String(id()) },
    tenant: { organizationId, role: 'Recepcion', gymIds: [gymId], gymId },
    tenantContext: { member: { roles: [], gyms: [{ gymId, roles: ['Recepcion'] }] } },
    app: { get: () => io },
    emitted,
  };
}

// Stubs the database for an enrollment; `existing` is the account with that email, `member` its membership here.
function stubEnrollment({ existing = null, member = null } = {}) {
  const writes = { created: [], memberUpdates: [], userUpdates: [], saved: [] };
  const restore = [
    stub(mongoose, 'startSession', async () => ({ withTransaction: (work) => work(), endSession: async () => {} })),
    stub(Gym, 'findOne', () => query(gym)),
    stub(User, 'findOne', () => query(existing)),
    stub(User, 'findById', (userId) => query({ _id: userId, name: 'Ana', email: body.email, pendingActivation: !existing })),
    stub(User, 'updateOne', async (filter, update) => { writes.userUpdates.push(update); }),
    stub(User.prototype, 'save', async function save() { writes.saved.push(this); return this; }),
    stub(OrganizationMember, 'findOne', () => query(member)),
    stub(OrganizationMember, 'exists', async () => null),
    stub(OrganizationMember, 'create', async (docs) => { writes.created.push(...docs); }),
    stub(OrganizationMember, 'updateOne', async (filter, update) => { writes.memberUpdates.push(update); }),
    stub(Membership, 'findOne', () => query(null)),
    stub(Membership, 'create', async (docs) => { writes.created.push(...docs); }),
    stub(Membership, 'find', () => query([])),
  ];
  return { writes, restore: () => restore.forEach((undo) => undo()) };
}

test('reception registers a new client with name, email and phone and gets a one-time activation code', async () => {
  const { writes, restore } = stubEnrollment();
  try {
    const req = receptionRequest();
    const result = await call(controller.enrollClient, req);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 201);
    assert.equal(result.body.linkedExisting, false);
    assert.match(result.body.activation.code, /^[A-Z2-9]{8}$/);
    assert.ok(new Date(result.body.activation.expiresAt) > new Date(Date.now() + 29 * DAY));

    const [user] = writes.saved;
    assert.equal(user.phone, '5512345678');
    assert.equal(user.pendingActivation, true);
    assert.notEqual(user.activation.codeHash, result.body.activation.code);
    // Client of the organization with a pending membership at the gym, ready for a payment.
    assert.deepEqual(writes.created.map((doc) => doc.roles ?? doc.status), [['Cliente'], 'pending']);
    assert.equal(String(writes.created[1].homeGymId), String(gymId));
  } finally {
    restore();
  }
});

test('phone is required to register a client at reception', async () => {
  const { restore } = stubEnrollment();
  try {
    const result = await call(controller.enrollClient, receptionRequest({ name: 'Ana', email: 'ana@ejemplo.com' }));
    assert.equal(result.error?.name, 'ZodError');
  } finally {
    restore();
  }
});

test('an existing GymGo account is linked as a client and its holder gets a notice, not a code', async () => {
  const existing = { _id: id(), email: body.email, pendingActivation: false };
  const { writes, restore } = stubEnrollment({ existing });
  try {
    const req = receptionRequest();
    const result = await call(controller.enrollClient, req);
    assert.equal(result.status, 201);
    assert.equal(result.body.linkedExisting, true);
    assert.equal(result.body.activation, null);
    assert.equal(String(writes.memberUpdates[0].$set.enrollmentNotice.gymId), String(gymId));
    assert.deepEqual(req.emitted.map(({ room, event }) => [room, event]), [[`user:${existing._id}`, 'client-enrollment:created']]);
  } finally {
    restore();
  }
});

test('an account another gym opened and nobody activated gets a new code instead of a notice', async () => {
  const existing = { _id: id(), email: body.email, pendingActivation: true };
  const { writes, restore } = stubEnrollment({ existing });
  try {
    const req = receptionRequest();
    const result = await call(controller.enrollClient, req);
    assert.equal(result.status, 201);
    assert.match(result.body.activation.code, /^[A-Z2-9]{8}$/);
    assert.ok(writes.userUpdates[0].$set.activation.codeHash);
    assert.equal(writes.memberUpdates.length, 0);
    assert.equal(req.emitted.length, 0);
  } finally {
    restore();
  }
});

test('a client of the gym is returned as is; staff and deactivated accounts are refused', async () => {
  const existing = { _id: id(), email: body.email };
  let stubs = stubEnrollment({ existing, member: { userId: existing._id, roles: ['Cliente'], gyms: [], isActive: true } });
  try {
    const result = await call(controller.enrollClient, receptionRequest());
    assert.equal(result.status, 200);
    assert.equal(result.body.alreadyClient, true);
  } finally {
    stubs.restore();
  }

  stubs = stubEnrollment({ existing, member: { userId: existing._id, roles: [], gyms: [{ gymId, roles: ['Coach'] }], isActive: true } });
  try {
    const result = await call(controller.enrollClient, receptionRequest());
    assert.equal(result.error.statusCode, 409);
    assert.match(result.error.message, /staff/);
  } finally {
    stubs.restore();
  }

  stubs = stubEnrollment({ existing, member: { userId: existing._id, roles: ['Cliente'], gyms: [], isActive: false } });
  try {
    const result = await call(controller.enrollClient, receptionRequest());
    assert.equal(result.error.statusCode, 409);
    assert.match(result.error.message, /desactivada/);
  } finally {
    stubs.restore();
  }
});

// A user document with an activation code, as findOne(...).select('+activation') returns it.
async function pendingUser(activationFields = {}) {
  const { code, activation } = await createActivation();
  const user = new User({ name: 'Ana', email: body.email, role: 'Cliente', pendingActivation: true, activation: { ...activation, ...activationFields } });
  await user.setPassword('contraseña-aleatoria');
  user.save = async () => user;
  return { user, code };
}

test('the client activates the account with the code and a password of their own, then signs in', async () => {
  const { user, code } = await pendingUser();
  const increments = [];
  const restore = [
    stub(User, 'findOne', () => query(user)),
    stub(User, 'updateOne', async (filter, update) => { increments.push(update); }),
    // The session of an account that belongs to no gym yet.
    stub(OrganizationMember, 'find', () => query([])),
    stub(Organization, 'find', () => query([])),
    stub(Gym, 'find', () => query([])),
  ];
  let result;
  try {
    const wrong = await call(controller.activateAccount, { body: { email: body.email, code: 'AAAAAAAA', password: 'mi-clave-segura' } });
    assert.equal(wrong.error.statusCode, 400);
    assert.deepEqual(increments, [{ $inc: { 'activation.failedAttempts': 1 } }]);

    // Typed in lowercase with a dash, as read from the printed code.
    const typed = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
    result = await call(controller.activateAccount, { body: { email: body.email, code: typed, password: 'mi-clave-segura' } });
  } finally {
    restore.forEach((undo) => undo());
  }
  assert.equal(result.error, undefined);
  assert.ok(result.body.token);
  assert.equal(user.pendingActivation, false);
  assert.equal(user.activation, null);
  assert.equal(await user.verifyPassword('mi-clave-segura'), true);
});

test('an expired code or one with too many wrong attempts no longer works', async () => {
  assert.equal(isActivationUsable({ expiresAt: new Date(Date.now() + DAY), failedAttempts: 0 }), true);
  assert.equal(isActivationUsable({ expiresAt: new Date(Date.now() - 1000), failedAttempts: 0 }), false);
  assert.equal(isActivationUsable({ expiresAt: new Date(Date.now() + DAY), failedAttempts: MAX_FAILED_ATTEMPTS }), false);

  const { user, code } = await pendingUser({ failedAttempts: MAX_FAILED_ATTEMPTS });
  const restore = stub(User, 'findOne', () => query(user));
  try {
    const result = await call(controller.activateAccount, { body: { email: body.email, code, password: 'mi-clave-segura' } });
    assert.equal(result.error.extra.code, 'activation_code_expired');
    assert.equal(user.pendingActivation, true);
  } finally {
    restore();
  }
});

test('an account waiting for activation is told so at login instead of a wrong-password error', async () => {
  const { user } = await pendingUser();
  const restore = stub(User, 'findOne', () => query(user));
  try {
    const result = await call(login, { body: { email: body.email, password: 'cualquier-clave' } });
    assert.equal(result.error.statusCode, 403);
    assert.equal(result.error.extra.code, 'account_pending_activation');
  } finally {
    restore();
  }
});
