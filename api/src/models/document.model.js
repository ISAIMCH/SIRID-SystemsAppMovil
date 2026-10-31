const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');

// Staff hiring files and client documents (e.g. a student card that unlocks a promotion).
const STAFF_CATEGORIES = ['cv', 'identification', 'fiscal', 'certification', 'availability', 'evaluation'];
const CLIENT_CATEGORIES = ['student_id'];
// 'other' belongs to staff or client depending on who owns it.
const DOCUMENT_CATEGORIES = [...STAFF_CATEGORIES, ...CLIENT_CATEGORIES, 'other'];
const DOCUMENT_STATUSES = ['pending', 'verified', 'rejected'];

// The file lives in R2 under `key`; this record keeps its history even after the file is destroyed.
const documentSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['staff', 'client'], required: true },
  category: { type: String, enum: DOCUMENT_CATEGORIES, required: true },
  key: { type: String, required: true, unique: true },
  originalName: { type: String, required: true, trim: true, maxlength: 200 },
  mimeType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png'], required: true },
  size: { type: Number, required: true, min: 1 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: DOCUMENT_STATUSES, default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, trim: true, maxlength: 300, default: '' },
  // Until when a verified document counts (e.g. the end of the school year on a student card).
  validUntil: { type: Date, default: null },
  // The /uploads/documents/<file>.pdf path the dashboard keeps in User.documents (pdfFiles uploads).
  legacyPath: { type: String, default: undefined },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // When the file was destroyed in R2 at the owner's request (LFPDPPP); the record stays without a file.
  purgedAt: { type: Date, default: null },
}, { timestamps: true });

documentSchema.plugin(tenantPlugin);
documentSchema.index({ legacyPath: 1 }, { unique: true, sparse: true });
documentSchema.index({ organizationId: 1, ownerId: 1, category: 1, status: 1 });

module.exports = mongoose.model('Document', documentSchema);
module.exports.STAFF_CATEGORIES = STAFF_CATEGORIES;
module.exports.CLIENT_CATEGORIES = CLIENT_CATEGORIES;
module.exports.DOCUMENT_CATEGORIES = DOCUMENT_CATEGORIES;
module.exports.DOCUMENT_STATUSES = DOCUMENT_STATUSES;
