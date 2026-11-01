const mongoose = require('mongoose');

const HISTORY_SECTIONS = ['workouts', 'routines', 'sensitive'];

// Every time staff open a client's shared history; entries are only ever added. The client sees them in the app.
const historyAccessLogSchema = new mongoose.Schema({
  shareId: { type: mongoose.Schema.Types.ObjectId, ref: 'HistoryShare', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  viewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
  sections: [{ type: String, enum: HISTORY_SECTIONS }],
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model('HistoryAccessLog', historyAccessLogSchema);
module.exports.HISTORY_SECTIONS = HISTORY_SECTIONS;
