const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// auth.controller reads the environment when it loads.
const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';

const StaffInvitation = require('../src/models/staff-invitation.model');
const OrganizationMember = require('../src/models/organization-member.model');
const User = require('../src/models/user.model');
const controller = require('../src/controllers/staff-invitation.controller');
const { belongsOnlyTo, setMemberActive } = require('../src/utils/members');

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

const organizationId = id();
const gymId = id();
const otherGymId = id();
const inviteeId = id();
const email = 'coach@ejemplo.com';

const owner = { roles: ['Propietario'], gyms: [] };
const manager = { roles: [], gyms: [{ gymId, roles: ['Gerente'] }] };

function staffRequest(member, body = {}) {
  return {
    body,
    params: {},
    user: { _id: id(), id: String(id()) },
    tenant: { organizationId, role: 'Admin', gymIds: [gymId], gymId },
    tenantContext: { member },
  };
}

// An invitation document that saves and populates without a database, as populated reads return it.
function invitationDocument(fields = {}) {
  const invitation = new StaffInvitation({ organizationId, gymId, email, roles: ['Coach'], invitedBy: id(), ...fields });
  invitation.save = async () => invitation;
  invitation.populate = async () => invitation;
  populate(invitation, { _id: organizationId, name: 'GymGo Demo', status: 'active' });
  Object.defineProperty(invitation, 'gymId', { value: { _id: gymId, name: 'Principal', isActive: true }, writable: true });
  return invitation;
}

// Plain properties: assigning an object to the document's path would cast it back to an ObjectId.
function populate(invitation, organization) {
  Object.defineProperty(invitation, 'organizationId', { value: organization, writable: true, configurable: true });
}

function memberDocument(fields) {
  const member = new OrganizationMember({ userId: inviteeId, organizationId, ...fields });
  member.save = async () => member;
  return member;
}

// Runs the handler with the database calls it makes answered by `stubs`, and transactions run inline.
async function withStubs(stubs, run) {
  const restore = [
    stub(mongoose, 'startSession', async () => ({ withTransaction: async (work) => work(), endSession: async () => {} })),
    ...stubs,
  ];
  try {
    return await run();
  } finally {
    restore.forEach((undo) => undo());
  }
}

test('inviting answers the same whether the account exists or not', async () => {
  for (const account of [null, { _id: inviteeId }]) {
    let created;
    const result = await withStubs([
      stub(User, 'findOne', () => query(account)),
      stub(OrganizationMember, 'findOne', () => query(null)),
      stub(StaffInvitation, 'findOne', () => query(null)),
      stub(StaffInvitation, 'create', async (fields) => { created = invitationDocument(fields); return created; }),
    ], () => call(controller.createStaffInvitation, staffRequest(owner, { email: 'Coach@Ejemplo.com', roles: ['Coach', 'Recepcion'] })));

    assert.equal(result.status, 201);
    assert.equal(result.body.message, controller.SENT_MESSAGE);
    assert.equal(created.email, email);
    assert.deepEqual([...created.roles], ['Coach', 'Recepcion']);
    assert.equal(String(created.gymId._id), String(gymId));
  }
});

test('people already in the organization change roles from Editar instead', async () => {
  for (const roles of [['Cliente'], ['Propietario']]) {
    const result = await withStubs([
      stub(User, 'findOne', () => query({ _id: inviteeId })),
      stub(OrganizationMember, 'findOne', () => query({ roles, gyms: [] })),
    ], () => call(controller.createStaffInvitation, staffRequest(owner, { email, roles: ['Coach'] })));
    assert.equal(result.error?.statusCode, 409);
  }
});

test('only owners invite managers', async () => {
  const result = await call(controller.createStaffInvitation, staffRequest(manager, { email, roles: ['Gerente'] }));
  assert.equal(result.error?.statusCode, 403);
});

test('a gym outside the request is never invited to', async () => {
  const result = await call(controller.createStaffInvitation, staffRequest(owner, { email, roles: ['Coach'], gymId: String(otherGymId) }));
  assert.equal(result.error?.statusCode, 403);
});

test('one open invitation per email and gym; an expired one is replaced', async () => {
  const open = invitationDocument();
  const conflict = await withStubs([
    stub(User, 'findOne', () => query(null)),
    stub(StaffInvitation, 'findOne', () => query(open)),
  ], () => call(controller.createStaffInvitation, staffRequest(owner, { email, roles: ['Coach'] })));
  assert.equal(conflict.error?.statusCode, 409);

  const stale = invitationDocument({ expiresAt: new Date(Date.now() - DAY) });
  const replaced = await withStubs([
    stub(User, 'findOne', () => query(null)),
    stub(StaffInvitation, 'findOne', () => query(stale)),
    stub(StaffInvitation, 'create', async (fields) => invitationDocument(fields)),
  ], () => call(controller.createStaffInvitation, staffRequest(owner, { email, roles: ['Coach'] })));
  assert.equal(replaced.status, 201);
  assert.equal(stale.status, 'expired');
});

