const mongoose = require('mongoose');
const { generateJoinCode } = require('../utils/access-codes');

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
  // Clients type or scan it in the app to join the gym; staff can regenerate it if it leaks.
  joinCode: { type: String, uppercase: true, trim: true, default: generateJoinCode },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

gymSchema.index({ organizationId: 1, name: 1 }, { unique: true });
gymSchema.index({ joinCode: 1 }, { unique: true, partialFilterExpression: { joinCode: { $type: 'string' } } });

module.exports = mongoose.model('Gym', gymSchema);
