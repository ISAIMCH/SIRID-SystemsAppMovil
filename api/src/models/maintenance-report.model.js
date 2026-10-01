const mongoose = require('mongoose');

const maintenanceReportSchema = new mongoose.Schema({
  equipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment', required: true, index: true },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  description: { type: String, required: true, trim: true, maxlength: 1500 },
  status: { type: String, enum: ['pending', 'in_progress', 'resolved'], default: 'pending', index: true },
  adminNote: { type: String, trim: true, maxlength: 1000 },
  resolvedAt: Date,
}, { timestamps: true });

maintenanceReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('MaintenanceReport', maintenanceReportSchema);