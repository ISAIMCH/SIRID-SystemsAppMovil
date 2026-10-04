const mongoose = require('mongoose');

const exerciseLogSchema = new mongoose.Schema({
  routineExerciseId: { type: mongoose.Schema.Types.ObjectId, required: true },
  exerciseName: { type: String, required: true, trim: true, maxlength: 120 },
  muscleGroup: { type: String, required: true, trim: true, maxlength: 80 },
  equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment', default: null },
  metricType: { type: String, enum: ['strength', 'cardio'], default: 'strength' },
  reps: { type: Number, min: 0, max: 300 },
  weightKg: { type: Number, min: 0, max: 1000 },
  durationMinutes: { type: Number, min: 1, max: 600 },
  distanceKm: { type: Number, min: 0, max: 1000 },
  level: { type: Number, min: 1, max: 100 },
  observations: { type: String, trim: true, maxlength: 1000 },
}, { _id: false });

const workoutBlockSchema = new mongoose.Schema({
  routineBlockId: { type: mongoose.Schema.Types.ObjectId, required: true },
  blockType: { type: String, enum: ['single', 'superset', 'circuit'], required: true },
  restSeconds: { type: Number, required: true, min: 0, max: 3600 },
  sets: { type: [{
    setNumber: { type: Number, required: true, min: 1 },
    completedAt: { type: Date, required: true, default: Date.now },
    exercises: { type: [exerciseLogSchema], required: true, validate: (items) => items.length > 0 },
  }], required: true, validate: (items) => items.length > 0 },
}, { _id: false });

const workoutSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  routine: { type: mongoose.Schema.Types.ObjectId, ref: 'Routine', required: true },
  trainingDay: { type: Number, required: true, min: 0, max: 6 },
  completedAt: { type: Date, required: true, default: Date.now, index: true },
  durationMinutes: { type: Number, required: true, min: 0, max: 600 },
  totalVolumeKg: { type: Number, required: true, min: 0, default: 0 },
  blocks: { type: [workoutBlockSchema], required: true, validate: (items) => items.length > 0 },
}, { timestamps: true, strict: false });

workoutSessionSchema.index({ user: 1, completedAt: -1 });

module.exports = mongoose.model('WorkoutSession', workoutSessionSchema);