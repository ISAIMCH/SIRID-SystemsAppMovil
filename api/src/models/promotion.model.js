const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');
const { CLIENT_CATEGORIES } = require('./document.model');

const PROMOTION_TARGETS = ['store', 'membership'];

const promotionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  discountPercentage: { type: Number, min: 0, max: 100, default: 0 },
  // What the discount is for: store products (orders) or membership plans (payments at reception).
  appliesTo: { type: String, enum: PROMOTION_TARGETS, default: 'store' },
  // Empty means every product (store) or every plan (membership).
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  applicablePlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan' }],
  validUntil: { type: Date },
  isActive: { type: Boolean, default: true, index: true },
  imageUrl: { type: String },
  // A verified document the client must hold to get the discount (e.g. 'student_id').
  requiredDocument: { type: String, enum: [...CLIENT_CATEGORIES, null], default: null },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

promotionSchema.pre('validate', function keepOneTarget() {
  if (this.appliesTo === 'membership') this.applicableProducts = [];
  else this.applicablePlans = [];
});

promotionSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Promotion', promotionSchema);
module.exports.PROMOTION_TARGETS = PROMOTION_TARGETS;
