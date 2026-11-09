const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// env.js reads the environment when it loads; this file runs with Stripe in test mode and PayPal sandbox.
const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';
process.env.STRIPE_SECRET_KEY = 'sk_test_gymgo';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_gymgo_test';
process.env.PAYPAL_CLIENT_ID = 'paypal-client';
process.env.PAYPAL_CLIENT_SECRET = 'paypal-secret';

const Stripe = require('stripe');
const Organization = require('../src/models/organization.model');
const OrganizationMember = require('../src/models/organization-member.model');
const SubscriptionPayment = require('../src/models/subscription-payment.model');
const Gym = require('../src/models/gym.model');
const Membership = require('../src/models/membership.model');
const { DEFAULT_PLANS, setPlanCache, planAmountCents, serializePlan } = require('../src/utils/saas-plans');
const {
  GRACE_DAYS, addDays, subscriptionState, initialSubscription, applyPrepaidPayment, syncStripeSubscription,
} = require('../src/utils/subscription');
const { loadTenantContext } = require('../src/utils/tenant');
const { allowedWhileUnpaid } = require('../src/middlewares/auth.middleware');
const { requireFeature, requireOwner } = require('../src/middlewares/subscription.middleware');
const { setStripeClient } = require('../src/utils/payment-providers');
const controller = require('../src/controllers/subscription.controller');

setPlanCache(DEFAULT_PLANS.map((plan) => ({ ...plan, isActive: true })));

const id = () => new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-09T12:00:00Z');
const ago = (days) => new Date(now.getTime() - days * DAY);

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

