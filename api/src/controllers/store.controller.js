const { z } = require('zod');
const Product = require('../models/product.model');
const Promotion = require('../models/promotion.model');
const HttpError = require('../utils/http-error');

const MAX_IMAGE_LENGTH = 4 * 1024 * 1024;
const imageSchema = z.string().max(MAX_IMAGE_LENGTH).refine(
  (value) => value === '' || /^https:\/\/\S+$/i.test(value) || /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(value),
  'La imagen debe ser una URL https o una imagen png, jpg o webp.',
);

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(['Suplementos', 'Ropa', 'Accesorios']),
  price: z.number().min(0).max(1000000),
  image: imageSchema.default(''),
  stock: z.number().int().min(0).max(100000),
});

const promotionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  image: imageSchema.min(1),
  active: z.boolean().default(true),
});

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID inválido.');
}

async function listProducts(req, res) {
  const products = await Product.find({}).sort({ category: 1, name: 1 }).lean();
  res.json({ products });
}

async function createProduct(req, res) {
  const product = await Product.create(productSchema.parse(req.body));
  res.status(201).json({ product });
}

async function updateProduct(req, res) {
  assertId(req.params.id);
  const input = productSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');
  const product = await Product.findByIdAndUpdate(req.params.id, input, { new: true, runValidators: true });
  if (!product) throw new HttpError(404, 'Producto no encontrado.');
  res.json({ product });
}

async function deleteProduct(req, res) {
  assertId(req.params.id);
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new HttpError(404, 'Producto no encontrado.');
  res.status(204).end();
}

async function listPromotions(req, res) {
  const filter = req.user.role === 'Admin' ? {} : { active: true };
  const promotions = await Promotion.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ promotions });
}

async function createPromotion(req, res) {
  const promotion = await Promotion.create(promotionSchema.parse(req.body));
  res.status(201).json({ promotion });
}

async function updatePromotion(req, res) {
  assertId(req.params.id);
  const input = promotionSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');
  const promotion = await Promotion.findByIdAndUpdate(req.params.id, input, { new: true, runValidators: true });
  if (!promotion) throw new HttpError(404, 'Promoción no encontrada.');
  res.json({ promotion });
}

async function deletePromotion(req, res) {
  assertId(req.params.id);
  const promotion = await Promotion.findByIdAndDelete(req.params.id);
  if (!promotion) throw new HttpError(404, 'Promoción no encontrada.');
  res.status(204).end();
}

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
};
