const mongoose = require('mongoose');

const exerciseDictionarySchema = new mongoose.Schema({
  sourceId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  targetMuscle: { type: String, required: true, trim: true, maxlength: 100 },
  equipment: { type: String, required: true, trim: true, maxlength: 100 },
  gifUrl: { type: String, required: true, trim: true, maxlength: 500 },
  metricType: { type: String, enum: ['strength', 'cardio'], default: 'strength', required: true },
  attribution: { type: String, trim: true, maxlength: 200 },
}, { timestamps: true });

exerciseDictionarySchema.index({ name: 1 });

module.exports = mongoose.model('ExerciseDictionary', exerciseDictionarySchema);