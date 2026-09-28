const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  zone: { type: String, required: true, trim: true, maxlength: 80 },
  brand: { type: String, trim: true, maxlength: 80 },
  status: {
    type: String,
    enum: ['available', 'busy', 'out_of_service'],
    default: 'available',
    required: true,
    index: true,
  },
  usageFrequency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
}, { timestamps: true });

equipmentSchema.index({ zone: 1, name: 1 });

module.exports = mongoose.model('Equipment', equipmentSchema);