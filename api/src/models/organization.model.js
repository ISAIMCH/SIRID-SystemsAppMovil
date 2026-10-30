const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 80, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  // Owners who sign up start as pending until SIRID approves them from the platform panel.
  status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending', index: true },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Owns every request that does not carry an organization yet (etapa 2 removes this fallback).
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

organizationSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true }, name: 'isDefault_unique' });

module.exports = mongoose.model('Organization', organizationSchema);
