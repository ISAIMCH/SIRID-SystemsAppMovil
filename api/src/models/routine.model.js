const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  muscleGroup: { type: String, required: true, trim: true, maxlength: 80 },
  equipment: { type: String, trim: true, maxlength: 100 },
  sets: { type: Number, required: true, min: 1, max: 50 },
  reps: { type: String, required: true, trim: true, maxlength: 30 },
  suggestedWeight: { type: Number, min: 0, max: 1000 },
  restSeconds: { type: Number, min: 0, max: 3600, default: 60 },
  order: { type: Number, required: true, min: 0 },
}, { _id: true });

const routineSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000 },
  goal: { type: String, trim: true, maxlength: 120 },
  level: { type: String, enum: ['principiante', 'intermedio', 'avanzado'], required: true },
  durationWeeks: { type: Number, min: 1, max: 52, default: 4 },
  daysPerWeek: { type: Number, required: true, min: 1, max: 7 },
  scheduleDays: [{ type: Number, min: 0, max: 6 }],
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['active', 'paused'], default: 'active' },
  exercises: { type: [exerciseSchema], validate: (items) => items.length > 0 },
}, { timestamps: true });

routineSchema.index({ assignedTo: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model('Routine', routineSchema);