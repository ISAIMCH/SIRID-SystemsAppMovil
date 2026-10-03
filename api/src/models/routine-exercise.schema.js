const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  muscleGroup: { type: String, required: true, trim: true, maxlength: 80 },
  equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' },
  bodyweight: { type: Boolean, default: false },
  day: { type: Number, required: true, min: 0, max: 6, default: 0 },
  sets: { type: Number, required: true, min: 1, max: 50 },
  reps: { type: String, required: true, trim: true, maxlength: 30 },
  suggestedWeight: { type: Number, min: 0, max: 1000 },
  restSeconds: { type: Number, min: 0, max: 3600, default: 60 },
  order: { type: Number, required: true, min: 0 },
}, { _id: true });

module.exports = exerciseSchema;
