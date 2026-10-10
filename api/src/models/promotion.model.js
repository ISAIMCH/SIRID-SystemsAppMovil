const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  imageUrl: { type: String, required: true },
  active: { type: Boolean, default: true, index: true },
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
}, { timestamps: true });

promotionSchema.index({ gymId: 1 });

module.exports = mongoose.model('Promotion', promotionSchema);
