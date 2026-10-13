const mongoose = require('mongoose');

const managedEquipmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  status: { type: String, enum: ['operational', 'maintenance', 'broken'], default: 'operational' },
  lastMaintenance: { type: Date },
  nextMaintenance: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('ManagedEquipment', managedEquipmentSchema);
