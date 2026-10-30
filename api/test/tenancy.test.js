const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const HttpError = require('../src/utils/http-error');
const { setDefaultTenant, getDefaultTenant } = require('../src/utils/tenant');
const Product = require('../src/models/product.model');
const Payment = require('../src/models/payment.model');
const MembershipPlan = require('../src/models/membership-plan.model');
const Membership = require('../src/models/membership.model');
const OrganizationMember = require('../src/models/organization-member.model');
const { memberFromUser, membershipFromUser } = require('../scripts/migrate-tenancy');

const tenant = { organizationId: new mongoose.Types.ObjectId(), gymId: new mongoose.Types.ObjectId() };
const userId = new mongoose.Types.ObjectId();

test('the default organization for self-registration fails clearly until it is loaded', () => {
  setDefaultTenant(null);
  assert.throws(() => getDefaultTenant(), (error) => error instanceof HttpError && error.statusCode === 503);
});

test('documents never fall back to the default organization', async (t) => {
  setDefaultTenant(tenant);
  t.after(() => setDefaultTenant(null));

  const plan = new MembershipPlan({ name: 'Mensual', price: 500, durationInDays: 30 });
  await assert.rejects(plan.validate(), /organizationId/);

  const payment = new Payment({ user: userId, planName: 'Mensual', amount: 500, durationDays: 30, reference: 'ref-1', organizationId: tenant.organizationId });
  await assert.rejects(payment.validate(), /gymId/);
});

test('catalog products belong to the organization, not to a gym', async () => {
  const product = new Product({ name: 'Creatina', category: 'Suplementos', price: 10, organizationId: tenant.organizationId });
  await product.validate();
  assert.equal(product.gymId, undefined);
  assert.equal(product.stock, undefined);
});

test('plans default to every gym and a gym list needs at least one gym', async () => {
  const plan = new MembershipPlan({ name: 'Mensual', price: 500, durationInDays: 30, organizationId: tenant.organizationId });
  await plan.validate();
  assert.equal(plan.gymAccess.scope, 'all');

  plan.gymAccess = { scope: 'list', gymIds: [] };
  await assert.rejects(plan.validate(), /sucursal/);
});

test('a home-gym membership needs its gym', async () => {
  const membership = new Membership({ userId, organizationId: tenant.organizationId, gymAccess: { scope: 'home' } });
  await assert.rejects(membership.validate(), /homeGymId/);
  membership.homeGymId = tenant.gymId;
  await membership.validate();
});

test('members need a valid role and can combine roles in a gym', async () => {
  const empty = new OrganizationMember({ userId, organizationId: tenant.organizationId });
  await assert.rejects(empty.validate(), /rol/);

  const invalid = new OrganizationMember({ userId, organizationId: tenant.organizationId, roles: ['Admin'] });
  await assert.rejects(invalid.validate(), /roles/);

  const staff = new OrganizationMember({
    userId,
    organizationId: tenant.organizationId,
    gyms: [{ gymId: tenant.gymId, roles: ['Coach', 'Recepcion'] }],
  });
  await staff.validate();
});

test('migration maps current roles and memberships to the default organization', () => {
  assert.deepEqual(memberFromUser({ role: 'Admin' }, tenant), { roles: ['Propietario'], gyms: [] });
  assert.deepEqual(memberFromUser({ role: 'Coach' }, tenant), { roles: [], gyms: [{ gymId: tenant.gymId, roles: ['Coach'] }] });
  assert.deepEqual(memberFromUser({ role: 'Cliente' }, tenant), { roles: ['Cliente'], gyms: [] });

  const expiresAt = new Date('2026-12-01');
  const membership = membershipFromUser(
    { _id: userId, membership: { status: 'active', expiresAt, planName: 'Mensual', price: 500, durationDays: 30 } },
    tenant,
    null,
  );
  assert.equal(membership.status, 'active');
  assert.equal(membership.expiresAt, expiresAt);
  assert.equal(String(membership.homeGymId), String(tenant.gymId));
  assert.deepEqual(membership.gymAccess, { scope: 'all', gymIds: [] });
});
