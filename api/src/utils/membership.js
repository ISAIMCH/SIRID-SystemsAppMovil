const User = require('../models/user.model');
const Membership = require('../models/membership.model');
const MembershipPlan = require('../models/membership-plan.model');
const HttpError = require('./http-error');
const { hasVerifiedDocument } = require('./documents');

const MIRRORED_FIELDS = ['status', 'startsAt', 'expiresAt', 'planName', 'price', 'currency', 'durationDays', 'autoRenew'];

function hasActiveMembership(membership, now = new Date()) {
  return membership?.status === 'active'
    && (!membership.startsAt || membership.startsAt <= now)
    && (!membership.expiresAt || membership.expiresAt >= now);
}

// Whether the plan sold lets the client in at that gym (see gym-access.schema.js).
function membershipCoversGym(membership, gymId) {
  const { scope = 'all', gymIds = [] } = membership?.gymAccess ?? {};
  if (scope === 'home') return Boolean(membership.homeGymId) && String(membership.homeGymId) === String(gymId);
  if (scope === 'list') return gymIds.some((id) => String(id) === String(gymId));
  return true;
}

// Membership is the source of truth; User.membership keeps a copy for the app and dashboard that still read it.
async function saveMembership(membership, { session } = {}) {
  await membership.save({ session });
  const copy = Object.fromEntries(MIRRORED_FIELDS.map((field) => [field, membership[field]]));
  await User.updateOne({ _id: membership.userId }, { $set: { membership: copy } }, { session });
  return membership;
}

// The single place where a paid payment turns into membership time; a current membership is extended.
async function activateMembership(session, payment) {
  const userId = payment.user ?? payment.userId;
  const membership = await Membership.findOne({ userId, organizationId: payment.organizationId }).session(session);
  if (!membership) throw new HttpError(404, 'El cliente no tiene membresía en este gimnasio.');

  // Selling a plan copies where it is valid, so editing the plan later does not change it.
  const plan = payment.planId && await MembershipPlan.findOne({ _id: payment.planId, organizationId: payment.organizationId }).session(session);
  if (plan?.requiredDocument && !(await hasVerifiedDocument(userId, payment.organizationId, plan.requiredDocument, { session }))) {
    throw new HttpError(409, 'Este plan requiere un documento verificado del cliente (por ejemplo, su credencial de estudiante).');
  }
  if (plan) {
    membership.planId = plan._id;
    membership.gymAccess = plan.gymAccess;
    if (!membership.homeGymId) membership.homeGymId = payment.gymId;
  }

  const now = new Date();
  const currentExpiry = membership.expiresAt;
  const isMembershipCurrent = currentExpiry && currentExpiry > now;
  const periodStartsAt = isMembershipCurrent ? currentExpiry : now;
  membership.status = 'active';
  if (!isMembershipCurrent) membership.startsAt = now;
  membership.expiresAt = new Date(periodStartsAt.getTime() + payment.durationDays * 86400000);
  membership.planName = payment.planName;
  membership.price = payment.amount;
  membership.currency = payment.currency;
  membership.durationDays = payment.durationDays;
  await saveMembership(membership, { session });
}

module.exports = { MIRRORED_FIELDS, hasActiveMembership, membershipCoversGym, saveMembership, activateMembership };
