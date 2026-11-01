const User = require('../models/user.model');
const Payment = require('../models/payment.model');
const Membership = require('../models/membership.model');
const MembershipPlan = require('../models/membership-plan.model');
const HttpError = require('./http-error');

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

// The rules a membership copies from its plan when sold.
function planAccessRules(plan) {
  return { gymAccess: plan.gymAccess, schedule: plan.schedule ?? null, requiredDocument: plan.requiredDocument ?? null };
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

  // Selling a plan copies its access rules, so editing the plan later does not change it. A plan that requires a
  // document can be sold before the document is verified: access is what checks it (see access-rules.js).
  const plan = payment.planId && await MembershipPlan.findOne({ _id: payment.planId, organizationId: payment.organizationId }).session(session);
  if (plan) {
    membership.planId = plan._id;
    Object.assign(membership, planAccessRules(plan));
    if (!membership.homeGymId) membership.homeGymId = payment.gymId;
  }

  const now = new Date();
  const currentExpiry = membership.expiresAt;
  const isMembershipCurrent = currentExpiry && currentExpiry > now;
  const periodStartsAt = isMembershipCurrent ? currentExpiry : now;
  membership.status = 'active';
  if (!isMembershipCurrent) membership.startsAt = now;
  membership.expiresAt = new Date(periodStartsAt.getTime() + payment.durationDays * 86400000);
  payment.membershipPeriod = { startsAt: periodStartsAt, endsAt: membership.expiresAt };
  if (payment._id) await Payment.updateOne({ _id: payment._id }, { $set: { membershipPeriod: payment.membershipPeriod } }, { session });
  membership.planName = payment.planName;
  membership.price = payment.amount;
  membership.currency = payment.currency;
  membership.durationDays = payment.durationDays;
  await saveMembership(membership, { session });
}

// The membership time a paid payment still gives: the part of its period not used yet, in ms. Payments paid before
// periods were recorded are taken as the membership's last period.
function unusedPaymentTime(payment, membership, now = new Date()) {
  const period = payment.membershipPeriod?.endsAt
    ? payment.membershipPeriod
    : membership.expiresAt && {
      startsAt: new Date(membership.expiresAt.getTime() - payment.durationDays * 86400000),
      endsAt: membership.expiresAt,
    };
  if (!period) return { period: null, unusedMs: 0 };
  const from = Math.max(period.startsAt.getTime(), now.getTime());
  return { period, unusedMs: Math.max(0, period.endsAt.getTime() - from) };
}

// Deleting a paid payment takes back the time it still gave: the membership ends that much earlier and the periods
// of the payments chained after it move back too. With no time left the membership is expired, or pending when
// no other paid payment remains (as when reception registered the client), so it can be charged again.
async function revertPaidPayment(session, payment, now = new Date()) {
  const userId = payment.user ?? payment.userId;
  const membership = await Membership.findOne({ userId, organizationId: payment.organizationId }).session(session);
  if (!membership) return;
  const { period, unusedMs } = unusedPaymentTime(payment, membership, now);
  if (unusedMs > 0 && membership.expiresAt) {
    membership.expiresAt = new Date(membership.expiresAt.getTime() - unusedMs);
    await Payment.updateMany(
      { user: userId, organizationId: payment.organizationId, status: 'paid', _id: { $ne: payment._id }, 'membershipPeriod.startsAt': { $gte: period.endsAt } },
      [{ $set: {
        'membershipPeriod.startsAt': { $subtract: ['$membershipPeriod.startsAt', unusedMs] },
        'membershipPeriod.endsAt': { $subtract: ['$membershipPeriod.endsAt', unusedMs] },
      } }],
      { session },
    );
  }
  if (!membership.expiresAt || membership.expiresAt <= now) {
    const otherPaid = await Payment.exists({ user: userId, organizationId: payment.organizationId, status: 'paid', _id: { $ne: payment._id } }).session(session);
    membership.status = otherPaid ? 'expired' : 'pending';
  }
  await saveMembership(membership, { session });
}

module.exports = { MIRRORED_FIELDS, hasActiveMembership, membershipCoversGym, planAccessRules, saveMembership, activateMembership, unusedPaymentTime, revertPaidPayment };
