const User = require('../models/user.model');
const HttpError = require('./http-error');

function hasActiveMembership(user, now = new Date()) {
  return user.membership?.status === 'active'
    && (!user.membership.startsAt || user.membership.startsAt <= now)
    && (!user.membership.expiresAt || user.membership.expiresAt >= now);
}

// The single place where a paid payment turns into membership time; a current membership is extended.
async function activateMembership(session, payment) {
  const user = await User.findOne({ _id: payment.user ?? payment.userId, role: 'Cliente' }).session(session);
  if (!user) throw new HttpError(404, 'No se encontró el cliente del pago.');

  const now = new Date();
  const currentExpiry = user.membership.expiresAt;
  const isMembershipCurrent = currentExpiry && currentExpiry > now;
  const periodStartsAt = isMembershipCurrent ? currentExpiry : now;
  user.membership.status = 'active';
  if (!isMembershipCurrent) user.membership.startsAt = now;
  user.membership.expiresAt = new Date(periodStartsAt.getTime() + payment.durationDays * 86400000);
  user.membership.planName = payment.planName;
  user.membership.price = payment.amount;
  user.membership.currency = payment.currency;
  user.membership.durationDays = payment.durationDays;
  await user.save({ session });
}

module.exports = { hasActiveMembership, activateMembership };
