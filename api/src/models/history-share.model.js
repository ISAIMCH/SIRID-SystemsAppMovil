const mongoose = require('mongoose');

const SHARE_STATUSES = ['pending', 'approved', 'rejected', 'revoked'];

// A client's consent for the staff of one gym to see their history from every organization.
// There is one per client and gym: a new request reopens it, so a gym never has two pending requests.
const historyShareSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
  status: { type: String, enum: SHARE_STATUSES, required: true, default: 'pending' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedAt: { type: Date, required: true, default: Date.now },
  // Physical measurements and injuries/restrictions need their own explicit consent.
  includeSensitive: { type: Boolean, default: false },
  respondedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

historyShareSchema.index({ userId: 1, gymId: 1 }, { unique: true });

module.exports = mongoose.model('HistoryShare', historyShareSchema);
module.exports.SHARE_STATUSES = SHARE_STATUSES;
