const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// auth.controller reads the environment when it loads.
const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';

const User = require('../src/models/user.model');
const WorkoutSession = require('../src/models/workout-session.model');
const OrganizationMember = require('../src/models/organization-member.model');
const { getClientWorkoutHistory } = require('../src/controllers/workout.controller');
const { updateClientObservations } = require('../src/controllers/user.controller');
const { sessionTenant, notesMember } = require('../scripts/migrate-history-isolation');

const id = () => new mongoose.Types.ObjectId();

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

// A query that supports the chained calls the controllers make and resolves to `value`.
function query(value) {
  const chain = { select: () => chain, populate: () => chain, sort: () => chain, limit: () => chain, lean: async () => value };
  chain.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  return chain;
}

function staffRequest(organizationId, clientId) {
  return {
    params: { clientId: String(clientId), id: String(clientId) },
    user: { id: String(id()), _id: id() },
    tenant: { organizationId, role: 'Admin', gymIds: [id()], gymId: id() },
    tenantContext: { member: { roles: ['Propietario'], gyms: [] } },
  };
}

test('a session belongs to an organization', async () => {
  const session = new WorkoutSession({ user: id(), routine: id(), trainingDay: 1, durationMinutes: 30, blocks: [] });
  await assert.rejects(session.validate(), /organizationId/);
});

test("staff only read the sessions their organization's routines produced", async () => {
  const organizationId = id();
  const clientId = id();
  let sessionFilter;
  const restore = [
    stub(OrganizationMember, 'findOne', () => query({ userId: clientId, organizationId, roles: ['Cliente'], gyms: [] })),
    stub(User, 'findById', () => query({ _id: clientId, assignedCoach: null })),
    stub(WorkoutSession, 'find', (filter) => { sessionFilter = filter; return query([]); }),
  ];
  try {
    let body;
    await getClientWorkoutHistory(staffRequest(organizationId, clientId), { json: (value) => { body = value; } });
    assert.deepEqual(body, { sessions: [] });
    assert.equal(String(sessionFilter.organizationId), String(organizationId));
  } finally {
    restore.forEach((undo) => undo());
  }
});

test("observations are saved on the organization's member, never on the shared account", async () => {
  const organizationId = id();
  const clientId = id();
  const member = { userId: clientId, organizationId, roles: ['Cliente'], gyms: [], observations: '', save: async () => {} };
  let userWrites = 0;
  const restore = [
    stub(OrganizationMember, 'findOne', async () => member),
    stub(User, 'findOne', () => query({ _id: clientId, name: 'Ana', email: 'ana@ejemplo.com' })),
    stub(User, 'findOneAndUpdate', () => { userWrites += 1; return query(null); }),
  ];
  try {
    let body;
    const req = { ...staffRequest(organizationId, clientId), body: { observations: 'Lesión de rodilla' } };
    await updateClientObservations(req, { json: (value) => { body = value; } });
    assert.equal(member.observations, 'Lesión de rodilla');
    assert.equal(body.user.observations, 'Lesión de rodilla');
    assert.equal(userWrites, 0);
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('the shared account no longer carries observations', () => {
  const user = new User({ name: 'Ana', email: 'ana@ejemplo.com', passwordHash: 'x', observations: 'nota' });
  assert.equal('observations' in user.toSafeJSON(), false);
});

test('old sessions take their routine organization and the client home gym there', () => {
  const [organizationId, otherOrganizationId, homeGymId] = [id(), id(), id()];
  const memberships = [{ organizationId: otherOrganizationId, homeGymId: id() }, { organizationId, homeGymId }];
  assert.deepEqual(sessionTenant({ organizationId }, memberships), { organizationId, gymId: homeGymId });
  assert.deepEqual(sessionTenant({ organizationId }, []), { organizationId, gymId: null });
  assert.equal(sessionTenant(null, memberships), null);
});

test('old notes go to the organization the user joined first', () => {
  const first = { _id: id(), createdAt: new Date('2026-01-01') };
  const later = { _id: id(), createdAt: new Date('2026-06-01') };
  assert.equal(notesMember([later, first]), first);
  assert.equal(notesMember([]), null);
});
