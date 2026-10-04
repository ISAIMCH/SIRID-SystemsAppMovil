const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  muscleGroup: { type: String, required: true, trim: true, maxlength: 80 },
  equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' },
  bodyweight: { type: Boolean, default: false },
  metricType: { type: String, enum: ['strength', 'cardio'], default: 'strength', required: true },
  reps: { type: String, trim: true, maxlength: 30 },
  suggestedWeight: { type: Number, min: 0, max: 1000 },
  order: { type: Number, required: true, min: 0 },
  targetDurationMinutes: { type: Number, min: 1, max: 600 },
  targetDistanceKm: { type: Number, min: 0.01, max: 1000 },
  targetLevel: { type: Number, min: 1, max: 100 },
}, { _id: true });

const blockSchema = new mongoose.Schema({
  day: { type: Number, required: true, min: 0, max: 6 },
  blockType: { type: String, enum: ['single', 'superset', 'circuit'], required: true, default: 'single' },
  sets: { type: Number, required: true, min: 1, max: 50 },
  restSeconds: { type: Number, required: true, min: 0, max: 3600, default: 60 },
  order: { type: Number, required: true, min: 0 },
  exercises: { type: [exerciseSchema], required: true, validate: (items) => items.length > 0 },
}, { _id: true });

blockSchema.pre('validate', function validateBlockType() {
  if (this.blockType === 'single' && this.exercises.length !== 1) {
    this.invalidate('exercises', 'Un bloque individual debe tener exactamente un ejercicio.');
  }
  if (this.blockType !== 'single' && this.exercises.length < 2) {
    this.invalidate('exercises', 'Un superset o circuito requiere al menos dos ejercicios.');
  }
});

module.exports = { exerciseSchema, blockSchema };
