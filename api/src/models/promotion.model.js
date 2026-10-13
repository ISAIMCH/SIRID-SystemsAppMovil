const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  discountPercentage: { type: Number, min: 0, max: 100, default: 0 },
  validUntil: { type: Date },
  isActive: { type: Boolean, default: true, index: true },
  imageUrl: { type: String },
  active: { type: Boolean, default: true, index: true },
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
}, { timestamps: true });

promotionSchema.index({ gymId: 1 });

module.exports = mongoose.model('Promotion', promotionSchema);
