const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');

const accessIotSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  event: { type: String, enum: ['check-in', 'check-out'], required: true },
  source: { type: String, enum: ['qr', 'pin'], default: 'qr' },
  deviceId: { type: String, trim: true, maxlength: 100 },
  qrJti: { type: String, unique: true, sparse: true },
  occurredAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

accessIotSchema.index({ user: 1, occurredAt: -1 });

accessIotSchema.plugin(tenantPlugin, { gym: true });

module.exports = mongoose.model('AccessIoT', accessIotSchema);