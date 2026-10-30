const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  price: { type: Number, required: true, min: 0, max: 1000000 },
  imageUrl: { type: String, default: '' },
  stock: { type: Number, required: true, min: 0, max: 100000, default: 0 },
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

productSchema.index({ gymId: 1, category: 1 });

productSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Product', productSchema);
