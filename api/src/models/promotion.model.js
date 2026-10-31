const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');
const { CLIENT_CATEGORIES } = require('./document.model');

const promotionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  discountPercentage: { type: Number, min: 0, max: 100, default: 0 },
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  validUntil: { type: Date },
  isActive: { type: Boolean, default: true, index: true },
  imageUrl: { type: String },
  // A verified document the client must hold to get the discount (e.g. 'student_id').
  requiredDocument: { type: String, enum: [...CLIENT_CATEGORIES, null], default: null },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

promotionSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Promotion', promotionSchema);