// A mongoose query: chainable, resolves to `value` with .lean() or when awaited.
function query(value) {
  const chain = { sort: () => chain, select: () => chain, populate: () => chain, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  return chain;
}

// Resolves with what the middleware passes to next (undefined when it lets the request through).
function run(handler, req, res = {}) {
  return new Promise((resolve) => {
    handler(req, res, resolve);
  });
}

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

/* ===== Plans ===== */

test('plans charge IVA on top of the list price, in cents for Stripe', () => {
  const [esencial, pro, cadena] = DEFAULT_PLANS;
  assert.equal(planAmountCents(esencial, 'month'), 81084);
  assert.equal(planAmountCents(esencial, 'year'), 810840);
  assert.equal(planAmountCents(pro, 'month'), 150684);
  assert.equal(planAmountCents(cadena, 'month'), null);

  const serialized = serializePlan(esencial);
  assert.deepEqual(serialized.monthly, { subtotal: 699, tax: 111.84, total: 810.84 });
  assert.equal(serializePlan(cadena).selfService, false);
  assert.equal(serializePlan(cadena).monthly, null);
});

/* ===== Trial, grace and expiry ===== */

test('a new owner gets 14 days of Esencial; without a trial left they start unpaid', () => {
  const trial = initialSubscription({ email: 'ana@ejemplo.com', phone: '5512345678', trial: true, now });
  assert.equal(trial.status, 'trialing');
  assert.equal(trial.planCode, 'esencial');
  assert.deepEqual(trial.trialEndsAt, addDays(now, 14));
  assert.equal(trial.trialPhone, '5512345678');

  const unpaid = initialSubscription({ email: 'ana@ejemplo.com', phone: '5512345678', trial: false, now });
  assert.equal(unpaid.status, 'incomplete');
  assert.equal(subscriptionState({ subscription: unpaid }, now).phase, 'grace');
});

test('the trial runs, then a 3-day grace, then it expires', () => {
  const organization = (trialEndsAt) => ({ subscription: { status: 'trialing', trialEndsAt } });
  assert.equal(subscriptionState(organization(addDays(now, 1)), now).phase, 'ok');
  assert.equal(subscriptionState(organization(ago(1)), now).phase, 'grace');
  assert.equal(subscriptionState(organization(ago(GRACE_DAYS)), now).phase, 'expired');
  assert.deepEqual(subscriptionState(organization(ago(1)), now).graceEndsAt, addDays(ago(1), GRACE_DAYS));
});

test('a renewing card never lapses by date; a period paid once does', () => {
  assert.equal(subscriptionState({ subscription: { status: 'active', renews: true, currentPeriodEnd: ago(10) } }, now).phase, 'ok');
  assert.equal(subscriptionState({ subscription: { status: 'active', renews: false, currentPeriodEnd: ago(1) } }, now).phase, 'grace');
  assert.equal(subscriptionState({ subscription: { status: 'past_due', lapsedAt: ago(4) } }, now).phase, 'expired');
});

test('organizations without a plan and those SIRID manages never lapse', () => {
  assert.equal(subscriptionState({}, now).phase, 'ok');
  assert.equal(subscriptionState({ subscription: { status: 'manual', planCode: 'cadena' } }, now).phase, 'ok');
});

/* ===== Who gets in while the plan is unpaid ===== */

function stubTenant({ roles, subscription }) {
  const organizationId = id();
  const gymId = id();
  const member = { userId: id(), organizationId, roles, gyms: roles.includes('Cliente') ? [] : [{ gymId, roles: ['Recepcion'] }], isActive: true };
  const restores = [
    stub(OrganizationMember, 'find', () => query([member])),
    stub(Organization, 'findById', () => query({ _id: organizationId, name: 'Fuerza', status: 'active', subscription })),
    stub(Gym, 'find', () => query([{ _id: gymId, name: 'Centro' }])),
    stub(Membership, 'findOne', () => query({ homeGymId: gymId })),
  ];
  return () => restores.forEach((restore) => restore());
}

test('when the trial ends the owner can only pay, staff and clients keep working during the grace', async () => {
  const subscription = { status: 'trialing', trialEndsAt: new Date(Date.now() - DAY) };
  let restore = stubTenant({ roles: ['Propietario'], subscription });
  try {
    assert.equal((await loadTenantContext({ _id: id() })).billingOnly, true);
  } finally { restore(); }

  restore = stubTenant({ roles: ['Cliente'], subscription });
  try {
    assert.equal((await loadTenantContext({ _id: id() })).billingOnly, false);
  } finally { restore(); }
});

test('after the grace, clients and staff see the gym as suspended; the owner still gets in to pay', async () => {
  const subscription = { status: 'trialing', trialEndsAt: new Date(Date.now() - (GRACE_DAYS + 1) * DAY) };
  let restore = stubTenant({ roles: ['Cliente'], subscription });
  try {
    await assert.rejects(loadTenantContext({ _id: id() }), (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(error.extra.code, 'organization_suspended');
      assert.equal(error.extra.organization.reason, null);
      return true;
    });
  } finally { restore(); }

  restore = stubTenant({ roles: ['Propietario'], subscription });
  try {
    assert.equal((await loadTenantContext({ _id: id() })).billingOnly, true);
  } finally { restore(); }
});

test('an owner with an unpaid plan reaches only the session and billing routes', () => {
  const allowed = (url) => allowedWhileUnpaid({ originalUrl: url });
  assert.equal(allowed('/api/subscription'), true);
  assert.equal(allowed('/api/subscription/checkout'), true);
  assert.equal(allowed('/api/auth/me?x=1'), true);
  assert.equal(allowed('/api/auth/me/gyms'), true);
  assert.equal(allowed('/api/users'), false);
  assert.equal(allowed('/api/subscriptions-fake'), false);
});

/* ===== Features by plan ===== */

test('the API refuses what the plan does not include', async () => {
  const request = (subscription, extra = {}) => ({ user: {}, tenantContext: { organization: { subscription } }, ...extra });
  const error = await run(requireFeature('iot'), request({ planCode: 'esencial', status: 'trialing' }));
  assert.equal(error.statusCode, 403);
  assert.equal(error.extra.code, 'feature_not_in_plan');
  assert.equal(error.extra.feature, 'iot');

  assert.equal(await run(requireFeature('iot'), request({ planCode: 'pro', status: 'active' })), undefined);
  assert.equal(await run(requireFeature('documents'), request({ planCode: 'cadena', status: 'manual' })), undefined);
  assert.equal(await run(requireFeature('iot'), request(undefined)), undefined, 'organizations from before billing keep everything');
  assert.equal(await run(requireFeature('iot'), request({ planCode: 'esencial' }, { user: { isPlatformAdmin: true } })), undefined);
});

test('managers do not handle the GymGo plan, only the owner', async () => {
  assert.equal((await run(requireOwner, { user: {}, tenantContext: { member: { roles: [] } } })).statusCode, 403);
  assert.equal(await run(requireOwner, { user: {}, tenantContext: { member: { roles: ['Propietario'] } } }), undefined);
});

/* ===== Payments applied to the organization ===== */

test('a period paid once starts when the paid one ends and is applied only once', async () => {
  const organizationId = id();
  const paidUntil = addDays(new Date(), 10);
  const created = [];
  let update;
  const restores = [
    stub(Organization, 'findById', async () => ({ _id: organizationId, subscription: { status: 'active', currentPeriodEnd: paidUntil } })),
    stub(SubscriptionPayment, 'create', async (doc) => {
      if (created.some((item) => item.reference === doc.reference)) throw Object.assign(new Error('dup'), { code: 11000 });
      created.push(doc);
      return doc;
    }),
    stub(Organization, 'findByIdAndUpdate', async (_, change) => { update = change; return { _id: organizationId }; }),
  ];
  try {
    const payment = { organizationId, planCode: 'pro', interval: 'month', provider: 'paypal', method: 'paypal', reference: 'CAPTURE1', amount: 1506.84 };
    assert.ok(await applyPrepaidPayment(payment));
    assert.deepEqual(created[0].periodStart, paidUntil);
    assert.equal(update.$set['subscription.status'], 'active');
    assert.equal(update.$set['subscription.planCode'], 'pro');
    assert.equal(update.$set.gymLimit, 3);
    assert.equal(update.$set['subscription.currentPeriodEnd'].getUTCMonth(), (paidUntil.getUTCMonth() + 1) % 12);
    assert.equal(await applyPrepaidPayment(payment), null);
  } finally { restores.forEach((restore) => restore()); }
});

function stripeSubscription(overrides = {}) {
  return {
    id: 'sub_new',
    status: 'active',
    customer: 'cus_1',
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { organizationId: String(overrides.organizationId ?? id()), planCode: 'pro', interval: 'month' },
    items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
    ...overrides,
  };
}

test('a paid card subscription activates the plan and replaces the previous one', async () => {
  const organizationId = id();
  let update;
  const restores = [
    stub(Organization, 'findById', async () => ({ _id: organizationId, subscription: { status: 'active', method: 'card', stripeSubscriptionId: 'sub_old', planCode: 'esencial' } })),
    stub(Organization, 'findByIdAndUpdate', async (_, change) => { update = change; return { _id: organizationId }; }),
  ];
  try {
    const result = await syncStripeSubscription(stripeSubscription({ organizationId, metadata: { organizationId: String(organizationId), planCode: 'pro', interval: 'month' } }));
    assert.equal(result.replacedSubscriptionId, 'sub_old');
    assert.equal(update.$set['subscription.status'], 'active');
    assert.equal(update.$set['subscription.renews'], true);
    assert.equal(update.$set['subscription.stripeSubscriptionId'], 'sub_new');
    assert.equal(update.$set.gymLimit, 3);
    assert.ok(update.$unset['subscription.lapsedAt'] === '');
  } finally { restores.forEach((restore) => restore()); }
});

test('a failed renewal starts the grace; events of a replaced subscription are ignored', async () => {
  const organizationId = id();
  let update;
  const restores = [
    stub(Organization, 'findById', async () => ({ _id: organizationId, subscription: { status: 'active', method: 'card', stripeSubscriptionId: 'sub_new' } })),
    stub(Organization, 'findByIdAndUpdate', async (_, change) => { update = change; return { _id: organizationId }; }),
  ];
  try {
    await syncStripeSubscription(stripeSubscription({ organizationId, status: 'past_due', metadata: { organizationId: String(organizationId) } }));
    assert.equal(update.$set['subscription.status'], 'past_due');
    assert.ok(update.$set['subscription.lapsedAt'] instanceof Date);

    update = null;
    assert.equal(await syncStripeSubscription(stripeSubscription({ id: 'sub_old', organizationId, status: 'canceled', metadata: { organizationId: String(organizationId) } })), null);
    assert.equal(update, null);
  } finally { restores.forEach((restore) => restore()); }
});

/* ===== Stripe: checkout and webhook ===== */

function ownerRequest(organizationId, body = {}) {
  const emitted = [];
  const io = { to: (rooms) => ({ emit: (event, payload) => emitted.push({ rooms, event, payload }) }) };
  return {
    body,
    params: {},
    user: { email: 'ana@ejemplo.com' },
    tenant: { organizationId },
    emitted,
    app: { get: (key) => ({ allowedOrigins: ['https://gymgo.mx'], io })[key] },
  };
}

test('card checkout opens a renewing subscription with IVA; OXXO pays one period', async () => {
  const organizationId = id();
  const sessions = [];
  setStripeClient({
    customers: { create: async () => ({ id: 'cus_1' }) },
    checkout: { sessions: { create: async (params) => { sessions.push(params); return { id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' }; } } },
  });
  const restores = [
    stub(Organization, 'findById', async () => ({ _id: organizationId, name: 'Fuerza', subscription: { status: 'trialing', planCode: 'esencial' } })),
    stub(Organization, 'updateOne', async () => ({})),
  ];
  try {
    const urls = { successUrl: 'https://gymgo.mx/pages/pago-exitoso.html', cancelUrl: 'https://gymgo.mx/pages/precios.html' };
    const res = response();
    await controller.createCheckout(ownerRequest(organizationId, { planCode: 'pro', interval: 'month', ...urls }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.url, 'https://checkout.stripe.com/c/cs_1');
    const [card] = sessions;
    assert.equal(card.mode, 'subscription');
    assert.equal(card.line_items[0].price_data.unit_amount, 150684);
    assert.deepEqual(card.line_items[0].price_data.recurring, { interval: 'month' });
    assert.equal(card.subscription_data.metadata.organizationId, String(organizationId));
    assert.match(card.success_url, /\?session_id=\{CHECKOUT_SESSION_ID\}$/);

    await controller.createCheckout(ownerRequest(organizationId, { planCode: 'esencial', method: 'oxxo', ...urls }), response());
    assert.equal(sessions[1].mode, 'payment');
    assert.deepEqual(sessions[1].excluded_payment_method_types, ['card']);
    assert.equal(card.payment_method_types, undefined);
    assert.equal(sessions[1].line_items[0].price_data.recurring, undefined);

    await assert.rejects(
      controller.createCheckout(ownerRequest(organizationId, { planCode: 'pro', ...urls, successUrl: 'https://evil.example/ok' }), response()),
      /URL de regreso/,
    );
    await assert.rejects(
      controller.createCheckout(ownerRequest(organizationId, { planCode: 'cadena', ...urls }), response()),
      (error) => error.extra.code === 'plan_requires_sales',
    );
  } finally { restores.forEach((restore) => restore()); }
});

test('a card that already renews changes plan from the portal, never with a second checkout', async () => {
  const organizationId = id();
  const restore = stub(Organization, 'findById', async () => ({ _id: organizationId, subscription: { status: 'active', method: 'card', renews: true } }));
  try {
    await assert.rejects(
      controller.createCheckout(ownerRequest(organizationId, { planCode: 'pro', successUrl: 'https://gymgo.mx/a', cancelUrl: 'https://gymgo.mx/b' }), response()),
      (error) => error.extra.code === 'subscription_active',
    );
  } finally { restore(); }
});

const realStripe = Stripe('sk_test_gymgo');

function signedWebhook(event, secret = 'whsec_gymgo_test') {
  const payload = JSON.stringify(event);
  return { body: Buffer.from(payload), signature: realStripe.webhooks.generateTestHeaderString({ payload, secret }) };
}

test('the webhook refuses requests not signed by Stripe', async () => {
  setStripeClient({ webhooks: realStripe.webhooks });
  const { body, signature } = signedWebhook({ id: 'evt_1', type: 'invoice.paid', data: { object: {} } }, 'whsec_other');
  const req = { ...ownerRequest(id()), body, get: () => signature };
  await assert.rejects(controller.stripeWebhook(req, response()), (error) => error.statusCode === 400);
});

test('a completed card checkout activates the organization and tells its dashboard live', async () => {
  const organizationId = id();
  const subscription = stripeSubscription({ organizationId, metadata: { organizationId: String(organizationId), planCode: 'pro', interval: 'month' } });
  setStripeClient({
    webhooks: realStripe.webhooks,
    subscriptions: { retrieve: async (subscriptionId) => { assert.equal(subscriptionId, 'sub_new'); return subscription; }, cancel: async () => ({}) },
  });
  const activated = { _id: organizationId, subscription: { status: 'active', planCode: 'pro', renews: true } };
  const restores = [
    stub(Organization, 'findById', async () => ({ _id: organizationId, subscription: { status: 'trialing', planCode: 'esencial' } })),
    stub(Organization, 'findByIdAndUpdate', async () => activated),
  ];
  try {
    const { body, signature } = signedWebhook({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', mode: 'subscription', subscription: 'sub_new', client_reference_id: String(organizationId), payment_status: 'paid', metadata: {} } },
    });
    const req = { ...ownerRequest(organizationId), body, get: () => signature };
    const res = response();
    await controller.stripeWebhook(req, res);
    assert.deepEqual(res.body, { received: true });
    assert.equal(req.emitted[0].event, 'subscription:updated');
    assert.deepEqual(req.emitted[0].rooms, [`org:${organizationId}:owners`, `org:${organizationId}:staff`]);
    assert.equal(req.emitted[0].payload.phase, 'ok');
  } finally { restores.forEach((restore) => restore()); }
});

test('an OXXO voucher waits as pending until Stripe confirms the store payment', async () => {
  const organizationId = id();
  const updates = [];
  const restores = [
    stub(Organization, 'findByIdAndUpdate', async (_, change) => { updates.push(change); return { _id: organizationId, subscription: {} }; }),
    stub(Organization, 'findById', async () => ({ _id: organizationId, subscription: { status: 'trialing' } })),
    stub(SubscriptionPayment, 'create', async (doc) => doc),
  ];
  try {
    const session = { id: 'cs_oxxo', mode: 'payment', payment_intent: 'pi_1', client_reference_id: String(organizationId), amount_total: 81084, metadata: { planCode: 'esencial', interval: 'month', method: 'oxxo' } };
    const fake = { paymentIntents: { retrieve: async () => ({ next_action: { oxxo_display_details: { hosted_voucher_url: 'https://payments.stripe.com/oxxo/voucher', expires_after: 1900000000 } } }) } };
    await controller.handleStripeEvent(fake, { type: 'checkout.session.completed', data: { object: { ...session, payment_status: 'unpaid' } } });
    assert.equal(updates[0].$set['subscription.pendingPayment'].voucherUrl, 'https://payments.stripe.com/oxxo/voucher');

    updates.length = 0;
    await controller.handleStripeEvent(fake, { type: 'checkout.session.async_payment_succeeded', data: { object: { ...session, payment_status: 'paid' } } });
    assert.equal(updates[0].$set['subscription.status'], 'active');
    assert.equal(updates[0].$set['subscription.method'], 'oxxo');
    assert.equal(updates[0].$unset['subscription.pendingPayment'], '');
  } finally { restores.forEach((restore) => restore()); }
});

/* ===== PayPal: captured and verified by the API ===== */

function stubPaypal(order) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/oauth2/token')) return { ok: true, json: async () => ({ access_token: 'token', expires_in: 3600 }) };
    return { ok: true, status: 200, json: async () => order };
  };
  return { calls, restore: () => { global.fetch = original; } };
}

function paypalOrder(organizationId, value, planCode = 'esencial') {
  return {
    id: 'ORDER12345',
    status: 'COMPLETED',
    purchase_units: [{ payments: { captures: [{ id: 'CAPTURE12345', status: 'COMPLETED', custom_id: `${organizationId}:${planCode}:month`, amount: { currency_code: 'MXN', value } }] } }],
  };
}

// PayPal real quedó comentado (se usa el simulado para la evaluación escolar).
test.skip('PayPal activates the plan only after the API captures the exact amount with PayPal', async () => {
  const organizationId = id();
  const paypal = stubPaypal(paypalOrder(organizationId, '810.84'));
  let update;
  const restores = [
    stub(Organization, 'findById', async () => ({ _id: organizationId, subscription: { status: 'trialing' } })),
    stub(SubscriptionPayment, 'create', async (doc) => doc),
    stub(Organization, 'findByIdAndUpdate', async (_, change) => { update = change; return { _id: organizationId, subscription: { status: 'active', planCode: 'esencial', method: 'paypal', currentPeriodEnd: addDays(new Date(), 30) } }; }),
  ];
  try {
    const req = { ...ownerRequest(organizationId), params: { orderId: 'ORDER12345' } };
    const res = response();
    await controller.capturePaypalOrder(req, res);
    assert.ok(paypal.calls.some((call) => call.url.endsWith('/v2/checkout/orders/ORDER12345/capture')));
    assert.ok(paypal.calls[0].url.startsWith('https://api-m.sandbox.paypal.com'));
    assert.equal(update.$set['subscription.method'], 'paypal');
    assert.equal(res.body.subscription.status, 'active');
    assert.equal(req.emitted[0].event, 'subscription:updated');
  } finally { paypal.restore(); restores.forEach((restore) => restore()); }
});

test.skip('a PayPal order for another amount or another organization activates nothing', async () => {
  const organizationId = id();
  const restore = stub(Organization, 'findById', async () => ({ _id: organizationId, subscription: {} }));
  let paypal = stubPaypal(paypalOrder(organizationId, '1.00'));
  try {
    await assert.rejects(
      controller.capturePaypalOrder({ ...ownerRequest(organizationId), params: { orderId: 'ORDER12345' } }, response()),
      (error) => error.extra.code === 'paypal_amount_mismatch',
    );
    paypal.restore();
    paypal = stubPaypal(paypalOrder(id(), '810.84'));
    await assert.rejects(
      controller.capturePaypalOrder({ ...ownerRequest(organizationId), params: { orderId: 'ORDER12345' } }, response()),
      (error) => error.statusCode === 403,
    );
  } finally { paypal.restore(); restore(); }
});

test('the simulated PayPal button gives a 5-day trial of the chosen plan once, without PayPal or a payment', async () => {
  const organizationId = id();
  let filter;
  let update;
  const restores = [
    stub(Organization, 'findById', async () => ({ _id: organizationId, subscription: { status: 'trialing', planCode: 'esencial', trialEndsAt: addDays(new Date(), 10) } })),
    stub(Organization, 'findOneAndUpdate', async (query, change) => {
      filter = query;
      update = change;
      return { _id: organizationId, subscription: { status: 'trialing', planCode: 'pro', method: 'paypal', trialEndsAt: change.$set['subscription.trialEndsAt'] } };
    }),
    stub(SubscriptionPayment, 'create', async () => { throw new Error('no payment should be recorded'); }),
  ];
  const original = global.fetch;
  global.fetch = async () => { throw new Error('PayPal must not be called'); };
  try {
    const req = { ...ownerRequest(organizationId), body: { planCode: 'pro' } };
    const res = response();
    await controller.startPaypalDemo(req, res);
    assert.deepEqual(filter['subscription.demoTrialUsedAt'], { $exists: false });
    assert.equal(update.$set['subscription.planCode'], 'pro');
    assert.equal(update.$set['subscription.status'], 'trialing');
    const days = (update.$set['subscription.trialEndsAt'] - Date.now()) / 864e5;
    assert.ok(days > 4.99 && days <= 5);
    assert.equal(res.body.simulated, true);
    assert.equal(res.body.subscription.status, 'trialing');
    assert.equal(req.emitted[0].event, 'subscription:updated');
  } finally { global.fetch = original; restores.forEach((restore) => restore()); }
});

test('the simulated PayPal trial is refused when it was used or the plan is already paid', async () => {
  const organizationId = id();
  let restore = stub(Organization, 'findById', async () => ({ _id: organizationId, subscription: { status: 'trialing', demoTrialUsedAt: new Date() } }));
  try {
    await assert.rejects(
      controller.startPaypalDemo({ ...ownerRequest(organizationId), body: { planCode: 'esencial' } }, response()),
      (error) => error.extra.code === 'paypal_demo_used',
    );
    restore();
    restore = stub(Organization, 'findById', async () => ({ _id: organizationId, subscription: { status: 'active', renews: false, method: 'oxxo', currentPeriodEnd: addDays(new Date(), 20) } }));
    await assert.rejects(
      controller.startPaypalDemo({ ...ownerRequest(organizationId), body: { planCode: 'esencial' } }, response()),
      (error) => error.extra.code === 'subscription_active',
    );
  } finally { restore(); }
});
