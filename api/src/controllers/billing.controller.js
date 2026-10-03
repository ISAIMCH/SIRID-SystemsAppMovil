const { randomBytes, randomInt } = require('node:crypto');
const { z } = require('zod');
const Payment = require('../models/payment.model');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');

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

async function generateUniquePin() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pin = String(randomInt(0, 100000)).padStart(5, '0');
    if (!(await Payment.exists({ validationPin: pin, status: 'pending' }))) return pin;
  }
  throw new HttpError(503, 'No se pudo generar un PIN. Intenta de nuevo.');
}

async function getMyBilling(req, res) {
  const user = await User.findById(req.user.id).select('membership');
  const payments = await Payment.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
  for (const payment of payments) {
    if (payment.status === 'pending' && !payment.validationPin) {
      payment.validationPin = await generateUniquePin();
      await Payment.updateOne({ _id: payment._id }, { $set: { validationPin: payment.validationPin } });
    }
  }
  res.json({ membership: user.membership, payments: payments.map((payment) => serializePayment(payment, { includePin: true })) });
}

async function requestReceptionPayment(req, res) {
  const user = await User.findById(req.user.id).select('membership role isActive');
  if (!user || user.role !== 'Cliente' || !user.isActive) throw new HttpError(403, 'La cuenta no está habilitada.');

  const membership = user.membership;
  if (!membership?.planName || typeof membership.price !== 'number' || !membership.durationDays) {
    throw new HttpError(400, 'Tu gimnasio todavía no configuró un plan y precio para tu membresía.');
  }
  const existingRequest = await Payment.findOne({ user: user.id, status: 'pending' });
  if (existingRequest) throw new HttpError(409, 'Ya tienes una solicitud de pago pendiente.');

  const payment = await Payment.create({
    user: user.id,
    planName: membership.planName,
    amount: membership.price,
    currency: membership.currency ?? 'MXN',
    durationDays: membership.durationDays,
    method: 'reception',
    status: 'pending',
    reference: `GYM-${randomBytes(5).toString('hex').toUpperCase()}`,
    validationPin: await generateUniquePin(),
  });

  res.status(201).json({ payment: serializePayment(payment.toObject(), { includePin: true }) });
}

async function findPendingPaymentByPin(req, res) {
  const { pin } = z.object({ pin: z.string().regex(/^\d{5}$/, 'El PIN debe tener 5 dígitos.') }).parse(req.params);
  const payment = await Payment.findOne({ validationPin: pin, status: 'pending' })
    .populate('user', 'name email')
    .lean();
  if (!payment) throw new HttpError(404, 'No hay un pago pendiente con ese PIN.');
  res.json({ payment: serializePayment(payment) });
}

async function listPayments(req, res) {
  const input = z.object({ status: z.enum(['pending', 'paid', 'cancelled']).optional() }).parse(req.query);
  const filter = input.status ? { status: input.status } : {};
  const payments = await Payment.find(filter)
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ payments: payments.map(serializePayment) });
}

async function updatePaymentStatus(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de pago inválido.');
  const { status } = z.object({ status: z.enum(['paid', 'cancelled']) }).parse(req.body);
  const session = await User.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({ _id: req.params.id, status: 'pending' }).session(session);
      if (!payment) throw new HttpError(404, 'No existe un pago pendiente con ese ID.');

      payment.status = status;
      payment.processedBy = req.user.id;
      payment.processedAt = new Date();
      await payment.save({ session });

      if (status === 'paid') {
        const user = await User.findOne({ _id: payment.user, role: 'Cliente' }).session(session);
        if (!user) throw new HttpError(404, 'No se encontró el cliente del pago.');

        const now = new Date();
        const currentExpiry = user.membership.expiresAt;
        const isMembershipCurrent = currentExpiry && currentExpiry > now;
        const periodStartsAt = isMembershipCurrent ? currentExpiry : now;
        user.membership.status = 'active';
        if (!isMembershipCurrent) user.membership.startsAt = now;
        user.membership.expiresAt = new Date(periodStartsAt.getTime() + payment.durationDays * 86400000);
        user.membership.planName = payment.planName;
        user.membership.price = payment.amount;
        user.membership.currency = payment.currency;
        user.membership.durationDays = payment.durationDays;
        await user.save({ session });
      }

      result = serializePayment(payment.toObject());
    });
  } finally {
    await session.endSession();
  }

  res.json({ payment: result });
}

module.exports = { getMyBilling, requestReceptionPayment, listPayments, updatePaymentStatus, findPendingPaymentByPin };