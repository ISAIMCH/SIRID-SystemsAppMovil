const mongoose = require('mongoose');

// Propietario and Cliente apply to the whole organization; staff roles are granted per gym.
const ORGANIZATION_ROLES = ['Propietario', 'Cliente'];
const GYM_ROLES = ['Gerente', 'Coach', 'Recepcion'];

const isUniqueList = (items) => new Set(items.map(String)).size === items.length;

const gymAssignmentSchema = new mongoose.Schema({
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
  roles: {
    type: [{ type: String, enum: GYM_ROLES }],
    validate: { validator: (roles) => roles.length > 0 && isUniqueList(roles), message: 'Asigna al menos un rol sin repetir.' },
  },
}, { _id: false });

const organizationMemberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  roles: {
    type: [{ type: String, enum: ORGANIZATION_ROLES }],
    validate: { validator: isUniqueList, message: 'No repitas roles.' },
  },
  gyms: {
    type: [gymAssignmentSchema],
    validate: { validator: (gyms) => isUniqueList(gyms.map((gym) => gym.gymId)), message: 'No repitas sucursales.' },
  },
  // A client's Coach in this organization; each organization assigns its own.
  assignedCoach: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  // Staff notes about this person; each organization keeps its own.
  observations: { type: String, trim: true, maxlength: 4000, default: '' },
  isActive: { type: Boolean, default: true },
  // Set when reception added an existing account as a client, so the app tells its holder; seenAt once they read it.
  enrollmentNotice: {
    type: new mongoose.Schema({
      gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
      createdAt: { type: Date, required: true },
      seenAt: { type: Date, default: null },
    }, { _id: false }),
    default: null,
  },
}, { timestamps: true });

organizationMemberSchema.pre('validate', function requireSomeRole() {
  if (this.roles.length === 0 && this.gyms.length === 0) this.invalidate('roles', 'El miembro necesita al menos un rol.');
});

organizationMemberSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
organizationMemberSchema.index({ 'gyms.gymId': 1 });

module.exports = mongoose.model('OrganizationMember', organizationMemberSchema);
module.exports.ORGANIZATION_ROLES = ORGANIZATION_ROLES;
module.exports.GYM_ROLES = GYM_ROLES;
