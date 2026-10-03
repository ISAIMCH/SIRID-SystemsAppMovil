const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  zone: { type: String, required: true, trim: true, maxlength: 80 },
  brand: { type: String, trim: true, maxlength: 80 },
  type: { type: String, enum: ['strength', 'cardio'], default: 'strength', required: true },
  totalQuantity: { type: Number, default: 1, min: 1, max: 500, required: true },
  maintenanceQuantity: { type: Number, default: 0, min: 0, required: true },
  // Derivado de las cantidades; se conserva para consultas y rutinas existentes.
  status: { type: String, enum: ['available', 'out_of_service'], default: 'available', index: true },
}, { timestamps: true });

equipmentSchema.pre('validate', function deriveStatus() {
  if (this.maintenanceQuantity > this.totalQuantity) {
    this.invalidate('maintenanceQuantity', 'Las unidades en mantenimiento no pueden superar el total.');
  }
  this.status = this.totalQuantity - this.maintenanceQuantity > 0 ? 'available' : 'out_of_service';
});

equipmentSchema.index({ zone: 1, name: 1 });

module.exports = mongoose.model('Equipment', equipmentSchema);
