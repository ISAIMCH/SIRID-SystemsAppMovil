const mongoose = require('mongoose');
const { blockSchema } = require('./routine-exercise.schema');

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
  sourceTemplate: { type: mongoose.Schema.Types.ObjectId, ref: 'RoutineTemplate', default: null },
  status: { type: String, enum: ['active', 'paused'], default: 'active' },
  blocks: { type: [blockSchema], validate: (items) => items.length > 0 },
}, { timestamps: true, strict: false });

routineSchema.index({ assignedTo: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model('Routine', routineSchema);
