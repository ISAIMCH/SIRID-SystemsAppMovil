const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// auth.controller reads the environment when it loads.
const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'IOT_DEVICE_API_KEY', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';

const HttpError = require('../src/utils/http-error');
const { resolveAccess, legacyRole, platformMember, resolveTargetGym, gymFilter, organizationFilter } = require('../src/utils/tenant');
const { canSeeMember } = require('../src/utils/members');
const { emitRealtime, emitToStaff } = require('../src/utils/realtime');
const { authorize } = require('../src/middlewares/auth.middleware');
const { applyLegacyRole } = require('../src/controllers/auth.controller');
const { withStock } = require('../src/controllers/store.controller');
const { resolveOrderOwnership } = require('../src/controllers/store-order.controller');
const ProductStock = require('../src/models/product-stock.model');

const id = () => new mongoose.Types.ObjectId();
const organizationId = id();
const [mainGym, northGym] = [{ _id: id(), name: 'Principal' }, { _id: id(), name: 'Norte' }];
const gyms = [mainGym, northGym];

function context(member, { homeGymId = null, requestedGymId = null } = {}) {
  return { organizationId, gyms, homeGymId, requestedGymId, member: { roles: [], gyms: [], ...member } };
}

const sameIds = (actual, expected) => assert.deepEqual(actual.map(String), expected.map(String));

test('an owner without a selected gym reads every gym and writes to the main one', () => {
  const access = resolveAccess(context({ roles: ['Propietario'] }), ['Admin']);
  assert.equal(access.role, 'Admin');
  sameIds(access.gymIds, [mainGym._id, northGym._id]);
  assert.equal(String(access.gymId), String(mainGym._id));
  assert.equal(access.allGyms, true);
});

test('SIRID staff act as owners of the organization they work in', () => {
  const staff = { _id: id(), isPlatformAdmin: true };
  const member = platformMember(staff, organizationId);
  assert.equal(legacyRole(member), 'Admin');
  const access = resolveAccess({ ...context(member), member }, ['Admin'], northGym._id);
  assert.equal(access.role, 'Admin');
  sameIds(access.gymIds, [northGym._id]);
});

test('a selected gym narrows the request to that gym', () => {
  const access = resolveAccess(context({ roles: ['Propietario'] }), ['Admin'], northGym._id);
  sameIds(access.gymIds, [northGym._id]);
  assert.equal(access.allGyms, false);
});

test('a gym outside the organization is never granted', () => {
  assert.equal(resolveAccess(context({ roles: ['Propietario'] }), ['Admin'], id()), null);
});

test('mixed roles only act with the matched role in the gyms where it is held', () => {
  const member = { gyms: [{ gymId: mainGym._id, roles: ['Gerente'] }, { gymId: northGym._id, roles: ['Coach'] }] };

  const asManager = resolveAccess(context(member), ['Admin', 'Coach']);
  assert.equal(asManager.role, 'Admin');
  sameIds(asManager.gymIds, [mainGym._id]);

  const asCoach = resolveAccess(context(member), ['Admin', 'Coach'], northGym._id);
  assert.equal(asCoach.role, 'Coach');
  assert.equal(resolveAccess(context(member), ['Admin'], northGym._id), null);
});

test('reception cannot use Admin routes and works only in its gym', () => {
  const member = { gyms: [{ gymId: northGym._id, roles: ['Recepcion'] }] };
  assert.equal(resolveAccess(context(member), ['Admin']), null);
  const access = resolveAccess(context(member), ['Admin', 'Recepcion']);
  assert.equal(access.role, 'Recepcion');
  sameIds(access.gymIds, [northGym._id]);
});

test('a client works with their home gym unless another gym is selected', () => {
  const member = { roles: ['Cliente'] };
  const home = resolveAccess(context(member, { homeGymId: northGym._id }), ['Cliente']);
  sameIds(home.gymIds, [northGym._id]);
  assert.equal(home.allGyms, false);

  const selected = resolveAccess(context(member, { homeGymId: northGym._id }), ['Cliente'], mainGym._id);
  sameIds(selected.gymIds, [mainGym._id]);
});

test('the legacy role keeps the values the dashboard and the app know', () => {
  assert.equal(legacyRole({ roles: ['Propietario'], gyms: [] }), 'Admin');
  assert.equal(legacyRole({ roles: [], gyms: [{ gymId: mainGym._id, roles: ['Gerente'] }] }), 'Admin');
  assert.equal(legacyRole({ roles: ['Cliente'], gyms: [{ gymId: mainGym._id, roles: ['Coach', 'Recepcion'] }] }), 'Coach');
  assert.equal(legacyRole({ roles: [], gyms: [{ gymId: mainGym._id, roles: ['Recepcion'] }] }), 'Recepcion');
  assert.equal(legacyRole({ roles: ['Cliente'], gyms: [] }), 'Cliente');
});

test('writes go to a named gym only when the request can see it', () => {
  const req = { tenant: resolveAccess(context({ gyms: [{ gymId: mainGym._id, roles: ['Gerente'] }] }), ['Admin']) };
  assert.equal(String(resolveTargetGym(req)), String(mainGym._id));
  assert.equal(String(resolveTargetGym(req, String(mainGym._id))), String(mainGym._id));
  assert.throws(() => resolveTargetGym(req, String(northGym._id)), (error) => error instanceof HttpError && error.statusCode === 403);
});

