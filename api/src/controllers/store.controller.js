const { z } = require('zod');
const mongoose = require('mongoose');
const Product = require('../models/product.model');
const Promotion = require('../models/promotion.model');
const HttpError = require('../utils/http-error');
const parseUpdate = require('../utils/parse-update');

// Serves both /api/store/{products,promotions} (mobile app) and /api/products, /api/promotions (Admin dashboard).
const MAX_IMAGE_LENGTH = 4 * 1024 * 1024;
const MOCK_GYM_ID = '60d5ecb8b392d700153ee123';
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID de producto inválido.');
const imageSchema = z.string().trim().max(MAX_IMAGE_LENGTH).refine(
  (value) => value === '' || /^https?:\/\/\S+$/i.test(value) || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value),
  'La imagen debe ser una URL http(s) o una imagen png, jpg, webp o gif.',
);

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  price: z.coerce.number().min(0).max(1000000),
  imageUrl: imageSchema.default(''),
  stock: z.coerce.number().int().min(0).max(100000),
});

const promotionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  imageUrl: imageSchema.default(''),
  discountPercentage: z.coerce.number().min(0).max(100).default(0),
  applicableProducts: z.array(objectIdSchema).default([]),
  validUntil: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
  active: z.boolean().optional(),
});

function getGymId(req) {
  const gymId = req.user?.gymId ?? req.auth?.gymId ?? req.gymId ?? MOCK_GYM_ID;
  if (!gymId || !mongoose.isValidObjectId(gymId)) {
    throw new HttpError(400, 'No se pudo determinar el gimnasio autenticado.');
  }
  return gymId;
}

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID inválido.');
}

// The app uses `active` and the dashboard `isActive`; both fields are kept in sync.
function syncActiveFlags(input) {
  const { isActive, active, ...rest } = input;
  const value = isActive ?? active;
  return value === undefined ? rest : { ...rest, isActive: value, active: value };
}

async function getProducts(req, res) {
  const gymId = getGymId(req);
  const products = await Product.find({ gymId, isDeleted: { $ne: true } }).sort({ category: 1, name: 1 }).lean();
  res.json({ products });
}

async function createProduct(req, res) {
  const product = await Product.create({ ...productSchema.parse(req.body), gymId: getGymId(req) });
  res.status(201).json({ product });
}

async function updateProduct(req, res) {
  assertId(req.params.id);
  const input = parseUpdate(productSchema, req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, gymId: getGymId(req), isDeleted: { $ne: true } },
    input,
    { new: true, runValidators: true },
  );
  if (!product) throw new HttpError(404, 'Producto no encontrado.');
  res.json({ product });
}

async function deleteProduct(req, res) {
  assertId(req.params.id);
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, gymId: getGymId(req), isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: new Date(), stock: 0 } },
    { new: true },
  );
  if (!product) throw new HttpError(404, 'Producto no encontrado.');
  res.status(204).end();
}

async function listPromotions(req, res) {
  const filter = { gymId: getGymId(req) };
  if (req.user.role !== 'Admin') Object.assign(filter, { active: { $ne: false }, isActive: { $ne: false } });
  const promotions = await Promotion.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ promotions });
}

async function createPromotion(req, res) {
  const input = syncActiveFlags({ isActive: true, ...promotionSchema.parse(req.body) });
  const promotion = await Promotion.create({ ...input, gymId: getGymId(req) });
  res.status(201).json({ promotion });
}

async function updatePromotion(req, res) {
  assertId(req.params.id);
  const input = syncActiveFlags(parseUpdate(promotionSchema, req.body));
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');
  const promotion = await Promotion.findOneAndUpdate({ _id: req.params.id, gymId: getGymId(req) }, input, { new: true, runValidators: true });
  if (!promotion) throw new HttpError(404, 'Promoción no encontrada.');
  res.json({ promotion });
}

async function deletePromotion(req, res) {
  assertId(req.params.id);
  const promotion = await Promotion.findOneAndDelete({ _id: req.params.id, gymId: getGymId(req) });
  if (!promotion) throw new HttpError(404, 'Promoción no encontrada.');
  res.status(204).end();
}

module.exports = {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  syncActiveFlags,
};
