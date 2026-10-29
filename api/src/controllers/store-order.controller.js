const { randomInt } = require('node:crypto');
const mongoose = require('mongoose');
const { z } = require('zod');
const StoreOrder = require('../models/store-order.model');
const Product = require('../models/product.model');
const Promotion = require('../models/promotion.model');
const HttpError = require('../utils/http-error');
const { emitRealtime } = require('../utils/realtime');

const MOCK_GYM_ID = '60d5ecb8b392d700153ee123';
const PICKUP_PIN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido.');
const orderSchema = z.object({
  userId: objectIdSchema.optional(),
  items: z.array(z.object({
    productId: objectIdSchema,
    quantity: z.coerce.number().int().positive(),
  })).min(1),
  promotionId: z.union([objectIdSchema, z.literal('')])
    .transform((value) => value || null)
    .optional(),
  paymentMethod: z.string().trim().min(1).max(40).default('reception'),
  reference: z.string().trim().max(120).optional(),
  status: z.enum(['pending', 'paid', 'cancelled']).optional(),
});

function getGymId(req) {
  const gymId = req.user?.gymId ?? req.auth?.gymId ?? req.gymId ?? MOCK_GYM_ID;
  if (!mongoose.isValidObjectId(gymId)) throw new HttpError(400, 'No se pudo determinar el gimnasio autenticado.');
  return gymId;
}

function assertId(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'ID de pedido inválido.');
}

// A unique partial index on pending orders backs this check against races.
async function generateUniquePickupPin() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pin = Array.from({ length: 4 }, () => PICKUP_PIN_ALPHABET[randomInt(PICKUP_PIN_ALPHABET.length)]).join('');
    if (!(await StoreOrder.exists({ pickupPin: pin, status: 'pending' }))) return pin;
  }
  throw new HttpError(503, 'No se pudo generar un PIN. Intenta de nuevo.');
}

async function deductInventory(session, order) {
  for (const item of order.items) {
    const product = await Product.findOneAndUpdate(
      { _id: item.productId, gymId: order.gymId, isDeleted: { $ne: true }, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { new: true, session },
    );
    if (!product) throw new HttpError(409, `Stock insuficiente para el producto ${item.productId}.`);
  }
}

// Only an Admin may create orders for another user or with a non-pending status.
function resolveOrderOwnership(user, input) {
  if (user.role !== 'Admin') return { userId: String(user._id), status: 'pending' };
  return { userId: input.userId ?? String(user._id), status: input.status ?? 'paid' };
}

async function createOrder(req, res) {
  const input = orderSchema.parse(req.body);
  const gymId = getGymId(req);
  const { userId, status } = resolveOrderOwnership(req.user, input);
  const quantities = new Map();
  for (const item of input.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);

  const productIds = [...quantities.keys()];
  const products = await Product.find({ _id: { $in: productIds }, gymId, isDeleted: { $ne: true } }).lean();
  if (products.length !== productIds.length) throw new HttpError(400, 'Uno o más productos no existen en este gimnasio.');

  const productById = new Map(products.map((product) => [String(product._id), product]));
  const items = productIds.map((productId) => ({
    productId,
    quantity: quantities.get(productId),
    price: productById.get(productId).price,
  }));
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  let promotionId = null;
  let discountApplied = 0;
  if (input.promotionId) {
    const promotion = await Promotion.findOne({ _id: input.promotionId, gymId }).lean();
    if (!promotion || promotion.isActive !== true || (promotion.validUntil && promotion.validUntil <= new Date())) {
      throw new HttpError(400, 'La promoción no existe, está inactiva o ha expirado.');
    }
    promotionId = promotion._id;
    const applicableProductIds = new Set((promotion.applicableProducts ?? []).map((productId) => String(productId)));
    const discountableSubtotal = applicableProductIds.size === 0
      ? subtotal
      : items.reduce((total, item) => (
        applicableProductIds.has(String(item.productId))
          ? total + item.price * item.quantity
          : total
      ), 0);
    discountApplied = Math.round((discountableSubtotal * promotion.discountPercentage / 100) * 100) / 100;
  }
  const totalAmount = Math.round((subtotal - discountApplied) * 100) / 100;
  const pickupPin = await generateUniquePickupPin();

  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      if (status === 'paid') await deductInventory(session, { items, gymId });
      [order] = await StoreOrder.create([{
        userId,
        gymId,
        items,
        totalAmount,
        promotionId,
        discountApplied,
        status,
        paymentMethod: input.paymentMethod,
        reference: input.reference,
        pickupPin,
      }], { session });
    });
    const createdOrder = await StoreOrder.findById(order._id)
      .populate('userId', 'name email')
      .populate('items.productId', 'name imageUrl price')
      .populate('promotionId', 'title discountPercentage validUntil')
      .lean();
    emitRealtime(req, 'sale-updated', { action: 'created', order: createdOrder }, [createdOrder.userId]);
    res.status(201).json({ order: createdOrder });
  } finally {
    await session.endSession();
  }
}

