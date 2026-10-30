const { z } = require('zod');
const MembershipPlan = require('../models/membership-plan.model');
const Gym = require('../models/gym.model');
const { GYM_ACCESS_SCOPES } = require('../models/gym-access.schema');
const HttpError = require('../utils/http-error');
const { resolveTenant, organizationFilter } = require('../utils/tenant');

const booleanSchema = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const specificationsSchema = z.union([
  z.array(z.string().trim().min(1).max(120)).max(15),
  z.string().transform((value) => value.split('\n').map((item) => item.trim()).filter(Boolean)),
]);

const gymAccessSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, z.object({
  scope: z.enum(GYM_ACCESS_SCOPES),
  gymIds: z.array(z.string().regex(/^[a-f\d]{24}$/i, 'ID de sucursal inválido.')).max(100).default([]),
}).refine((access) => access.scope !== 'list' || access.gymIds.length > 0, { path: ['gymIds'], message: 'Elige al menos una sucursal.' })
  .transform((access) => ({ scope: access.scope, gymIds: access.scope === 'list' ? [...new Set(access.gymIds)] : [] })));

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
  gymAccess: gymAccessSchema.optional(),
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
    ...(input.gymAccess !== undefined ? { gymAccess: input.gymAccess } : {}),
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

async function assertGymsInOrganization(plan, organizationId) {
  const gymIds = plan.gymAccess?.gymIds ?? [];
  if (gymIds.length === 0) return;
  if (await Gym.countDocuments({ _id: { $in: gymIds }, organizationId }) !== gymIds.length) {
    throw new HttpError(400, 'Alguna sucursal del plan no existe.');
  }
}

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de plan inválido.');
}

async function listPlans(req, res) {
  const filter = {
    ...organizationFilter(req),
    isDeleted: { $ne: true },
    ...(resolveTenant(req).role === 'Admin' && req.query.all === 'true' ? {} : { isActive: true }),
  };
  const plans = await MembershipPlan.find(filter).sort({ price: 1, name: 1 }).lean();
  res.json({ plans });
}

async function createPlan(req, res) {
  const input = parsePlanInput(req.body);
  await assertGymsInOrganization(input, resolveTenant(req).organizationId);
  const plan = await MembershipPlan.create({ ...input, ...organizationFilter(req) });
  res.status(201).json({ plan });
}

async function updatePlan(req, res) {
  assertId(req.params.id);
  const input = parsePlanInput(req.body, { partial: true });
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');
  await assertGymsInOrganization(input, resolveTenant(req).organizationId);
  const plan = await MembershipPlan.findOneAndUpdate(
    { _id: req.params.id, ...organizationFilter(req), isDeleted: { $ne: true } },
    input,
    { new: true, runValidators: true },
  );
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  res.json({ plan });
}

async function deletePlan(req, res) {
  assertId(req.params.id);
  const plan = await MembershipPlan.findOneAndUpdate(
    { _id: req.params.id, ...organizationFilter(req), isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: new Date(), isActive: false } },
    { new: true },
  );
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  res.status(204).end();
}

module.exports = { listPlans, createPlan, updatePlan, deletePlan };
