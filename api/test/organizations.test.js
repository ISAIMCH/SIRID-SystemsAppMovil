const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// auth.controller reads the environment when it loads.
const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';

const User = require('../src/models/user.model');
const Organization = require('../src/models/organization.model');
const OrganizationMember = require('../src/models/organization-member.model');
const Gym = require('../src/models/gym.model');
const { organizationInactiveError } = require('../src/utils/tenant');
const { errorHandler } = require('../src/middlewares/error.middleware');
const { requirePlatformAdmin } = require('../src/middlewares/auth.middleware');
const { signupSchema, slugify, signupOwner } = require('../src/controllers/organization.controller');
const { STATUS_TRANSITIONS, updateOrganizationStatus } = require('../src/controllers/platform.controller');
const { createGym } = require('../src/controllers/gym.controller');

const id = () => new mongoose.Types.ObjectId();

// Runs a middleware or handler and resolves with the error it passes on or throws (undefined if none).
function run(handler, req, res = {}) {
  return new Promise((resolve) => {
    Promise.resolve(handler(req, res, resolve)).then(() => resolve()).catch(resolve);
  });
}

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

const signup = {
  name: 'Ana',
  email: 'Ana@Ejemplo.com',
  password: 'contrasena-segura',
  phone: '55 1234 5678',
  organizationName: 'Fuerza Total',
  gymName: 'Centro',
};

test('an owner signs up without fiscal data, but needs a phone SIRID can call', () => {
  const input = signupSchema.parse({ ...signup, rfc: '', legalName: '' });
  assert.equal(input.email, 'ana@ejemplo.com');
  assert.equal(input.phone, '5512345678');
  assert.equal(input.rfc, undefined);
  assert.equal(input.legalName, undefined);
  assert.equal(input.timezone, 'America/Mexico_City');

  assert.throws(() => signupSchema.parse({ ...signup, phone: undefined }));
});

test('a given RFC must be valid and is stored in uppercase', () => {
  assert.equal(signupSchema.parse({ ...signup, rfc: 'ftc010101ab1' }).rfc, 'FTC010101AB1');
  assert.throws(() => signupSchema.parse({ ...signup, rfc: '123' }), /RFC/);
});

test('organization slugs drop accents and symbols', () => {
  assert.equal(slugify('  Músculo & Fuerza Ñandú '), 'musculo-fuerza-nandu');
  assert.equal(slugify('***'), 'gimnasio');
});

test('organizations allow 3 gyms unless SIRID changes the limit', () => {
  assert.equal(new Organization({ name: 'X', slug: 'x' }).gymLimit, 3);
  assert.equal(new Organization({ name: 'X', slug: 'x' }).status, 'pending');
});

test('an organization that is not active tells the login screen why, with no data of its own', () => {
  const organization = { _id: id(), name: 'Fuerza Total', status: 'rejected', statusReason: 'Datos incompletos' };
  const error = organizationInactiveError(organization, { includeReason: true });
  assert.equal(error.statusCode, 403);
  assert.equal(error.extra.code, 'organization_rejected');
  assert.deepEqual(error.extra.organization, { id: String(organization._id), name: 'Fuerza Total', status: 'rejected', reason: 'Datos incompletos' });
  assert.equal(organizationInactiveError({ ...organization, status: 'pending', statusReason: null }).extra.code, 'organization_pending');

  let body;
  const res = { headersSent: false, status() { return this; }, json(value) { body = value; } };
  errorHandler(error, {}, res, () => {});
  assert.equal(body.code, 'organization_rejected');
  assert.match(body.error, /rechazó/);
});

test("SIRID's reason reaches the owner, never the organization's clients or staff", () => {
  const organization = { _id: id(), name: 'Fuerza Total', status: 'suspended', statusReason: 'Falta de pago' };
  assert.equal(organizationInactiveError(organization).extra.organization.reason, null);
  assert.equal(organizationInactiveError(organization, { includeReason: true }).extra.organization.reason, 'Falta de pago');
});

test('only SIRID staff reach the platform panel', async () => {
  assert.equal((await run(requirePlatformAdmin, { user: { isPlatformAdmin: false } })).statusCode, 403);
  assert.equal(await run(requirePlatformAdmin, { user: { isPlatformAdmin: true } }), undefined);
});

test('SIRID approves or rejects pending requests and suspends or reactivates active ones', () => {
  assert.deepEqual(STATUS_TRANSITIONS.pending, ['active', 'rejected']);
  assert.deepEqual(STATUS_TRANSITIONS.active, ['suspended']);
  assert.deepEqual(STATUS_TRANSITIONS.suspended, ['active']);
  assert.deepEqual(STATUS_TRANSITIONS.rejected, []);
});

test('rejecting needs a reason and an invalid transition is refused', async () => {
  const noReason = await run(updateOrganizationStatus, { params: { id: String(id()) }, body: { status: 'rejected' } });
  assert.equal(noReason.name, 'ZodError');

  const organization = new Organization({ name: 'X', slug: 'x', status: 'rejected' });
  const restore = stub(Organization, 'findById', async () => organization);
  try {
    const error = await run(updateOrganizationStatus, { params: { id: String(organization._id) }, body: { status: 'active' } });
    assert.equal(error.statusCode, 409);
  } finally {
    restore();
  }
});

function gymRequest(member) {
  const organizationId = id();
  return {
    body: { name: 'Norte' },
    user: { _id: id() },
    tenantContext: { member: { roles: [], gyms: [], ...member } },
    tenant: { organizationId, role: 'Admin', gymIds: [id()], gymId: id() },
  };
}

test('a manager cannot open gyms; only the owner can', async () => {
  const error = await run(createGym, gymRequest({ gyms: [{ gymId: id(), roles: ['Gerente'] }] }));
  assert.equal(error.statusCode, 403);
});

test('the owner cannot open more gyms than the organization allows', async () => {
  const lean = (value) => ({ select() { return this; }, lean: async () => value });
  const restore = [
    stub(Organization, 'findById', () => lean({ gymLimit: 3 })),
    stub(Gym, 'countDocuments', async () => 3),
  ];
  try {
    const error = await run(createGym, gymRequest({ roles: ['Propietario'] }));
    assert.equal(error.statusCode, 409);
    assert.equal(error.extra.code, 'gym_limit_reached');
  } finally {
    restore.forEach((undo) => undo());
  }
});

function existingAccount(password) {
  const user = { _id: id(), isActive: true, passwordHash: bcrypt.hashSync(password, 4) };
  return stub(User, 'findOne', () => ({ select: async () => user }));
}

test('an existing account signs up as owner only with its own password', async () => {
  const restore = existingAccount('otra-contrasena-1');
  try {
    const error = await run(signupOwner, { body: signup });
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /contraseña/);
  } finally {
    restore();
  }
});

test('an owner with a request under review cannot send another one', async () => {
  const restore = [
    existingAccount(signup.password),
    stub(OrganizationMember, 'find', () => ({ populate: () => ({ lean: async () => [{ organizationId: { _id: id(), status: 'pending' } }] }) })),
  ];
  try {
    const error = await run(signupOwner, { body: signup });
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /revisión/);
  } finally {
    restore.forEach((undo) => undo());
  }
});
