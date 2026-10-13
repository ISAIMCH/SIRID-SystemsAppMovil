const { z } = require('zod');
const mongoose = require('mongoose');
const Promotion = require('../models/promotion.model');
const HttpError = require('../utils/http-error');

const MOCK_GYM_ID = '60d5ecb8b392d700153ee123';
const promotionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  discountPercentage: z.coerce.number().min(0).max(100),
  validUntil: z.coerce.date(),
  isActive: z.boolean().default(true),
});

function getGymId(req) {
  const gymId = req.user?.gymId ?? req.auth?.gymId ?? req.gymId ?? MOCK_GYM_ID;
  if (!mongoose.isValidObjectId(gymId)) throw new HttpError(400, 'No se pudo determinar el gimnasio autenticado.');
  return gymId;
}

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de promoción inválido.');
}

async function getPromotions(req, res) {
  const promotions = await Promotion.find({ gymId: getGymId(req) }).sort({ createdAt: -1 }).lean();
  res.json({ promotions });
}

async function createPromotion(req, res) {
  const input = promotionSchema.parse(req.body);
  const promotion = await Promotion.create({ ...input, active: input.isActive, gymId: getGymId(req) });
  res.status(201).json({ promotion });
}

async function updatePromotion(req, res) {
  assertId(req.params.id);
  const input = promotionSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const update = input.isActive === undefined ? input : { ...input, active: input.isActive };
  const promotion = await Promotion.findOneAndUpdate(
    { _id: req.params.id, gymId: getGymId(req) },
    update,
    { new: true, runValidators: true },
  ).lean();
  if (!promotion) throw new HttpError(404, 'Promoción no encontrada.');
  res.json({ promotion });
}

async function deletePromotion(req, res) {
  assertId(req.params.id);
  const promotion = await Promotion.findOneAndDelete({ _id: req.params.id, gymId: getGymId(req) });
  if (!promotion) throw new HttpError(404, 'Promoción no encontrada.');
  res.status(204).end();
}

module.exports = { getPromotions, createPromotion, updatePromotion, deletePromotion };