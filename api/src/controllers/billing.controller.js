const { randomBytes } = require('node:crypto');
const { z } = require('zod');
const Payment = require('../models/payment.model');
const Membership = require('../models/membership.model');
const HttpError = require('../utils/http-error');
const { activateMembership } = require('../utils/membership');
const { generateUniquePaymentPin } = require('../utils/payment-pin');
const { resolveTenant, organizationFilter, gymFilter } = require('../utils/tenant');

const MEMBERSHIP_FIELDS = 'status startsAt expiresAt planName price currency durationDays autoRenew';

function serializePayment(payment, { includePin = false } = {}) {
  const user = payment.user;
  return {
    ...(includePin ? { validationPin: payment.validationPin } : {}),
    id: String(payment._id),
    user: user && typeof user === 'object' && user.name ? {
      id: String(user._id),
      name: user.name,
      email: user.email,
    } : String(user),
    planName: payment.planName,
    amount: payment.amount,
    currency: payment.currency,
    durationDays: payment.durationDays,
    method: payment.method,
    status: payment.status,
    reference: payment.reference,
    createdAt: payment.createdAt,
    processedAt: payment.processedAt,
  };
}

// The client's membership and payments with the organization of the request.
async function getMyBilling(req, res) {
  const [membership, payments] = await Promise.all([
    Membership.findOne({ userId: req.user._id, ...organizationFilter(req) }).select(MEMBERSHIP_FIELDS).lean(),
    Payment.find({ user: req.user._id, ...organizationFilter(req) }).sort({ createdAt: -1 }).lean(),
  ]);
  res.json({ membership: membership ?? { status: 'pending' }, payments: payments.map((payment) => serializePayment(payment, { includePin: true })) });
}

async function requestReceptionPayment(req, res) {
  const { organizationId, gymId } = resolveTenant(req);
  const membership = await Membership.findOne({ userId: req.user._id, organizationId }).lean();
  if (!membership?.planName || typeof membership.price !== 'number' || !membership.durationDays) {
    throw new HttpError(400, 'Tu gimnasio todavía no configuró un plan y precio para tu membresía.');
  }
  const existingRequest = await Payment.findOne({ user: req.user._id, organizationId, status: 'pending' });
  if (existingRequest) throw new HttpError(409, 'Ya tienes una solicitud de pago pendiente.');
  const pin = await generateUniquePaymentPin();

  const payment = await Payment.create({
    user: req.user._id,
    organizationId,
    gymId,
    planId: membership.planId ?? undefined,
    planName: membership.planName,
    amount: membership.price,
    currency: membership.currency ?? 'MXN',
    durationDays: membership.durationDays,
    method: 'reception',
    status: 'pending',
    reference: `GYM-${randomBytes(5).toString('hex').toUpperCase()}`,
    pin,
    validationPin: pin,
  });

  res.status(201).json({ payment: serializePayment(payment.toObject(), { includePin: true }) });
}

async function findPendingPaymentByPin(req, res) {
  const { pin } = z.object({ pin: z.string().regex(/^\d{5}$/, 'El PIN debe tener 5 dígitos.') }).parse(req.params);
  const payment = await Payment.findOne({ ...gymFilter(req), validationPin: pin, status: 'pending' })
    .populate('user', 'name email')
    .lean();
  if (!payment) throw new HttpError(404, 'No hay un pago pendiente con ese PIN.');
  res.json({ payment: serializePayment(payment) });
}

async function listPayments(req, res) {
  const input = z.object({ status: z.enum(['pending', 'paid', 'cancelled']).optional() }).parse(req.query);
  const filter = { ...gymFilter(req), ...(input.status ? { status: input.status } : {}) };
  const payments = await Payment.find(filter)
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ payments: payments.map(serializePayment) });
}

async function updatePaymentStatus(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de pago inválido.');
  const { status } = z.object({ status: z.enum(['paid', 'cancelled']) }).parse(req.body);
  const session = await Payment.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({ _id: req.params.id, ...gymFilter(req), status: 'pending' }).session(session);
      if (!payment) throw new HttpError(404, 'No existe un pago pendiente con ese ID.');

      payment.status = status;
      payment.processedBy = req.user.id;
      payment.processedAt = new Date();
      await payment.save({ session });

      if (status === 'paid') await activateMembership(session, payment);

      result = serializePayment(payment.toObject());
    });
  } finally {
    await session.endSession();
  }

  res.json({ payment: result });
}

module.exports = { getMyBilling, requestReceptionPayment, listPayments, updatePaymentStatus, findPendingPaymentByPin };