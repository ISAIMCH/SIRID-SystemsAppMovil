const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  price: { type: Number, required: true, min: 0, max: 1000000 },
  imageUrl: { type: String, default: '' },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

// The catalog is shared by the organization; each gym keeps its own stock in ProductStock.
productSchema.index({ organizationId: 1, category: 1 });

productSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Product', productSchema);
