const mongoose = require('mongoose');
const { MUSCLE_GROUPS } = require('../constants/muscle-groups');

const muscleGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, enum: MUSCLE_GROUPS },
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('MuscleGroup', muscleGroupSchema);
