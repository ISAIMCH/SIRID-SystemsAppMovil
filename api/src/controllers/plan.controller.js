const { z } = require('zod');
const MembershipPlan = require('../models/membership-plan.model');
const HttpError = require('../utils/http-error');

const booleanSchema = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const specificationsSchema = z.union([
  z.array(z.string().trim().min(1).max(120)).max(15),
  z.string().transform((value) => value.split('\n').map((item) => item.trim()).filter(Boolean)),
]);

const planInputSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  nombre: z.string().trim().min(1).max(80).optional(),
  price: z.coerce.number().min(0).max(1000000).optional(),
  precio: z.coerce.number().min(0).max(1000000).optional(),
  durationInDays: z.coerce.number().int().min(1).max(730).optional(),
  duracion: z.coerce.number().int().min(1).max(730).optional(),
  specifications: specificationsSchema.optional(),
  especificaciones: specificationsSchema.optional(),
  autoRenew: booleanSchema.optional(),
  planType: z.enum(['standard', 'promotional']).optional(),
  isActive: booleanSchema.optional(),
  tipoCobro: z.string().trim().min(1).max(30).optional(),
});

function parsePlanInput(body, { partial = false } = {}) {
  const input = planInputSchema.parse(body);
  const plan = {
    ...(input.name !== undefined || input.nombre !== undefined ? { name: input.name ?? input.nombre } : {}),
    ...(input.price !== undefined || input.precio !== undefined ? { price: input.price ?? input.precio } : {}),
    ...(input.durationInDays !== undefined || input.duracion !== undefined
      ? { durationInDays: input.durationInDays ?? input.duracion } : {}),
    ...(input.specifications !== undefined || input.especificaciones !== undefined
      ? { specifications: input.specifications ?? input.especificaciones } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.autoRenew !== undefined ? { autoRenew: input.autoRenew } : {}),
    ...(input.planType !== undefined ? { planType: input.planType } : {}),
  };

  if (!partial) {
    if (plan.name === undefined) throw new HttpError(400, 'El nombre del plan es obligatorio.');
    if (plan.price === undefined) throw new HttpError(400, 'El precio del plan es obligatorio.');
    if (plan.durationInDays === undefined) throw new HttpError(400, 'La duración del plan es obligatoria.');
    if (plan.specifications === undefined) plan.specifications = [];
    if (plan.autoRenew === undefined) plan.autoRenew = true;
    if (plan.planType === undefined) plan.planType = 'standard';
    if (plan.isActive === undefined) plan.isActive = true;
  }
  return plan;
}

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de plan inválido.');
}

async function listPlans(req, res) {
  const filter = {
    isDeleted: { $ne: true },
    ...(req.user.role === 'Admin' && req.query.all === 'true' ? {} : { isActive: true }),
  };
  const plans = await MembershipPlan.find(filter).sort({ price: 1, name: 1 }).lean();
  res.json({ plans });
}

async function createPlan(req, res) {
  const plan = await MembershipPlan.create(parsePlanInput(req.body));
  res.status(201).json({ plan });
}

async function updatePlan(req, res) {
  assertId(req.params.id);
  const input = parsePlanInput(req.body, { partial: true });
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');
  const plan = await MembershipPlan.findOneAndUpdate(
    { _id: req.params.id, isDeleted: { $ne: true } },
    input,
    { new: true, runValidators: true },
  );
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  res.json({ plan });
}

async function deletePlan(req, res) {
  assertId(req.params.id);
  const plan = await MembershipPlan.findOneAndUpdate(
    { _id: req.params.id, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: new Date(), isActive: false } },
    { new: true },
  );
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  res.status(204).end();
}

module.exports = { listPlans, createPlan, updatePlan, deletePlan };
