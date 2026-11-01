const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// The controllers read the environment when they load.
const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';

const Document = require('../src/models/document.model');
const MembershipPlan = require('../src/models/membership-plan.model');
const Payment = require('../src/models/payment.model');
const Promotion = require('../src/models/promotion.model');
const { promotionCoversPlan, quoteMembership, priceMembership } = require('../src/utils/membership-pricing');
const { createPromotion } = require('../src/controllers/store.controller');
const { updatePayment } = require('../src/controllers/payment.controller');

const id = () => new mongoose.Types.ObjectId();
const [studentPlan, basicPlan, organizationId, userId] = [id(), id(), id(), id()];
const plan = { _id: studentPlan, price: 450 };
const tomorrow = new Date(Date.now() + 86400000);
const yesterday = new Date(Date.now() - 86400000);

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

function query(value) {
  const chain = { select: () => chain, session: () => chain, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  return chain;
}

const promotion = (fields) => ({ _id: id(), title: 'Promo', appliesTo: 'membership', applicablePlans: [], discountPercentage: 10, isActive: true, active: true, ...fields });

test('a membership promotion applies to its plans, or to every plan when it lists none', () => {
  assert.equal(promotionCoversPlan(promotion({ applicablePlans: [studentPlan] }), studentPlan), true);
  assert.equal(promotionCoversPlan(promotion({ applicablePlans: [studentPlan] }), basicPlan), false);
  assert.equal(promotionCoversPlan(promotion({}), basicPlan), true);
  assert.equal(promotionCoversPlan(promotion({ appliesTo: 'store' }), basicPlan), false);
});

test('the quote lists current promotions for the plan and picks the cheapest one the client can use', async () => {
  const promotions = [
    promotion({ title: 'Buen Fin', discountPercentage: 20, validUntil: tomorrow }),
    promotion({ title: 'Estudiantes', discountPercentage: 30, requiredDocument: 'student_id', applicablePlans: [studentPlan] }),
    promotion({ title: 'Vencida', discountPercentage: 50, validUntil: yesterday }),
    promotion({ title: 'Inactiva', discountPercentage: 50, isActive: false }),
    promotion({ title: 'Otro plan', discountPercentage: 50, applicablePlans: [basicPlan] }),
  ];
  const restore = [
    stub(Promotion, 'find', () => query(promotions)),
    stub(Document, 'exists', () => query(null)),
  ];
  try {
    const quote = await quoteMembership({ plan, userId, organizationId });
    assert.equal(quote.listPrice, 450);
    assert.deepEqual(quote.promotions.map((option) => [option.title, option.amount, option.eligible]), [
      ['Estudiantes', 315, false],
      ['Buen Fin', 360, true],
    ]);
    assert.equal(quote.best.title, 'Buen Fin');
    assert.equal(quote.best.discountApplied, 90);

    // Without a client the document cannot be checked yet.
    const anonymous = await quoteMembership({ plan, organizationId });
    assert.equal(anonymous.promotions[0].eligible, null);
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('the server prices the payment with the promotion', async () => {
  const restore = stub(Promotion, 'findOne', () => query(promotion({ discountPercentage: 15, applicablePlans: [studentPlan] })));
  try {
    const pricing = await priceMembership({ plan, promotionId: id(), userId, organizationId });
    assert.deepEqual({ ...pricing, promotionId: undefined }, { promotionId: undefined, listPrice: 450, discountApplied: 67.5, amount: 382.5 });
    assert.deepEqual(await priceMembership({ plan, promotionId: null, userId, organizationId }), { promotionId: null, listPrice: 450, discountApplied: 0, amount: 450 });
  } finally {
    restore();
  }
});

test('a promotion that does not apply is refused instead of charging a discount', async () => {
  const cases = [
    [null, 'promotion_unavailable'],
    [promotion({ validUntil: yesterday }), 'promotion_unavailable'],
    [promotion({ appliesTo: 'store' }), 'promotion_not_applicable'],
    [promotion({ applicablePlans: [basicPlan] }), 'promotion_not_applicable'],
    [promotion({ requiredDocument: 'student_id' }), 'promotion_document_required'],
  ];
  const restore = [stub(Document, 'exists', () => query(null))];
  try {
    for (const [found, code] of cases) {
      const undo = stub(Promotion, 'findOne', () => query(found));
      try {
        await assert.rejects(priceMembership({ plan, promotionId: id(), userId, organizationId }), (error) => {
          assert.equal(error.statusCode, 409);
          assert.equal(error.extra.code, code);
          return true;
        });
      } finally {
        undo();
      }
    }
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('a membership promotion keeps only its plans, which must belong to the organization', async () => {
  let created;
  const restore = [
    stub(Promotion, 'create', async (value) => { created = value; return value; }),
    stub(MembershipPlan, 'countDocuments', async (filter) => filter._id.$in.filter((planId) => String(planId) === String(studentPlan)).length),
  ];
  const req = (body) => ({ body, tenant: { role: 'Admin', organizationId } });
  const res = { status: () => res, json: () => {} };
  try {
    await createPromotion(req({ title: 'Estudiantes', appliesTo: 'membership', discountPercentage: 30, applicablePlans: [String(studentPlan)], applicableProducts: [String(id())] }), res);
    assert.deepEqual(created.applicablePlans, [String(studentPlan)]);
    assert.deepEqual(created.applicableProducts, []);

    await assert.rejects(createPromotion(req({ title: 'X', appliesTo: 'membership', applicablePlans: [String(basicPlan)] }), res), /plan/);
  } finally {
    restore.forEach((undo) => undo());
  }
});

// Edits a payment priced by a promotion, as the dashboard does (it resends plan and amount), and returns what was set.
async function editPromotionPayment(stored, body) {
  const changes = {};
  const payment = { ...stored, set: (values) => Object.assign(changes, values), save: async () => {} };
  const restore = [
    stub(MembershipPlan, 'findOne', () => query({ _id: body.planId ?? stored.planId, name: 'Estudiante', price: 450, durationInDays: 30 })),
    stub(Payment, 'startSession', async () => ({ withTransaction: (work) => work(), endSession: async () => {} })),
    stub(Payment, 'findOne', () => query(payment)),
    stub(Payment, 'findById', () => ({ populate() { return this; }, then: (resolve) => resolve({ ...payment, toObject: () => payment }) })),
    stub(Promotion, 'findOne', () => query(promotion({ discountPercentage: 30 }))),
  ];
  const req = { params: { id: String(stored._id) }, body, user: { id: String(id()) }, tenant: { role: 'Admin', organizationId, gymIds: [] } };
  try {
    await updatePayment(req, { json: () => {} });
    return changes;
  } finally {
    restore.forEach((undo) => undo());
  }
}

test('editing a paid payment priced by a promotion keeps its price when plan and promotion do not change', async () => {
  const stored = { _id: id(), user: userId, organizationId, planId: studentPlan, promotionId: id(), amount: 315, status: 'paid' };
  const changes = await editPromotionPayment(stored, { planId: String(studentPlan), amount: 450, reference: 'R-1' });
  assert.equal(changes.amount, undefined);
  assert.equal(changes.reference, 'R-1');

  await assert.rejects(editPromotionPayment(stored, { planId: String(basicPlan) }), /pago pagado/);
});

test('a pending payment that gets a promotion is priced again by the server', async () => {
  const stored = { _id: id(), user: userId, organizationId, planId: studentPlan, promotionId: null, amount: 450, status: 'pending', validationPin: '12345' };
  const restore = stub(Payment, 'exists', async () => null);
  try {
    const changes = await editPromotionPayment(stored, { promotionId: String(id()), amount: 1 });
    assert.equal(changes.amount, 315);
    assert.equal(changes.discountApplied, 135);
  } finally {
    restore();
  }
});

test('changing the plan of a pending payment takes the duration of the new plan; a paid payment keeps its plan', async () => {
  const stored = { _id: id(), user: userId, organizationId, planId: studentPlan, promotionId: null, amount: 450, durationDays: 90, status: 'pending', validationPin: '12345' };
  const restore = stub(Payment, 'exists', async () => null);
  try {
    const changes = await editPromotionPayment(stored, { planId: String(basicPlan), amount: 300 });
    assert.equal(changes.durationDays, 30);
    assert.equal(changes.amount, 300);

    await assert.rejects(editPromotionPayment({ ...stored, status: 'paid' }, { planId: String(basicPlan) }), /plan de un pago pagado/);
  } finally {
    restore();
  }
});
