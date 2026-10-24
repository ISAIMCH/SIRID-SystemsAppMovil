const mongoose = require('mongoose');
const { MUSCLE_GROUPS } = require('../constants/muscle-groups');

const exerciseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  muscleGroup: { type: String, required: true, enum: MUSCLE_GROUPS },
  equipment: { type: String, trim: true, maxlength: 100, default: null },
  videoUrl: { type: String, trim: true, maxlength: 500, default: null },
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

exerciseSchema.index({ gymId: 1, muscleGroup: 1, name: 1 });

module.exports = mongoose.model('Exercise', exerciseSchema);
