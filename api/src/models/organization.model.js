const mongoose = require('mongoose');

const ORGANIZATION_STATUSES = ['pending', 'active', 'rejected', 'suspended'];
const DEFAULT_GYM_LIMIT = 3;
const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'incomplete', 'manual'];

// The owner's GymGo plan (see utils/subscription.js). Separate from `status`, which is SIRID's own decision:
// an active organization whose trial or payment lapsed keeps working for a grace period, then closes.
// Organizations created before billing have no subscription and keep every feature.
const subscriptionSchema = new mongoose.Schema({
  planCode: { type: String, trim: true, lowercase: true },
  status: { type: String, enum: SUBSCRIPTION_STATUSES },
  interval: { type: String, enum: ['month', 'year'] },
  provider: { type: String, enum: ['stripe', 'paypal', 'manual'] },
  // card renews with Stripe each period; oxxo, paypal and manual pay one period at a time.
  method: { type: String, enum: ['card', 'oxxo', 'paypal', 'manual'] },
  renews: { type: Boolean, default: false },
  trialEndsAt: Date,
  currentPeriodEnd: Date,
  // When the trial or the last paid period ended, or a renewal failed; the grace period counts from here.
  lapsedAt: Date,
  stripeCustomerId: { type: String, index: true },
  stripeSubscriptionId: { type: String, index: true },
  // An OXXO voucher waiting to be paid at the store.
  pendingPayment: {
    type: new mongoose.Schema({
      method: { type: String, enum: ['oxxo'] },
      reference: String,
      planCode: String,
      interval: String,
      voucherUrl: String,
      expiresAt: Date,
    }, { _id: false }),
    default: undefined,
  },
  // PayPal simulado (evaluación escolar): la prueba de 5 días se da una sola vez.
  demoTrialUsedAt: Date,
  // One free trial per email and per phone.
  trialEmail: { type: String, lowercase: true, trim: true, index: true },
  trialPhone: { type: String, trim: true, index: true },
}, { _id: false });

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  // Fiscal data is optional at signup; billing will require it later.
  legalName: { type: String, trim: true, maxlength: 200 },
  rfc: { type: String, trim: true, uppercase: true, match: /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/ },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 80, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  // Owners who sign up start as pending until SIRID approves them from the platform panel.
  status: { type: String, enum: ORGANIZATION_STATUSES, default: 'pending', index: true },
  // Shown to the owner on the login screen when SIRID rejects or suspends the organization.
  statusReason: { type: String, trim: true, maxlength: 500, default: null },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // How many active gyms the owner may open; SIRID raises it from the platform panel.
  gymLimit: { type: Number, min: 1, max: 100, default: DEFAULT_GYM_LIMIT },
  subscription: { type: subscriptionSchema, default: undefined },
  // Owns every request that does not carry an organization yet (etapa 2 removes this fallback).
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

organizationSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true }, name: 'isDefault_unique' });

module.exports = mongoose.model('Organization', organizationSchema);
module.exports.ORGANIZATION_STATUSES = ORGANIZATION_STATUSES;
module.exports.DEFAULT_GYM_LIMIT = DEFAULT_GYM_LIMIT;
module.exports.SUBSCRIPTION_STATUSES = SUBSCRIPTION_STATUSES;
