const { z } = require('zod');
const Payment = require('../models/payment.model');
const HttpError = require('../utils/http-error');

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido.');
const paymentSchema = z.object({
  userId: objectIdSchema,
  planId: objectIdSchema,
  amount: z.coerce.number().min(0),
  paymentMethod: z.enum(['Cash', 'Card', 'Transfer']),
  paymentDate: z.coerce.date(),
  status: z.enum(['Completed', 'Pending', 'Failed']),
});

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de pago inválido.');
}

async function getPayments(req, res) {
  const payments = await Payment.find({})
    .populate('userId', 'name email')
    .populate('planId', 'name')
    .sort({ paymentDate: -1 })
    .lean();
  res.json({ payments });
}

async function createPayment(req, res) {
  const input = paymentSchema.parse(req.body);
  const payment = await Payment.create({
    ...input,
    user: input.userId,
    planName: 'Pago administrativo',
    currency: 'MXN',
    durationDays: 30,
    method: 'reception',
    reference: `ADMIN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: input.status,
  });
  res.status(201).json({ payment });
}

async function updatePayment(req, res) {
  assertId(req.params.id);
  const input = paymentSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const payment = await Payment.findByIdAndUpdate(
    req.params.id,
    { ...input, ...(input.userId ? { user: input.userId } : {}) },
    { new: true, runValidators: true },
  )
    .populate('userId', 'name email')
    .populate('planId', 'name');
  if (!payment) throw new HttpError(404, 'Pago no encontrado.');
  res.json({ payment });
}

async function deletePayment(req, res) {
  assertId(req.params.id);
  const payment = await Payment.findByIdAndDelete(req.params.id);
  if (!payment) throw new HttpError(404, 'Pago no encontrado.');
  res.status(204).end();
}

module.exports = { getPayments, createPayment, updatePayment, deletePayment };