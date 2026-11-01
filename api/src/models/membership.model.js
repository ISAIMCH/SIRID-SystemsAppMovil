const mongoose = require('mongoose');
const { gymAccessSchema } = require('./gym-access.schema');
const { accessScheduleSchema } = require('./access-schedule.schema');
const { CLIENT_CATEGORIES } = require('./document.model');

// A client's membership with one organization; renewals extend this same document.
const membershipSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan', default: null },
  homeGymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', default: null },
  // Copied from the plan when sold, so editing the plan later does not change memberships already sold.
  gymAccess: { type: gymAccessSchema, default: () => ({}) },
  schedule: { type: accessScheduleSchema, default: null },
  requiredDocument: { type: String, enum: [...CLIENT_CATEGORIES, null], default: null },
  status: { type: String, enum: ['pending', 'active', 'suspended', 'expired'], default: 'pending', index: true },
  startsAt: Date,
  expiresAt: Date,
  planName: { type: String, trim: true, maxlength: 80 },
  price: { type: Number, min: 0 },
  currency: { type: String, uppercase: true, trim: true, maxlength: 3, default: 'MXN' },
  durationDays: { type: Number, min: 1, max: 730, default: 30 },
  autoRenew: { type: Boolean, default: false },
}, { timestamps: true });

membershipSchema.pre('validate', function requireHomeGym() {
  if (this.gymAccess?.scope === 'home' && !this.homeGymId) this.invalidate('homeGymId', 'Elige la sucursal de la membresía.');
});

membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });

module.exports = mongoose.model('Membership', membershipSchema);
