const mongoose = require('mongoose');

const ORGANIZATION_STATUSES = ['pending', 'active', 'rejected', 'suspended'];
const DEFAULT_GYM_LIMIT = 3;

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
  // Owns every request that does not carry an organization yet (etapa 2 removes this fallback).
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

organizationSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true }, name: 'isDefault_unique' });

module.exports = mongoose.model('Organization', organizationSchema);
module.exports.ORGANIZATION_STATUSES = ORGANIZATION_STATUSES;
module.exports.DEFAULT_GYM_LIMIT = DEFAULT_GYM_LIMIT;
