const mongoose = require('mongoose');
const { z } = require('zod');
const StoreOrder = require('../models/store-order.model');
const Product = require('../models/product.model');
const HttpError = require('../utils/http-error');

const MOCK_GYM_ID = '60d5ecb8b392d700153ee123';
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido.');
const orderSchema = z.object({
  userId: objectIdSchema.optional(),
  items: z.array(z.object({
    productId: objectIdSchema,
    quantity: z.coerce.number().int().positive(),
  })).min(1),
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

async function deductInventory(session, order) {
  for (const item of order.items) {
    const product = await Product.findOneAndUpdate(
      { _id: item.productId, gymId: order.gymId, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { new: true, session },
    );
    if (!product) throw new HttpError(409, `Stock insuficiente para el producto ${item.productId}.`);
  }
}

async function createOrder(req, res) {
  const input = orderSchema.parse(req.body);
  const gymId = getGymId(req);
  const userId = input.userId ?? String(req.user._id);
  const status = input.status ?? (req.user.role === 'Admin' ? 'paid' : 'pending');
  const quantities = new Map();
  for (const item of input.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);

  const productIds = [...quantities.keys()];
  const products = await Product.find({ _id: { $in: productIds }, gymId }).lean();
  if (products.length !== productIds.length) throw new HttpError(400, 'Uno o más productos no existen en este gimnasio.');

  const productById = new Map(products.map((product) => [String(product._id), product]));
  const items = productIds.map((productId) => ({
    productId,
    quantity: quantities.get(productId),
    price: productById.get(productId).price,
  }));
  const totalAmount = items.reduce((total, item) => total + item.price * item.quantity, 0);

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
        status,
        paymentMethod: input.paymentMethod,
        reference: input.reference,
      }], { session });
    });
    res.status(201).json({ order });
  } finally {
    await session.endSession();
  }
}

async function getOrders(req, res) {
  const orders = await StoreOrder.find({ gymId: getGymId(req) })
    .populate('userId', 'name email')
    .populate('items.productId', 'name imageUrl price')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ orders });
}

async function getMyOrders(req, res) {
  const orders = await StoreOrder.find({ userId: req.user._id, gymId: getGymId(req) })
    .populate('items.productId', 'name imageUrl price')
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
      .lean();
    res.json({ order: updatedOrder });
  } finally {
    await session.endSession();
  }
}

module.exports = { createOrder, getOrders, getMyOrders, updateOrderStatus };