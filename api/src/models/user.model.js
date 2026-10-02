const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const membershipSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'expired'],
    default: 'pending',
  },
  startsAt: Date,
  expiresAt: Date,
  planName: { type: String, trim: true, maxlength: 80 },
  price: { type: Number, min: 0 },
  currency: { type: String, uppercase: true, trim: true, maxlength: 3, default: 'MXN' },
  durationDays: { type: Number, min: 1, max: 730, default: 30 },
  autoRenew: { type: Boolean, default: false },
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, trim: true, maxlength: 30 },
  role: {
    type: String,
    enum: ['Admin', 'Coach', 'Cliente'],
    default: 'Cliente',
    required: true,
  },
  isActive: { type: Boolean, default: true },
  membership: { type: membershipSchema, default: () => ({}) },
  assignedCoach: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  goal: { type: String, trim: true, maxlength: 120 },
  experienceLevel: { type: String, enum: ['principiante', 'intermedio', 'avanzado'] },
  availableTrainingDays: [{ type: Number, min: 0, max: 6 }],
  preferredTrainingTime: { type: String, trim: true, maxlength: 80 },
  restrictions: { type: String, trim: true, maxlength: 1000 },
  preferredZones: [{ type: String, trim: true, maxlength: 80 }],
  weightKg: { type: Number, min: 20, max: 400 },
  heightCm: { type: Number, min: 80, max: 260 },
  currentlyInside: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this.id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    isActive: this.isActive,
    membership: this.membership,
    assignedCoach: this.assignedCoach,
    goal: this.goal,
    experienceLevel: this.experienceLevel,
    availableTrainingDays: this.availableTrainingDays,
    preferredTrainingTime: this.preferredTrainingTime,
    restrictions: this.restrictions,
    preferredZones: this.preferredZones,
    weightKg: this.weightKg,
    heightCm: this.heightCm,
  };
};

module.exports = mongoose.model('User', userSchema);