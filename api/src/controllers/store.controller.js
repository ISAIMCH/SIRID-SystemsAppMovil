const { z } = require('zod');
const mongoose = require('mongoose');
const Product = require('../models/product.model');
const Promotion = require('../models/promotion.model');
const Order = require('../models/order.model');
const HttpError = require('../utils/http-error');

const MAX_IMAGE_LENGTH = 4 * 1024 * 1024;
const MOCK_GYM_ID = '60d5ecb8b392d700153ee123';
const imageSchema = z.string().max(MAX_IMAGE_LENGTH).refine(
  (value) => value === '' || /^https:\/\/\S+$/i.test(value) || /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(value),
  'La imagen debe ser una URL https o una imagen png, jpg o webp.',
);

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(['Suplementos', 'Ropa', 'Accesorios']),
  price: z.number().min(0).max(1000000),
  imageUrl: imageSchema.default(''),
  stock: z.number().int().min(0).max(100000),
});

const promotionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  imageUrl: imageSchema.min(1),
  active: z.boolean().default(true),
});

const orderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().regex(/^[a-f\d]{24}$/i),
    quantity: z.number().int().positive(),
  })).min(1),
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

async function getProducts(req, res) {
  const gymId = getGymId(req);
  const products = await Product.find({ gymId }).sort({ category: 1, name: 1 }).lean();
  res.json({ products });
}

async function createProduct(req, res) {
  const product = await Product.create({ ...productSchema.parse(req.body), gymId: getGymId(req) });
  res.status(201).json({ product });
}

async function updateProduct(req, res) {
  assertId(req.params.id);
  const input = productSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');
  const product = await Product.findOneAndUpdate({ _id: req.params.id, gymId: getGymId(req) }, input, { new: true, runValidators: true });
  if (!product) throw new HttpError(404, 'Producto no encontrado.');
  res.json({ product });
}

async function deleteProduct(req, res) {
  assertId(req.params.id);
  const product = await Product.findOneAndDelete({ _id: req.params.id, gymId: getGymId(req) });
  if (!product) throw new HttpError(404, 'Producto no encontrado.');
  res.status(204).end();
}

async function listPromotions(req, res) {
  const filter = { gymId: getGymId(req) };
  if (req.user.role !== 'Admin') filter.active = true;
  const promotions = await Promotion.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ promotions });
}

async function createPromotion(req, res) {
  const promotion = await Promotion.create({ ...promotionSchema.parse(req.body), gymId: getGymId(req) });
  res.status(201).json({ promotion });
}

async function updatePromotion(req, res) {
  assertId(req.params.id);
  const input = promotionSchema.partial().parse(req.body);
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

async function createOrder(req, res) {
  const gymId = getGymId(req);
  const { items } = orderSchema.parse(req.body);
  const quantities = new Map();
  for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);

  const productIds = [...quantities.keys()];
  const products = await Product.find({ _id: { $in: productIds }, gymId }).lean();
  if (products.length !== productIds.length) throw new HttpError(400, 'Uno o más productos no existen en este gimnasio.');

  const productById = new Map(products.map((product) => [String(product._id), product]));
  let totalPrice = 0;
  for (const [productId, quantity] of quantities) {
    const product = productById.get(productId);
    if (product.stock < quantity) throw new HttpError(409, `Stock insuficiente para ${product.name}.`);
    totalPrice += product.price * quantity;
  }

  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      for (const [productId, quantity] of quantities) {
        const updated = await Product.findOneAndUpdate(
          { _id: productId, gymId, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { new: true, session },
        );
        if (!updated) throw new HttpError(409, 'El stock cambió. Intenta de nuevo.');
      }
      [order] = await Order.create([{
        userId: req.user._id,
        gymId,
        items: [...quantities].map(([productId, quantity]) => ({ productId, quantity })),
        totalPrice,
        status: 'pending',
      }], { session });
    });
    res.status(201).json({ order });
  } finally {
    await session.endSession();
  }
}

module.exports = {
  getProducts,
  listProducts: getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  createOrder,
};
