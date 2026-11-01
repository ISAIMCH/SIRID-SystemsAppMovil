const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');
const { gymAccessSchema } = require('./gym-access.schema');
const { PLAN_TYPES, accessScheduleSchema } = require('./access-schedule.schema');
const { CLIENT_CATEGORIES } = require('./document.model');

const membershipPlanSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  price: { type: Number, required: true, min: 0, max: 1000000 },
  durationInDays: { type: Number, required: true, min: 1, max: 730 },
  specifications: [{ type: String, trim: true, maxlength: 120 }],
  autoRenew: { type: Boolean, default: true },
  // Only prefills the dashboard form; the rules below are what access enforces.
  planType: { type: String, enum: PLAN_TYPES, default: 'standard' },
  // Which gyms of the organization the plan opens; a Plan Básico uses 'home'.
  gymAccess: { type: gymAccessSchema, default: () => ({}) },
  // Hours the plan lets the client in; null means any time.
  schedule: { type: accessScheduleSchema, default: null },
  // A verified, unexpired document the client must hold to enter (e.g. 'student_id' for a student plan).
  requiredDocument: { type: String, enum: [...CLIENT_CATEGORIES, null], default: null },
  isActive: { type: Boolean, default: true, index: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

membershipPlanSchema.plugin(tenantPlugin);

module.exports = mongoose.model('MembershipPlan', membershipPlanSchema);
