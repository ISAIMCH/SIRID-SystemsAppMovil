const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  muscleGroup: { type: String, required: true, trim: true, maxlength: 80 },
  equipment: { type: String, trim: true, maxlength: 100, default: null },
  videoUrl: { type: String, required: true, trim: true, maxlength: 500 },
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
}, { timestamps: true });

exerciseSchema.index({ gymId: 1, muscleGroup: 1, name: 1 });

module.exports = mongoose.model('Exercise', exerciseSchema);
