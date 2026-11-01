const { z } = require('zod');
const Payment = require('../models/payment.model');
const MembershipPlan = require('../models/membership-plan.model');
const HttpError = require('../utils/http-error');
const { emitRealtime } = require('../utils/realtime');
const { activateMembership } = require('../utils/membership');
const { priceMembership, quoteMembership } = require('../utils/membership-pricing');
const { generateUniquePaymentPin } = require('../utils/payment-pin');
const parseUpdate = require('../utils/parse-update');
const { resolveTenant, resolveTargetGym, organizationFilter, gymFilter } = require('../utils/tenant');
const { findClientMember } = require('../utils/members');

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido.');
const paymentSchema = z.object({
  userId: objectIdSchema,
  planId: objectIdSchema,
  // Ignored when promotionId is sent: the server prices the plan with the promotion. Defaults to the plan's price.
  amount: z.coerce.number().min(0).optional(),
  promotionId: z.union([objectIdSchema, z.literal(''), z.null()]).transform((value) => value || null).optional(),
  currency: z.string().trim().length(3).default('MXN'),
  durationDays: z.coerce.number().int().min(1).max(730).optional(),
  source: z.enum(['reception']),
  paymentDate: z.coerce.date(),
  status: z.enum(['paid', 'pending', 'cancelled']),
  reference: z.string().trim().min(1).max(120).optional(),
  // The gym that charges; defaults to the selected or main gym. A payment keeps its gym once created.
  gymId: z.union([objectIdSchema, z.literal('')]).transform((value) => value || undefined).optional(),
});

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de pago inválido.');
}

async function getPayments(req, res) {
  const payments = await Payment.find(gymFilter(req))
    .populate('userId', 'name email')
    .populate('planId', 'name')
    .populate('user', 'name email')
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();
  res.json({ payments });
}

async function assertNoOtherPendingPayment(userId, organizationId, paymentId = null) {
  if (await Payment.exists({ user: userId, organizationId, status: 'pending', _id: { $ne: paymentId } })) {
    throw new HttpError(409, 'El cliente ya tiene un pago pendiente.');
  }
}

