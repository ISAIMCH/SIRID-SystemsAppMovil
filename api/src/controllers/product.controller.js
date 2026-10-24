const { z } = require('zod');
const mongoose = require('mongoose');
const Product = require('../models/product.model');
const HttpError = require('../utils/http-error');

const MOCK_GYM_ID = '60d5ecb8b392d700153ee123';
const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  imageUrl: z.string().trim().default(''),
  price: z.coerce.number().min(0).max(1000000),
  stock: z.coerce.number().int().min(0).max(100000),
});

function getGymId(req) {
  const gymId = req.user?.gymId ?? req.auth?.gymId ?? req.gymId ?? MOCK_GYM_ID;
  if (!mongoose.isValidObjectId(gymId)) throw new HttpError(400, 'No se pudo determinar el gimnasio autenticado.');
  return gymId;
}

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de producto inválido.');
}

async function getProducts(req, res) {
  const products = await Product.find({ gymId: getGymId(req), isDeleted: { $ne: true } }).sort({ category: 1, name: 1 }).lean();
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

  const product = await Product.findOneAndUpdate({ _id: req.params.id, gymId: getGymId(req), isDeleted: { $ne: true } }, input, {
    new: true,
    runValidators: true,
  }).lean();
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

module.exports = { getProducts, createProduct, updateProduct, deleteProduct };
