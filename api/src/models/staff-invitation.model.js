const mongoose = require('mongoose');
const { GYM_ROLES } = require('./organization-member.model');

// 'expired' is stored only when a new invitation replaces a pending one that ran out; reads compute it from expiresAt.
const INVITATION_STATUSES = ['pending', 'accepted', 'rejected', 'cancelled', 'expired'];
const INVITATION_DAYS = 7;

// A gym's offer to someone who already has a GymGo account to join its staff; it only takes effect when they accept.
// The gym knows the email it typed and nothing else about the person until then.
const staffInvitationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, index: true },
  roles: {
    type: [{ type: String, enum: GYM_ROLES }],
    validate: { validator: (roles) => roles.length > 0 && new Set(roles).size === roles.length, message: 'Asigna al menos un rol sin repetir.' },
  },
  status: { type: String, enum: INVITATION_STATUSES, required: true, default: 'pending' },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000) },
  respondedAt: { type: Date, default: null },
  // The account that answered.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// One open invitation per email and gym.
staffInvitationSchema.index({ gymId: 1, email: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

module.exports = mongoose.model('StaffInvitation', staffInvitationSchema);
module.exports.INVITATION_STATUSES = INVITATION_STATUSES;
module.exports.INVITATION_DAYS = INVITATION_DAYS;
