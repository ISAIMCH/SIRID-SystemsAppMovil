const { z } = require('zod');
const Product = require('../models/product.model');
const ProductStock = require('../models/product-stock.model');
const Promotion = require('../models/promotion.model');
const HttpError = require('../utils/http-error');
const parseUpdate = require('../utils/parse-update');
const withTransaction = require('../utils/transaction');
const { resolveTenant, resolveTargetGym, organizationFilter } = require('../utils/tenant');

// Serves both /api/store/{products,promotions} (mobile app) and /api/products, /api/promotions (Admin dashboard).
const MAX_IMAGE_LENGTH = 4 * 1024 * 1024;
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
  // The gym whose stock `stock` sets; defaults to the selected or main gym.
  gymId: z.union([objectIdSchema, z.literal('')]).transform((value) => value || undefined).optional(),
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


function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID inválido.');
}

// The app uses `active` and the dashboard `isActive`; both fields are kept in sync.
function syncActiveFlags(input) {
  const { isActive, active, ...rest } = input;
  const value = isActive ?? active;
  return value === undefined ? rest : { ...rest, isActive: value, active: value };
}

// `stock` is the units in the request's gym (the selected or main one); `stockByGym` lists every gym the request sees.
function withStock(product, stocks, tenant) {
  const quantityIn = (gymId) => stocks.find((stock) => String(stock.productId) === String(product._id)
    && String(stock.gymId) === String(gymId))?.quantity ?? 0;
  return {
    ...product,
    stock: quantityIn(tenant.gymId),
    stockByGym: tenant.gymIds.map((gymId) => ({ gymId, quantity: quantityIn(gymId) })),
  };
}

async function serializeProducts(req, products) {
  const tenant = resolveTenant(req);
  const stocks = await ProductStock.find({ productId: { $in: products.map((product) => product._id) }, gymId: { $in: tenant.gymIds } }).lean();
  return products.map((product) => withStock(product, stocks, tenant));
}

function setStock(req, productId, gymId, quantity, session) {
  return ProductStock.updateOne(
    { productId, gymId },
    { $set: { quantity }, $setOnInsert: { organizationId: resolveTenant(req).organizationId } },
    { upsert: true, runValidators: true, session },
  );
}

async function getProducts(req, res) {
  const products = await Product.find({ ...organizationFilter(req), isDeleted: { $ne: true } }).sort({ category: 1, name: 1 }).lean();
  res.json({ products: await serializeProducts(req, products) });
}

async function createProduct(req, res) {
  const { stock, gymId, ...input } = productSchema.parse(req.body);
  const targetGymId = resolveTargetGym(req, gymId);
  const product = await withTransaction(async (session) => {
    const [created] = await Product.create([{ ...input, ...organizationFilter(req) }], { session });
    await setStock(req, created._id, targetGymId, stock, session);
    return created;
  });
  const [serialized] = await serializeProducts(req, [product.toObject()]);
  res.status(201).json({ product: serialized });
}

async function updateProduct(req, res) {
  assertId(req.params.id);
  const { stock, gymId, ...input } = parseUpdate(productSchema, req.body);
  if (Object.keys(input).length === 0 && stock === undefined) throw new HttpError(400, 'Envía al menos un campo para actualizar.');
  const targetGymId = resolveTargetGym(req, gymId);
  const product = await withTransaction(async (session) => {
    const updated = await Product.findOneAndUpdate(
      { _id: req.params.id, ...organizationFilter(req), isDeleted: { $ne: true } },
      input,
      { new: true, runValidators: true, session },
    );
    if (!updated) throw new HttpError(404, 'Producto no encontrado.');
    if (stock !== undefined) await setStock(req, updated._id, targetGymId, stock, session);
    return updated;
  });
  const [serialized] = await serializeProducts(req, [product.toObject()]);
  res.json({ product: serialized });
}

async function deleteProduct(req, res) {
  assertId(req.params.id);
  await withTransaction(async (session) => {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, ...organizationFilter(req), isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true, session },
    );
    if (!product) throw new HttpError(404, 'Producto no encontrado.');
    await ProductStock.updateMany({ productId: product._id }, { $set: { quantity: 0 } }, { session });
  });
  res.status(204).end();
}

async function listPromotions(req, res) {
  const filter = organizationFilter(req);
  if (resolveTenant(req).role !== 'Admin') Object.assign(filter, { active: { $ne: false }, isActive: { $ne: false } });
  const promotions = await Promotion.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ promotions });
}

async function assertProductsInOrganization(req, productIds = []) {
  if (productIds.length === 0) return;
  const count = await Product.countDocuments({ _id: { $in: productIds }, ...organizationFilter(req), isDeleted: { $ne: true } });
  if (count !== new Set(productIds).size) throw new HttpError(400, 'Algún producto de la promoción no existe.');
}

async function createPromotion(req, res) {
  const input = syncActiveFlags({ isActive: true, ...promotionSchema.parse(req.body) });
  await assertProductsInOrganization(req, input.applicableProducts);
  const promotion = await Promotion.create({ ...input, ...organizationFilter(req) });
  res.status(201).json({ promotion });
}

async function updatePromotion(req, res) {
  assertId(req.params.id);
  const input = syncActiveFlags(parseUpdate(promotionSchema, req.body));
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');
  await assertProductsInOrganization(req, input.applicableProducts);
  const promotion = await Promotion.findOneAndUpdate({ _id: req.params.id, ...organizationFilter(req) }, input, { new: true, runValidators: true });
  if (!promotion) throw new HttpError(404, 'Promoción no encontrada.');
  res.json({ promotion });
}

async function deletePromotion(req, res) {
  assertId(req.params.id);
  const promotion = await Promotion.findOneAndDelete({ _id: req.params.id, ...organizationFilter(req) });
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
  withStock,
};