async function getOrders(req, res) {
  const orders = await StoreOrder.find({ gymId: getGymId(req) })
    .populate('userId', 'name email')
    .populate('items.productId', 'name imageUrl price')
    .populate('promotionId', 'title discountPercentage validUntil')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ orders });
}

async function getMyOrders(req, res) {
  const orders = await StoreOrder.find({ userId: req.user._id, gymId: getGymId(req) })
    .populate('items.productId', 'name imageUrl price')
    .populate('promotionId', 'title discountPercentage validUntil')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ orders });
}

async function updateOrderStatus(req, res) {
  assertId(req.params.id);
  const input = z.object({
    status: z.enum(['pending', 'paid', 'cancelled']),
    paymentMethod: z.string().trim().min(1).max(40).optional(),
    reference: z.string().trim().max(120).optional(),
  }).parse(req.body);
  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await StoreOrder.findOne({ _id: req.params.id, gymId: getGymId(req) }).session(session);
      if (!order) throw new HttpError(404, 'Pedido no encontrado.');
      if (order.status === 'paid' && input.status !== 'paid') throw new HttpError(409, 'Un pedido pagado no puede cambiar de estado.');
      if (order.status !== 'paid' && input.status === 'paid') await deductInventory(session, order);
      order.status = input.status;
      if (input.paymentMethod !== undefined) order.paymentMethod = input.paymentMethod;
      if (input.reference !== undefined) order.reference = input.reference;
      await order.save({ session });
    });

    const updatedOrder = await StoreOrder.findById(order._id)
      .populate('userId', 'name email')
      .populate('items.productId', 'name imageUrl price')
      .populate('promotionId', 'title discountPercentage validUntil')
      .lean();
    emitRealtime(req, 'sale-updated', { action: 'updated', order: updatedOrder }, [updatedOrder.userId]);
    res.json({ order: updatedOrder });
  } finally {
    await session.endSession();
  }
}

async function redeemOrderByPin(req, res) {
  const { pin } = z.object({ pin: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}$/, 'El PIN debe tener 4 caracteres.') }).parse(req.body);
  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await StoreOrder.findOne({ pickupPin: pin, status: 'pending', gymId: getGymId(req) }).session(session);
      if (!order) throw new HttpError(404, 'No hay un pedido pendiente con ese PIN.');
      await deductInventory(session, order);
      order.status = 'paid';
      order.paymentMethod = order.paymentMethod ?? 'reception';
      await order.save({ session });
    });

    const updatedOrder = await StoreOrder.findById(order._id)
      .populate('userId', 'name email')
      .populate('items.productId', 'name imageUrl price')
      .populate('promotionId', 'title discountPercentage validUntil')
      .lean();
    emitRealtime(req, 'sale-updated', { action: 'redeemed', order: updatedOrder }, [updatedOrder.userId]);
    res.json({ order: updatedOrder });
  } finally {
    await session.endSession();
  }
}

module.exports = { createOrder, getOrders, getMyOrders, updateOrderStatus, redeemOrderByPin, resolveOrderOwnership };