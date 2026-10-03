const { z } = require('zod');
const MembershipPlan = require('../models/membership-plan.model');
const HttpError = require('../utils/http-error');

const planSchema = z.object({
  name: z.string().trim().min(1).max(80),
  price: z.number().min(0).max(1000000),
  durationInDays: z.number().int().min(1).max(730),
  specifications: z.array(z.string().trim().min(1).max(120)).max(15).default([]),
  isActive: z.boolean().default(true),
});

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de plan inválido.');
}

async function listPlans(req, res) {
  const filter = req.user.role === 'Admin' && req.query.all === 'true' ? {} : { isActive: true };
  const plans = await MembershipPlan.find(filter).sort({ price: 1, name: 1 }).lean();
  res.json({ plans });
}

async function createPlan(req, res) {
  const plan = await MembershipPlan.create(planSchema.parse(req.body));
  res.status(201).json({ plan });
}

async function updatePlan(req, res) {
  assertId(req.params.id);
  const input = planSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');
  const plan = await MembershipPlan.findByIdAndUpdate(req.params.id, input, { new: true, runValidators: true });
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  res.json({ plan });
}

async function deletePlan(req, res) {
  assertId(req.params.id);
  const plan = await MembershipPlan.findByIdAndDelete(req.params.id);
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  res.status(204).end();
}

module.exports = { listPlans, createPlan, updatePlan, deletePlan };