async function createPayment(req, res) {
  const { gymId: requestedGymId, ...input } = paymentSchema.parse(req.body);
  const { organizationId } = resolveTenant(req);
  const gymId = resolveTargetGym(req, requestedGymId);
  await findClientMember(req, input.userId, 'Usuario no encontrado.');
  const plan = await MembershipPlan.findOne({ _id: input.planId, organizationId, isDeleted: { $ne: true } }).select('name price durationInDays');
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  const pricing = await priceMembership({ plan, promotionId: input.promotionId, userId: input.userId, organizationId });
  if (!pricing.promotionId && input.amount !== undefined) pricing.amount = input.amount;
  if (input.status === 'pending') await assertNoOtherPendingPayment(input.userId, organizationId);
  const pin = input.status === 'pending' ? await generateUniquePaymentPin() : null;

  const session = await Payment.startSession();
  let payment;
  try {
    await session.withTransaction(async () => {
      [payment] = await Payment.create([{
        ...input,
        ...pricing,
        organizationId,
        gymId,
        currency: input.currency.toUpperCase(),
        user: input.userId,
        planName: plan.name,
        durationDays: input.durationDays ?? plan.durationInDays,
        method: input.source,
        reference: input.reference ?? `GYM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        ...(pin ? { pin, validationPin: pin } : {}),
        ...(input.status === 'paid' ? { processedBy: req.user.id, processedAt: new Date() } : {}),
      }], { session });
      if (payment.status === 'paid') await activateMembership(session, payment);
    });
  } finally {
    await session.endSession();
  }
  emitRealtime(req, 'payment-updated', { action: 'created', payment: payment.toObject() }, [payment.user], { gymId });
  res.status(201).json({ payment });
}

async function updatePayment(req, res) {
  assertId(req.params.id);
  const { gymId: _gymId, ...input } = parseUpdate(paymentSchema, req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const update = { ...input };
  if (input.currency) update.currency = input.currency.toUpperCase();
  if (input.source) update.method = input.source;
  if (input.userId) {
    await findClientMember(req, input.userId, 'Usuario no encontrado.');
    update.user = input.userId;
  }
  let newPlan = null;
  if (input.planId) {
    newPlan = await MembershipPlan.findOne({ _id: input.planId, ...organizationFilter(req), isDeleted: { $ne: true } }).select('name price durationInDays');
    if (!newPlan) throw new HttpError(404, 'Plan no encontrado.');
    update.planName = newPlan.name;
  }

  const session = await Payment.startSession();
  let paymentId;
  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({ _id: req.params.id, ...gymFilter(req) }).session(session);
      if (!payment) throw new HttpError(404, 'Pago no encontrado.');
      const wasPaid = payment.status === 'paid';
      if (wasPaid && update.status && update.status !== 'paid') {
        throw new HttpError(409, 'Un pago pagado no puede cambiar de estado.');
      }
      // A payment priced by a promotion keeps the server's price: only a different promotion or plan prices it again.
      // The dashboard resends the same plan and amount on every edit, so unchanged values are not a change.
      const promotionId = 'promotionId' in input ? input.promotionId : payment.promotionId;
      const promotionChanged = 'promotionId' in input && String(input.promotionId ?? '') !== String(payment.promotionId ?? '');
      const planChanged = Boolean(newPlan) && String(newPlan._id) !== String(payment.planId);
      // A paid payment already activated its membership with its plan; changing it would leave the two out of step.
      if (planChanged && wasPaid) throw new HttpError(409, 'No se puede cambiar el plan de un pago pagado.');
      if (planChanged && input.durationDays === undefined) update.durationDays = newPlan.durationInDays;
      if (promotionChanged || (promotionId && planChanged)) {
        if (wasPaid) throw new HttpError(409, 'No se puede cambiar la promoción de un pago pagado.');
        const plan = newPlan ?? await MembershipPlan.findOne({ _id: payment.planId, organizationId: payment.organizationId }).select('price').session(session);
        if (!plan) throw new HttpError(404, 'Plan no encontrado.');
        const pricing = await priceMembership({ plan, promotionId, userId: update.user ?? payment.user, organizationId: payment.organizationId, session });
        Object.assign(update, pricing, !pricing.promotionId && input.amount !== undefined ? { amount: input.amount } : {});
      } else if (promotionId) {
        delete update.amount;
      }
      payment.set(update);
      if (payment.status === 'pending') {
        await assertNoOtherPendingPayment(payment.user, payment.organizationId, payment._id);
        if (!payment.validationPin) {
          const pin = await generateUniquePaymentPin();
          payment.set({ pin, validationPin: pin });
        }
      }
      if (!wasPaid && payment.status === 'paid') {
        payment.set({ processedBy: req.user.id, processedAt: new Date() });
        await activateMembership(session, payment);
      }
      await payment.save({ session });
      paymentId = payment._id;
    });
  } finally {
    await session.endSession();
  }

  const payment = await Payment.findById(paymentId)
    .populate('userId', 'name email')
    .populate('planId', 'name')
    .populate('user', 'name email');
  emitRealtime(req, 'payment-updated', { action: 'updated', payment: payment.toObject() }, [payment.user], { gymId: payment.gymId });
  res.json({ payment });
}

// The price of a plan with each current membership promotion, so reception sees the discount before charging.
async function quotePayment(req, res) {
  const input = z.object({
    planId: objectIdSchema,
    userId: z.union([objectIdSchema, z.literal('')]).transform((value) => value || undefined).optional(),
  }).parse(req.query);
  const { organizationId } = resolveTenant(req);
  if (input.userId) await findClientMember(req, input.userId, 'Usuario no encontrado.');
  const plan = await MembershipPlan.findOne({ _id: input.planId, organizationId, isDeleted: { $ne: true } }).select('price').lean();
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  res.json(await quoteMembership({ plan, userId: input.userId, organizationId }));
}

async function redeemPaymentByPin(req, res) {
  const { pin } = z.object({ pin: z.string().trim().regex(/^\d{5}$/, 'El PIN debe tener 5 dígitos.') }).parse(req.body);
  const session = await Payment.startSession();
  let paymentId;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({
        ...gymFilter(req),
        status: 'pending',
        $or: [{ pin }, { validationPin: pin }],
      }).session(session);
      if (!payment) throw new HttpError(404, 'No hay un pago pendiente con ese PIN.');

      payment.status = 'paid';
      payment.processedBy = req.user.id;
      payment.processedAt = new Date();
      await payment.save({ session });
      await activateMembership(session, payment);
      paymentId = payment._id;
    });
  } finally {
    await session.endSession();
  }

  const payment = await Payment.findById(paymentId)
    .populate('userId', 'name email')
    .populate('planId', 'name')
    .populate('user', 'name email')
    .lean();
  emitRealtime(req, 'payment-updated', { action: 'redeemed', payment }, [payment.user], { gymId: payment.gymId });
  res.json({ payment });
}

async function deletePayment(req, res) {
  assertId(req.params.id);
  const payment = await Payment.findOneAndDelete({ _id: req.params.id, ...gymFilter(req) });
  if (!payment) throw new HttpError(404, 'Pago no encontrado.');
  emitRealtime(req, 'payment-updated', { action: 'deleted', paymentId: req.params.id }, [payment.user], { gymId: payment.gymId });
  res.status(204).end();
}

module.exports = { getPayments, createPayment, updatePayment, quotePayment, redeemPaymentByPin, deletePayment };