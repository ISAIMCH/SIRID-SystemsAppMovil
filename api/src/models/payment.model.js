const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan', index: true },
  planName: { type: String, required: true, trim: true, maxlength: 80 },
  amount: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ['Cash', 'Card', 'Transfer'] },
  source: { type: String, enum: ['reception'], index: true },
  paymentDate: { type: Date, default: Date.now },
  currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 3, default: 'MXN' },
  durationDays: { type: Number, required: true, min: 1, max: 730 },
  method: { type: String, enum: ['reception'], required: true, default: 'reception' },
  status: { type: String, enum: ['Completed', 'Pending', 'Failed', 'pending', 'paid', 'cancelled'], required: true, default: 'pending', index: true },
  reference: { type: String, required: true, unique: true, trim: true },
  validationPin: { type: String, match: /^\d{5}$/, index: true },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  processedAt: Date,
}, { timestamps: true });

paymentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);