const mongoose = require('mongoose');

// What a plan unlocks in the API besides the shared basics (app, memberships, store, QR by camera).
const PLAN_FEATURES = ['iot', 'occupancy', 'documents', 'historyShare'];

// GymGo's own plans, the ones gym owners pay SIRID for (not the gyms' membership plans, see membership-plan.model.js).
// Prices are in MXN before IVA; a plan without price is sold by SIRID's sales team.
const saasPlanSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]{2,30}$/ },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, trim: true, maxlength: 300, default: '' },
  priceMxn: { type: Number, min: 0, default: null },
  priceYearlyMxn: { type: Number, min: 0, default: null },
  gymLimit: { type: Number, min: 1, max: 100, required: true },
  features: [{ type: String, enum: PLAN_FEATURES }],
  // Bullet points the public pricing page shows.
  highlights: [{ type: String, trim: true, maxlength: 120 }],
  // false: "Contactar ventas"; SIRID bills outside the web and activates it from the platform panel.
  selfService: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('SaasPlan', saasPlanSchema);
module.exports.PLAN_FEATURES = PLAN_FEATURES;
