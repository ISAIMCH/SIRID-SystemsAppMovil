const mongoose = require('mongoose');

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PLAN_TYPES = ['standard', 'student', 'limited_hours', 'single_gym', 'promotional'];

// Hours of the day the plan lets the client in, in the gym's local time. endTime before startTime crosses midnight
// (22:00-06:00). The plan type only prefills the dashboard form; access follows these explicit rules.
const accessScheduleSchema = new mongoose.Schema({
  startTime: { type: String, required: true, match: TIME_PATTERN },
  endTime: { type: String, required: true, match: TIME_PATTERN },
}, { _id: false });

accessScheduleSchema.pre('validate', function validateRange() {
  if (this.startTime === this.endTime) this.invalidate('endTime', 'La hora de salida debe ser distinta a la de entrada.');
});

module.exports = { TIME_PATTERN, PLAN_TYPES, accessScheduleSchema };
