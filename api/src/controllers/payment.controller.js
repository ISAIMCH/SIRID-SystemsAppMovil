const { z } = require('zod');
const Payment = require('../models/payment.model');
const User = require('../models/user.model');
const MembershipPlan = require('../models/membership-plan.model');
const HttpError = require('../utils/http-error');
const { emitRealtime } = require('../utils/realtime');
const { activateMembership } = require('../utils/membership');
const { generateUniquePaymentPin } = require('../utils/payment-pin');
const parseUpdate = require('../utils/parse-update');

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido.');
const paymentSchema = z.object({
  userId: objectIdSchema,
  planId: objectIdSchema,
  amount: z.coerce.number().min(0),
  currency: z.string().trim().length(3).default('MXN'),
  durationDays: z.coerce.number().int().min(1).max(730).optional(),
  source: z.enum(['reception']),
  paymentDate: z.coerce.date(),
  status: z.enum(['paid', 'pending', 'cancelled']),
  reference: z.string().trim().min(1).max(120).optional(),
});

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de pago inválido.');
}

async function getPayments(req, res) {
  const payments = await Payment.find({})
    .populate('userId', 'name email')
    .populate('planId', 'name')
    .populate('user', 'name email')
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();
  res.json({ payments });
}

async function assertNoOtherPendingPayment(userId, paymentId = null) {
  if (await Payment.exists({ user: userId, status: 'pending', _id: { $ne: paymentId } })) {
    throw new HttpError(409, 'El cliente ya tiene un pago pendiente.');
  }
}

async function createPayment(req, res) {
  const input = paymentSchema.parse(req.body);
  const [user, plan] = await Promise.all([
    User.findById(input.userId).select('_id'),
    MembershipPlan.findOne({ _id: input.planId, isDeleted: { $ne: true } }).select('name durationInDays'),
  ]);
  if (!user) throw new HttpError(404, 'Usuario no encontrado.');
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  if (input.status === 'pending') await assertNoOtherPendingPayment(input.userId);
  const pin = input.status === 'pending' ? await generateUniquePaymentPin() : null;

  const session = await Payment.startSession();
  let payment;
  try {
    await session.withTransaction(async () => {
      [payment] = await Payment.create([{
        ...input,
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
  emitRealtime(req, 'payment-updated', { action: 'created', payment: payment.toObject() }, [payment.user]);
  res.status(201).json({ payment });
}

async function updatePayment(req, res) {
  assertId(req.params.id);
  const input = parseUpdate(paymentSchema, req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const update = { ...input };
  if (input.currency) update.currency = input.currency.toUpperCase();
  if (input.source) update.method = input.source;
  if (input.userId) update.user = input.userId;
  if (input.planId) {
    const plan = await MembershipPlan.findOne({ _id: input.planId, isDeleted: { $ne: true } }).select('name');
    if (!plan) throw new HttpError(404, 'Plan no encontrado.');
    update.planName = plan.name;
  }

  const session = await Payment.startSession();
  let paymentId;
  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findById(req.params.id).session(session);
      if (!payment) throw new HttpError(404, 'Pago no encontrado.');
      const wasPaid = payment.status === 'paid';
      if (wasPaid && update.status && update.status !== 'paid') {
        throw new HttpError(409, 'Un pago pagado no puede cambiar de estado.');
      }
      payment.set(update);
      if (payment.status === 'pending') {
        await assertNoOtherPendingPayment(payment.user, payment._id);
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
  emitRealtime(req, 'payment-updated', { action: 'updated', payment: payment.toObject() }, [payment.user]);
  res.json({ payment });
}

async function redeemPaymentByPin(req, res) {
  const { pin } = z.object({ pin: z.string().trim().regex(/^\d{5}$/, 'El PIN debe tener 5 dígitos.') }).parse(req.body);
  const session = await User.startSession();
  let paymentId;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({
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
  emitRealtime(req, 'payment-updated', { action: 'redeemed', payment }, [payment.user]);
  res.json({ payment });
}

async function deletePayment(req, res) {
  assertId(req.params.id);
  const payment = await Payment.findByIdAndDelete(req.params.id);
  if (!payment) throw new HttpError(404, 'Pago no encontrado.');
  emitRealtime(req, 'payment-updated', { action: 'deleted', paymentId: req.params.id }, [payment.user]);
  res.status(204).end();
}

module.exports = { getPayments, createPayment, updatePayment, redeemPaymentByPin, deletePayment };