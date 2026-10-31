const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');

const DOCUMENT_ACTIONS = ['upload', 'view', 'download', 'verify', 'reject', 'delete', 'purge'];

// Who did what with each document; entries are only ever added.
const documentAccessLogSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: DOCUMENT_ACTIONS, required: true },
  ip: { type: String, maxlength: 64, default: '' },
  userAgent: { type: String, maxlength: 300, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });

documentAccessLogSchema.plugin(tenantPlugin);

module.exports = mongoose.model('DocumentAccessLog', documentAccessLogSchema);
module.exports.DOCUMENT_ACTIONS = DOCUMENT_ACTIONS;