test('filters carry the organization and the visible gyms', () => {
  const req = { tenant: resolveAccess(context({ roles: ['Propietario'] }), ['Admin'], northGym._id) };
  assert.deepEqual(organizationFilter(req), { organizationId });
  assert.deepEqual(gymFilter(req), { organizationId, gymId: { $in: [northGym._id] } });
  assert.throws(() => gymFilter({}), (error) => error instanceof HttpError && error.statusCode === 403);
});

test('managers see clients and the staff of their gyms, but not owners', () => {
  const managerContext = context({ gyms: [{ gymId: mainGym._id, roles: ['Gerente'] }] });
  const req = { tenantContext: managerContext, tenant: resolveAccess(managerContext, ['Admin']) };
  assert.equal(canSeeMember(req, { roles: ['Cliente'], gyms: [] }), true);
  assert.equal(canSeeMember(req, { roles: [], gyms: [{ gymId: mainGym._id, roles: ['Coach'] }] }), true);
  assert.equal(canSeeMember(req, { roles: [], gyms: [{ gymId: northGym._id, roles: ['Coach'] }] }), false);
  assert.equal(canSeeMember(req, { roles: ['Propietario'], gyms: [] }), false);
});

test('legacy role changes edit the member in one gym and never touch owners', () => {
  const member = { roles: ['Cliente'], gyms: [{ gymId: northGym._id, roles: ['Coach'] }] };
  applyLegacyRole(member, 'Admin', mainGym._id);
  assert.deepEqual(member.roles, []);
  assert.deepEqual(member.gyms.map((gym) => [String(gym.gymId), gym.roles]), [
    [String(northGym._id), ['Coach']],
    [String(mainGym._id), ['Gerente']],
  ]);

  applyLegacyRole(member, 'Cliente', mainGym._id);
  assert.deepEqual(member, { roles: ['Cliente'], gyms: [] });

  assert.throws(() => applyLegacyRole({ roles: ['Propietario'], gyms: [] }, 'Coach', mainGym._id), (error) => error.statusCode === 409);
});

test('product stock is reported for the request gym and for every visible gym', () => {
  const product = { _id: id(), name: 'Creatina' };
  const tenant = resolveAccess(context({ roles: ['Propietario'] }), ['Admin']);
  const stocks = [
    { productId: product._id, gymId: mainGym._id, quantity: 4 },
    { productId: id(), gymId: northGym._id, quantity: 9 },
  ];
  const serialized = withStock(product, stocks, tenant);
  assert.equal(serialized.stock, 4);
  assert.deepEqual(serialized.stockByGym.map((item) => [String(item.gymId), item.quantity]), [
    [String(mainGym._id), 4],
    [String(northGym._id), 0],
  ]);
});

test('stock always belongs to an organization and a gym', async () => {
  const stock = new ProductStock({ productId: id(), quantity: 3, organizationId });
  await assert.rejects(stock.validate(), /gymId/);
});

test('reception can sell to a client; clients only order for themselves', () => {
  const clientId = String(id());
  assert.deepEqual(resolveOrderOwnership({ _id: 'staff', role: 'Recepcion' }, { userId: clientId }), { userId: clientId, status: 'paid' });
  assert.deepEqual(resolveOrderOwnership({ _id: clientId, role: 'Cliente' }, { userId: 'other', status: 'paid' }), { userId: clientId, status: 'pending' });
});

test('authorize narrows the request to the matched role or rejects it', () => {
  const managerContext = context({ gyms: [{ gymId: mainGym._id, roles: ['Gerente'] }] });
  const allowed = { user: {}, tenantContext: managerContext };
  authorize('Admin')(allowed, {}, (error) => assert.equal(error, undefined));
  assert.equal(allowed.tenant.role, 'Admin');

  const denied = { user: {}, tenantContext: managerContext };
  authorize('Coach')(denied, {}, (error) => assert.equal(error.statusCode, 403));

  const outsider = { user: {}, tenantContext: null };
  authorize('Cliente')(outsider, {}, (error) => assert.equal(error.statusCode, 403));
});

function fakeRequest(tenant) {
  const sent = [];
  const io = { to: (rooms) => ({ emit: (event) => sent.push({ rooms: [rooms].flat(), event }) }) };
  return { sent, req: { tenant, app: { get: () => io } } };
}

test('gym events reach that gym and the owners; organization events reach admins', () => {
  const tenant = resolveAccess(context({ roles: ['Propietario'] }), ['Admin']);
  const userId = id();
  const { sent, req } = fakeRequest(tenant);

  emitRealtime(req, 'payment-updated', {}, [userId], { gymId: northGym._id });
  assert.deepEqual(sent[0].rooms.sort(), [
    `gym:${northGym._id}:managers`,
    `gym:${northGym._id}:reception`,
    `org:${organizationId}:owners`,
    `user:${userId}`,
  ].sort());

  emitRealtime(req, 'routine-updated', {});
  assert.deepEqual(sent[1].rooms, [`org:${organizationId}:admins`]);

  emitToStaff(req, 'routine-updated', {});
  assert.deepEqual(sent[2].rooms, [`org:${organizationId}:staff`]);
});

test('nothing is emitted without an organization', () => {
  const { sent, req } = fakeRequest(null);
  emitRealtime(req, 'payment-updated', {}, [id()]);
  emitToStaff(req, 'routine-updated', {});
  assert.equal(sent.length, 0);
});