test('managers cannot cancel an invitation for a manager', async () => {
  const invitation = invitationDocument({ roles: ['Gerente'] });
  const req = { ...staffRequest(manager), params: { id: String(invitation._id) } };
  const result = await withStubs([stub(StaffInvitation, 'findOne', () => query(invitation))], () => call(controller.cancelStaffInvitation, req));
  assert.equal(result.error?.statusCode, 403);
  assert.equal(invitation.status, 'pending');
});

function inviteeRequest(invitation) {
  return { params: { id: String(invitation._id) }, body: {}, user: { _id: inviteeId, id: String(inviteeId), email } };
}

test('accepting joins the staff of that gym with the invited roles', async () => {
  const invitation = invitationDocument({ roles: ['Coach', 'Recepcion'] });
  let saved;
  const result = await withStubs([
    stub(StaffInvitation, 'findOne', () => query(invitation)),
    stub(OrganizationMember, 'findOne', () => query(null)),
    stub(OrganizationMember.prototype, 'save', async function save() { saved = this; return this; }),
  ], () => call(controller.acceptStaffInvitation, inviteeRequest(invitation)));

  assert.equal(result.body.invitation.status, 'accepted');
  assert.equal(String(saved.userId), String(inviteeId));
  assert.deepEqual(saved.gyms.map((gym) => [String(gym.gymId), [...gym.roles]]), [[String(gymId), ['Coach', 'Recepcion']]]);
  assert.equal(String(invitation.userId), String(inviteeId));
});

test('active staff keep their other gyms; former staff come back with the invited roles only', async () => {
  const active = memberDocument({ gyms: [{ gymId: otherGymId, roles: ['Coach'] }] });
  const former = memberDocument({ gyms: [{ gymId: otherGymId, roles: ['Gerente'] }], isActive: false });
  for (const [member, expected] of [[active, [String(otherGymId), String(gymId)]], [former, [String(gymId)]]]) {
    const invitation = invitationDocument();
    await withStubs([
      stub(StaffInvitation, 'findOne', () => query(invitation)),
      stub(OrganizationMember, 'findOne', () => query(member)),
    ], () => call(controller.acceptStaffInvitation, inviteeRequest(invitation)));
    assert.deepEqual(member.gyms.map((gym) => String(gym.gymId)), expected);
    assert.equal(member.isActive, true);
  }
});

test('a client of the organization, an expired invitation or a suspended gym cannot be accepted', async () => {
  const cases = [
    [invitationDocument(), memberDocument({ roles: ['Cliente'] })],
    [invitationDocument({ expiresAt: new Date(Date.now() - DAY) }), null],
  ];
  const suspended = invitationDocument();
  populate(suspended, { _id: organizationId, name: 'GymGo Demo', status: 'suspended' });
  cases.push([suspended, null]);

  for (const [invitation, member] of cases) {
    const result = await withStubs([
      stub(StaffInvitation, 'findOne', () => query(invitation)),
      stub(OrganizationMember, 'findOne', () => query(member)),
    ], () => call(controller.acceptStaffInvitation, inviteeRequest(invitation)));
    assert.equal(result.error?.statusCode, 409);
    assert.equal(invitation.status, 'pending');
  }
});

test('the invited person only sees their own pending invitations of available gyms', async () => {
  let filter;
  const suspended = invitationDocument();
  populate(suspended, { _id: id(), name: 'Otra', status: 'suspended' });
  const result = await withStubs([
    stub(StaffInvitation, 'find', (value) => { filter = value; return query([invitationDocument(), suspended]); }),
  ], () => call(controller.listMyStaffInvitations, inviteeRequest(invitationDocument())));
  assert.equal(filter.email, email);
  assert.equal(filter.status, 'pending');
  assert.equal(result.body.invitations.length, 1);
});

test('deactivating someone shared with another organization keeps their account', async () => {
  for (const [elsewhere, accountActive] of [[true, true], [false, false]]) {
    const user = { _id: inviteeId, isActive: true };
    const member = memberDocument({ gyms: [{ gymId, roles: ['Coach'] }] });
    await withStubs([stub(OrganizationMember, 'exists', async () => elsewhere)], async () => {
      await setMemberActive(user, member, false);
    });
    assert.equal(member.isActive, false);
    assert.equal(user.isActive, accountActive);
  }
  await assert.rejects(setMemberActive({ isActive: true }, memberDocument({ roles: ['Propietario'] }), false), (error) => error.statusCode === 409);
});

test('only accounts used in no other organization can have their credentials edited there', async () => {
  const restore = stub(OrganizationMember, 'exists', async () => true);
  try {
    assert.equal(await belongsOnlyTo({ _id: inviteeId }, organizationId), false);
  } finally {
    restore();
  }
  assert.equal(await belongsOnlyTo({ _id: inviteeId, isPlatformAdmin: true }, organizationId), false);
});
