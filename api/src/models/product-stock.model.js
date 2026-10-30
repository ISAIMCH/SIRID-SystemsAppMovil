const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');

// Units of a catalog product available in one gym.
const productStockSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 0, max: 100000, default: 0 },
}, { timestamps: true });

productStockSchema.index({ productId: 1, gymId: 1 }, { unique: true });

productStockSchema.plugin(tenantPlugin, { gym: true });

module.exports = mongoose.model('ProductStock', productStockSchema);
