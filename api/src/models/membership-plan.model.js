const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');
const { gymAccessSchema } = require('./gym-access.schema');

const membershipPlanSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  price: { type: Number, required: true, min: 0, max: 1000000 },
  durationInDays: { type: Number, required: true, min: 1, max: 730 },
  specifications: [{ type: String, trim: true, maxlength: 120 }],
  autoRenew: { type: Boolean, default: true },
  planType: { type: String, enum: ['standard', 'promotional'], default: 'standard' },
  // Which gyms of the organization the plan opens; a Plan Básico uses 'home'.
  gymAccess: { type: gymAccessSchema, default: () => ({}) },
  isActive: { type: Boolean, default: true, index: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

membershipPlanSchema.plugin(tenantPlugin);

module.exports = mongoose.model('MembershipPlan', membershipPlanSchema);
