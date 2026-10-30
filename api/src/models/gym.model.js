const mongoose = require('mongoose');

function isTimeZone(value) {
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const gymSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  address: { type: String, trim: true, maxlength: 200 },
  // Memberships and access are evaluated in the gym's local time.
  timezone: { type: String, required: true, default: 'America/Mexico_City', validate: { validator: isTimeZone, message: 'Zona horaria inválida.' } },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

gymSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Gym', gymSchema);
