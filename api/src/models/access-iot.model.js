const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');

// Events that move a client in or out; 'denied' only records a refused attempt for the access log.
const PASSAGE_EVENTS = ['check-in', 'check-out'];

const accessIotSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  event: { type: String, enum: [...PASSAGE_EVENTS, 'denied'], required: true },
  // Why a 'denied' attempt was refused: the API's error code (see utils/access-rules.js) and the message shown.
  reason: {
    code: { type: String, trim: true, maxlength: 60 },
    message: { type: String, trim: true, maxlength: 300 },
  },
  // auto: a check-out the API records when the client enters another gym without leaving this one.
  source: { type: String, enum: ['qr', 'pin', 'auto'], default: 'qr' },
  deviceId: { type: String, trim: true, maxlength: 100 },
  // Who validated the entry: a registered device, or the staff member who scanned the QR.
  accessDevice: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessDevice', default: null },
  validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  qrJti: { type: String, unique: true, sparse: true },
  occurredAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

accessIotSchema.index({ user: 1, occurredAt: -1 });
// The access log of a gym, newest first.
accessIotSchema.index({ organizationId: 1, gymId: 1, occurredAt: -1 });

accessIotSchema.plugin(tenantPlugin, { gym: true });

const AccessIoT = mongoose.model('AccessIoT', accessIotSchema);
AccessIoT.PASSAGE_EVENTS = PASSAGE_EVENTS;

module.exports = AccessIoT;