const mongoose = require('mongoose');

const GYM_ACCESS_SCOPES = ['all', 'home', 'list'];

// all: every gym of the organization; home: the gym chosen when the membership is sold; list: only gymIds.
const gymAccessSchema = new mongoose.Schema({
  scope: { type: String, enum: GYM_ACCESS_SCOPES, default: 'all', required: true },
  gymIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Gym' }],
}, { _id: false });

gymAccessSchema.pre('validate', function validateGymList() {
  if (this.scope === 'list' && this.gymIds.length === 0) this.invalidate('gymIds', 'Elige al menos una sucursal.');
  if (this.scope !== 'list' && this.gymIds.length > 0) this.gymIds = [];
});

module.exports = { GYM_ACCESS_SCOPES, gymAccessSchema };
