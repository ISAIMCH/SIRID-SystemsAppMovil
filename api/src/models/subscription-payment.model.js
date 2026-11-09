const mongoose = require('mongoose');

// A payment an owner made to SIRID for their GymGo plan. `reference` is the provider's id (Stripe invoice or
// Checkout session, PayPal capture), unique so a webhook or capture delivered twice never adds time twice.
const subscriptionPaymentSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  provider: { type: String, enum: ['stripe', 'paypal'], required: true },
  method: { type: String, enum: ['card', 'oxxo', 'paypal'], required: true },
  reference: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
  planCode: { type: String, required: true },
  interval: { type: String, enum: ['month', 'year'], required: true },
  // MXN, IVA included.
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'MXN' },
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },
  paidAt: { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);
