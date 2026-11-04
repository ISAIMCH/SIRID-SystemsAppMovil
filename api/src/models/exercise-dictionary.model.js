const mongoose = require('mongoose');
const { EQUIPMENT_CATEGORIES } = require('../constants/equipment-families');

const exerciseDictionarySchema = new mongoose.Schema({
  sourceId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  targetMuscle: { type: String, required: true, trim: true, maxlength: 100 },
  secondaryMuscles: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
  equipment: { type: String, required: true, enum: EQUIPMENT_CATEGORIES },
  gifUrl: { type: String, required: true, trim: true, maxlength: 500 },
  imageUrl: { type: String, trim: true, maxlength: 500 },
  mediaId: { type: String, trim: true, maxlength: 40 },
  steps: { type: [{ type: String, trim: true, maxlength: 600 }], default: [] },
  metricType: { type: String, enum: ['strength', 'cardio'], default: 'strength', required: true },
  attribution: { type: String, trim: true, maxlength: 200 },
  // 'dataset' records come from the seed script; 'sirid' ones are added by platform admins.
  origin: { type: String, enum: ['dataset', 'sirid'], default: 'dataset', required: true },
  isActive: { type: Boolean, default: true },
  // Fields edited by hand that the seed script must not overwrite.
  lockedFields: { type: [String], default: [] },
}, { timestamps: true });

exerciseDictionarySchema.index({ name: 1 });
exerciseDictionarySchema.index({ isActive: 1, equipment: 1, targetMuscle: 1, name: 1 });

module.exports = mongoose.model('ExerciseDictionary', exerciseDictionarySchema);
