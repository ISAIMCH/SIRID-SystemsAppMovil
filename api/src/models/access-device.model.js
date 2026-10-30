const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');

// A turnstile or reader installed in one gym. Only the hash of its key is stored; the key is shown once when created.
const accessDeviceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  keyHash: { type: String, required: true, unique: true, select: false },
  // The first characters of the key, so staff can tell devices apart without seeing the key.
  keyPreview: { type: String, required: true, maxlength: 20 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastSeenAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

accessDeviceSchema.plugin(tenantPlugin, { gym: true });

module.exports = mongoose.model('AccessDevice', accessDeviceSchema);
