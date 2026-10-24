const mongoose = require('mongoose');

const membershipPlanSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  price: { type: Number, required: true, min: 0, max: 1000000 },
  durationInDays: { type: Number, required: true, min: 1, max: 730 },
  specifications: [{ type: String, trim: true, maxlength: 120 }],
  autoRenew: { type: Boolean, default: true },
  planType: { type: String, enum: ['standard', 'promotional'], default: 'standard' },
  isActive: { type: Boolean, default: true, index: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('MembershipPlan', membershipPlanSchema);
