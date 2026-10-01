const mongoose = require('mongoose');

const setLogSchema = new mongoose.Schema({
  reps: { type: Number, required: true, min: 0, max: 300 },
  weightKg: { type: Number, required: true, min: 0, max: 1000 },
  restSeconds: { type: Number, required: true, min: 0, max: 3600 },
}, { _id: false });

const exerciseLogSchema = new mongoose.Schema({
  routineExerciseId: { type: mongoose.Schema.Types.ObjectId, required: true },
  exerciseName: { type: String, required: true, trim: true, maxlength: 120 },
  muscleGroup: { type: String, required: true, trim: true, maxlength: 80 },
  equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment', default: null },
  sets: { type: [setLogSchema], required: true, validate: (items) => items.length > 0 },
  observations: { type: String, trim: true, maxlength: 1000 },
}, { _id: false });

const workoutSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  routine: { type: mongoose.Schema.Types.ObjectId, ref: 'Routine', required: true },
  trainingDay: { type: Number, required: true, min: 0, max: 6 },
  completedAt: { type: Date, required: true, default: Date.now, index: true },
  durationMinutes: { type: Number, required: true, min: 0, max: 600 },
  totalVolumeKg: { type: Number, required: true, min: 0, default: 0 },
  exercises: { type: [exerciseLogSchema], required: true, validate: (items) => items.length > 0 },
}, { timestamps: true });

workoutSessionSchema.index({ user: 1, completedAt: -1 });

module.exports = mongoose.model('WorkoutSession', workoutSessionSchema);