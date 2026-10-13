const { z } = require('zod');
const Product = require('../models/catalog-product.model');
const HttpError = require('../utils/http-error');

const productSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  imageUrl: z.string().trim().default(''),
  price: z.coerce.number().min(0),
  stock: z.coerce.number().int().min(0),
});

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de producto inválido.');
}

async function getProducts(req, res) {
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

  const product = await Product.findByIdAndUpdate(req.params.id, input, {
    new: true,
    runValidators: true,
  }).lean();
  if (!product) throw new HttpError(404, 'Producto no encontrado.');
  res.json({ product });
}

async function deleteProduct(req, res) {
  assertId(req.params.id);
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new HttpError(404, 'Producto no encontrado.');
  res.status(204).end();
}

module.exports = { getProducts, createProduct, updateProduct, deleteProduct };
