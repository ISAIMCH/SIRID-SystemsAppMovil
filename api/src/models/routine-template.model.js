const mongoose = require('mongoose');
const { blockSchema } = require('./routine-exercise.schema');

const routineTemplateSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000 },
  goal: { type: String, trim: true, maxlength: 120 },
  level: { type: String, enum: ['principiante', 'intermedio', 'avanzado'], required: true },
  durationWeeks: { type: Number, min: 1, max: 52, default: 4 },
  daysPerWeek: { type: Number, required: true, min: 1, max: 7 },
  scheduleDays: [{ type: Number, min: 0, max: 6 }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  blocks: { type: [blockSchema], validate: (items) => items.length > 0 },
}, { timestamps: true, strict: false });

module.exports = mongoose.model('RoutineTemplate', routineTemplateSchema);
